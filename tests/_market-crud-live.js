/**
 * Live CRUD check for the MARKET dashboard sections.
 *
 * The market dashboard never calls the admin routes directly: a URL-rewriting
 * shim at the top of public/js/page-market-dashboard.js maps /api/waste,
 * /api/promocodes and /api/announcements onto /api/market-admin/*. This test
 * exercises those market-admin endpoints with a real market token and asserts
 * the envelope shape the page now expects ({ data: { items, meta } }), so a
 * silent "renders zero rows" regression fails loudly here instead.
 *
 *   node tests/_market-crud-live.js
 */
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const BASE = process.env.TEST_BASE_URL || "http://localhost:10000/api";
let failures = 0;

function check(name, ok, detail) {
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " -> " + detail : ""}`);
	if (!ok) failures++;
}

// Mirrors public/js/config.js listFrom(): the page tolerates several shapes,
// so the test must accept exactly the same set — no more, no less.
function listFrom(payload, key) {
	if (!payload) return [];
	if (Array.isArray(payload)) return payload;
	if (key) {
		if (Array.isArray(payload[key])) return payload[key];
		if (payload.data && Array.isArray(payload.data[key])) return payload.data[key];
	}
	const data = payload.data;
	if (Array.isArray(data)) return data;
	if (Array.isArray(payload.items)) return payload.items;
	if (data && typeof data === "object") {
		if (Array.isArray(data.items)) return data.items;
		for (const k of Object.keys(data)) if (Array.isArray(data[k])) return data[k];
	}
	return [];
}

async function main() {
	await mongoose.connect(process.env.MONGODB_URI);

	// Market accounts live in the `markets` collection, not `users`, and their
	// tokens must carry isMarket:true or the market-admin guard rejects them.
	const market = await mongoose.connection.db.collection("markets").findOne({});
	if (!market) {
		console.log("No market account in the database — nothing to verify.");
		await mongoose.disconnect();
		return;
	}
	const token = jwt.sign(
		{ id: market._id.toString(), role: "market", isMarket: true },
		process.env.JWT_SECRET,
		{ expiresIn: "1h" }
	);
	const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
	const get = async (p) => {
		const r = await fetch(`${BASE}${p}`, { headers: H });
		return { status: r.status, body: await r.json().catch(() => null) };
	};

	console.log(`\nMarket: ${market.name || market._id}\n`);

	for (const [label, path, key] of [
		["Waste Management", "/market-admin/waste?page=1&limit=20", "items"],
		["Promo Codes", "/market-admin/promocodes", "items"],
		["Announcements", "/market-admin/announcements", "items"],
	]) {
		console.log(`=== ${label} ===\n`);
		const res = await get(path);
		check(`${label} READ list authorised`, res.status === 200, `HTTP ${res.status}`);
		if (res.status === 200) {
			const rows = listFrom(res.body, key);
			check(`${label} unwraps to an array`, Array.isArray(rows), `${rows.length} row(s)`);
		}
		console.log("");
	}

	await mongoose.disconnect();
	console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
