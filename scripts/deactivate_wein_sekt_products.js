require("dotenv").config();
const connectDB = require("../src/config/database");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");

async function deactivateWeinSektProducts() {
	try {
		console.log("🔄 Connecting to database...");
		await connectDB();

		const categoryName = "Wein & Sekt";

		console.log(`📝 Finding category: "${categoryName}"...`);

		// Find the Wein & Sekt category
		const category = await Category.findOne({
			name: categoryName,
			isActive: true,
		});

		if (!category) {
			console.log(`❌ Category "${categoryName}" not found or inactive`);
			process.exit(1);
		}

		console.log(`✅ Found category: ${category.name} (ID: ${category._id})`);

		// Count active products in this category
		const count = await Product.countDocuments({
			category: category._id,
			isActive: true,
		});

		console.log(
			`📊 Found ${count} active products in "${categoryName}" category`
		);

		if (count === 0) {
			console.log("✅ No active products found in this category");
			process.exit(0);
		}

		// Confirm before proceeding
		console.log(
			`⚠️  This will deactivate ${count} products in "${categoryName}" category. Continue? (y/N)`
		);

		// For automated scripts, we'll proceed automatically
		// In a real scenario, you might want to add user confirmation
		console.log("🔄 Proceeding with deactivation...");

		// Update products to set isActive to false
		const result = await Product.updateMany(
			{ category: category._id, isActive: true },
			{ $set: { isActive: false } }
		);

		console.log(`✅ Successfully deactivated ${result.modifiedCount} products`);
		console.log(`📊 Total matched: ${result.matchedCount}`);

		// Optional: Log the names of some deactivated products
		const deactivatedProducts = await Product.find(
			{ category: category._id, isActive: false },
			{ name: 1, barcode: 1 }
		)
			.sort({ updatedAt: -1 })
			.limit(10);

		if (deactivatedProducts.length > 0) {
			console.log(`\n📋 Recently deactivated products in "${categoryName}":`);
			deactivatedProducts.forEach((product) => {
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

deactivateWeinSektProducts();
