/**
 * Live check for the "look up product by barcode" step of the Record Waste modal.
 *
 * Reported symptom: after entering a barcode, the product detail block never
 * shows anything. Root cause: GET /waste/product/:barcode answers
 * { data: { product } } but the page read `data.data` (the wrapper), so every
 * field came back undefined and the hidden productId was never populated —
 * which also meant stock was not decremented on save.
 *
 *   node tests/_waste-barcode-live.js
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

// Mirrors public/js/config.js objectFrom().
function objectFrom(payload, key) {
	if (!payload || typeof payload !== "object") return null;
	if (Array.isArray(payload)) return payload[0] || null;
	const isRecord = (v) => v && typeof v === "object" && !Array.isArray(v);
	if (key) {
		if (isRecord(payload[key])) return payload[key];
		if (isRecord(payload.data) && isRecord(payload.data[key])) return payload.data[key];
	}
	const data = payload.data;
	if (isRecord(data)) {
		const keys = Object.keys(data);
		if (keys.length === 1 && isRecord(data[keys[0]]) && !("_id" in data)) {
			return data[keys[0]];
		}
		return data;
	}
	if ("_id" in payload || "id" in payload) return payload;
	return null;
}

(async () => {
	await mongoose.connect(process.env.MONGODB_URI);
	const admin = await mongoose.connection.db
		.collection("users")
		.findOne({ role: "admin" });
	const token = jwt.sign(
		{ id: admin._id.toString(), role: "admin" },
		process.env.JWT_SECRET,
		{ expiresIn: "1h" }
	);
	const H = { Authorization: `Bearer ${token}` };

	// The lookup only resolves ACTIVE main-store products, so pick one of those
	// — an inactive product legitimately 404s.
	const product = await mongoose.connection.db
		.collection("products")
		.findOne({
			barcode: { $exists: true, $nin: [null, ""] },
			market: null,
			isActive: true,
		});
	const inactive = await mongoose.connection.db
		.collection("products")
		.findOne({
			barcode: { $exists: true, $nin: [null, ""] },
			isActive: false,
		});
	await mongoose.disconnect();

	console.log(`\n=== Barcode lookup: "${product.barcode}" (${product.name}) ===\n`);

	const res = await fetch(
		`${BASE}/waste/product/${encodeURIComponent(product.barcode)}`,
		{ headers: H }
	);
	const body = await res.json().catch(() => null);
	check("lookup responds", res.status === 200, `HTTP ${res.status}`);

	// Reproduce the old behaviour.
	const oldWay = body.data;
	check(
		"reproduced: old parsing yields undefined fields",
		oldWay && oldWay._id === undefined && oldWay.name === undefined
	);

	// The fix.
	const rec = objectFrom(body, "product");
	check("fixed: objectFrom yields the record", !!(rec && rec._id), rec && rec.name);
	check("name is renderable", typeof rec.name === "string" && rec.name.length > 0);
	check("price is numeric", typeof rec.price === "number", `$${rec.price}`);
	check("stock is defined", rec.stock !== undefined, String(rec.stock));

	// Category must render as a NAME, not a raw ObjectId hex string.
	const categoryText =
		(rec.category && (rec.category.name || rec.category)) || "N/A";
	check(
		"category renders as a name, not an ObjectId",
		typeof categoryText === "string" && !/^[a-f0-9]{24}$/i.test(categoryText),
		String(categoryText)
	);

	// An unknown barcode must fail cleanly with a useful message.
	const missRes = await fetch(`${BASE}/waste/product/NOSUCHBARCODE123`, {
		headers: H,
	});
	const missBody = await missRes.json().catch(() => ({}));
	check("unknown barcode returns 404", missRes.status === 404);
	check(
		"unknown barcode carries a readable message",
		typeof missBody.message === "string" && missBody.message.length > 0,
		missBody.message
	);

	// A deactivated product must say so rather than claiming the barcode is
	// unknown — 60 products are inactive, and the old message sent staff
	// hunting for a barcode that was actually correct.
	if (inactive) {
		const iRes = await fetch(
			`${BASE}/waste/product/${encodeURIComponent(inactive.barcode)}`,
			{ headers: H }
		);
		const iBody = await iRes.json().catch(() => ({}));
		check(
			"deactivated product explains why, not just 'not found'",
			iRes.status === 404 && /deactivated/i.test(iBody.message || ""),
			iBody.message
		);
	}

	console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
	process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
