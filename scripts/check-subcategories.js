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

// Check what subcategories exist
async function checkSubcategories() {
	try {
		console.log("\n🔍 Checking available subcategories...\n");

		// Try to get some products first to see their subcategories
		const productsResponse = await fetch(
			"http://localhost:3001/api/products?limit=10",
			{
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			}
		);

		if (!productsResponse.ok) {
			console.log("❌ Failed to get products");
			return;
		}

		const productsData = await productsResponse.json();
		console.log("📦 Sample products and their subcategories:");

		const subcategoryNames = new Set();
		productsData.data.forEach((product, index) => {
			if (product.subcategory && product.subcategory.name) {
				subcategoryNames.add(product.subcategory.name);
				if (index < 5) {
					// Show first 5
					console.log(
						`   ${index + 1}. ${product.name} -> ${product.subcategory.name}`
					);
				}
			}
		});

		console.log(
			`\n📋 Unique subcategory names found: ${Array.from(subcategoryNames).join(
				", "
			)}`
		);

		// Now test with one of these subcategories
		if (subcategoryNames.size > 0) {
			const testSubcategory = Array.from(subcategoryNames)[0];
			console.log(`\n🧪 Testing with subcategory: "${testSubcategory}"`);

			const subcategoryResponse = await fetch(
				`http://localhost:3001/api/products/subcategory?subcategoryName=${encodeURIComponent(
					testSubcategory
				)}&limit=3`,
				{
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
				}
			);

			console.log(`Response status: ${subcategoryResponse.status}`);
			const subcategoryData = await subcategoryResponse.json();
			console.log(`Response data:`, JSON.stringify(subcategoryData, null, 2));

			if (subcategoryResponse.ok) {
				console.log("✅ Successfully retrieved products by subcategory!");
				console.log(`   Found ${subcategoryData.data.length} products`);
				if (subcategoryData.data.length > 0) {
					console.log(`   Sample: ${subcategoryData.data[0].name}`);
				}
			} else {
				console.log("❌ Failed:", subcategoryData.message);
			}
		}
	} catch (error) {
		console.error("Check error:", error);
	}
}

// Main test function
async function main() {
	console.log("Checking subcategories and testing the endpoint...");

	// Login first
	const loginSuccess = await login();
	if (!loginSuccess) {
		console.error("Cannot proceed without authentication.");
		return;
	}

	// Check subcategories
	await checkSubcategories();

	console.log("\n🎉 Check completed!");
}

// Run the test
main().catch(console.error);
