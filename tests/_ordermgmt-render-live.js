/**
 * Renders the REAL Order Management page in a real DOM, once per role, against
 * the REAL server, and asserts rows actually land in the table.
 *
 * This is the check that was missing. Every API-level test passed while the
 * page still showed "No orders found", because the failure was in the page's
 * own parsing (`result.data.orders`) and in how it picked an endpoint — neither
 * of which an API test can see.
 *
 * Requires the server on :10000.
 *   node tests/_ordermgmt-render-live.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { JSDOM, VirtualConsole } = require("jsdom");

const PUB = path.join(__dirname, "..", "public");
const BASE = "http://localhost:10000/api";

let failures = 0;
const check = (name, ok, detail) => {
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " -> " + detail : ""}`);
	if (!ok) failures++;
};

async function renderAs({ label, authToken, marketToken, ctx, expected }) {
	console.log(`\n########## ${label}${ctx ? ` (?ctx=${ctx})` : ""} ##########`);

	const html = fs.readFileSync(path.join(PUB, "ordermanagement.html"), "utf8");
	const vc = new VirtualConsole();
	const errors = [];
	vc.on("jsdomError", (e) => errors.push(e.message));

	const dom = new JSDOM(html, {
		runScripts: "outside-only",
		virtualConsole: vc,
		url: `http://localhost:10000/ordermanagement${ctx ? `?ctx=${ctx}` : ""}`,
	});
	const { window } = dom;
	const doc = window.document;

	// Real network. Only the Response object is shimmed, because this jsdom
	// build has no constructible Response.
	window.fetch = async (url, opts = {}) => {
		const { signal, ...safe } = opts; // jsdom's AbortSignal breaks Node fetch
		const res = await fetch(String(url), safe);
		const text = await res.text();
		return {
			ok: res.ok,
			status: res.status,
			headers: { get: (h) => res.headers.get(h) },
			json: async () => JSON.parse(text),
			text: async () => text,
		};
	};
	if (authToken) window.localStorage.setItem("authToken", authToken);
	if (marketToken) window.localStorage.setItem("marketToken", marketToken);
	window.alert = () => {};
	window.confirm = () => true;
	window.scrollTo = () => {};

	// One shared eval: `const API_BASE_URL` in config.js is a lexical binding
	// and would not be visible across separate eval calls.
	const combined = ["config.js", "barcode-scanner.js", "page-ordermanagement.js"]
		.map((f) => path.join(PUB, "js", f))
		.filter((p) => fs.existsSync(p))
		.map((p) => fs.readFileSync(p, "utf8"))
		.join("\n;\n");
	try {
		window.eval(combined);
	} catch (e) {
		errors.push(e.message);
	}

	doc.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
	await new Promise((r) => setTimeout(r, 1500));

	check("page scripts run without a fatal error", errors.length === 0, errors[0]);

	const tbody = doc.getElementById("orders-table-body");
	// Ignore the "No orders found" / loading placeholder, otherwise an empty
	// table counts as a rendered row and a broken page looks healthy.
	const rows = tbody
		? Array.from(tbody.querySelectorAll("tr")).filter(
				(tr) => !tr.querySelector("td[colspan]")
		  )
		: [];

	check("orders table body exists", !!tbody);
	check(
		"orders are rendered in the table",
		rows.length === expected,
		`${rows.length} row(s) rendered, expected ${expected}`
	);

	// The stats strip must agree with what is on screen, not show a stale 0.
	const totalEl = doc.getElementById("total-orders");
	check(
		"total-orders stat agrees with the data",
		totalEl && Number(totalEl.textContent) === expected,
		totalEl ? `shows "${totalEl.textContent}"` : "(missing)"
	);

	// The empty-state must NOT be showing when orders exist.
	check(
		"no misleading 'No orders found' message",
		expected === 0 || !(tbody && /No orders found/.test(tbody.textContent))
	);

	window.close();
}

(async () => {
	await mongoose.connect(process.env.MONGODB_URI);
	const db = mongoose.connection.db;

	const sign = (p) => jwt.sign(p, process.env.JWT_SECRET, { expiresIn: "15m" });
	const market = await db.collection("markets").findOne({});

	const mainTotal = await db.collection("orders").countDocuments({
		$or: [{ market: null }, { market: { $exists: false } }],
	});
	const marketTotal = market
		? await db
				.collection("orders")
				.countDocuments({ market: market._id, isActive: { $ne: false } })
		: 0;

	const PAGE_SIZE = 20;
	const cases = [];

	for (const role of ["admin", "manager", "staff"]) {
		const u = await db.collection("users").findOne({ role });
		if (!u) continue;
		cases.push({
			label: role,
			authToken: sign({ id: String(u._id), role }),
			expected: Math.min(mainTotal, PAGE_SIZE),
		});
	}

	if (market) {
		const mt = sign({ id: String(market._id), role: "market", isMarket: true });
		// From the market dashboard button.
		cases.push({
			label: "market (owner)",
			marketToken: mt,
			ctx: "market",
			expected: Math.min(marketTotal, PAGE_SIZE),
		});
		// Same user, but WITHOUT the ?ctx hint — e.g. a bookmark or the shared
		// sidebar. This must still work.
		cases.push({
			label: "market (owner, no ctx hint)",
			authToken: mt,
			expected: Math.min(marketTotal, PAGE_SIZE),
		});
	}

	for (const role of ["market_staff", "market_manager"]) {
		const u = await db.collection("users").findOne({ role });
		if (!u) continue;
		const t = sign({ id: String(u._id), role });
		cases.push({
			label: role,
			authToken: t,
			ctx: "market",
			expected: Math.min(marketTotal, PAGE_SIZE),
		});
		// market_staff signs in through the same form as admins and so holds an
		// authToken. Opening the page without ?ctx used to route them to the
		// admin-only /api/orders -> 403 -> empty table.
		cases.push({
			label: `${role} (no ctx hint)`,
			authToken: t,
			expected: Math.min(marketTotal, PAGE_SIZE),
		});
	}

	await mongoose.disconnect();

	console.log(
		`\nDB: ${mainTotal} main-store order(s), ${marketTotal} market order(s)`
	);

	for (const c of cases) await renderAs(c);

	console.log(
		failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
	);
	process.exit(failures === 0 ? 0 : 1);
})().catch(async (e) => {
	console.error("FATAL:", e.message);
	try {
		await mongoose.disconnect();
	} catch (_) {}
	process.exit(1);
});
