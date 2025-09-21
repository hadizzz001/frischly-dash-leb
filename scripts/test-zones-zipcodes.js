const axios = require("axios");

// Test the zones API to verify zip codes are available
async function testZonesAPI() {
	const baseURL = "http://localhost:3001/api";

	console.log("Testing Zones API for Zip Codes...\n");

	try {
		// Test 1: Get active zones
		console.log("1. Fetching active zones...");
		const response = await axios.get(`${baseURL}/zones/active`);
		console.log(`✅ Found ${response.data.data.length} active zones`);

		if (response.data.data.length > 0) {
			console.log("\n📍 Available Zip Codes:");
			response.data.data.forEach((zone, index) => {
				console.log(`${index + 1}. ${zone.zipCode} - ${zone.zoneName}`);
			});

			console.log("\n🎯 Zip Code Dropdown should show:");
			response.data.data.forEach((zone, index) => {
				console.log(
					`   Option ${index + 1}: "${zone.zipCode} - ${zone.zoneName}"`
				);
			});
		} else {
			console.log(
				"⚠️  No active zones found. You may need to create some zones first."
			);
		}

		// Test 2: Get all zones (in case active zones are empty)
		console.log("\n2. Fetching all zones...");
		const allResponse = await axios.get(`${baseURL}/zones`);
		console.log(`✅ Found ${allResponse.data.data.length} total zones`);

		if (allResponse.data.data.length > 0 && response.data.data.length === 0) {
			console.log("\n📍 All Zip Codes (some may be inactive):");
			allResponse.data.data.forEach((zone, index) => {
				const status = zone.isActive ? "✅ Active" : "❌ Inactive";
				console.log(
					`${index + 1}. ${zone.zipCode} - ${zone.zoneName} (${status})`
				);
			});
		}
	} catch (error) {
		console.log("\n❌ Error testing zones API:");
		if (error.response) {
			console.log("Status:", error.response.status);
			console.log("Error:", JSON.stringify(error.response.data, null, 2));
		} else {
			console.log("Network Error:", error.message);
			console.log("Make sure the server is running on http://localhost:3001");
		}
	}
}

// Run the test
testZonesAPI();
