const mongoose = require("mongoose");
const Category = require("../src/models/Category");

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

// Update category images to app icon
const updateCategoryImages = async (iconSize = "256x256") => {
	try {
		console.log(`🔄 Updating category images to app icon (${iconSize})...`);

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

		// Option 1: Update only categories without images
		const updateOnlyEmpty = process.argv.includes("--only-empty");

		let query = {};
		if (updateOnlyEmpty) {
			query = {
				$or: [{ image: { $exists: false } }, { image: null }, { image: "" }],
			};
			console.log("📝 Updating only categories without images...");
		} else {
			console.log("📝 Updating all categories...");
		}

		// Get categories to update
		const categoriesToUpdate = await Category.find(query);
		console.log(`📊 Found ${categoriesToUpdate.length} categories to update`);

		if (categoriesToUpdate.length === 0) {
			console.log("ℹ️ No categories need updating");
			return;
		}

		// Update categories
		const updateResult = await Category.updateMany(query, {
			$set: {
				image: iconPath,
				updatedAt: new Date(),
			},
		});

		console.log(
			`✅ Successfully updated ${updateResult.modifiedCount} categories`
		);
		console.log(`📍 Image path set to: ${iconPath}`);

		// Show updated categories
		const updatedCategories = await Category.find(query).select("name image");
		console.log("\n📋 Updated categories:");
		updatedCategories.forEach((cat) => {
			console.log(`  - ${cat.name}: ${cat.image}`);
		});
	} catch (error) {
		console.error("❌ Error updating category images:", error);
	}
};

// Main function
const main = async () => {
	console.log("🚀 Category Image Update Script");
	console.log("=================================");

	// Get icon size from command line arguments
	let iconSize = "256x256"; // default

	const sizeArg = process.argv.find((arg) => arg.startsWith("--size="));
	if (sizeArg) {
		iconSize = sizeArg.split("=")[1];
	}

	console.log(`🎯 Target icon size: ${iconSize}`);

	// Connect to database
	await connectDB();

	// Update category images
	await updateCategoryImages(iconSize);

	// Close connection
	await mongoose.connection.close();
	console.log("👋 Database connection closed");
	console.log("✅ Script completed successfully!");
};

// Handle command line arguments
if (process.argv.includes("--help") || process.argv.includes("-h")) {
	console.log(`
🎯 Category Image Update Script

USAGE:
  node updateCategoryImages.js [options]

OPTIONS:
  --size=<size>     Icon size to use (default: 256x256)
                    Available: 72x72, 96x96, 128x128, 192x192, 256x256, 512x512, 1024x1024
  --only-empty      Only update categories that don't have images (default: update all)
  --help, -h        Show this help message

EXAMPLES:
  node updateCategoryImages.js
  node updateCategoryImages.js --size=512x512
  node updateCategoryImages.js --only-empty
  node updateCategoryImages.js --size=128x128 --only-empty
	`);
	process.exit(0);
}

// Run the script
main().catch((error) => {
	console.error("💥 Script failed:", error);
	process.exit(1);
});
