require("dotenv").config();
const connectDB = require("../src/config/database");
const Product = require("../src/models/Product");

async function deactivateProductsWithDefaultIcon() {
	try {
		console.log("🔄 Connecting to database...");
		await connectDB();

		const targetPicture = "/icons/app_icon_256x256.png";

		console.log(`📝 Finding products with picture: "${targetPicture}"...`);

		// First, count how many products match the criteria
		const count = await Product.countDocuments({
			picture: targetPicture,
			isActive: true
		});

		console.log(`📊 Found ${count} active products with the default icon`);

		if (count === 0) {
			console.log("✅ No products found that need to be deactivated");
			process.exit(0);
		}

		// Confirm before proceeding
		console.log(`⚠️  This will deactivate ${count} products. Continue? (y/N)`);

		// For automated scripts, we'll proceed automatically
		// In a real scenario, you might want to add user confirmation
		console.log("🔄 Proceeding with deactivation...");

		// Update products to set isActive to false
		const result = await Product.updateMany(
			{ picture: targetPicture, isActive: true },
			{ $set: { isActive: false } }
		);

		console.log(`✅ Successfully deactivated ${result.modifiedCount} products`);
		console.log(`📊 Total matched: ${result.matchedCount}`);

		// Optional: Log the names of deactivated products
		const deactivatedProducts = await Product.find(
			{ picture: targetPicture, isActive: false },
			{ name: 1, barcode: 1 }
		).sort({ updatedAt: -1 }).limit(10);

		if (deactivatedProducts.length > 0) {
			console.log("\n📋 Recently deactivated products:");
			deactivatedProducts.forEach(product => {
				console.log(`   - ${product.name} (Barcode: ${product.barcode})`);
			});

			if (result.modifiedCount > 10) {
				console.log(`   ... and ${result.modifiedCount - 10} more`);
			}
		}

		process.exit(0);
	} catch (error) {
		console.error("❌ Error deactivating products:", error.message);
		process.exit(1);
	}
}

deactivateProductsWithDefaultIcon();