const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// Configuration
const PRODUCTS_JSON_FILE = path.join(__dirname, "all-products.json");
const IMAGES_FOLDER = path.join(__dirname, "product-images");

// Create images folder if it doesn't exist
function createImagesFolder() {
	if (!fs.existsSync(IMAGES_FOLDER)) {
		fs.mkdirSync(IMAGES_FOLDER, { recursive: true });
		console.log(`📁 Created images folder: ${IMAGES_FOLDER}`);
	}
}

// Sanitize filename to remove invalid characters
function sanitizeFilename(filename) {
	return filename
		.replace(/[<>:"/\\|?*]/g, "_") // Replace invalid characters with underscore
		.replace(/\s+/g, "_") // Replace spaces with underscore
		.replace(/_{2,}/g, "_") // Replace multiple underscores with single
		.substring(0, 100); // Limit length
}

// Download image from URL
function downloadImage(url, filepath) {
	return new Promise((resolve, reject) => {
		const protocol = url.startsWith("https") ? https : http;

		protocol
			.get(url, (response) => {
				if (response.statusCode !== 200) {
					reject(
						new Error(`Failed to download: ${response.statusCode} - ${url}`)
					);
					return;
				}

				const fileStream = fs.createWriteStream(filepath);
				response.pipe(fileStream);

				fileStream.on("finish", () => {
					fileStream.close();
					resolve();
				});

				fileStream.on("error", (error) => {
					fs.unlink(filepath, () => {}); // Delete the file on error
					reject(error);
				});
			})
			.on("error", (error) => {
				reject(error);
			});
	});
}

// Load products from JSON file
function loadProducts() {
	try {
		const data = fs.readFileSync(PRODUCTS_JSON_FILE, "utf8");
		const jsonData = JSON.parse(data);

		if (!jsonData.success || !jsonData.products) {
			throw new Error("Invalid JSON structure");
		}

		return jsonData.products;
	} catch (error) {
		console.error("❌ Error loading products JSON:", error.message);
		throw error;
	}
}

// Main function to download all product images
async function downloadAllProductImages() {
	console.log("🚀 Starting product images download...");
	console.log(`📁 Images will be saved to: ${IMAGES_FOLDER}`);

	try {
		// Create images folder
		createImagesFolder();

		// Load products
		const products = loadProducts();
		console.log(`📊 Found ${products.length} products to process`);

		// Filter products that have images
		const productsWithImages = products.filter(
			(product) => product.picture && product.picture.trim() !== ""
		);

		console.log(`🖼️  Found ${productsWithImages.length} products with images`);

		if (productsWithImages.length === 0) {
			console.log("⚠️  No products with images found");
			return;
		}

		let successCount = 0;
		let errorCount = 0;
		const errors = [];

		// Process each product with image
		for (let i = 0; i < productsWithImages.length; i++) {
			const product = productsWithImages[i];
			const { _id, name, picture } = product;

			// Create filename: productId_productName.extension
			const urlParts = picture.split("/");
			const filenameWithExt = urlParts[urlParts.length - 1];
			const extension = path.extname(filenameWithExt) || ".webp"; // Default to webp if no extension
			const sanitizedName = sanitizeFilename(name);
			const filename = `${_id}_${sanitizedName}${extension}`;
			const filepath = path.join(IMAGES_FOLDER, filename);

			try {
				console.log(
					`📥 [${i + 1}/${productsWithImages.length}] Downloading: ${name}`
				);
				await downloadImage(picture, filepath);
				console.log(`   ✅ Saved: ${filename}`);
				successCount++;
			} catch (error) {
				console.error(`   ❌ Failed: ${name} - ${error.message}`);
				errorCount++;
				errors.push({
					productId: _id,
					productName: name,
					url: picture,
					error: error.message,
				});
			}

			// Small delay between downloads to be respectful
			if (i < productsWithImages.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
		}

		// Save error log if there were errors
		if (errors.length > 0) {
			const errorLogPath = path.join(IMAGES_FOLDER, "download-errors.json");
			fs.writeFileSync(
				errorLogPath,
				JSON.stringify(
					{
						totalErrors: errors.length,
						errors: errors,
						generatedAt: new Date().toISOString(),
					},
					null,
					2
				)
			);
			console.log(`📋 Error log saved to: ${errorLogPath}`);
		}

		// Summary
		console.log("\n🎉 Download completed!");
		console.log("📋 Summary:");
		console.log(`   • Total products processed: ${products.length}`);
		console.log(`   • Products with images: ${productsWithImages.length}`);
		console.log(`   • Successfully downloaded: ${successCount}`);
		console.log(`   • Failed downloads: ${errorCount}`);
		console.log(`   • Images saved to: ${IMAGES_FOLDER}`);
	} catch (error) {
		console.error("❌ Unexpected error:", error.message);
		process.exit(1);
	}
}

// Run the script
if (require.main === module) {
	downloadAllProductImages();
}

module.exports = {
	downloadAllProductImages,
	createImagesFolder,
	sanitizeFilename,
};
