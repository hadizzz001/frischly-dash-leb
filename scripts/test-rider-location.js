/**
 * Test script for Rider Location Update API
 *
 * This script tests the PATCH /api/riders/:id/location endpoint
 *
 * Usage:
 * 1. Make sure you have a valid rider ID and authentication token
 * 2. Update the riderId and token variables below
 * 3. Run: node scripts/test-rider-location.js
 */

const fetch = require("node-fetch");

// Configuration - Update these values
const BASE_URL = process.env.API_URL || "http://localhost:5000";
const RIDER_ID = process.env.RIDER_ID || "YOUR_RIDER_ID_HERE";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "YOUR_JWT_TOKEN_HERE";

// Test location coordinates (Berlin, Germany)
const testLocation = {
	latitude: 52.520008,
	longitude: 13.404954,
};

/**
 * Update rider location
 */
async function updateRiderLocation(riderId, latitude, longitude) {
	try {
		console.log("\n📍 Testing Rider Location Update API...");
		console.log(`Rider ID: ${riderId}`);
		console.log(`Location: ${latitude}, ${longitude}`);

		const response = await fetch(`${BASE_URL}/api/riders/${riderId}/location`, {
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${AUTH_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				latitude,
				longitude,
			}),
		});

		const data = await response.json();

		console.log("\n✅ Response Status:", response.status);
		console.log("Response Data:", JSON.stringify(data, null, 2));

		if (data.success) {
			console.log("\n🎉 Location updated successfully!");
			console.log("Updated Location:", data.data.currentLocation);
		} else {
			console.log("\n❌ Error:", data.message);
		}

		return data;
	} catch (error) {
		console.error("\n❌ Request failed:", error.message);
		throw error;
	}
}

/**
 * Test invalid coordinates
 */
async function testInvalidCoordinates() {
	console.log("\n\n🧪 Testing Invalid Coordinates...");

	// Test 1: Invalid latitude (> 90)
	console.log("\n--- Test 1: Invalid Latitude ---");
	try {
		await updateRiderLocation(RIDER_ID, 91, 13.404954);
	} catch (error) {
		console.log("Expected error for invalid latitude");
	}

	// Test 2: Invalid longitude (< -180)
	console.log("\n--- Test 2: Invalid Longitude ---");
	try {
		await updateRiderLocation(RIDER_ID, 52.520008, -181);
	} catch (error) {
		console.log("Expected error for invalid longitude");
	}

	// Test 3: Missing coordinates
	console.log("\n--- Test 3: Missing Coordinates ---");
	try {
		const response = await fetch(
			`${BASE_URL}/api/riders/${RIDER_ID}/location`,
			{
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${AUTH_TOKEN}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			}
		);
		const data = await response.json();
		console.log("Response:", data);
	} catch (error) {
		console.log("Expected error for missing coordinates");
	}
}

/**
 * Simulate continuous location updates
 */
async function simulateLocationTracking(
	riderId,
	duration = 30000,
	interval = 5000
) {
	console.log("\n\n🚗 Simulating Location Tracking...");
	console.log(`Duration: ${duration / 1000} seconds`);
	console.log(`Update Interval: ${interval / 1000} seconds`);

	const startTime = Date.now();
	let updateCount = 0;

	const trackingInterval = setInterval(async () => {
		const elapsed = Date.now() - startTime;

		if (elapsed >= duration) {
			clearInterval(trackingInterval);
			console.log(`\n✅ Tracking completed. Total updates: ${updateCount}`);
			return;
		}

		// Simulate slight movement (random offset within ~100 meters)
		const latOffset = (Math.random() - 0.5) * 0.001;
		const lonOffset = (Math.random() - 0.5) * 0.001;

		const newLat = testLocation.latitude + latOffset;
		const newLon = testLocation.longitude + lonOffset;

		updateCount++;
		console.log(
			`\n--- Update #${updateCount} (${elapsed / 1000}s elapsed) ---`
		);

		try {
			await updateRiderLocation(riderId, newLat, newLon);
		} catch (error) {
			console.error("Update failed:", error.message);
		}
	}, interval);
}

/**
 * Get rider details to verify location
 */
async function getRiderDetails(riderId) {
	try {
		console.log("\n\n📋 Fetching Rider Details...");

		const response = await fetch(`${BASE_URL}/api/riders/${riderId}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${AUTH_TOKEN}`,
				"Content-Type": "application/json",
			},
		});

		const data = await response.json();

		if (data.success) {
			console.log("Current Location:", data.data.currentLocation);
			console.log("Status:", data.data.status);
			console.log("Zones:", data.data.zones);
		} else {
			console.log("Error:", data.message);
		}

		return data;
	} catch (error) {
		console.error("Failed to fetch rider details:", error.message);
	}
}

/**
 * Main test runner
 */
async function runTests() {
	console.log("🚀 Starting Rider Location API Tests");
	console.log("=====================================");

	// Validate configuration
	if (
		RIDER_ID === "YOUR_RIDER_ID_HERE" ||
		AUTH_TOKEN === "YOUR_JWT_TOKEN_HERE"
	) {
		console.error(
			"\n❌ Error: Please update RIDER_ID and AUTH_TOKEN in the script or set environment variables"
		);
		console.log("\nUsage:");
		console.log(
			"  RIDER_ID=<rider_id> AUTH_TOKEN=<token> node scripts/test-rider-location.js"
		);
		process.exit(1);
	}

	try {
		// Test 1: Get current rider details
		await getRiderDetails(RIDER_ID);

		// Test 2: Update location with valid coordinates
		await updateRiderLocation(
			RIDER_ID,
			testLocation.latitude,
			testLocation.longitude
		);

		// Test 3: Verify updated location
		await getRiderDetails(RIDER_ID);

		// Test 4: Test invalid coordinates (optional)
		const runInvalidTests = process.argv.includes("--test-invalid");
		if (runInvalidTests) {
			await testInvalidCoordinates();
		}

		// Test 5: Simulate continuous tracking (optional)
		const simulateTracking = process.argv.includes("--simulate");
		if (simulateTracking) {
			await simulateLocationTracking(RIDER_ID, 30000, 5000);
		}

		console.log("\n\n✅ All tests completed!");
	} catch (error) {
		console.error("\n❌ Test failed:", error.message);
		process.exit(1);
	}
}

// Run tests if this script is executed directly
if (require.main === module) {
	runTests();
}

module.exports = {
	updateRiderLocation,
	testInvalidCoordinates,
	simulateLocationTracking,
	getRiderDetails,
};
