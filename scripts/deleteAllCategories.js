const mongoose = require("mongoose");
const Category = require("../src/models/Category");
const Product = require("../src/models/Product");
const Subcategory = require("../src/models/Subcategory");
require("dotenv").config();

const deleteAllCategories = async () => {
	try {
		console.log("🔗 Connecting to MongoDB...");
		await mongoose.connect(process.env.MONGODB_URI);
		console.log("✅ MongoDB Connected");

		// Get all categories with product count for logging
		const categories = await Category.find({});
		console.log(`\n📋 Found ${categories.length} categories to delete:`);

		categories.forEach((category, index) => {
			console.log(`   ${index + 1}. ${category.name} (ID: ${category._id})`);
		});

		console.log("\n🗑️  Deleting all categories...");

		// Delete all subcategories first (they reference categories)
		const subcategoryResult = await Subcategory.deleteMany({});
		console.log(`🗂️  Deleted ${subcategoryResult.deletedCount} subcategories`);

		// Update products to remove category references
		const productUpdateResult = await Product.updateMany(
			{ category: { $exists: true } },
			{ $unset: { category: "" } }
		);
		console.log(
			`📦 Updated ${productUpdateResult.modifiedCount} products (removed category references)`
		);

		// Delete all categories
		const categoryResult = await Category.deleteMany({});
		console.log(
			`✅ Successfully deleted ${categoryResult.deletedCount} categories`
		);

		// Verification
		console.log("\n🔍 Verifying deletion...");
		const remainingCategories = await Category.countDocuments({});
		const remainingSubcategories = await Subcategory.countDocuments({});
		const productsWithCategories = await Product.countDocuments({
			category: { $exists: true },
		});

		console.log("📊 Verification Results:");
		console.log(`   Categories remaining: ${remainingCategories}`);
		console.log(`   Subcategories remaining: ${remainingSubcategories}`);
		console.log(
			`   Products with category references: ${productsWithCategories}`
		);

		if (
			remainingCategories === 0 &&
			remainingSubcategories === 0 &&
			productsWithCategories === 0
		) {
			console.log(
				"\n✅ Verification successful - All categories and subcategories deleted"
			);
		} else {
			console.log(
				"\n⚠️  Warning: Some items may not have been fully cleaned up"
			);
		}

		console.log("\n💡 Post-Deletion Recommendations:");
		console.log("══════════════════════════════════════════════════");
		console.log("1. 📂 Recreate essential categories for your business");
		console.log("2. 🏷️  Set up subcategories under main categories");
		console.log("3. 📦 Reassign products to appropriate categories");
		console.log("4. 🧪 Test category filtering in your application");
		console.log("5. 📱 Update mobile apps if they cache categories");
		console.log("\nAvailable scripts:");
		console.log("• npm run add-products     - Add sample products");
		console.log("• npm run manage-users     - Manage user accounts");

		console.log("\n🏁 Category deletion completed successfully!");
	} catch (error) {
		console.error("❌ Error deleting categories:", error.message);
		process.exit(1);
	} finally {
		console.log("📡 Database connection closed");
		await mongoose.connection.close();
		process.exit(0);
	}
};

// Run the deletion
deleteAllCategories();
