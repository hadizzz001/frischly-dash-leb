const fetch = require("node-fetch");

// Configuration
const API_URL = "http://localhost:3001/api/auth";
const ADMIN_EMAIL = "admin@frischly.com";
const ADMIN_PASSWORD = "Admin123!";

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

async function fetchUsers(token, options = {}) {
	try {
		let url = `${API_URL}/users`;
		const params = [];

		if (options.role) {
			params.push(`role=${options.role}`);
		}
		if (options.excludeRole) {
			params.push(`excludeRole=${options.excludeRole}`);
		}
		if (options.includeRoles) {
			params.push(`includeRoles=${options.includeRoles}`);
		}

		if (params.length > 0) {
			url += `?${params.join("&")}`;
		}

		console.log(`Fetching users with URL: ${url}`);

		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
		});

		const data = await response.json();
		if (data.success) {
			return data.data;
		} else {
			console.error("❌ Failed to fetch users:", data.message);
			return null;
		}
	} catch (error) {
		console.error("❌ Error fetching users:", error.message);
		return null;
	}
}

// Test function to test all filter options
async function testFilteredUsers() {
	console.log("🧪 TESTING USER API FILTERS");
	console.log("============================");

	// Step 1: Login
	const token = await login();
	if (!token) {
		console.error("Cannot proceed without authentication token");
		return;
	}

	// Step 2: Fetch all users
	console.log("\n📋 Fetching all users:");
	const allUsers = await fetchUsers(token);
	if (!allUsers) {
		console.error("Failed to fetch all users");
		return;
	}

	console.log(`Found ${allUsers.count} users total`);

	// Count users by role
	const roleCount = {};
	allUsers.users.forEach((user) => {
		roleCount[user.role] = (roleCount[user.role] || 0) + 1;
	});

	console.log("\nUsers by role:");
	Object.entries(roleCount).forEach(([role, count]) => {
		console.log(`- ${role}: ${count} users`);
	});

	// Step 3: Test exclude customer
	console.log("\n🚫 Fetching users excluding customers:");
	const nonCustomerUsers = await fetchUsers(token, { excludeRole: "customer" });
	if (nonCustomerUsers) {
		console.log(`Found ${nonCustomerUsers.count} non-customer users`);
		console.log("Roles found:");
		const rolesPresent = new Set();
		nonCustomerUsers.users.forEach((user) => rolesPresent.add(user.role));
		console.log([...rolesPresent].join(", "));

		// Verify no customers are present
		const hasCustomers = nonCustomerUsers.users.some(
			(user) => user.role === "customer"
		);
		if (!hasCustomers) {
			console.log("✅ No customers found in results - filter works correctly!");
		} else {
			console.log(
				"❌ Some customers found in results - filter not working correctly!"
			);
		}
	}

	// Step 4: Test specific role
	console.log("\n🎯 Fetching users with specific role (admin):");
	const adminUsers = await fetchUsers(token, { role: "admin" });
	if (adminUsers) {
		console.log(`Found ${adminUsers.count} admin users`);

		// Verify all users are admins
		const allAdmins = adminUsers.users.every((user) => user.role === "admin");
		if (allAdmins) {
			console.log("✅ All users have admin role - filter works correctly!");
		} else {
			console.log(
				"❌ Some users do not have admin role - filter not working correctly!"
			);
		}
	}

	// Step 5: Test role inclusion
	console.log("\n✅ Fetching users with multiple roles (staff,rider):");
	const staffAndRiders = await fetchUsers(token, {
		includeRoles: "staff,rider",
	});
	if (staffAndRiders) {
		console.log(`Found ${staffAndRiders.count} staff and rider users`);

		// Verify all users are staff or riders
		const validRoles = staffAndRiders.users.every(
			(user) => user.role === "staff" || user.role === "rider"
		);

		if (validRoles) {
			console.log(
				"✅ All users have staff or rider role - filter works correctly!"
			);
		} else {
			console.log(
				"❌ Some users have unexpected roles - filter not working correctly!"
			);
			// Show the distribution
			const roles = {};
			staffAndRiders.users.forEach((user) => {
				roles[user.role] = (roles[user.role] || 0) + 1;
			});
			console.log("Role distribution:", roles);
		}
	}

	console.log("\n✅ API filter testing complete!");
}

// Run the test
testFilteredUsers().catch((error) => {
	console.error("Test failed with error:", error);
});
