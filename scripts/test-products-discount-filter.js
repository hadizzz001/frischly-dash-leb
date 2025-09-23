const axios = require("axios");

const BASE_URL = "http://localhost:3001/api";

// Test function for products with discount filter
async function testProductsDiscountFilter() {
	console.log("🧪 Testing Products Discount Filter...\n");

	try {
		// Test 1: Get all products with any discount (discount=true)
		console.log("1. Testing products with any discount (discount=true)...");
		const response1 = await axios.get(
			`${BASE_URL}/products?discount=true&limit=5`
		);
		console.log(
			`✅ Found ${response1.data.pagination.totalProducts} products with discount`
		);
		if (response1.data.data.length > 0) {
			console.log("Sample products with discount:");
			response1.data.data.forEach((product) => {
				console.log(`   - ${product.name}: ${product.discount}% discount`);
			});
		}
		console.log();

		// Test 2: Get all products without discount (discount=false)
		console.log("2. Testing products without discount (discount=false)...");
		const response2 = await axios.get(
			`${BASE_URL}/products?discount=false&limit=5`
		);
		console.log(
			`✅ Found ${response2.data.pagination.totalProducts} products without discount`
		);
		if (response2.data.data.length > 0) {
			console.log("Sample products without discount:");
			response2.data.data.forEach((product) => {
				console.log(`   - ${product.name}: ${product.discount || 0}% discount`);
			});
		}
		console.log();

		// Test 3: Get products with minimum discount of 10%
		console.log("3. Testing products with minimum 10% discount...");
		const response3 = await axios.get(
			`${BASE_URL}/products?minDiscount=10&limit=5`
		);
		console.log(
			`✅ Found ${response3.data.pagination.totalProducts} products with 10%+ discount`
		);
		if (response3.data.data.length > 0) {
			console.log("Sample products with 10%+ discount:");
			response3.data.data.forEach((product) => {
				console.log(`   - ${product.name}: ${product.discount}% discount`);
			});
		}
		console.log();

		// Test 4: Get products with minimum discount of 25%
		console.log("4. Testing products with minimum 25% discount...");
		const response4 = await axios.get(
			`${BASE_URL}/products?minDiscount=25&limit=5`
		);
		console.log(
			`✅ Found ${response4.data.pagination.totalProducts} products with 25%+ discount`
		);
		if (response4.data.data.length > 0) {
			console.log("Sample products with 25%+ discount:");
			response4.data.data.forEach((product) => {
				console.log(`   - ${product.name}: ${product.discount}% discount`);
			});
		}
		console.log();

		// Test 5: Combine discount filter with other filters
		console.log("5. Testing combined filters (discount + search)...");
		const response5 = await axios.get(
			`${BASE_URL}/products?discount=true&search=a&limit=3`
		);
		console.log(
			`✅ Found ${response5.data.pagination.totalProducts} products with discount containing 'a'`
		);
		if (response5.data.data.length > 0) {
			console.log("Sample filtered products:");
			response5.data.data.forEach((product) => {
				console.log(`   - ${product.name}: ${product.discount}% discount`);
			});
		}
		console.log();

		// Test 6: Test sorting by discount
		console.log("6. Testing sort by discount (highest first)...");
		const response6 = await axios.get(
			`${BASE_URL}/products?discount=true&sortBy=discount&sortOrder=desc&limit=5`
		);
		console.log(
			`✅ Found ${response6.data.pagination.totalProducts} products sorted by discount`
		);
		if (response6.data.data.length > 0) {
			console.log("Top discounted products:");
			response6.data.data.forEach((product) => {
				console.log(`   - ${product.name}: ${product.discount}% discount`);
			});
		}
		console.log();

		console.log("🎉 All discount filter tests completed successfully!");
	} catch (error) {
		console.error(
			"❌ Error testing products discount filter:",
			error.response?.data || error.message
		);
	}
}

// Run the test
testProductsDiscountFilter();
