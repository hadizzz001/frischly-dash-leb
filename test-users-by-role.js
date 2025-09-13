const axios = require("axios");
const readline = require("readline");

// Create readline interface for user input
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

// Default configuration for the API
const API_URL = "http://localhost:3001/api/auth";
let authToken = "";

// Function to login and get token
async function login() {
	try {
		console.log("Logging in to get auth token...");
		const response = await axios.post(`${API_URL}/login`, {
			email: "admin@frischly.com",
			password: "Admin123!",
		});

		if (response.data.success) {
			authToken = response.data.token;
			console.log("Login successful!");
			return true;
		} else {
			console.error("Login failed:", response.data.message);
			return false;
		}
	} catch (error) {
		console.error(
			"Login error:",
			error.response ? error.response.data : error.message
		);
		return false;
	}
}

// Function to get all users
async function getAllUsers() {
	try {
		console.log("\nFetching all users...");
		const response = await axios.get(`${API_URL}/users`, {
			headers: { Authorization: `Bearer ${authToken}` },
		});

		if (response.data.success) {
			console.log(`Found ${response.data.data.count} users:`);
			response.data.data.users.forEach((user) => {
				console.log(`- ${user.name} (${user.email}): ${user.role}`);
			});
		} else {
			console.error("Failed to fetch users:", response.data.message);
		}
	} catch (error) {
		console.error(
			"Error fetching users:",
			error.response ? error.response.data : error.message
		);
	}
}

// Function to get users filtered by role
async function getUsersByRole(role) {
	try {
		console.log(`\nFetching users with role '${role}'...`);
		const response = await axios.get(`${API_URL}/users?role=${role}`, {
			headers: { Authorization: `Bearer ${authToken}` },
		});

		if (response.data.success) {
			console.log(
				`Found ${response.data.data.count} users with role '${role}':`
			);
			response.data.data.users.forEach((user) => {
				console.log(`- ${user.name} (${user.email}): ${user.role}`);
			});
		} else {
			console.error(
				`Failed to fetch users with role '${role}':`,
				response.data.message
			);
		}
	} catch (error) {
		console.error(
			`Error fetching users with role '${role}':`,
			error.response ? error.response.data : error.message
		);
	}
}

// Main function to run the test
async function runTest() {
	const loggedIn = await login();
	if (!loggedIn) {
		rl.close();
		return;
	}

	// Get all users first
	await getAllUsers();

	// Ask user for role to filter by
	rl.question(
		"\nEnter a role to filter by (customer, rider, staff, user, manager, admin): ",
		async (role) => {
			if (role) {
				await getUsersByRole(role);
			} else {
				console.log("No role provided, skipping filtered search.");
			}

			console.log("\nTest completed!");
			rl.close();
		}
	);
}

// Run the test
runTest();
