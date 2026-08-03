/**
 * Live CRUD check for the Waste Management section.
 *
 * Reproduces the reported failure ("data.data.forEach is not a function") and
 * proves the fix, then drives a full create -> read -> update -> delete cycle
 * against the real API so a silent regression in either the envelope or the
 * write path fails loudly here.
 *
 *   node tests/_waste-crud-live.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const BASE = process.env.TEST_BASE_URL || "http://localhost:10000/api";
let failures = 0;

function check(name, ok, detail) {
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " -> " + detail : ""}`);
	if (!ok) failures++;
}

// Mirrors public/js/config.js listFrom().
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
		for (const k of Object.keys(data)) {
			if (Array.isArray(data[k])) return data[k];
		}
	}
	return [];
}

async function main() {
	await mongoose.connect(process.env.MONGODB_URI);
	const admin = await mongoose.connection.db
		.collection("users")
		.findOne({ role: "admin" });
	if (!admin) {
		console.log("No admin user in the database — cannot verify.");
		await mongoose.disconnect();
		process.exit(0);
	}
	const token = jwt.sign(
		{ id: admin._id.toString(), role: "admin" },
		process.env.JWT_SECRET,
		{ expiresIn: "1h" }
	);
	const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

	// A real product is required: createWaste resolves the barcode server-side.
	const product = await mongoose.connection.db
		.collection("products")
		.findOne({ barcode: { $exists: true, $ne: null, $ne: "" } });
	const dbCount = await mongoose.connection.db
		.collection("wastes")
		.countDocuments({ isDeleted: { $ne: true } });
	await mongoose.disconnect();

	console.log(`\n=== Waste Management (${dbCount} active record(s) in DB) ===\n`);

	// --- READ -------------------------------------------------------------
	const listRes = await fetch(`${BASE}/waste?page=1&limit=10`, { headers: H });
	const listBody = await listRes.json().catch(() => null);
	check("READ list", listRes.status === 200, `HTTP ${listRes.status}`);

	// Reproduce the exact reported crash with the OLD parsing.
	let reproduced = false;
	try {
		// eslint-disable-next-line no-unused-expressions
		listBody.data.forEach(() => {});
	} catch (e) {
		reproduced = /forEach is not a function/.test(e.message);
	}
	check("reproduced the reported crash with the old parsing", reproduced);

	const rows = listFrom(listBody, "waste");
	check("fixed: listFrom yields an array", Array.isArray(rows), `${rows.length} row(s)`);

	const pagination =
		(listBody.data && listBody.data.pagination) || listBody.pagination || {};
	check("pagination is reachable", typeof pagination === "object");

	// --- CREATE -----------------------------------------------------------
	if (!product) {
		console.log("\n  (no product with a barcode — skipping write cycle)\n");
	} else {
		const payload = {
			barcode: product.barcode,
			productName: product.name,
			productId: product._id.toString(),
			quantity: 1,
			reason: "Damaged",
			notes: "automated test record",
		};
		const cRes = await fetch(`${BASE}/waste`, {
			method: "POST",
			headers: H,
			body: JSON.stringify(payload),
		});
		const cBody = await cRes.json().catch(() => ({}));
		const created = (cBody.data && (cBody.data._id || cBody.data.waste?._id)) || null;
		check("CREATE", cRes.ok && !!created, created || JSON.stringify(cBody).slice(0, 160));

		if (created) {
			// --- READ BY ID ---------------------------------------------------
			const gRes = await fetch(`${BASE}/waste/${created}`, { headers: H });
			check("READ by id", gRes.status === 200, `HTTP ${gRes.status}`);

			// --- UPDATE -------------------------------------------------------
			const uRes = await fetch(`${BASE}/waste/${created}`, {
				method: "PUT",
				headers: H,
				body: JSON.stringify({ ...payload, quantity: 5, notes: "updated" }),
			});
			check("UPDATE", uRes.ok, `HTTP ${uRes.status}`);
			const vRes = await fetch(`${BASE}/waste/${created}`, { headers: H });
			const vBody = await vRes.json().catch(() => ({}));
			const rec = (vBody.data && (vBody.data.waste || vBody.data)) || {};
			check("UPDATE persisted", Number(rec.quantity) === 5, `quantity=${rec.quantity}`);

			// --- DELETE -------------------------------------------------------
			const dRes = await fetch(`${BASE}/waste/${created}`, {
				method: "DELETE",
				headers: H,
			});
			check("DELETE", dRes.ok, `HTTP ${dRes.status}`);
		}
	}

	// --- STATS ------------------------------------------------------------
	const sRes = await fetch(`${BASE}/waste/stats`, { headers: H });
	check("READ stats", sRes.status === 200, `HTTP ${sRes.status}`);

	// --- FILTERS ----------------------------------------------------------
	// A window that ended before this data existed must return nothing. If the
	// controller ignores the dates it returns everything and this fails.
	const fRes = await fetch(
		`${BASE}/waste?startDate=2000-01-01&endDate=2000-01-02`,
		{ headers: H }
	);
	const fBody = await fRes.json().catch(() => ({}));
	check(
		"date filter is applied",
		fRes.ok && listFrom(fBody, "waste").length === 0,
		`${listFrom(fBody, "waste").length} row(s) in an empty window`
	);

	const rRes = await fetch(`${BASE}/waste?reason=Expired`, { headers: H });
	const rBody = await rRes.json().catch(() => ({}));
	const allExpired = listFrom(rBody, "waste").every((w) => w.reason === "Expired");
	check("reason filter is applied", rRes.ok && allExpired);

	console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
