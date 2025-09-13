const fetch = require("node-fetch");

// API Configurations
const API_URL = "http://localhost:3001/api/auth";
const ADMIN_EMAIL = "admin@frischly.com";
const ADMIN_PASSWORD = "Admin123";

// Helper functions
async function login() {
	try {
		console.log("Logging in as admin...");
		const response = await fetch(`${API_URL}/login`, {
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
			console.log("Login successful!");
			return data.token;
		} else {
			console.error("Login failed:", data.message);
			return null;
		}
	} catch (error) {
		console.error("Login error:", error.message);
		return null;
	}
}

async function fetchUsers(token, role = null) {
	try {
		let url = `${API_URL}/users`;
		if (role) {
			url += `?role=${role}`;
		}

		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const data = await response.json();
		if (data.success) {
			return data.data;
		} else {
			console.error("Failed to fetch users:", data.message);
			return null;
		}
	} catch (error) {
		console.error("Error fetching users:", error.message);
		return null;
	}
}

// Main test function
async function testUserAPI() {
	// Step 1: Login to get a token
	const token = await login();
	if (!token) {
		console.error("Cannot proceed without authentication token");
		return;
	}

	// Step 2: Fetch all users
	console.log("\nFetching all users:");
	const allUsers = await fetchUsers(token);
	if (allUsers) {
		console.log(`Found ${allUsers.count} users total`);

		// Count users by role
		const roleCount = {};
		allUsers.users.forEach((user) => {
			roleCount[user.role] = (roleCount[user.role] || 0) + 1;
		});

		console.log("Users by role:");
		Object.entries(roleCount).forEach(([role, count]) => {
			console.log(`- ${role}: ${count} users`);
		});

		// List all available roles
		const availableRoles = Object.keys(roleCount);
		console.log("\nAvailable roles:", availableRoles.join(", "));

		// Step 3: Test filtering for each available role
		for (const role of availableRoles) {
			console.log(`\nFetching users with role '${role}':`);
			const filteredUsers = await fetchUsers(token, role);

			if (filteredUsers) {
				console.log(`Found ${filteredUsers.count} users with role '${role}'`);
				console.log("Sample users:");
				filteredUsers.users.slice(0, 3).forEach((user) => {
					console.log(`- ${user.name} (${user.email})`);
				});

				// Verify all returned users have the correct role
				const correctRoles = filteredUsers.users.every(
					(user) => user.role === role
				);
				if (correctRoles) {
					console.log(`✅ All returned users have the correct role: ${role}`);
				} else {
					console.log(`❌ Some users have incorrect roles!`);
					const wrongUsers = filteredUsers.users.filter(
						(user) => user.role !== role
					);
					console.log(`Wrong users: ${wrongUsers.length}`);
				}
			}
		}
	}
}

// Run the test
testUserAPI().catch((error) => {
	console.error("Test failed with error:", error);
});
