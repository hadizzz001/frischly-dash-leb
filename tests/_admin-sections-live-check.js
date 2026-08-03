/*
 * Live check: every admin list section returns rows the page can actually
 * render. Mints a short-lived admin token from the server's own JWT secret so
 * the protected endpoints can be exercised without a password.
 *
 * These sections all share one failure mode: the API nests the array under a
 * named key (`{ data: { kitchens: [...] } }`), but the page read `X.data`
 * directly. With `Array.isArray(X.data) ? X.data : []` that yields [] SILENTLY
 * — no error, no console warning, just an empty table.
 *
 *     node tests/_admin-sections-live-check.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const BASE = process.env.API_BASE || "http://localhost:10000/api";

const configSrc = fs.readFileSync(
	path.join(__dirname, "..", "public", "js", "config.js"),
	"utf8"
);
const listFrom = eval(
	`(${configSrc
		.slice(configSrc.indexOf("function listFrom"))
		.match(/^function listFrom[\s\S]*?\n}/)[0]})`
);

let failures = 0;
const fail = (m) => {
	failures++;
	console.log("  FAIL  " + m);
};
const pass = (m) => console.log("  PASS  " + m);

// section label, url, listFrom key, mongo collection to cross-check
const SECTIONS = [
	["Feedback", "/feedback?limit=100", "feedback", "feedbacks"],
	["Zones", "/zones?limit=100", "zones", "zones"],
	["Riders", "/riders?limit=100", "riders", "riders"],
	["For Kitchens", "/kitchens", "kitchens", "kitchens"],
	["Kitchen Categories", "/kitchen-categories", "categories", "kitchencategories"],
	["Waste", "/waste?limit=100", "waste", "wastes"],
];

(async () => {
	const health = await fetch(`${BASE}/health`).catch(() => null);
	if (!health || health.status !== 200) {
		console.log(`\nServer not reachable at ${BASE}. Start it: node server.js\n`);
		process.exit(1);
	}

	await mongoose.connect(process.env.MONGODB_URI);
	const admin = await mongoose.connection.db
		.collection("users")
		.findOne({ role: "admin" }, { projection: { _id: 1, role: 1 } });
	if (!admin) {
		console.log("\nNo admin user found — cannot verify protected sections.\n");
		await mongoose.disconnect();
		process.exit(1);
	}
	const token = jwt.sign(
		{ id: String(admin._id), role: admin.role },
		process.env.JWT_SECRET,
		{ expiresIn: "5m" }
	);
	const auth = { Authorization: `Bearer ${token}` };

	console.log("\n=== Admin list sections: DB rows vs rows the page renders ===\n");

	for (const [label, url, key, collection] of SECTIONS) {
		let dbCount = null;
		try {
			dbCount = await mongoose.connection.db
				.collection(collection)
				.countDocuments();
		} catch {
			/* collection may not exist */
		}

		const res = await fetch(BASE + url, { headers: auth });
		if (!res.ok) {
			fail(`${label}: HTTP ${res.status}`);
			continue;
		}
		const payload = await res.json();

		// What the buggy code produced.
		const oldWay = Array.isArray(payload.data) ? payload.data : [];
		// What the pages do now.
		const rows = listFrom(payload, key);

		if (!Array.isArray(rows)) {
			fail(`${label}: listFrom did not return an array`);
			continue;
		}

		if (dbCount && dbCount > 0 && rows.length === 0) {
			fail(`${label}: ${dbCount} row(s) in DB but the page would render 0`);
			continue;
		}

		const note =
			dbCount === null ? "" : ` (DB has ${dbCount})`;
		pass(
			`${label}: renders ${rows.length} row(s)${note}` +
				(oldWay.length === 0 && rows.length > 0
					? " — old code rendered 0"
					: "")
		);
	}

	await mongoose.disconnect();
	console.log(
		failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
	);
	process.exit(failures === 0 ? 0 : 1);
})();
