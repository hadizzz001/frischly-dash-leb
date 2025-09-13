const fetch = require("node-fetch");

// Admin credentials - update these as needed
const adminEmail = "admin@frischly.com";
const adminPassword = "Admin123!"; // Added exclamation mark

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

// Test the getAllUsers endpoint
async function testGetAllUsers() {
	try {
		console.log("Testing getAllUsers endpoint...");
		const response = await fetch("http://localhost:3001/api/auth/users", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
		});

		const data = await response.json();

		console.log("Response status:", response.status);
		if (response.ok) {
			console.log("Total users:", data.data.users.length);
			console.log("First few users:");
			const users = data.data.users.slice(0, 3); // Show first 3 users
			users.forEach((user) => {
				console.log(
					`- ID: ${user._id}, Name: ${user.name}, Email: ${user.email}, Role: ${user.role}`
				);
			});
		} else {
			console.error("Error:", data.message);
		}
	} catch (error) {
		console.error("Error testing getAllUsers:", error);
	}
}

// Run the tests
async function runTests() {
	const loginSuccess = await login();

	if (loginSuccess) {
		await testGetAllUsers();
	}
}

runTests();
