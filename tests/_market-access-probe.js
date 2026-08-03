/*
 * Probe: hit the endpoints the market dashboard calls, using a real market
 * token, and report the ACTUAL status. Static analysis of authorize() lists can
 * mislead (middleware may special-case market tokens), so this is the ground
 * truth before changing any page.
 *
 * Read-only: GET/HEAD only. Nothing is created, updated or deleted.
 */
require("dotenv").config();
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const BASE = process.env.API_BASE || "http://localhost:10000/api";

// Read-only endpoints the market dashboard fetches, per section.
const PROBES = [
	["Announcements (list)", "/announcements"],
	["Promo Codes (list, admin route)", "/promocodes"],
	["Promo Codes (list, market route)", "/market-admin/promocodes"],
	["Settings", "/admin/settings"],
	["Waste (list)", "/waste?limit=5"],
	["Waste (stats)", "/waste/stats"],
	["For Kitchens", "/kitchens"],
	["Kitchen Categories", "/kitchen-categories"],
	["Riders (list)", "/riders"],
	["Riders (stats)", "/riders/stats"],
	["Orders (stats)", "/orders/stats"],
	["Orders (count)", "/orders/count"],
	["Orders (sales-stats)", "/orders/sales-stats"],
	["Orders (unsold-products)", "/orders/unsold-products"],
	["Orders (customer-order-counts)", "/orders/customer-order-counts"],
	["Zones (admin stats)", "/zones/admin/stats"],
	["Backup", "/backup"],
];

(async () => {
	await mongoose.connect(process.env.MONGODB_URI);
	const market = await mongoose.connection.db
		.collection("markets")
		.findOne({}, { projection: { _id: 1, name: 1 } });
	if (!market) {
		console.log("No market found.");
		await mongoose.disconnect();
		return;
	}
	const token = jwt.sign(
		{ id: String(market._id), isMarket: true, role: "market" },
		process.env.JWT_SECRET,
		{ expiresIn: "5m" }
	);
	console.log(`\nmarket account: ${market.name}\n`);

	let forbidden = 0;
	for (const [label, url] of PROBES) {
		let status, msg = "";
		try {
			const res = await fetch(BASE + url, {
				headers: { Authorization: `Bearer ${token}` },
			});
			status = res.status;
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				msg = j.message || "";
			}
		} catch (e) {
			status = "ERR";
			msg = e.message;
		}
		const flag = status === 403 ? " <-- FORBIDDEN" : status === 200 ? "" : " <--";
		if (status === 403) forbidden++;
		console.log(`  ${String(status).padEnd(4)} ${label.padEnd(34)}${flag}`);
		if (msg && status !== 200) console.log(`       ${msg.slice(0, 90)}`);
	}

	console.log(`\n${forbidden} endpoint(s) return 403 for a market account\n`);
	await mongoose.disconnect();
})();
