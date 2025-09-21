const axios = require("axios");

// Test the new product filters
async function testProductFilters() {
	const baseURL = "http://localhost:3001/api"; // Adjust if your server runs on different port
	const token = "YOUR_AUTH_TOKEN_HERE"; // Replace with actual token

	const headers = {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	};

	console.log("Testing Product Filters...\n");

	try {
		// Test 1: Filter by price range (under €10)
		console.log("1. Testing price filter: Under €10");
		const priceResponse = await axios.get(
			`${baseURL}/products?priceRange=0-10&limit=5`,
			{ headers }
		);
		console.log(`Found ${priceResponse.data.data.length} products under €10\n`);

		// Test 2: Filter by stock level (low stock)
		console.log("2. Testing stock filter: Low stock (≤10)");
		const stockResponse = await axios.get(
			`${baseURL}/products?stockLevel=low&limit=5`,
			{ headers }
		);
		console.log(
			`Found ${stockResponse.data.data.length} products with low stock\n`
		);

		// Test 3: Filter by price and stock combined
		console.log("3. Testing combined filters: Price €10-25 AND medium stock");
		const combinedResponse = await axios.get(
			`${baseURL}/products?priceRange=10-25&stockLevel=medium&limit=5`,
			{ headers }
		);
		console.log(
			`Found ${combinedResponse.data.data.length} products matching both criteria\n`
		);

		// Test 4: Sort by price (low to high)
		console.log("4. Testing sort by price: Low to High");
		const sortResponse = await axios.get(
			`${baseURL}/products?sortBy=price&sortOrder=asc&limit=5`,
			{ headers }
		);
		console.log(
			`First product price: €${sortResponse.data.data[0]?.price || "N/A"}\n`
		);

		console.log("All filter tests completed successfully!");
	} catch (error) {
		console.error(
			"Error testing filters:",
			error.response?.data || error.message
		);
	}
}

// Run the test
testProductFilters();
