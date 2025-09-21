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

// Test the getUserById endpoint with the ID of one of the users we found
async function testGetUserById() {
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
	} catch (error) {
		console.error("Error testing getUserById:", error);
	}
}

// Run the tests
async function runTests() {
	const loginSuccess = await login();

	if (loginSuccess) {
		await testGetUserById();
	}
}

runTests();
