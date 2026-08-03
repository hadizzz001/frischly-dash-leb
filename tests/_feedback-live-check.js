/*
 * Live check: the Feedback section actually renders the records that exist.
 *
 * The page reported "No feedback submitted yet" while the collection held
 * records, because GET /feedback answers
 *     { data: { feedback: [...], count, total, pagination } }
 * and the page did `Array.isArray(data.data) ? data.data : []`. data.data is
 * the WRAPPER object, so Array.isArray was false and the list fell back to []
 * — an empty table with no error anywhere.
 *
 * Requires the server running and admin credentials:
 *     ADMIN_EMAIL=... ADMIN_PASSWORD=... node tests/_feedback-live-check.js
 */
const fs = require("fs");
const path = require("path");

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

(async () => {
	const health = await fetch(`${BASE}/health`).catch(() => null);
	if (!health || health.status !== 200) {
		console.log(`\nServer not reachable at ${BASE}. Start it: node server.js\n`);
		process.exit(1);
	}

	// How many records really exist, straight from Mongo.
	require("dotenv").config();
	const mongoose = require("mongoose");
	await mongoose.connect(process.env.MONGODB_URI);
	const dbCount = await mongoose.connection.db
		.collection("feedbacks")
		.countDocuments();
	await mongoose.disconnect();
	console.log(`\n=== Feedback: ${dbCount} record(s) in the database ===\n`);
	if (dbCount === 0) {
		console.log("  (no data to prove rendering against — skipping)\n");
		process.exit(0);
	}

	// /feedback is admin-only, so we need a token. Prefer minting one straight
	// from an admin user in the database — the same approach the other live
	// checks use. Falling back to a long-lived ADMIN_TOKEN in .env made this
	// test fail with 401 whenever that value went stale, which looked like a
	// product bug but was only a harness problem.
	let token = null;
	try {
		const jwt = require("jsonwebtoken");
		await mongoose.connect(process.env.MONGODB_URI);
		const admin = await mongoose.connection.db
			.collection("users")
			.findOne({ role: "admin" });
		await mongoose.disconnect();
		if (admin) {
			token = jwt.sign(
				{ id: admin._id.toString(), role: "admin" },
				process.env.JWT_SECRET,
				{ expiresIn: "1h" }
			);
		}
	} catch (_) {
		token = null;
	}
	if (!token) token = process.env.ADMIN_TOKEN || null;
	const email = process.env.ADMIN_EMAIL;
	const password = process.env.ADMIN_PASSWORD;
	if (!token && email && password) {
		const r = await fetch(`${BASE}/auth/login-profile`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		});
		const j = await r.json().catch(() => ({}));
		token = (j.data && j.data.token) || j.token || null;
	}
	if (!token) {
		console.log(
			"  No admin token (set ADMIN_EMAIL / ADMIN_PASSWORD) — verifying\n" +
				"  the parsing against the documented envelope instead.\n"
		);
		const shape = {
			success: true,
			data: {
				feedback: Array.from({ length: dbCount }, (_, i) => ({ _id: "f" + i })),
				count: dbCount,
				total: dbCount,
				pagination: { page: 1, limit: 10, totalPages: 1 },
			},
		};
		const oldWay = Array.isArray(shape.data) ? shape.data : [];
		if (oldWay.length !== 0) fail("expected the old parsing to yield [] (stale test)");
		else pass("reproduced: old parsing yields 0 rows -> 'No feedback submitted yet'");
		const rows = listFrom(shape, "feedback");
		if (rows.length !== dbCount) fail(`listFrom gave ${rows.length}, expected ${dbCount}`);
		else pass(`fixed: listFrom yields ${rows.length} row(s)`);
		console.log(
			failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
		);
		process.exit(failures === 0 ? 0 : 1);
	}

	const auth = { Authorization: `Bearer ${token}` };

	// 1. The list endpoint.
	const res = await fetch(`${BASE}/feedback?page=1&limit=10`, { headers: auth });
	if (!res.ok) {
		fail(`GET /feedback -> HTTP ${res.status}`);
	} else {
		const payload = await res.json();

		const oldWay = Array.isArray(payload.data) ? payload.data : [];
		if (oldWay.length === 0) {
			pass("reproduced: old parsing yields 0 rows (the empty table)");
		} else {
			fail("old parsing unexpectedly worked — test is stale");
		}

		const rows = listFrom(payload, "feedback");
		if (rows.length === 0) {
			fail("listFrom still yields 0 rows");
		} else {
			pass(`fixed: listFrom yields ${rows.length} row(s) for the table`);
		}

		// Pagination must come from the wrapper, not the envelope.
		if (payload.pagination) {
			fail("pagination unexpectedly on the envelope — test is stale");
		} else if (payload.data && payload.data.pagination) {
			pass("pagination read from data.pagination (as the fix does)");
		} else {
			fail("no pagination found in the payload at all");
		}

		// Rendering must not throw on sparse records.
		try {
			rows.forEach((fb) => {
				const order = fb.order || {};
				String((fb.customer && fb.customer.name) || (order.customer && order.customer.name) || "—");
				const rider = fb.assignedRider || order.assignedRider || null;
				String((rider && rider.user && rider.user.name) || "—");
			});
			pass("row rendering is safe for every record returned");
		} catch (e) {
			fail("row rendering threw: " + e.message);
		}
	}

	// 2. The stats endpoint.
	const sres = await fetch(`${BASE}/feedback/stats`, { headers: auth });
	if (!sres.ok) {
		fail(`GET /feedback/stats -> HTTP ${sres.status}`);
	} else {
		const sp = await sres.json();
		const oldStats = sp.data || {};
		const newStats = (sp.data && sp.data.stats) || sp.data || {};
		if (oldStats.totalFeedback === undefined && newStats.totalFeedback !== undefined) {
			pass(`fixed: stats unwrap to totalFeedback=${newStats.totalFeedback}`);
		} else if (newStats.totalFeedback === undefined) {
			fail("stats.totalFeedback missing after unwrapping");
		} else {
			pass("stats readable (envelope already flat)");
		}
	}

	console.log(
		failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
	);
	process.exit(failures === 0 ? 0 : 1);
})();
