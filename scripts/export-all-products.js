const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const API_ENDPOINT = "/api/products";
const OUTPUT_FILE = path.join(__dirname, "all-products.json");

// Function to fetch products from API
async function fetchProducts(page = 1, limit = 100) {
	const url = `${API_BASE_URL}${API_ENDPOINT}?page=${page}&limit=${limit}&isActive=all`;

	try {
		const response = await fetch(url, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		return data;
	} catch (error) {
		console.error(`Error fetching page ${page}:`, error.message);
		throw error;
	}
}

// Function to get all products with pagination
async function getAllProducts() {
	console.log("🔄 Starting to fetch all products from API...");
	console.log(`📍 API URL: ${API_BASE_URL}${API_ENDPOINT}`);

	const allProducts = [];
	let currentPage = 1;
	let totalPages = 1;
	let totalProducts = 0;

	try {
		// First request to get pagination info
		const firstResponse = await fetchProducts(1, 100);
		if (!firstResponse.success) {
			throw new Error("Failed to fetch products: " + firstResponse.message);
		}

		const firstPageData = firstResponse.data;
		totalPages = firstResponse.pagination?.totalPages || 1;
		totalProducts = firstResponse.pagination?.totalProducts || 0;

		console.log(`📊 Total products to fetch: ${totalProducts}`);
		console.log(`📄 Total pages: ${totalPages}`);

		// Add first page products
		allProducts.push(...firstPageData);

		// Fetch remaining pages
		for (let page = 2; page <= totalPages; page++) {
			console.log(`📥 Fetching page ${page}/${totalPages}...`);
			const response = await fetchProducts(page, 100);

			if (response.success && response.data) {
				allProducts.push(...response.data);
			} else {
				console.warn(`⚠️  Failed to fetch page ${page}`);
			}

			// Small delay to be respectful to the API
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		return {
			success: true,
			totalProducts: allProducts.length,
			products: allProducts,
			fetchedAt: new Date().toISOString(),
		};
	} catch (error) {
		console.error("❌ Error fetching products:", error.message);
		return {
			success: false,
			error: error.message,
			products: [],
		};
	}
}

// Function to save products to JSON file
function saveToFile(data) {
	try {
		const jsonData = JSON.stringify(data, null, 2);
		fs.writeFileSync(OUTPUT_FILE, jsonData, "utf8");
		console.log(`✅ Products saved to: ${OUTPUT_FILE}`);
		console.log(`📊 Total products saved: ${data.totalProducts}`);
		return true;
	} catch (error) {
		console.error("❌ Error saving to file:", error.message);
		return false;
	}
}

// Main execution function
async function main() {
	console.log("🚀 Starting product export script...");
	console.log("📁 Output file:", OUTPUT_FILE);

	try {
		const result = await getAllProducts();

		if (result.success) {
			const saved = saveToFile(result);
			if (saved) {
				console.log("🎉 Export completed successfully!");
				console.log("\n📋 Summary:");
				console.log(`   • Total products: ${result.totalProducts}`);
				console.log(`   • File saved: ${OUTPUT_FILE}`);
				console.log(`   • Timestamp: ${result.fetchedAt}`);
			} else {
				console.error("❌ Failed to save products to file");
				process.exit(1);
			}
		} else {
			console.error("❌ Failed to fetch products:", result.error);
			process.exit(1);
		}
	} catch (error) {
		console.error("❌ Unexpected error:", error.message);
		process.exit(1);
	}
}

// Run the script
if (require.main === module) {
	main();
}

module.exports = { getAllProducts, saveToFile };
