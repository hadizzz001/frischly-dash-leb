const mongoose = require("mongoose");
const Category = require("../src/models/Category");

// Simple script to update all category images to app icon
const updateAllCategoryImages = async () => {
	try {
		console.log("🔄 Updating all category images to app icon...");

		// Connect to database
		await mongoose.connect(
			process.env.MONGODB_URI ||
				"mongodb+srv://frischly_db_user:FtfekQlVCjFRlpNj@cluster-frischly.xyw0ftk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster-frischly"
		);

		// Update all categories to use 256x256 app icon
		const iconPath = "/icons/app_icon_256x256.png";

		const result = await Category.updateMany(
			{}, // Update all categories
			{
				$set: {
					image: iconPath,
					updatedAt: new Date(),
				},
			}
		);

		console.log(`✅ Successfully updated ${result.modifiedCount} categories`);
		console.log(`📍 Image path set to: ${iconPath}`);

		// Show a few examples
		const sampleCategories = await Category.find({})
			.select("name image")
			.limit(5);
		console.log("\n📋 Sample updated categories:");
		sampleCategories.forEach((cat) => {
			console.log(`  - ${cat.name}: ${cat.image}`);
		});

		await mongoose.connection.close();
		console.log("✅ All category images updated successfully!");
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	}
};

// Run the script
updateAllCategoryImages();
