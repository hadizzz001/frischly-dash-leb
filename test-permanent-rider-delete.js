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
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
		};

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

// Test permanent deletion of a rider
async function testPermanentRiderDeletion() {
	console.log("🧪 TESTING PERMANENT RIDER DELETION");
	console.log("==================================");

	// Step 1: Login
	const token = await login();
	if (!token) {
		console.error("Cannot proceed without authentication token");
		return;
	}

	// Step 2: Get list of riders
	console.log("\n📋 Fetching riders:");
	const { data: ridersData } = await apiRequest("/riders", "GET", null, token);

	if (
		!ridersData ||
		!ridersData.success ||
		!ridersData.data.riders ||
		ridersData.data.riders.length === 0
	) {
		console.log("❌ No riders found to delete. Creating a test rider first...");

		// Create a test rider user first
		const userData = {
			name: "Test Rider For Deletion",
			email: `testrider${Date.now()}@example.com`,
			password: "Test123!",
			phoneNumber: "+1234567890",
			role: "rider",
			address: {
				street: "123 Test St",
				city: "Test City",
				state: "TS",
				zipCode: "12345",
				country: "Testland",
			},
		};

		console.log("👤 Creating test user with rider role...");
		const { data: userResponse } = await apiRequest(
			"/auth/users",
			"POST",
			userData,
			token
		);

		if (!userResponse || !userResponse.success) {
			console.error(
				"❌ Failed to create test user:",
				userResponse?.message || "Unknown error"
			);
			return;
		}

		const userId = userResponse.data._id;
		console.log(`✅ Test user created with ID: ${userId}`);

		// Create rider profile for the user
		const riderData = {
			userId: userId,
			zone: "Test Zone",
			vehicleType: "motorbike",
			vehicleNumber: "TEST123",
		};

		console.log("🏍️ Creating rider profile...");
		const { data: riderResponse } = await apiRequest(
			"/riders",
			"POST",
			riderData,
			token
		);

		if (!riderResponse || !riderResponse.success) {
			console.error(
				"❌ Failed to create rider profile:",
				riderResponse?.message || "Unknown error"
			);
			return;
		}

		const riderId = riderResponse.data._id;
		console.log(`✅ Test rider created with ID: ${riderId}`);

		// Now delete the rider we just created
		console.log(`\n🗑️ Testing permanent deletion of rider ID: ${riderId}`);
		const { response: deleteResponse, data: deleteData } = await apiRequest(
			`/riders/${riderId}`,
			"DELETE",
			null,
			token
		);

		if (!deleteResponse.ok) {
			console.error(
				"❌ Failed to delete rider:",
				deleteData?.message || `HTTP ${deleteResponse.status}`
			);
			return;
		}

		console.log("✅ Rider deletion API call successful");
		console.log("Response:", deleteData);

		// Verify the rider is permanently deleted
		console.log("\n🔍 Verifying rider is permanently deleted...");
		const { response: verifyResponse } = await apiRequest(
			`/riders/${riderId}`,
			"GET",
			null,
			token
		);

		if (verifyResponse.status === 404) {
			console.log(
				"✅ SUCCESS: Rider was permanently deleted and cannot be found"
			);
		} else {
			console.error(
				"❌ FAILURE: Rider still exists or unexpected response:",
				verifyResponse.status
			);
		}

		return;
	}

	// If we have existing riders, delete one of them
	const riders = ridersData.data.riders;
	console.log(`Found ${riders.length} riders`);

	if (riders.length > 0) {
		const riderToDelete = riders[0];
		const riderId = riderToDelete._id;

		console.log(`\n🗑️ Testing permanent deletion of rider ID: ${riderId}`);
		const { response: deleteResponse, data: deleteData } = await apiRequest(
			`/riders/${riderId}`,
			"DELETE",
			null,
			token
		);

		if (!deleteResponse.ok) {
			console.error(
				"❌ Failed to delete rider:",
				deleteData?.message || `HTTP ${deleteResponse.status}`
			);
			return;
		}

		console.log("✅ Rider deletion API call successful");
		console.log("Response:", deleteData);

		// Verify the rider is permanently deleted
		console.log("\n🔍 Verifying rider is permanently deleted...");
		const { response: verifyResponse } = await apiRequest(
			`/riders/${riderId}`,
			"GET",
			null,
			token
		);

		if (verifyResponse.status === 404) {
			console.log(
				"✅ SUCCESS: Rider was permanently deleted and cannot be found"
			);
		} else {
			console.error(
				"❌ FAILURE: Rider still exists or unexpected response:",
				verifyResponse.status
			);
		}
	}
}

// Run the test
testPermanentRiderDeletion().catch((error) => {
	console.error("Test failed with error:", error);
});
