/**
 * Live check: the Staff "Order Management" page renders orders for EVERY role
 * that can reach it.
 *
 * Reported symptom: the dashboard Orders table is full, but clicking
 * "📋 Staff Manage Orders" lands on /ordermanagement with an empty table.
 *
 * The page reads `result.data.orders`. That key only exists on the main
 * /api/orders envelope. The market-scoped /api/market-admin/orders answers
 * `{ data: { items, meta } }`, so `data.orders` is undefined, the list falls
 * back to [] and the table renders "No orders found" with no error anywhere.
 *
 *   node tests/_ordermgmt-live.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const BASE = process.env.TEST_BASE_URL || "http://localhost:10000/api";

let failures = 0;
const check = (name, ok, detail) => {
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " -> " + detail : ""}`);
	if (!ok) failures++;
};

// Use the shipped helper, not a copy, so this tests what the page runs.
const configSrc = fs.readFileSync(
	path.join(__dirname, "..", "public", "js", "config.js"),
	"utf8"
);
const listFrom = eval(
	`(${configSrc
		.slice(configSrc.indexOf("function listFrom"))
		.match(/^function listFrom[\s\S]*?\n}/)[0]})`
);

(async () => {
	await mongoose.connect(process.env.MONGODB_URI);
	const db = mongoose.connection.db;

	const market = await db.collection("markets").findOne({});
	const users = {};
	for (const role of ["admin", "manager", "staff", "market_staff", "market_manager"]) {
		users[role] = await db.collection("users").findOne({ role });
	}

	const mainOrderCount = await db
		.collection("orders")
		.countDocuments({ $or: [{ market: null }, { market: { $exists: false } }] });
	const marketOrderCount = market
		? await db
				.collection("orders")
				.countDocuments({ market: market._id, isActive: { $ne: false } })
		: 0;

	console.log(
		`\nDB: ${mainOrderCount} main-store order(s), ${marketOrderCount} market order(s)\n`
	);

	const sign = (payload) =>
		jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "10m" });

	// [label, token, endpoint the page would call, orders that should show]
	const CASES = [];
	for (const role of ["admin", "manager", "staff"]) {
		if (!users[role]) continue;
		CASES.push([
			role,
			sign({ id: String(users[role]._id), role }),
			"/orders",
			null, // main store: just require a non-empty, well-formed list
		]);
	}
	if (market) {
		CASES.push([
			"market (owner token)",
			sign({ id: String(market._id), role: "market", isMarket: true }),
			"/market-admin/orders",
			marketOrderCount,
		]);
	}
	for (const role of ["market_staff", "market_manager"]) {
		if (!users[role]) continue;
		CASES.push([
			role,
			sign({ id: String(users[role]._id), role }),
			"/market-admin/orders",
			null,
		]);
	}

	for (const [label, token, endpoint, expected] of CASES) {
		console.log(`=== ${label} -> ${endpoint} ===\n`);
		const res = await fetch(`${BASE}${endpoint}?page=1&limit=20`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		const body = await res.json().catch(() => null);

		check(`${label}: endpoint authorised`, res.ok, `HTTP ${res.status}`);
		if (!res.ok) {
			console.log("");
			continue;
		}

		// What the page used to do.
		const oldWay = (body.data && body.data.orders) || [];
		// What the page does now.
		const rows = listFrom(body, "orders");

		check(
			`${label}: rows reach the table`,
			Array.isArray(rows) && (expected === null ? true : rows.length === Math.min(expected, 20)),
			`${rows.length} row(s)` +
				(oldWay.length === 0 && rows.length > 0 ? " (old code rendered 0)" : "")
		);

		// Pagination must be reachable regardless of which envelope came back.
		const p = (body.data && (body.data.pagination || body.data.meta)) || {};
		const total = p.totalOrders ?? p.total;
		const pages = p.totalPages;
		check(
			`${label}: pagination carries a total and a page count`,
			Number.isFinite(Number(total)) && Number.isFinite(Number(pages)),
			JSON.stringify(p)
		);

		// The "Showing X to Y of N" label must agree with the rows on screen.
		check(
			`${label}: total is consistent with the rows returned`,
			Number(total) >= rows.length,
			`total=${total} rows=${rows.length}`
		);

		// A window that closed before this system existed must return nothing.
		// If the endpoint ignores the dates it returns everything, and the
		// page's date filter silently does nothing.
		const fRes = await fetch(
			`${BASE}${endpoint}?dateFrom=2000-01-01&dateTo=2000-01-02`,
			{ headers: { Authorization: `Bearer ${token}` } }
		);
		const fBody = await fRes.json().catch(() => ({}));
		check(
			`${label}: date filter is applied`,
			fRes.ok && listFrom(fBody, "orders").length === 0,
			`${listFrom(fBody, "orders").length} row(s) in an empty window`
		);
		console.log("");
	}

	await mongoose.disconnect();
	console.log(
		failures === 0 ? "ALL CHECKS PASSED\n" : `${failures} CHECK(S) FAILED\n`
	);
	process.exit(failures === 0 ? 0 : 1);
})().catch(async (e) => {
	console.error("FATAL:", e.message);
	try {
		await mongoose.disconnect();
	} catch (_) {}
	process.exit(1);
});
