const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");
const Order = require("../src/models/Order");
require("dotenv").config();

// ANSI color codes for console output
const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
};

const log = (message, color = colors.reset) => {
	console.log(`${color}${message}${colors.reset}`);
};

// Banner
const showBanner = () => {
	log("", colors.cyan);
	log("╔══════════════════════════════════════════════════╗", colors.cyan);
	log("║              🗑️  PRODUCT CLEANER 🗑️              ║", colors.cyan);
	log("║                                                  ║", colors.cyan);
	log("║       PERMANENTLY DELETE ALL PRODUCTS            ║", colors.cyan);
	log("║              ⚠️  WARNING ⚠️                      ║", colors.cyan);
	log("║        THIS ACTION CANNOT BE UNDONE!            ║", colors.cyan);
	log("╚══════════════════════════════════════════════════╝", colors.cyan);
	log("");
};

// Connect to MongoDB
const connectDB = async () => {
	try {
		const MONGODB_URI = process.env.MONGODB_URI;
		if (!MONGODB_URI) {
			throw new Error("MONGODB_URI not found in environment variables");
		}

		log("🔗 Connecting to MongoDB...", colors.blue);
		await mongoose.connect(MONGODB_URI);
		log("✅ Connected to MongoDB successfully", colors.green);
		log(`📍 Database: ${mongoose.connection.db.databaseName}`, colors.blue);
		log("");
	} catch (error) {
		log(`❌ MongoDB connection failed: ${error.message}`, colors.red);
		process.exit(1);
	}
};

// Get current product statistics
const getProductStats = async () => {
	try {
		const totalProducts = await Product.countDocuments();
		const activeProducts = await Product.countDocuments({ isActive: true });
		const inactiveProducts = await Product.countDocuments({ isActive: false });

		// Get products by category
		const productsByCategory = await Product.aggregate([
			{
				$lookup: {
					from: "categories",
					localField: "category",
					foreignField: "_id",
					as: "categoryInfo",
				},
			},
			{
				$unwind: "$categoryInfo",
			},
			{
				$group: {
					_id: "$categoryInfo.name",
					count: { $sum: 1 },
				},
			},
			{
				$sort: { count: -1 },
			},
		]);

		return {
			totalProducts,
			activeProducts,
			inactiveProducts,
			productsByCategory,
		};
	} catch (error) {
		log(`❌ Error getting product statistics: ${error.message}`, colors.red);
		return null;
	}
};

// Display current database statistics
const showCurrentStats = async () => {
	log("📊 Current Database Statistics:", colors.bright);
	log("═".repeat(50), colors.cyan);

	const stats = await getProductStats();
	if (!stats) return;

	log(`📦 Total Products: ${stats.totalProducts}`, colors.blue);
	log(`✅ Active Products: ${stats.activeProducts}`, colors.green);
	log(`❌ Inactive Products: ${stats.inactiveProducts}`, colors.yellow);
	log("");

	if (stats.productsByCategory.length > 0) {
		log("📈 Products by Category:", colors.bright);
		stats.productsByCategory.forEach((category) => {
			log(`   ${category._id}: ${category.count} products`, colors.blue);
		});
		log("");
	}

	// Check for orders with products
	const ordersWithProducts = await Order.countDocuments({
		"items.0": { $exists: true },
	});

	if (ordersWithProducts > 0) {
		log(
			`⚠️  Warning: ${ordersWithProducts} orders contain product references`,
			colors.yellow
		);
		log("   These orders will be affected by product deletion", colors.yellow);
		log("");
	}
};

// Confirm deletion with user
const confirmDeletion = () => {
	return new Promise((resolve) => {
		const readline = require("readline").createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		log("⚠️  CRITICAL WARNING:", colors.red);
		log(
			"This will permanently delete ALL products from the database!",
			colors.red
		);
		log("This action cannot be undone!", colors.red);
		log("");
		log("What will be deleted:", colors.yellow);
		log("• All product records", colors.yellow);
		log("• Product images (if any)", colors.yellow);
		log(
			"• Product references in orders (may cause data issues)",
			colors.yellow
		);
		log("");

		readline.question(
			`${colors.bright}Type 'DELETE ALL PRODUCTS' to confirm: ${colors.reset}`,
			(answer) => {
				readline.close();
				resolve(answer === "DELETE ALL PRODUCTS");
			}
		);
	});
};

// Delete all products
const deleteAllProducts = async () => {
	try {
		log("🗑️  Starting product deletion process...", colors.yellow);
		log("");

		// Get list of products for logging
		const productsToDelete = await Product.find({}, "name category").populate(
			"category",
			"name"
		);

		if (productsToDelete.length === 0) {
			log("ℹ️  No products found to delete", colors.blue);
			return;
		}

		log(
			`📋 Products to be deleted (${productsToDelete.length} total):`,
			colors.bright
		);
		productsToDelete.forEach((product, index) => {
			const categoryName = product.category?.name || "Unknown Category";
			log(`   ${index + 1}. ${product.name} (${categoryName})`, colors.blue);
		});
		log("");

		// Delete all products
		log("🗑️  Deleting products...", colors.yellow);
		const deleteResult = await Product.deleteMany({});

		log(
			`✅ Successfully deleted ${deleteResult.deletedCount} products`,
			colors.green
		);
		log("");

		// Clean up any orphaned references in orders
		log("🧹 Cleaning up order references...", colors.yellow);

		// Update orders to remove deleted product references
		const orderUpdateResult = await Order.updateMany(
			{},
			{
				$pull: {
					items: { product: { $exists: false } },
				},
			}
		);

		// Mark orders with no items as cancelled
		const emptyOrdersResult = await Order.updateMany(
			{ items: { $size: 0 } },
			{ status: "cancelled", notes: "Products were deleted from system" }
		);

		if (orderUpdateResult.modifiedCount > 0) {
			log(
				`🧹 Cleaned up ${orderUpdateResult.modifiedCount} orders`,
				colors.green
			);
		}

		if (emptyOrdersResult.modifiedCount > 0) {
			log(
				`📝 Marked ${emptyOrdersResult.modifiedCount} empty orders as cancelled`,
				colors.green
			);
		}

		log("");
		log("🎉 Product deletion completed successfully!", colors.green);
	} catch (error) {
		log(`❌ Error during deletion: ${error.message}`, colors.red);
		throw error;
	}
};

// Verify deletion
const verifyDeletion = async () => {
	try {
		log("🔍 Verifying deletion...", colors.blue);

		const remainingProducts = await Product.countDocuments();
		const totalOrders = await Order.countDocuments();
		const cancelledOrders = await Order.countDocuments({ status: "cancelled" });

		log(`📊 Verification Results:`, colors.bright);
		log(
			`   Products remaining: ${remainingProducts}`,
			remainingProducts === 0 ? colors.green : colors.red
		);
		log(`   Total orders: ${totalOrders}`, colors.blue);
		log(`   Cancelled orders: ${cancelledOrders}`, colors.blue);
		log("");

		if (remainingProducts === 0) {
			log("✅ Verification successful - All products deleted", colors.green);
		} else {
			log(
				"⚠️  Warning: Some products may not have been deleted",
				colors.yellow
			);
		}
	} catch (error) {
		log(`❌ Error during verification: ${error.message}`, colors.red);
	}
};

// Show cleanup recommendations
const showCleanupRecommendations = () => {
	log("💡 Post-Deletion Recommendations:", colors.bright);
	log("═".repeat(50), colors.cyan);
	log("1. 🗂️  Consider cleaning up unused categories", colors.blue);
	log("2. 📊 Review and update any affected orders", colors.blue);
	log("3. 🔄 Rebuild product catalog with fresh data", colors.blue);
	log("4. 🧪 Test application functionality", colors.blue);
	log("5. 📱 Update mobile apps if connected", colors.blue);
	log("");
	log("Available scripts:", colors.bright);
	log("• npm run add-products     - Add sample products", colors.green);
	log("• npm run manage-users     - Manage user accounts", colors.green);
	log("• npm run create-admin     - Create admin users", colors.green);
	log("");
};

// Main execution function
const main = async () => {
	try {
		showBanner();
		await connectDB();
		await showCurrentStats();

		// Confirm deletion
		const confirmed = await confirmDeletion();

		if (!confirmed) {
			log("❌ Deletion cancelled by user", colors.yellow);
			log("💡 No changes were made to the database", colors.blue);
			process.exit(0);
		}

		log("");
		log("🚀 Starting deletion process...", colors.green);
		log("");

		await deleteAllProducts();
		await verifyDeletion();
		showCleanupRecommendations();

		log("🏁 Process completed successfully!", colors.green);
	} catch (error) {
		log(`💥 Fatal error: ${error.message}`, colors.red);
		console.error(error);
		process.exit(1);
	} finally {
		if (mongoose.connection.readyState === 1) {
			await mongoose.connection.close();
			log("📡 Database connection closed", colors.blue);
		}
		process.exit(0);
	}
};

// Handle process termination
process.on("SIGINT", async () => {
	log("\n🛑 Process interrupted by user", colors.yellow);
	if (mongoose.connection.readyState === 1) {
		await mongoose.connection.close();
		log("📡 Database connection closed", colors.blue);
	}
	process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", async (error) => {
	log(`💥 Uncaught Exception: ${error.message}`, colors.red);
	console.error(error);
	if (mongoose.connection.readyState === 1) {
		await mongoose.connection.close();
	}
	process.exit(1);
});

// Run the script
if (require.main === module) {
	main();
}

module.exports = { deleteAllProducts, getProductStats };
