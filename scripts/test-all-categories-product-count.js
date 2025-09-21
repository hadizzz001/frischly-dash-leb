const axios = require("axios");

// Test the new all categories product count endpoint
async function testAllCategoriesProductCount() {
	try {
		console.log("Testing GET /api/categories/all/product-count endpoint...\n");

		const response = await axios.get(
			"http://localhost:3001/api/categories/all/product-count",
			{
				timeout: 5000, // 5 second timeout
			}
		);

		console.log("Status:", response.status);
		console.log("Response Data:");
		console.log(JSON.stringify(response.data, null, 2));

		if (response.data.success) {
			console.log("\n✅ Success! Retrieved product counts for all categories");
			console.log(`Total categories with counts: ${response.data.total}`);

			if (response.data.data && response.data.data.length > 0) {
				console.log("\nCategory Product Counts:");
				response.data.data.forEach((category) => {
					console.log(
						`- ${category.categoryName} (ID: ${category.categoryId}): ${category.productCount} products`
					);
				});
			} else {
				console.log("No categories found or no data returned");
			}
		} else {
			console.log("❌ Request failed:", response.data.message);
		}
	} catch (error) {
		console.error("❌ Error testing all categories product count endpoint:");
		if (error.code === "ECONNREFUSED") {
			console.error(
				"Server is not running. Please start the server with: node server.js"
			);
		} else if (error.response) {
			console.error("Status:", error.response.status);
			console.error("Response:", error.response.data);
		} else {
			console.error("Error:", error.message);
		}
	}
}

// Check if server is accessible first
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
		await testAllCategoriesProductCount();
	}
}

runTest();
