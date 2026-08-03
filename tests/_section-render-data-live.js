/**
 * Drives the REAL admin dashboard loaders against the REAL server and asserts
 * rows actually land in the DOM.
 *
 * This is the test that was missing. The API returned 200 with correct data and
 * every API-level check passed, yet the page rendered nothing, because
 * loadPromoCodes/loadAnnouncements did `result.data.filter(...)` /
 * `result.data.length` on the envelope object {promoCodes|announcements, count}
 * instead of on the array inside it.
 *
 * Requires the server on :10000.
 *   node tests/_section-render-data-live.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const mongoose = require("mongoose");
require("dotenv").config();

const PUB = path.join(__dirname, "..", "public");
const API = "http://localhost:10000/api";
let failures = 0;
const check = (name, ok, detail) => {
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " -> " + detail : ""}`);
	if (!ok) failures++;
};

async function mintAdminToken() {
	await mongoose.connect(process.env.MONGODB_URI);
	const User = require("../src/models/User");
	const jwt = require("jsonwebtoken");
	const admin = await User.findOne({ role: { $in: ["admin", "manager"] } });
	if (!admin) throw new Error("no admin user in the database");
	const token = jwt.sign(
		{ id: admin._id.toString(), role: admin.role },
		process.env.JWT_SECRET,
		{ expiresIn: "1h" }
	);
	return { token, admin };
}

(async () => {
	const { token, admin } = await mintAdminToken();

	const html = fs.readFileSync(path.join(PUB, "dashboard.html"), "utf8");
	const vc = new VirtualConsole();
	const pageErrors = [];
	vc.on("error", (...a) => pageErrors.push(a.join(" ")));

	const dom = new JSDOM(html, {
		runScripts: "outside-only",
		virtualConsole: vc,
		url: "http://localhost:10000/dashboard",
	});
	const { window } = dom;
	const doc = window.document;

	// Real network, real envelopes — only the Response shim is synthetic,
	// because this jsdom build has no constructible Response.
	window.fetch = async (url, opts = {}) => {
		// jsdom's AbortSignal is not an instance of Node's AbortSignal and makes
		// Node's fetch throw, which silently turned every request into a failure.
		const { signal, ...safe } = opts;
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
	window.localStorage.setItem("authToken", token);
	window.localStorage.setItem("user", JSON.stringify({ role: admin.role }));
	window.alert = () => {};
	window.scrollTo = () => {};

	// One shared eval: `const API_BASE_URL` is a lexical binding and would not
	// be visible across separate eval calls.
	const combined = [
		"config.js",
		"translator.js",
		"lebanese-cities.js",
		"page-dashboard.js",
	]
		.map((f) => path.join(PUB, "js", f))
		.filter((p) => fs.existsSync(p))
		.map((p) => fs.readFileSync(p, "utf8"))
		.join("\n;\n");
	window.eval(combined);

	doc.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

	const rows = (id) => {
		const tb = doc.getElementById(id);
		if (!tb) return null;
		// Ignore the "nothing here" placeholder row, otherwise an empty table
		// counts as one rendered record and a broken page looks healthy.
		return Array.from(tb.querySelectorAll("tr")).filter(
			(tr) => !tr.querySelector("td[colspan]")
		);
	};

	// --- Announcements -----------------------------------------------------
	const annRes = await fetch(`${API}/announcements`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const annJson = await annRes.json();
	const annExpected = (annJson.data.announcements || []).length;

	await window.loadAnnouncements();
	await new Promise((r) => setTimeout(r, 100));

	const annRows = rows("announcements-table-body");
	check("announcements tbody exists", !!annRows);
	check(
		"announcements rows rendered",
		annRows && annRows.length === annExpected,
		`${annRows ? annRows.length : "n/a"} rendered vs ${annExpected} from API`
	);
	const annCount = doc.getElementById("announcements-count-display");
	// Must agree with the rows actually on screen, not merely look plausible.
	check(
		"announcements count label agrees with rendered rows",
		annCount &&
			annCount.textContent.trim().startsWith(String(annExpected) + " announcement"),
		annCount
			? `"${annCount.textContent.trim()}" vs ${annExpected} row(s)`
			: "(missing)"
	);

	// --- Promo codes -------------------------------------------------------
	const promoRes = await fetch(`${API}/promocodes`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const promoJson = await promoRes.json();
	const allPromos = promoJson.data.promoCodes || [];
	const ownExpected = allPromos.filter((p) => p.isFromOwnCompany === true).length;

	await window.loadPromoCodes(true);
	await new Promise((r) => setTimeout(r, 100));

	const promoRows = rows("promo-table-body");
	check("promo tbody exists", !!promoRows);
	check(
		"own-company promo rows rendered",
		promoRows && promoRows.length === ownExpected,
		`${promoRows ? promoRows.length : "n/a"} rendered vs ${ownExpected} expected`
	);

	// --- The regression that caused the outage -----------------------------
	const unwrapErrors = pageErrors.filter((e) =>
		/is not a function|undefined/.test(e)
	);
	check(
		"no envelope-unwrap errors while rendering",
		unwrapErrors.length === 0,
		unwrapErrors.length ? unwrapErrors[0].slice(0, 120) : "clean"
	);

	window.close();
	await mongoose.disconnect();
	console.log(
		failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
	);
	process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
	console.error("FATAL:", e.message);
	process.exit(1);
});
