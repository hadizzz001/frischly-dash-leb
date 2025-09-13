const fetch = require("node-fetch");

// The user ID to test - replace with a valid user ID from your database
const userId = "68c400fb4903f9c0c3c98b49";

// Admin token - replace with a valid admin token
let token = "";

// First, login to get a token
async function login() {
	try {
		const response = await fetch("http://localhost:3001/api/auth/login", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: "admin@frischly.com",
				password: "Admin123",
			}),
		});

		const data = await response.json();

		if (!response.ok) {
			console.error("Login failed:", data.message);
			return false;
		}

		token = data.data.token;
		console.log("Login successful. Token:", token);
		return true;
	} catch (error) {
		console.error("Login error:", error);
		return false;
	}
}

// Then, test the get user by ID endpoint
async function testGetUserById() {
	try {
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
		console.log("\nTesting getUserById endpoint:");
		await testGetUserById();
	}
}

runTests();
