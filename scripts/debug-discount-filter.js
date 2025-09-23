const axios = require("axios");

const BASE_URL = "http://localhost:3001/api";

// Simple test to debug discount filtering
async function debugDiscountFilter() {
	console.log("🔍 Debugging Discount Filter...\n");

	try {
		// Test basic request first
		console.log("1. Testing basic products request...");
		const response1 = await axios.get(`${BASE_URL}/products?limit=3`);
		console.log(
			`✅ Found ${response1.data.pagination.totalProducts} total products`
		);
		console.log("Sample products:");
		response1.data.data.forEach((product) => {
			console.log(
				`   - ${product.name}: discount=${product.discount || "undefined"}`
			);
		});
		console.log();

		// Test with discount=true specifically
		console.log("2. Testing discount=true filter...");
		const response2 = await axios.get(
			`${BASE_URL}/products?discount=true&limit=3`
		);
		console.log(`Request URL: ${BASE_URL}/products?discount=true&limit=3`);
		console.log(
			`✅ Found ${response2.data.pagination.totalProducts} products with discount filter`
		);
		console.log("Filtered products:");
		response2.data.data.forEach((product) => {
			console.log(
				`   - ${product.name}: discount=${product.discount || "undefined"}`
			);
		});
		console.log();

		// Test minDiscount filter specifically
		console.log("3. Testing minDiscount=1 filter...");
		const response3 = await axios.get(
			`${BASE_URL}/products?minDiscount=1&limit=3`
		);
		console.log(`Request URL: ${BASE_URL}/products?minDiscount=1&limit=3`);
		console.log(
			`✅ Found ${response3.data.pagination.totalProducts} products with minDiscount filter`
		);
		console.log("Filtered products:");
		response3.data.data.forEach((product) => {
			console.log(
				`   - ${product.name}: discount=${product.discount || "undefined"}`
			);
		});
		console.log();
	} catch (error) {
		console.error("❌ Error:", error.response?.data || error.message);
	}
}

debugDiscountFilter();
