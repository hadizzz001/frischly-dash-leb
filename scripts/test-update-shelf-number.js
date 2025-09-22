const fetch = require("node-fetch");

// Test getting a product ID
async function getProductId() {
	try {
		console.log("Fetching products to get a product ID...");

		const response = await fetch("http://localhost:3001/api/products?limit=1", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
		});

		const data = await response.json();

		if (!response.ok || !data.data || data.data.length === 0) {
			console.error("No products found or fetch failed:", data.message);
			return null;
		}

		const productId = data.data[0]._id;
		console.log(`Using product ID: ${productId} (${data.data[0].name})`);
		return productId;
	} catch (error) {
		console.error("Error fetching products:", error);
		return null;
	}
}

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

// Test updating product shelf number
async function testUpdateShelfNumber(productId) {
	try {
		const newShelfNumber = "A-5"; // New shelf number to assign

		console.log(
			`Updating shelf number for product ${productId} to ${newShelfNumber}...`
		);

		const response = await fetch(
			`http://localhost:3001/api/products/${productId}/shelf`,
			{
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					shelfNumber: newShelfNumber,
				}),
			}
		);

		const data = await response.json();

		if (!response.ok) {
			console.error("Update failed:", data.message);
			return false;
		}

		console.log("Shelf number updated successfully!");
		console.log("Updated product:", {
			id: data.data._id,
			name: data.data.name,
			shelfNumber: data.data.shelfNumber,
		});

		return true;
	} catch (error) {
		console.error("Update error:", error);
		return false;
	}
}

// Main test function
async function main() {
	console.log("Testing Update Product Shelf Number API...\n");

	// Login first
	const loginSuccess = await login();
	if (!loginSuccess) {
		console.error("Cannot proceed without authentication.");
		return;
	}

	// Get a product ID
	const productId = await getProductId();
	if (!productId) {
		console.error("Cannot proceed without a product ID.");
		return;
	}

	// Test the update
	await testUpdateShelfNumber(productId);

	console.log("\nTest completed.");
}

// Run the test
main().catch(console.error);
