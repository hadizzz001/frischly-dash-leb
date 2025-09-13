const fetch = require("node-fetch");

// Admin credentials
const adminEmail = "admin@frischly.com";
const adminPassword = "Admin123!";

// Variable to store the token
let token = "";

// First, login to get a token
async function login() {
	try {
		console.log(`Attempting login with email: ${adminEmail}`);
		const response = await fetch("http://localhost:3001/api/auth/login", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: adminEmail,
				password: adminPassword,
			}),
		});

		const data = await response.json();

		if (!response.ok) {
			console.error("Login failed:", data.message);
			return false;
		}

		token = data.data.token;
		console.log("Login successful. Token received.");
		return true;
	} catch (error) {
		console.error("Login error:", error);
		return false;
	}
}

// Test the getUserById endpoint with detailed inspection
async function testGetUserByIdDetailed() {
	try {
		// Using one of the user IDs we found from the previous script
		const userId = "68c54e555c064b9607b8d72f"; // Mike Transport

		console.log(`Testing getUserById endpoint for user ID: ${userId}`);
		const response = await fetch(
			`http://localhost:3001/api/auth/users/${userId}`,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			}
		);

		const data = await response.json();

		console.log("Response status:", response.status);
		console.log("Response data:", JSON.stringify(data, null, 2));

		if (data.success && data.data) {
			const user = data.data;

			// Log each important field directly
			console.log("\nInspecting user data fields:");
			console.log("- _id:", user._id);
			console.log("- name:", user.name);
			console.log("- email:", user.email);
			console.log("- phoneNumber:", user.phoneNumber);
			console.log("- role:", user.role);
			console.log("- isActive:", user.isActive);

			// Log address structure
			console.log("\nAddress structure:");
			if (user.address) {
				console.log("- street:", user.address.street);
				console.log("- city:", user.address.city);
				console.log("- state:", user.address.state);
				console.log("- zipCode:", user.address.zipCode);
				console.log("- country:", user.address.country);
			} else {
				console.log("Address is missing or null");
			}

			// Check property types
			console.log("\nProperty types:");
			console.log("- user object type:", typeof user);
			console.log("- email property type:", typeof user.email);
			console.log("- phoneNumber property type:", typeof user.phoneNumber);
			console.log("- address property type:", typeof user.address);
		}
	} catch (error) {
		console.error("Error testing getUserById:", error);
	}
}

// Run the tests
async function runTests() {
	const loginSuccess = await login();

	if (loginSuccess) {
		await testGetUserByIdDetailed();
	}
}

runTests();
