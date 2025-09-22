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

// Test sorting functionality
async function testCategorySorting() {
	try {
		const headers = {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		};

		console.log("\n🧪 Testing Category Sorting...\n");

		// Test 1: Default sorting (sortOrder asc, then name asc)
		console.log("1. Testing default sorting (sortOrder asc, name asc):");
		const defaultSort = await fetch(
			"http://localhost:3001/api/categories?limit=5",
			{
				headers,
			}
		);
		const defaultData = await defaultSort.json();
		if (defaultSort.ok) {
			console.log("✅ Default sort successful");
			defaultData.data.forEach((cat, index) => {
				console.log(
					`   ${index + 1}. ${cat.name} (sortOrder: ${cat.sortOrder})`
				);
			});
		} else {
			console.log("❌ Default sort failed:", defaultData.message);
		}

		// Test 2: Sort by name ascending
		console.log("\n2. Testing sort by name (ascending):");
		const nameAscSort = await fetch(
			"http://localhost:3001/api/categories?sortBy=name&sortOrder=asc&limit=5",
			{
				headers,
			}
		);
		const nameAscData = await nameAscSort.json();
		if (nameAscSort.ok) {
			console.log("✅ Name ascending sort successful");
			nameAscData.data.forEach((cat, index) => {
				console.log(`   ${index + 1}. ${cat.name}`);
			});
		} else {
			console.log("❌ Name ascending sort failed:", nameAscData.message);
		}

		// Test 3: Sort by name descending
		console.log("\n3. Testing sort by name (descending):");
		const nameDescSort = await fetch(
			"http://localhost:3001/api/categories?sortBy=name&sortOrder=desc&limit=5",
			{
				headers,
			}
		);
		const nameDescData = await nameDescSort.json();
		if (nameDescSort.ok) {
			console.log("✅ Name descending sort successful");
			nameDescData.data.forEach((cat, index) => {
				console.log(`   ${index + 1}. ${cat.name}`);
			});
		} else {
			console.log("❌ Name descending sort failed:", nameDescData.message);
		}

		// Test 4: Sort by sortOrder descending
		console.log("\n4. Testing sort by sortOrder (descending):");
		const sortOrderDescSort = await fetch(
			"http://localhost:3001/api/categories?sortBy=sortOrder&sortOrder=desc&limit=5",
			{
				headers,
			}
		);
		const sortOrderDescData = await sortOrderDescSort.json();
		if (sortOrderDescSort.ok) {
			console.log("✅ SortOrder descending sort successful");
			sortOrderDescData.data.forEach((cat, index) => {
				console.log(
					`   ${index + 1}. ${cat.name} (sortOrder: ${cat.sortOrder})`
				);
			});
		} else {
			console.log(
				"❌ SortOrder descending sort failed:",
				sortOrderDescData.message
			);
		}

		// Test 5: Invalid sortBy parameter
		console.log("\n5. Testing invalid sortBy parameter:");
		const invalidSort = await fetch(
			"http://localhost:3001/api/categories?sortBy=invalidField&limit=3",
			{
				headers,
			}
		);
		const invalidData = await invalidSort.json();
		if (invalidSort.ok) {
			console.log(
				"✅ Invalid sortBy handled gracefully (likely defaults to sortOrder)"
			);
			invalidData.data.forEach((cat, index) => {
				console.log(
					`   ${index + 1}. ${cat.name} (sortOrder: ${cat.sortOrder})`
				);
			});
		} else {
			console.log("❌ Invalid sortBy caused error:", invalidData.message);
		}
	} catch (error) {
		console.error("Test error:", error);
	}
}

// Main test function
async function main() {
	console.log("Testing Category Sorting API...");

	// Login first
	const loginSuccess = await login();
	if (!loginSuccess) {
		console.error("Cannot proceed without authentication.");
		return;
	}

	// Test the sorting
	await testCategorySorting();

	console.log("\n🎉 Sorting tests completed!");
}

// Run the test
main().catch(console.error);
