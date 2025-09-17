const mongoose = require("mongoose");
const Product = require("../src/models/Product");

// Database connection
const connectDB = async () => {
	try {
		await mongoose.connect(
			process.env.MONGODB_URI ||
				"mongodb+srv://frischly_db_user:FtfekQlVCjFRlpNj@cluster-frischly.xyw0ftk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster-frischly"
		);
		console.log("✅ Connected to MongoDB");
	} catch (error) {
		console.error("❌ MongoDB connection error:", error);
		process.exit(1);
	}
};

// Update product images to app icon
const updateProductImages = async (iconSize = "256x256") => {
	try {
		console.log(`🔄 Updating product images to app icon (${iconSize})...`);

		// Available icon sizes
		const iconSizes = {
			"72x72": "/icons/app_icon_72x72.png",
			"96x96": "/icons/app_icon_96x96.png",
			"128x128": "/icons/app_icon_128x128.png",
			"192x192": "/icons/app_icon_192x192.png",
			"256x256": "/icons/app_icon_256x256.png",
			"512x512": "/icons/app_icon_512x512.png",
			"1024x1024": "/icons/app_icon_1024x1024.png",
		};

		const iconPath = iconSizes[iconSize];
		if (!iconPath) {
			console.error(`❌ Invalid icon size: ${iconSize}`);
			console.log("Available sizes:", Object.keys(iconSizes).join(", "));
			return;
		}

		// Option 1: Update only products without images
		const updateOnlyEmpty = process.argv.includes("--only-empty");

		let query = {};
		if (updateOnlyEmpty) {
			query = {
				$or: [
					{ picture: { $exists: false } },
					{ picture: null },
					{ picture: "" },
				],
			};
			console.log("📝 Updating only products without images...");
		} else {
			console.log("📝 Updating all products...");
		}

		// Get products to update
		const productsToUpdate = await Product.find(query);
		console.log(`📊 Found ${productsToUpdate.length} products to update`);

		if (productsToUpdate.length === 0) {
			console.log("ℹ️ No products need updating");
			return;
		}

		// Update products
		const updateResult = await Product.updateMany(query, {
			$set: {
				picture: iconPath,
				updatedAt: new Date(),
			},
		});

		console.log(
			`✅ Successfully updated ${updateResult.modifiedCount} products`
		);
		console.log(`📍 Image path set to: ${iconPath}`);

		// Show updated products
		const updatedProducts = await Product.find(query)
			.select("name picture")
			.limit(5);
		console.log("\n📋 Sample updated products:");
		updatedProducts.forEach((product) => {
			console.log(`  - ${product.name}: ${product.picture}`);
		});
	} catch (error) {
		console.error("❌ Error updating product images:", error);
	}
};

// Main function
const main = async () => {
	console.log("🚀 Product Image Update Script");
	console.log("===============================");

	// Get icon size from command line arguments
	let iconSize = "256x256"; // default

	const sizeArg = process.argv.find((arg) => arg.startsWith("--size="));
	if (sizeArg) {
		iconSize = sizeArg.split("=")[1];
	}

	console.log(`🎯 Target icon size: ${iconSize}`);

	// Connect to database
	await connectDB();

	// Update product images
	await updateProductImages(iconSize);

	// Close connection
	await mongoose.connection.close();
	console.log("👋 Database connection closed");
	console.log("✅ Script completed successfully!");
};

// Handle command line arguments
if (process.argv.includes("--help") || process.argv.includes("-h")) {
	console.log(`
🎯 Product Image Update Script

USAGE:
  node updateProductImages.js [options]

OPTIONS:
  --size=<size>     Icon size to use (default: 256x256)
                    Available: 72x72, 96x96, 128x128, 192x192, 256x256, 512x512, 1024x1024
  --only-empty      Only update products that don't have images (default: update all)
  --help, -h        Show this help message

EXAMPLES:
  node updateProductImages.js
  node updateProductImages.js --size=512x512
  node updateProductImages.js --only-empty
  node updateProductImages.js --size=128x128 --only-empty
	`);
	process.exit(0);
}

// Run the script
main().catch((error) => {
	console.error("💥 Script failed:", error);
	process.exit(1);
});
