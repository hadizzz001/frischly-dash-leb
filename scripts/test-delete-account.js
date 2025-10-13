const fetch = require("node-fetch");

// Test user credentials
const testEmail = "test2@test.com";
const testPassword = "Test123!"; // Assuming this password for the test user

// Base URL for the API
const BASE_URL = "http://localhost:3001/api/auth";

// Function to create test user if it doesn't exist
async function createTestUser() {
	try {
		console.log("🔧 Creating test user...");

		const response = await fetch(`${BASE_URL}/register`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: "Test User",
				email: testEmail,
				password: testPassword,
				phoneNumber: "+1234567890",
				address: {
					street: "123 Test Street",
					city: "Test City",
					state: "Test State",
					zipCode: "12345",
					country: "Test Country",
				},
			}),
		});

		const data = await response.json();

		if (response.ok) {
			console.log("✅ Test user created successfully!");
			console.log("📧 Email:", testEmail);
			console.log("🔑 Password:", testPassword);
			return true;
		} else if (data.message === "User already exists with this email") {
			console.log("ℹ️  Test user already exists, proceeding with login...");
			return true;
		} else {
			console.error("❌ Failed to create test user:", data.message);
			return false;
		}
	} catch (error) {
		console.error("❌ Error creating test user:", error.message);
		return false;
	}
}

// Function to login and get token
async function login() {
	try {
		console.log("🔐 Logging in as test user...");

		const response = await fetch(`${BASE_URL}/login`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: testEmail,
				password: testPassword,
			}),
		});

		const data = await response.json();

		if (!response.ok) {
			console.error("❌ Login failed:", data.message);
			return null;
		}

		console.log("✅ Login successful!");
		return data.data.token;
	} catch (error) {
		console.error("❌ Login error:", error.message);
		return null;
	}
}

// Function to delete the account
async function deleteAccount(token) {
	try {
		console.log("🗑️  Deleting account...");

		const response = await fetch(`${BASE_URL}/delete-account`, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				password: testPassword,
			}),
		});

		const data = await response.json();

		if (response.ok) {
			console.log("✅ Account deleted successfully!");
			console.log("📄 Response:", data.message);
			return true;
		} else {
			console.error("❌ Failed to delete account:", data.message);
			return false;
		}
	} catch (error) {
		console.error("❌ Error deleting account:", error.message);
		return false;
	}
}

// Main test function
async function testDeleteAccount() {
	console.log("🚀 Starting account deletion test for", testEmail);
	console.log("=".repeat(50));

	// Step 1: Create test user if needed
	const userCreated = await createTestUser();
	if (!userCreated) {
		console.log("❌ Test failed: Could not create/access test user");
		return;
	}

	// Step 2: Login to get token
	const token = await login();
	if (!token) {
		console.log("❌ Test failed: Could not login");
		return;
	}

	// Step 3: Delete the account
	const deleted = await deleteAccount(token);
	if (deleted) {
		console.log("✅ Test completed successfully!");
		console.log("🎉 Account deletion API is working correctly");
	} else {
		console.log("❌ Test failed: Could not delete account");
	}

	console.log("=".repeat(50));
}

// Run the test
testDeleteAccount().catch(console.error);
