/*
 * Verify what a MARKET admin actually gets from the two promo-code endpoints.
 * Read-only: performs GETs and prints the outcome. Nothing is modified.
 */
require("dotenv").config();
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const BASE = process.env.API_BASE || "http://localhost:10000/api";

(async () => {
	await mongoose.connect(process.env.MONGODB_URI);

	// Market accounts live in the `markets` collection, not `users`.
	const market = await mongoose.connection.db
		.collection("markets")
		.findOne({}, { projection: { _id: 1, name: 1, email: 1, role: 1 } });
	if (!market) {
		console.log("No market found.");
		await mongoose.disconnect();
		return;
	}
	console.log(`market: ${market.name} (role=${market.role || "market"})`);

	const mpCount = await mongoose.connection.db
		.collection("marketpromocodes")
		.countDocuments();
	const pCount = await mongoose.connection.db
		.collection("promocodes")
		.countDocuments();
	console.log(`DB: marketpromocodes=${mpCount}  promocodes=${pCount}\n`);

	const token = jwt.sign(
		{ id: String(market._id), isMarket: true, role: "market" },
		process.env.JWT_SECRET,
		{ expiresIn: "5m" }
	);

	for (const url of ["/promocodes", "/market-admin/promocodes"]) {
		const res = await fetch(BASE + url, {
			headers: { Authorization: `Bearer ${token}` },
		});
		const j = await res.json().catch(() => ({}));
		const d = j && j.data;
		const rows =
			(d && (d.promoCodes || d.promocodes || d.items)) ||
			(Array.isArray(d) ? d : null);
		console.log(
			`${url.padEnd(28)} HTTP ${res.status}  ` +
				(res.ok
					? `rows=${rows ? rows.length : "?"}`
					: `message="${j.message || ""}"`)
		);
	}

	await mongoose.disconnect();
})();
