/**
 * Test script for the Riders API
 * This script tests the basic functionality of the riders API endpoints
 */

const fetch = require("node-fetch");

// Configuration
const API_BASE_URL = "http://localhost:3001/api";
let authToken = null;

// Test rider data
const testRider = {
	name: "Test Rider",
	phoneNumber: "+1234567890",
	email: "testrider@example.com",
	vehicleType: "motorcycle",
	status: "active",
};

let createdRiderId = null;

// Helper function to get authentication token
async function authenticate() {
	try {
		const response = await fetch(`${API_BASE_URL}/auth/login`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: "admin@example.com",
				password: "admin123",
			}),
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(`Authentication failed: ${data.message}`);
		}

		authToken = data.token;
		console.log("✓ Authentication successful");
		return authToken;
	} catch (error) {
		console.error("✗ Authentication error:", error.message);
		process.exit(1);
	}
}

// Helper function for making authenticated API requests
async function apiRequest(endpoint, method = "GET", body = null) {
	try {
		const options = {
			method,
			headers: {
				Authorization: `Bearer ${authToken}`,
				"Content-Type": "application/json",
			},
		};

		if (body) {
			options.body = JSON.stringify(body);
		}

		const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
		const data = await response.json();

		return { response, data };
	} catch (error) {
		console.error(`✗ API request error (${endpoint}):`, error.message);
		return { error };
	}
}

// Test creating a rider
async function testCreateRider() {
	console.log("\n📝 Testing rider creation...");

	const { response, data, error } = await apiRequest(
		"/riders",
		"POST",
		testRider
	);

	if (error) return false;

	if (!response.ok) {
		console.error("✗ Failed to create rider:", data.message);
		return false;
	}

	console.log("✓ Rider created successfully");
	console.log("Response data structure:", JSON.stringify(data, null, 2));

	// Save the created rider ID for later tests
	if (data.data && data.data._id) {
		createdRiderId = data.data._id;
		console.log(`  ID: ${createdRiderId}`);
	} else {
		console.warn("⚠ Could not extract rider ID from response");
	}

	return true;
}

// Test getting all riders
async function testGetAllRiders() {
	console.log("\n📋 Testing get all riders...");

	const { response, data, error } = await apiRequest("/riders");

	if (error) return false;

	if (!response.ok) {
		console.error("✗ Failed to get riders:", data.message);
		return false;
	}

	console.log("✓ Fetched riders successfully");
	console.log("Response data structure:", JSON.stringify(data, null, 2));

	// Log the number of riders and first rider if available
	const riders = data.data && data.data.riders ? data.data.riders : [];
	console.log(`  Total riders: ${riders.length}`);

	if (riders.length > 0) {
		console.log("  First rider sample:", JSON.stringify(riders[0], null, 2));
	}

	return true;
}

// Test getting a single rider
async function testGetSingleRider() {
	if (!createdRiderId) {
		console.log("\n🔍 Skipping single rider test (no rider ID available)");
		return false;
	}

	console.log(`\n🔍 Testing get single rider (ID: ${createdRiderId})...`);

	const { response, data, error } = await apiRequest(
		`/riders/${createdRiderId}`
	);

	if (error) return false;

	if (!response.ok) {
		console.error("✗ Failed to get rider:", data.message);
		return false;
	}

	console.log("✓ Fetched single rider successfully");
	console.log("Response data structure:", JSON.stringify(data, null, 2));

	return true;
}

// Test updating a rider
async function testUpdateRider() {
	if (!createdRiderId) {
		console.log("\n✏️ Skipping rider update test (no rider ID available)");
		return false;
	}

	console.log(`\n✏️ Testing update rider (ID: ${createdRiderId})...`);

	const updateData = {
		name: "Updated Rider",
		status: "onLeave",
	};

	const { response, data, error } = await apiRequest(
		`/riders/${createdRiderId}`,
		"PUT",
		updateData
	);

	if (error) return false;

	if (!response.ok) {
		console.error("✗ Failed to update rider:", data.message);
		return false;
	}

	console.log("✓ Rider updated successfully");
	console.log("Response data structure:", JSON.stringify(data, null, 2));

	return true;
}

// Test deleting a rider
async function testDeleteRider() {
	if (!createdRiderId) {
		console.log("\n🗑️ Skipping rider deletion test (no rider ID available)");
		return false;
	}

	console.log(`\n🗑️ Testing permanent delete rider (ID: ${createdRiderId})...`);

	const { response, data, error } = await apiRequest(
		`/riders/${createdRiderId}`,
		"DELETE"
	);

	if (error) return false;

	if (!response.ok) {
		console.error("✗ Failed to delete rider:", data.message);
		return false;
	}

	console.log("✓ Rider permanently deleted successfully");
	console.log("Response data structure:", JSON.stringify(data, null, 2));

	// Verify the rider is truly deleted by trying to fetch it
	const verifyResult = await apiRequest(`/riders/${createdRiderId}`, "GET");
	if (verifyResult.response && verifyResult.response.status === 404) {
		console.log(
			"✓ Verification successful: Rider no longer exists in the database"
		);
	} else {
		console.log(
			"✗ Verification failed: Rider still exists or unexpected response"
		);
		console.log(
			"Verification response:",
			verifyResult.response ? verifyResult.response.status : "No response",
			verifyResult.data
		);
	}

	return true;
}

// Main test function
async function runTests() {
	console.log("🚀 Starting Riders API tests");

	// First, authenticate
	await authenticate();

	// Run the tests
	await testCreateRider();
	await testGetAllRiders();
	await testGetSingleRider();
	await testUpdateRider();
	await testDeleteRider();

	console.log("\n✅ Riders API testing completed");
}

// Run the tests
runTests().catch((err) => {
	console.error("❌ Test suite error:", err);
});
