/**
 * Reproduces two reported bugs and proves the fixes:
 *
 *  1. Settings > "Minimum Order Value ($)" never showed the saved value.
 *  2. Profile > map pin(s) appeared not to be saved.
 *
 * Both come from the SAME defect: GET/PUT /api/admin/settings answer
 * { data: { settings: {...} } }, but every admin-side caller reads
 * `data.data.minimumOrderValue` / `data.data.deliveryRegions` — i.e. it reads
 * the wrapper, not the settings object. The values were written to the
 * database correctly and then never read back.
 *
 * Requires the server on :10000.
 *   node tests/_settings-map-live.js
 */
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const API = "http://localhost:10000/api";
let failures = 0;
const check = (name, ok, detail) => {
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " -> " + detail : ""}`);
	if (!ok) failures++;
};

// Mirrors public/js/config.js so the test unwraps exactly like the page does.
function objectFrom(payload, key) {
	if (!payload) return {};
	if (key) {
		if (payload[key] && typeof payload[key] === "object") return payload[key];
		if (payload.data && payload.data[key] && typeof payload.data[key] === "object")
			return payload.data[key];
	}
	return payload.data && typeof payload.data === "object" ? payload.data : {};
}

(async () => {
	await mongoose.connect(process.env.MONGODB_URI);
	const db = mongoose.connection.db;

	const admin = await db.collection("users").findOne({ role: "admin" });
	if (!admin) throw new Error("no admin user in the database");
	const adminToken = jwt.sign(
		{ id: admin._id.toString(), role: "admin" },
		process.env.JWT_SECRET,
		{ expiresIn: "1h" }
	);
	const AH = {
		Authorization: `Bearer ${adminToken}`,
		"Content-Type": "application/json",
	};

	console.log("\n=== ADMIN: minimum order value ===\n");

	// This test writes to the REAL documents, so snapshot everything it touches
	// and put it back in the finally block. deliveryRegions in particular gates
	// which shoppers can see the store — leaving probe pins behind would hide
	// products from real customers.
	const settingsBefore = await db.collection("settings").findOne({});
	const restore = [];
	restore.push(async () => {
		await db.collection("settings").updateOne(
			{ _id: settingsBefore._id },
			{
				$set: {
					minimumOrderValue: settingsBefore.minimumOrderValue,
					deliveryRegions: settingsBefore.deliveryRegions || [],
				},
			}
		);
	});

	// Save a distinctive value, then read it back the way the page does.
	const probeValue = 37.5;
	const putRes = await fetch(`${API}/admin/settings`, {
		method: "PUT",
		headers: AH,
		body: JSON.stringify({ minimumOrderValue: probeValue }),
	});
	const putJson = await putRes.json();
	check("PUT /admin/settings accepted", putRes.ok, `HTTP ${putRes.status}`);

	const stored = await db.collection("settings").findOne({});
	check(
		"value reaches the database",
		stored && stored.minimumOrderValue === probeValue,
		`db has ${stored && stored.minimumOrderValue}`
	);

	const getRes = await fetch(`${API}/admin/settings`, { headers: AH });
	const getJson = await getRes.json();

	// This is the exact expression the Settings page evaluates.
	const asPageReadsIt = objectFrom(getJson, "settings").minimumOrderValue;
	check(
		"Settings page reads back the saved value",
		asPageReadsIt === probeValue,
		`page would show ${asPageReadsIt}`
	);

	// Guard against a regression to the old wrapper read. If this ever starts
	// returning the value directly the envelope changed and the unwrap helpers
	// should be revisited; today it must be undefined.
	check(
		"envelope is still {data:{settings}} (unwrap is required)",
		getJson.data && getJson.data.minimumOrderValue === undefined &&
			typeof getJson.data.settings === "object",
		`data keys: ${Object.keys(getJson.data || {}).join(",")}`
	);

	console.log("\n=== ADMIN: profile map pins ===\n");

	const pins = [
		{ latitude: 33.8938, longitude: 35.5018, radiusKm: 5 },
		{ latitude: 34.4381, longitude: 35.8308, radiusKm: 3.5 },
	];
	const pinPut = await fetch(`${API}/admin/settings`, {
		method: "PUT",
		headers: AH,
		body: JSON.stringify({ deliveryRegions: pins }),
	});
	const pinPutJson = await pinPut.json();
	check("PUT pins accepted", pinPut.ok, `HTTP ${pinPut.status}`);

	const storedPins = await db.collection("settings").findOne({});
	check(
		"pins reach the database",
		storedPins &&
			Array.isArray(storedPins.deliveryRegions) &&
			storedPins.deliveryRegions.length === pins.length,
		`db has ${storedPins && (storedPins.deliveryRegions || []).length} pin(s)`
	);

	// The map page echoes the save response back to the user; if it reads the
	// wrapper it wrongly reports "Saved 0 of 2 pin(s) — invalid".
	const echoed = objectFrom(pinPutJson, "settings").deliveryRegions;
	check(
		"save response reports the pins back correctly",
		Array.isArray(echoed) && echoed.length === pins.length,
		`echoed ${Array.isArray(echoed) ? echoed.length : "none"} of ${pins.length}`
	);

	const reGet = await fetch(`${API}/admin/settings`, { headers: AH });
	const reGetJson = await reGet.json();
	const reloaded = objectFrom(reGetJson, "settings").deliveryRegions;
	check(
		"map reloads the saved pins",
		Array.isArray(reloaded) && reloaded.length === pins.length,
		`map would show ${Array.isArray(reloaded) ? reloaded.length : 0} pin(s)`
	);

	console.log("\n=== ADMIN: other settings fields (same envelope) ===\n");
	const s = objectFrom(reGetJson, "settings");
	check(
		"maintenance toggles/message readable",
		typeof s.isMaintenanceMode === "boolean" &&
			typeof s.areOrdersDisabled === "boolean" &&
			typeof s.maintenanceMessage === "string",
		`isMaintenanceMode=${s.isMaintenanceMode} areOrdersDisabled=${s.areOrdersDisabled}`
	);

	console.log("\n=== MARKET: minimum order value + profile pins ===\n");

	const market = await db.collection("markets").findOne({});
	if (!market) {
		console.log("  (no market in the database — skipping market checks)");
	} else {
		const marketToken = jwt.sign(
			{ id: market._id.toString(), isMarket: true },
			process.env.JWT_SECRET,
			{ expiresIn: "1h" }
		);
		const MH = {
			Authorization: `Bearer ${marketToken}`,
			"Content-Type": "application/json",
		};

		const marketSettingBefore = await db
			.collection("marketsettings")
			.findOne({ market: market._id });
		restore.push(async () => {
			if (marketSettingBefore) {
				await db.collection("marketsettings").updateOne(
					{ _id: marketSettingBefore._id },
					{ $set: { minOrderAmount: marketSettingBefore.minOrderAmount } }
				);
			}
			await db
				.collection("markets")
				.updateOne(
					{ _id: market._id },
					{ $set: { deliveryRegions: market.deliveryRegions || [] } }
				);
		});

		const mPut = await fetch(`${API}/market-admin/settings`, {
			method: "PUT",
			headers: MH,
			body: JSON.stringify({ minOrderAmount: 22.25 }),
		});
		check("market PUT settings accepted", mPut.ok, `HTTP ${mPut.status}`);

		const mGet = await fetch(`${API}/market-admin/settings`, { headers: MH });
		const mJson = await mGet.json();
		// The market dashboard reads marketData.data.minOrderAmount
		check(
			"market dashboard reads back its minimum order value",
			mJson.data && mJson.data.minOrderAmount === 22.25,
			`page would show ${mJson.data && mJson.data.minOrderAmount}`
		);

		const mpPut = await fetch(`${API}/market-admin/profile`, {
			method: "PUT",
			headers: MH,
			body: JSON.stringify({ deliveryRegions: pins }),
		});
		const mpJson = await mpPut.json();
		check("market PUT profile pins accepted", mpPut.ok, `HTTP ${mpPut.status}`);
		check(
			"market map reports pins back correctly",
			mpJson.data &&
				Array.isArray(mpJson.data.deliveryRegions) &&
				mpJson.data.deliveryRegions.length === pins.length,
			`echoed ${
				mpJson.data && Array.isArray(mpJson.data.deliveryRegions)
					? mpJson.data.deliveryRegions.length
					: "none"
			} of ${pins.length}`
		);

		const mpGet = await fetch(`${API}/market-admin/profile`, { headers: MH });
		const mpGetJson = await mpGet.json();
		check(
			"market map reloads the saved pins",
			mpGetJson.data &&
				Array.isArray(mpGetJson.data.deliveryRegions) &&
				mpGetJson.data.deliveryRegions.length === pins.length,
			`map would show ${
				mpGetJson.data && Array.isArray(mpGetJson.data.deliveryRegions)
					? mpGetJson.data.deliveryRegions.length
					: 0
			} pin(s)`
		);
	}

	for (const undo of restore.reverse()) {
		try {
			await undo();
		} catch (e) {
			console.error("  !! failed to restore original data:", e.message);
			failures++;
		}
	}
	console.log("\n  (original settings restored)");

	await mongoose.disconnect();
	console.log(
		failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
	);
	process.exit(failures === 0 ? 0 : 1);
})().catch(async (e) => {
	console.error("FATAL:", e.message);
	try {
		await mongoose.disconnect();
	} catch (_) {}
	process.exit(1);
});
