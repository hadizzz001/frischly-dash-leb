const axios = require("axios");

// Test the new customer count endpoint
async function testCustomerCount() {
	try {
		console.log("Testing GET /api/auth/customers/count endpoint...\n");

		// You'll need to replace this with a valid admin token
		const authToken = "YOUR_ADMIN_TOKEN_HERE";

		const response = await axios.get(
			"http://localhost:3001/api/auth/customers/count",
			{
				headers: {
					Authorization: `Bearer ${authToken}`,
					"Content-Type": "application/json",
				},
				timeout: 5000,
			}
		);

		console.log("Status:", response.status);
		console.log("Response Data:");
		console.log(JSON.stringify(response.data, null, 2));

		if (response.data.success) {
			console.log("\n✅ Success! Retrieved customer count");
			console.log(
				`Total active customers: ${response.data.data.customerCount}`
			);
		} else {
			console.log("❌ Request failed:", response.data.message);
		}
	} catch (error) {
		console.error("❌ Error testing customer count endpoint:");
		if (error.code === "ECONNREFUSED") {
			console.error(
				"Server is not running. Please start the server with: node server.js"
			);
		} else if (error.response) {
			console.error("Status:", error.response.status);
			console.error("Response:", error.response.data);

			if (error.response.status === 401) {
				console.error(
					"\n💡 Note: You need to provide a valid admin/manager token in the script"
				);
				console.error("Replace YOUR_ADMIN_TOKEN_HERE with an actual JWT token");
			}
		} else {
			console.error("Error:", error.message);
		}
	}
}

// Check if server is accessible first (without auth)
async function checkServer() {
	try {
		const response = await axios.get("http://localhost:3001/api/categories", {
			timeout: 3000,
		});
		console.log("✅ Server is running!\n");
		return true;
	} catch (error) {
		console.log(
			"❌ Server is not accessible. Please start the server first with: node server.js\n"
		);
		return false;
	}
}

// Run the test
async function runTest() {
	const serverRunning = await checkServer();
	if (serverRunning) {
		console.log("💡 To test this endpoint with authentication, please:");
		console.log("1. Sign in to the dashboard as an admin/manager");
		console.log("2. Copy the JWT token from localStorage or network requests");
		console.log("3. Replace YOUR_ADMIN_TOKEN_HERE in this script\n");

		await testCustomerCount();
	}
}

runTest();
