const fetch = require("node-fetch");

// Configuration
const API_URL = "http://localhost:3001/api";

// Helper function to make API requests
async function apiRequest(endpoint, method = "GET") {
	try {
		const response = await fetch(`${API_URL}${endpoint}`, { method });
		const data = await response.json();
		return data;
	} catch (error) {
		console.error(`Error making API request to ${endpoint}:`, error.message);
		return { success: false, error: error.message };
	}
}

// Test the product count API endpoint
async function testCategoryProductCount() {
	console.log("🧪 TESTING CATEGORY PRODUCT COUNT API");
	console.log("====================================");

	// Step 1: Get all categories
	console.log("\n📋 Fetching all categories:");
	const categoriesResponse = await apiRequest("/categories");

	if (
		!categoriesResponse.success ||
		!categoriesResponse.data ||
		!categoriesResponse.data.categories
	) {
		console.error(
			"❌ Failed to fetch categories:",
			categoriesResponse.message || "Unknown error"
		);
		return;
	}

	const categories = categoriesResponse.data.categories;
	console.log(`✅ Found ${categories.length} categories`);

	if (categories.length === 0) {
		console.log("❌ No categories found to test with");
		return;
	}

	// Step 2: Test the product count endpoint for each category
	console.log("\n🔢 Testing product count for each category:");

	for (const category of categories.slice(0, 5)) {
		// Test only first 5 categories to avoid too much output
		console.log(
			`\n🔍 Testing category: ${category.name} (ID: ${category._id})`
		);

		const productCountResponse = await apiRequest(
			`/categories/${category._id}/product-count`
		);

		if (productCountResponse.success) {
			console.log("✅ API call successful");
			console.log(`Category: ${productCountResponse.data.categoryName}`);
			console.log(`Product Count: ${productCountResponse.data.productCount}`);
			console.log(`Message: ${productCountResponse.message}`);
		} else {
			console.error(
				"❌ API call failed:",
				productCountResponse.message || "Unknown error"
			);
		}
	}

	// Step 3: Test with an invalid category ID
	console.log("\n❓ Testing with invalid category ID:");
	const invalidIdResponse = await apiRequest(
		"/categories/invalidid/product-count"
	);

	if (!invalidIdResponse.success) {
		console.log("✅ Correctly rejected invalid ID:", invalidIdResponse.message);
	} else {
		console.error("❌ Failed to reject invalid ID");
	}

	// Step 4: Test with a non-existent but valid format category ID
	console.log("\n❓ Testing with non-existent category ID:");
	const nonExistentResponse = await apiRequest(
		"/categories/60f1a5c52c91d83a58e9e123/product-count"
	);

	if (!nonExistentResponse.success) {
		console.log(
			"✅ Correctly handled non-existent ID:",
			nonExistentResponse.message
		);
	} else {
		console.error("❌ Failed to handle non-existent ID properly");
	}

	console.log("\n✅ Testing completed!");
}

// Run the test
testCategoryProductCount().catch((error) => {
	console.error("Test failed with error:", error);
});
