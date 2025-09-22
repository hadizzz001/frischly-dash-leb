const fetch = require("node-fetch");

// Admin token
let token = "";

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
		console.log("Login successful. Token obtained.");
		return true;
	} catch (error) {
		console.error("Login error:", error);
		return false;
	}
}

// Test getting products by subcategory
async function testGetProductsBySubcategory() {
	try {
		const headers = {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		};

		console.log("\n🧪 Testing Get Products by Subcategory...\n");

		// Test 1: Get products by a specific subcategory
		console.log("1. Testing get products by subcategory 'Brot':");
		const brotResponse = await fetch(
			"http://localhost:3001/api/products/subcategory?subcategoryName=Brot&limit=5",
			{
				headers,
			}
		);
		const brotData = await brotResponse.json();
		if (brotResponse.ok) {
			console.log("✅ Successfully retrieved products by subcategory 'Brot'");
			console.log(`   Found ${brotData.data.length} products`);
			if (brotData.data.length > 0) {
				console.log(`   Sample product: ${brotData.data[0].name}`);
				console.log(
					`   Subcategory: ${brotData.data[0].subcategory?.name || "N/A"}`
				);
			}
		} else {
			console.log(
				"❌ Failed to get products by subcategory:",
				brotData.message
			);
		}

		// Test 2: Get products by another subcategory
		console.log("\n2. Testing get products by subcategory 'Käse':");
		const kaseResponse = await fetch(
			"http://localhost:3001/api/products/subcategory?subcategoryName=Käse&limit=3",
			{
				headers,
			}
		);
		const kaseData = await kaseResponse.json();
		if (kaseResponse.ok) {
			console.log("✅ Successfully retrieved products by subcategory 'Käse'");
			console.log(`   Found ${kaseData.data.length} products`);
		} else {
			console.log(
				"❌ Failed to get products by subcategory:",
				kaseData.message
			);
		}

		// Test 3: Test with sorting
		console.log("\n3. Testing with sorting (name ascending):");
		const sortedResponse = await fetch(
			"http://localhost:3001/api/products/subcategory?subcategoryName=Brot&sortBy=name&sortOrder=asc&limit=3",
			{
				headers,
			}
		);
		const sortedData = await sortedResponse.json();
		if (sortedResponse.ok) {
			console.log("✅ Successfully retrieved sorted products");
			console.log(`   Found ${sortedData.data.length} products`);
			if (sortedData.data.length > 1) {
				console.log(`   First product: ${sortedData.data[0].name}`);
				console.log(
					`   Last product: ${sortedData.data[sortedData.data.length - 1].name}`
				);
			}
		} else {
			console.log("❌ Failed to get sorted products:", sortedData.message);
		}

		// Test 4: Test with search filter
		console.log("\n4. Testing with search filter:");
		const searchResponse = await fetch(
			"http://localhost:3001/api/products/subcategory?subcategoryName=Brot&search=weizen&limit=5",
			{
				headers,
			}
		);
		const searchData = await searchResponse.json();
		if (searchResponse.ok) {
			console.log("✅ Successfully retrieved products with search filter");
			console.log(
				`   Found ${searchData.data.length} products matching 'weizen'`
			);
		} else {
			console.log("❌ Failed to get products with search:", searchData.message);
		}

		// Test 5: Test with invalid subcategory
		console.log("\n5. Testing with invalid subcategory name:");
		const invalidResponse = await fetch(
			"http://localhost:3001/api/products/subcategory?subcategoryName=InvalidSubcategory",
			{
				headers,
			}
		);
		const invalidData = await invalidResponse.json();
		if (invalidResponse.status === 404) {
			console.log("✅ Correctly handled invalid subcategory (404 Not Found)");
		} else {
			console.log(
				"❌ Unexpected response for invalid subcategory:",
				invalidData.message
			);
		}

		// Test 6: Test without subcategoryName parameter
		console.log("\n6. Testing without subcategoryName parameter:");
		const noParamResponse = await fetch(
			"http://localhost:3001/api/products/subcategory",
			{
				headers,
			}
		);
		const noParamData = await noParamResponse.json();
		if (noParamResponse.status === 400) {
			console.log(
				"✅ Correctly handled missing subcategoryName (400 Bad Request)"
			);
		} else {
			console.log(
				"❌ Unexpected response for missing parameter:",
				noParamData.message
			);
		}
	} catch (error) {
		console.error("Test error:", error);
	}
}

// Main test function
async function main() {
	console.log("Testing Get Products by Subcategory API...");

	// Login first
	const loginSuccess = await login();
	if (!loginSuccess) {
		console.error("Cannot proceed without authentication.");
		return;
	}

	// Test the subcategory endpoint
	await testGetProductsBySubcategory();

	console.log("\n🎉 Subcategory tests completed!");
}

// Run the test
main().catch(console.error);
