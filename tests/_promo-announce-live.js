/**
 * Live data check for the Promo Codes and Announcements sections.
 *
 * Answers two questions the UI cannot distinguish between:
 *   1. does the endpoint return rows?
 *   2. does the page's own parsing turn those rows into table rows?
 * An empty table means one of the two — this says which.
 *
 *   node tests/_promo-announce-live.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const BASE = process.env.TEST_BASE_URL || "http://localhost:10000/api";
let failures = 0;
const check = (name, ok, detail) => {
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " -> " + detail : ""}`);
	if (!ok) failures++;
};

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

(async () => {
	await mongoose.connect(process.env.MONGODB_URI);
	const db = mongoose.connection.db;

	const counts = {};
	for (const c of ["promocodes", "marketpromocodes", "announcements"]) {
		counts[c] = await db.collection(c).countDocuments();
	}
	console.log("\n=== what is actually stored ===\n");
	for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);

	// Show the admin promo codes so we can see why the two tabs split them.
	const promos = await db.collection("promocodes").find({}).limit(10).toArray();
	if (promos.length) {
		console.log("\n  promocodes rows:");
		promos.forEach((p) =>
			console.log(
				`    ${p.code || "(no code)"}  company=${JSON.stringify(
					p.companyName
				)}  active=${p.isActive}`
			)
		);
	}
	const anns = await db.collection("announcements").find({}).limit(10).toArray();
	if (anns.length) {
		console.log("\n  announcements rows:");
		anns.forEach((a) =>
			console.log(`    ${JSON.stringify(a.title)}  active=${a.isActive}`)
		);
	}

	const admin = await db.collection("users").findOne({ role: "admin" });
	await mongoose.disconnect();

	const token = jwt.sign(
		{ id: admin._id.toString(), role: "admin" },
		process.env.JWT_SECRET,
		{ expiresIn: "1h" }
	);
	const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

	console.log("\n=== what the API returns to the page ===\n");

	for (const [label, url, key, expected] of [
		["Promo Codes", "/promocodes", "promoCodes", counts.promocodes],
		["Announcements", "/announcements", "announcements", counts.announcements],
	]) {
		const r = await fetch(`${BASE}${url}`, { headers: H });
		const body = await r.json().catch(() => null);
		check(`${label} responds`, r.status === 200, `HTTP ${r.status}`);
		if (r.status !== 200) {
			console.log("    body:", JSON.stringify(body).slice(0, 200));
			continue;
		}
		const rows = listFrom(body, key);
		check(
			`${label} rows reach the table`,
			rows.length === expected,
			`${rows.length} of ${expected} in DB`
		);
		if (rows.length === 0 && expected === 0) {
			console.log(`    (the collection is genuinely empty — nothing to show)`);
		}
	}

	console.log(
		failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
	);
	process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
