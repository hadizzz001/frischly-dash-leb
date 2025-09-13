const fetch = require("node-fetch");

// Configuration
const API_URL = "http://localhost:3001/api";
const ADMIN_EMAIL = "admin@frischly.com";
const ADMIN_PASSWORD = "Admin123!";

// Helper functions
async function login() {
	try {
		console.log("🔑 Logging in as admin...");
		const response = await fetch(`${API_URL}/auth/login`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: ADMIN_EMAIL,
				password: ADMIN_PASSWORD,
			}),
		});

		const data = await response.json();
		if (data.success) {
			console.log("✅ Login successful!");
			return data.token;
		} else {
			console.error("❌ Login failed:", data.message);
			return null;
		}
	} catch (error) {
		console.error("❌ Login error:", error.message);
		return null;
	}
}

async function apiRequest(endpoint, method = "GET", body = null, token) {
	try {
		const options = {
			method,
			headers: {
				"Content-Type": "application/json",
			},
		};

		if (token) {
			options.headers.Authorization = `Bearer ${token}`;
		}

		if (body) {
			options.body = JSON.stringify(body);
		}

		const response = await fetch(`${API_URL}${endpoint}`, options);
		const data = await response.json();

		return { response, data };
	} catch (error) {
		console.error(`❌ API request error (${endpoint}):`, error.message);
		return { error };
	}
}

// Test zones API
async function testZonesAPI() {
	console.log("🧪 TESTING ZONES API");
	console.log("===================");

	// Step 1: Login
	const token = await login();
	if (!token) {
		console.error("Cannot proceed without authentication token");
		return;
	}

	// Step 2: Create test zones
	console.log("\n📝 Creating test zones...");

	const testZones = [
		{
			name: "Downtown",
			maxDistance: 5,
			zipCodes: ["12345", "12346"],
			description: "Downtown delivery zone",
			deliveryFee: 2.99,
			minDeliveryTime: 20,
			maxDeliveryTime: 40,
		},
		{
			name: "Suburbs",
			maxDistance: 10,
			zipCodes: ["23456", "23457", "23458"],
			description: "Suburban delivery zone",
			deliveryFee: 4.99,
			minDeliveryTime: 30,
			maxDeliveryTime: 60,
		},
	];

	const createdZones = [];

	for (const zoneData of testZones) {
		const { response, data } = await apiRequest(
			"/zones",
			"POST",
			zoneData,
			token
		);

		if (response && response.ok) {
			console.log(`✅ Created zone: ${zoneData.name}`);
			createdZones.push(data.data);
		} else {
			console.error(
				`❌ Failed to create zone ${zoneData.name}:`,
				data.message || "Unknown error"
			);
		}
	}

	if (createdZones.length === 0) {
		console.error("No zones created, cannot continue testing");
		return;
	}

	// Step 3: Get all zones
	console.log("\n📋 Fetching all zones...");
	const { data: allZonesData } = await apiRequest("/zones", "GET");

	if (allZonesData && allZonesData.success) {
		console.log(`Found ${allZonesData.count} zones:`);
		allZonesData.data.forEach((zone) => {
			console.log(
				`- ${zone.name}: max distance ${zone.maxDistance}km, ${zone.zipCodes.length} zip codes`
			);
		});
	} else {
		console.error("❌ Failed to fetch zones");
	}

	// Step 4: Test get zone by ID
	if (createdZones.length > 0) {
		const testZoneId = createdZones[0]._id;
		console.log(`\n🔍 Testing get zone by ID: ${testZoneId}`);

		const { data: zoneData } = await apiRequest(`/zones/${testZoneId}`, "GET");

		if (zoneData && zoneData.success) {
			console.log(`✅ Found zone: ${zoneData.data.name}`);
		} else {
			console.error("❌ Failed to get zone by ID");
		}
	}

	// Step 5: Test get zone by zip code
	if (createdZones.length > 0 && createdZones[0].zipCodes.length > 0) {
		const testZipCode = createdZones[0].zipCodes[0];
		console.log(`\n🔍 Testing get zone by zip code: ${testZipCode}`);

		const { data: zipZoneData } = await apiRequest(
			`/zones/zip/${testZipCode}`,
			"GET"
		);

		if (zipZoneData && zipZoneData.success) {
			console.log(
				`✅ Found zone for zip code ${testZipCode}: ${zipZoneData.data.name}`
			);
		} else {
			console.error(`❌ Failed to get zone by zip code ${testZipCode}`);
		}
	}

	// Step 6: Test updating a zone
	if (createdZones.length > 0) {
		const zoneToUpdate = createdZones[0];
		console.log(`\n✏️ Testing update zone: ${zoneToUpdate.name}`);

		const updateData = {
			maxDistance: zoneToUpdate.maxDistance + 2,
			description: `${zoneToUpdate.description} (Updated)`,
			deliveryFee: zoneToUpdate.deliveryFee + 1,
		};

		const { response, data: updateResponse } = await apiRequest(
			`/zones/${zoneToUpdate._id}`,
			"PUT",
			updateData,
			token
		);

		if (response && response.ok) {
			console.log(`✅ Updated zone: ${updateResponse.data.name}`);
			console.log(`   New max distance: ${updateResponse.data.maxDistance}`);
			console.log(`   New delivery fee: ${updateResponse.data.deliveryFee}`);
		} else {
			console.error(
				`❌ Failed to update zone:`,
				updateResponse?.message || "Unknown error"
			);
		}
	}

	// Step 7: Test deleting a zone
	if (createdZones.length > 0) {
		const zoneToDelete = createdZones[createdZones.length - 1];
		console.log(`\n🗑️ Testing delete zone: ${zoneToDelete.name}`);

		const { response, data: deleteResponse } = await apiRequest(
			`/zones/${zoneToDelete._id}`,
			"DELETE",
			null,
			token
		);

		if (response && response.ok) {
			console.log(`✅ Deleted zone: ${zoneToDelete.name}`);
		} else {
			console.error(
				`❌ Failed to delete zone:`,
				deleteResponse?.message || "Unknown error"
			);
		}

		// Verify deletion
		const { response: verifyResponse } = await apiRequest(
			`/zones/${zoneToDelete._id}`,
			"GET"
		);

		if (verifyResponse && verifyResponse.status === 404) {
			console.log(`✅ Verified: Zone no longer exists`);
		} else {
			console.error(
				`❌ Verification failed: Zone still exists or unexpected response`
			);
		}
	}

	console.log("\n✅ Zones API testing completed");
}

// Run the test
testZonesAPI().catch((error) => {
	console.error("Test failed with error:", error);
});
