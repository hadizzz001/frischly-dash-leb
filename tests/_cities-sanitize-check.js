/*
 * Logic test for the server-side cities sanitization used by the profile
 * endpoints. It exercises the exact normalization rule (trim, drop blanks,
 * de-dupe, cap at 60) without needing a DB connection.
 *
 *   node tests/_cities-sanitize-check.js
 */
let pass = 0,
	fail = 0;
const ok = (cond, msg) => {
	console.log((cond ? "  ✓ " : "  ✗ ") + msg);
	cond ? pass++ : fail++;
};

// Mirror of the controller logic (authController.updateProfile / marketAdmin).
function sanitizeCities(cities) {
	return Array.isArray(cities)
		? [
				...new Set(
					cities
						.filter((c) => typeof c === "string")
						.map((c) => c.trim())
						.filter(Boolean)
				),
		  ].slice(0, 60)
		: [];
}

ok(
	JSON.stringify(sanitizeCities(["Beirut", "Tyre"])) ===
		JSON.stringify(["Beirut", "Tyre"]),
	"keeps valid cities"
);
ok(
	JSON.stringify(sanitizeCities([" Beirut ", "Tyre", "Beirut"])) ===
		JSON.stringify(["Beirut", "Tyre"]),
	"trims + de-duplicates"
);
ok(
	JSON.stringify(sanitizeCities(["", "  ", "Sidon", null, 5, {}])) ===
		JSON.stringify(["Sidon"]),
	"drops blanks and non-strings"
);
ok(JSON.stringify(sanitizeCities("nope")) === "[]", "non-array → empty array");
ok(JSON.stringify(sanitizeCities(undefined)) === "[]", "undefined → empty array");
ok(sanitizeCities(Array.from({ length: 200 }, (_, i) => "City" + i)).length === 60, "caps at 60 entries");

// The controllers must load without errors and expose the handlers.
try {
	const authController = require("../src/controllers/authController");
	ok(typeof authController.updateProfile === "function", "authController.updateProfile exported");
	const marketAdmin = require("../src/controllers/marketAdminController");
	ok(typeof marketAdmin.updateProfile === "function", "marketAdminController.updateProfile exported");
} catch (e) {
	ok(false, "controllers load without error: " + e.message);
}

// The models must compile and include the new cities path.
try {
	const mongoose = require("mongoose");
	// Avoid OverwriteModelError if already registered elsewhere.
	const User = mongoose.models.User || require("../src/models/User");
	const Market = mongoose.models.Market || require("../src/models/Market");
	ok(!!User.schema.path("cities"), "User schema has cities path");
	ok(!!Market.schema.path("cities"), "Market schema has cities path");
} catch (e) {
	ok(false, "models load without error: " + e.message);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
