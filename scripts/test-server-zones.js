const axios = require("axios");

// Simple test to check if server is responding
async function testServerConnection() {
	console.log("Testing server connection...\n");

	try {
		// Test basic health endpoint
		const response = await axios.get("http://localhost:3001/api/health");
		console.log("✅ Server is responding!");
		console.log("Health check:", response.data);
	} catch (error) {
		console.log("❌ Server not responding on port 3001");
		console.log("Error:", error.message);

		// Try alternative ports
		console.log("\nTrying alternative ports...");
		for (const port of [3000, 8000, 8080]) {
			try {
				const response = await axios.get(`http://localhost:${port}/api/health`);
				console.log(`✅ Server found on port ${port}!`);
				console.log("Health check:", response.data);
				return;
			} catch (e) {
				console.log(`❌ No server on port ${port}`);
			}
		}
	}
}

// Test zones endpoint
async function testZonesEndpoint() {
	console.log("\nTesting zones endpoint...\n");

	try {
		const response = await axios.get("http://localhost:3001/api/zones/active");
		console.log("✅ Zones API responding!");
		console.log(`Found ${response.data.data.length} active zones`);

		if (response.data.data.length > 0) {
			console.log("\n📍 Available Zip Codes:");
			response.data.data.forEach((zone, index) => {
				console.log(`${index + 1}. ${zone.zipCode} - ${zone.zoneName}`);
			});
		} else {
			console.log(
				"⚠️  No active zones found. You may need to create some zones first."
			);
			console.log("💡 Tip: Use the dashboard to add zones with zip codes.");
		}
	} catch (error) {
		console.log("❌ Zones API error:");
		if (error.response) {
			console.log("Status:", error.response.status);
			console.log("Error:", JSON.stringify(error.response.data, null, 2));
		} else {
			console.log("Network Error:", error.message);
		}
	}
}

// Run tests
async function runTests() {
	await testServerConnection();
	await testZonesEndpoint();
}

runTests();
