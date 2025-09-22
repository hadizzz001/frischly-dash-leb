const axios = require("axios");

const BASE_URL = "http://localhost:3001/api/products";

async function testProductsWithDiscount() {
	try {
		console.log("🧪 Testing GET /api/products/discount endpoint...\n");

		// Test 1: Get all products with discount (default params)
		console.log("Test 1: Get all products with discount (default)");
		const response1 = await axios.get(`${BASE_URL}/discount`);
		console.log(`✅ Status: ${response1.status}`);
		console.log(
			`📊 Total products with discount: ${response1.data.pagination.totalProducts}`
		);
		console.log(`📄 Current page: ${response1.data.pagination.currentPage}`);
		console.log(`📋 Products returned: ${response1.data.data.length}`);

		if (response1.data.data.length > 0) {
			console.log("🎯 Sample product with discount:");
			const sample = response1.data.data[0];
			console.log(`   Name: ${sample.name}`);
			console.log(`   Discount: ${sample.discount}%`);
			console.log(`   Original Price: €${sample.price}`);
			console.log(
				`   Final Price: €${(
					sample.price *
					(1 - sample.discount / 100)
				).toFixed(2)}`
			);
		}
		console.log("");

		// Test 2: Get products with discount > 10%
		console.log("Test 2: Get products with discount > 10%");
		const response2 = await axios.get(`${BASE_URL}/discount?minDiscount=10`);
		console.log(`✅ Status: ${response2.status}`);
		console.log(
			`📊 Total products with discount > 10%: ${response2.data.pagination.totalProducts}`
		);
		console.log("");

		// Test 3: Get products with discount, sorted by discount descending
		console.log(
			"Test 3: Get products with discount, sorted by discount (highest first)"
		);
		const response3 = await axios.get(
			`${BASE_URL}/discount?sortBy=discount&sortOrder=desc&limit=5`
		);
		console.log(`✅ Status: ${response3.status}`);
		console.log(
			`📊 Total products: ${response3.data.pagination.totalProducts}`
		);
		console.log("🎯 Top 5 products by discount:");
		response3.data.data.forEach((product, index) => {
			console.log(
				`   ${index + 1}. ${product.name} - ${product.discount}% off`
			);
		});
		console.log("");

		// Test 4: Search products with discount
		console.log('Test 4: Search products with discount containing "wein"');
		const response4 = await axios.get(`${BASE_URL}/discount?search=wein`);
		console.log(`✅ Status: ${response4.status}`);
		console.log(
			`📊 Products found: ${response4.data.pagination.totalProducts}`
		);
		console.log("");

		// Test 5: Pagination test
		console.log("Test 5: Test pagination (page 1, limit 2)");
		const response5 = await axios.get(`${BASE_URL}/discount?page=1&limit=2`);
		console.log(`✅ Status: ${response5.status}`);
		console.log(`📄 Page: ${response5.data.pagination.currentPage}`);
		console.log(`📏 Limit: ${response5.data.pagination.limit}`);
		console.log(`📊 Total pages: ${response5.data.pagination.totalPages}`);
		console.log(`➡️  Has next page: ${response5.data.pagination.hasNextPage}`);
		console.log(`⬅️  Has prev page: ${response5.data.pagination.hasPrevPage}`);
		console.log("");

		console.log("🎉 All tests completed successfully!");
	} catch (error) {
		console.error("❌ Test failed:");
		if (error.response) {
			console.error(`Status: ${error.response.status}`);
			console.error(`Message: ${error.response.data.message}`);
		} else {
			console.error(`Error: ${error.message}`);
		}
	}
}

// Run the test
testProductsWithDiscount();
