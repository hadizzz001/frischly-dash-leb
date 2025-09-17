const mongoose = require("mongoose");
const Product = require("../src/models/Product");

// Simple script to update all product images to app icon
const updateAllProductImages = async () => {
	try {
		console.log("🔄 Updating all product images to app icon...");

		// Connect to database
		await mongoose.connect(
			process.env.MONGODB_URI ||
				"mongodb+srv://frischly_db_user:FtfekQlVCjFRlpNj@cluster-frischly.xyw0ftk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster-frischly"
		);

		// Update all products to use 256x256 app icon
		const iconPath = "/icons/app_icon_256x256.png";

		const result = await Product.updateMany(
			{}, // Update all products
			{
				$set: {
					picture: iconPath,
					updatedAt: new Date(),
				},
			}
		);

		console.log(`✅ Successfully updated ${result.modifiedCount} products`);
		console.log(`📍 Image path set to: ${iconPath}`);

		// Show a few examples
		const sampleProducts = await Product.find({})
			.select("name picture")
			.limit(5);
		console.log("\n📋 Sample updated products:");
		sampleProducts.forEach((product) => {
			console.log(`  - ${product.name}: ${product.picture}`);
		});

		await mongoose.connection.close();
		console.log("✅ All product images updated successfully!");
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	}
};

// Run the script
updateAllProductImages();
