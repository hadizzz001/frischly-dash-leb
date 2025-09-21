const fetch = require("node-fetch");

// Admin token - will be set after login
let token = "";

// Test product data with bottlerefund
const testProduct = {
	name: "Test Product with Bottle Refund",
	description: "A test product to verify bottlerefund functionality",
	price: 10.99,
	tax: 8.5,
	discount: 5,
	bottlerefund: 2.5,
	stock: 100,
	isActive: true,
	subcategory: "679f8b8b8b8b8b8b8b8b8b8b", // Replace with a valid subcategory ID
	barcode: `TEST${Date.now()}`, // Unique barcode with timestamp
	shelfNumber: "A-01",
};

// First, login to get a token
async function login() {
	try {
		const response = await fetch("http://localhost:3001/api/auth/login", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: "admin@frischly.com",
				password: "Admin123!",
			}),
		});

		const data = await response.json();

		if (!response.ok) {
			console.error("Login failed:", data.message);
			return false;
		}

		token = data.data.token;
		console.log("✅ Login successful");
		return true;
	} catch (error) {
		console.error("❌ Login error:", error);
		return false;
	}
}

// Test creating a product with bottlerefund
async function testCreateProductWithBottlerefund() {
	try {
		console.log("\n🧪 Testing product creation with bottlerefund...");

		const response = await fetch("http://localhost:3001/api/products", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(testProduct),
		});

		const data = await response.json();

		if (!response.ok) {
			console.error("❌ Product creation failed:", data.message);
			return null;
		}

		console.log("✅ Product created successfully");
		console.log("📦 Product ID:", data.data._id);
		console.log("🏷️  Product Name:", data.data.name);
		console.log("💰 Base Price:", data.data.price);
		console.log("💸 Tax:", data.data.tax + "%");
		console.log("🎯 Discount:", data.data.discount + "%");
		console.log("🔄 Bottle Refund:", data.data.bottlerefund);
		console.log("💵 Final Price:", data.data.finalPrice);

		return data.data._id;
	} catch (error) {
		console.error("❌ Product creation error:", error);
		return null;
	}
}

// Test retrieving the product to verify bottlerefund is stored correctly
async function testGetProduct(productId) {
	try {
		console.log("\n🔍 Testing product retrieval...");

		const response = await fetch(
			`http://localhost:3001/api/products/${productId}`,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			}
		);

		const data = await response.json();

		if (!response.ok) {
			console.error("❌ Product retrieval failed:", data.message);
			return false;
		}

		const product = data.data;
		console.log("✅ Product retrieved successfully");
		console.log("🏷️  Product Name:", product.name);
		console.log("💰 Base Price:", product.price);
		console.log("💸 Tax:", product.tax + "%");
		console.log("🎯 Discount:", product.discount + "%");
		console.log("🔄 Bottle Refund:", product.bottlerefund);
		console.log("💵 Final Price:", product.finalPrice);

		// Verify bottlerefund calculation
		const expectedDiscountedPrice =
			product.price - (product.price * product.discount) / 100;
		const expectedTaxAmount = (expectedDiscountedPrice * product.tax) / 100;
		const expectedFinalPrice =
			expectedDiscountedPrice + expectedTaxAmount + product.bottlerefund;

		console.log("\n🔢 Price Calculation Verification:");
		console.log("📊 Expected Final Price:", expectedFinalPrice.toFixed(2));
		console.log("📈 Actual Final Price:", product.finalPrice.toFixed(2));

		if (Math.abs(expectedFinalPrice - product.finalPrice) < 0.01) {
			console.log("✅ Price calculation is correct!");
			return true;
		} else {
			console.log("❌ Price calculation mismatch!");
			return false;
		}
	} catch (error) {
		console.error("❌ Product retrieval error:", error);
		return false;
	}
}

// Clean up test product
async function cleanupTestProduct(productId) {
	try {
		console.log("\n🧹 Cleaning up test product...");

		const response = await fetch(
			`http://localhost:3001/api/products/${productId}`,
			{
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			}
		);

		if (response.ok) {
			console.log("✅ Test product deleted successfully");
		} else {
			console.log("⚠️  Could not delete test product, but test completed");
		}
	} catch (error) {
		console.log("⚠️  Cleanup error:", error);
	}
}

// Main test function
async function runBottlerefundTest() {
	console.log("🚀 Starting Bottle Refund Field Test");
	console.log("====================================");

	// Login
	if (!(await login())) {
		console.log("❌ Test failed: Could not login");
		return;
	}

	// Create product with bottlerefund
	const productId = await testCreateProductWithBottlerefund();
	if (!productId) {
		console.log("❌ Test failed: Could not create product");
		return;
	}

	// Retrieve and verify product
	const verificationPassed = await testGetProduct(productId);
	if (!verificationPassed) {
		console.log("❌ Test failed: Product verification failed");
	} else {
		console.log(
			"\n🎉 All tests passed! Bottle refund functionality is working correctly."
		);
	}

	// Cleanup
	await cleanupTestProduct(productId);

	console.log("\n🏁 Bottle Refund Test Completed");
}

// Run the test
runBottlerefundTest().catch(console.error);
