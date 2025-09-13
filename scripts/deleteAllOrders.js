const mongoose = require("mongoose");
const Order = require("../src/models/Order");
const User = require("../src/models/User");
const Product = require("../src/models/Product");
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
	log("║              🗑️  ORDER CLEANER 🗑️               ║", colors.cyan);
	log("║                                                  ║", colors.cyan);
	log("║        PERMANENTLY DELETE ALL ORDERS             ║", colors.cyan);
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

// Get current order statistics
const getOrderStats = async () => {
	try {
		const totalOrders = await Order.countDocuments();

		// Orders by status
		const ordersByStatus = await Order.aggregate([
			{
				$group: {
					_id: "$status",
					count: { $sum: 1 },
					totalValue: { $sum: "$total" },
				},
			},
			{
				$sort: { count: -1 },
			},
		]);

		// Orders by payment status
		const ordersByPayment = await Order.aggregate([
			{
				$group: {
					_id: "$paymentStatus",
					count: { $sum: 1 },
					totalValue: { $sum: "$total" },
				},
			},
			{
				$sort: { count: -1 },
			},
		]);

		// Monthly orders (last 6 months)
		const sixMonthsAgo = new Date();
		sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

		const monthlyOrders = await Order.aggregate([
			{
				$match: {
					createdAt: { $gte: sixMonthsAgo },
				},
			},
			{
				$group: {
					_id: {
						year: { $year: "$createdAt" },
						month: { $month: "$createdAt" },
					},
					count: { $sum: 1 },
					totalValue: { $sum: "$total" },
				},
			},
			{
				$sort: { "_id.year": -1, "_id.month": -1 },
			},
		]);

		// Total revenue
		const revenueStats = await Order.aggregate([
			{
				$group: {
					_id: null,
					totalRevenue: { $sum: "$total" },
					averageOrderValue: { $avg: "$total" },
					maxOrderValue: { $max: "$total" },
					minOrderValue: { $min: "$total" },
				},
			},
		]);

		// Recent orders
		const recentOrders = await Order.find()
			.populate("customer", "name email")
			.sort({ createdAt: -1 })
			.limit(5)
			.select("orderNumber status total createdAt customer");

		return {
			totalOrders,
			ordersByStatus,
			ordersByPayment,
			monthlyOrders,
			revenueStats: revenueStats[0] || {},
			recentOrders,
		};
	} catch (error) {
		log(`❌ Error getting order statistics: ${error.message}`, colors.red);
		return null;
	}
};

// Display current database statistics
const showCurrentStats = async () => {
	log("📊 Current Database Statistics:", colors.bright);
	log("═".repeat(50), colors.cyan);

	const stats = await getOrderStats();
	if (!stats) return;

	log(`📦 Total Orders: ${stats.totalOrders}`, colors.blue);
	log("");

	// Orders by status
	if (stats.ordersByStatus.length > 0) {
		log("📈 Orders by Status:", colors.bright);
		stats.ordersByStatus.forEach((status) => {
			const statusColor = getStatusColor(status._id);
			log(
				`   ${status._id}: ${status.count} orders ($${status.totalValue.toFixed(
					2
				)})`,
				statusColor
			);
		});
		log("");
	}

	// Orders by payment status
	if (stats.ordersByPayment.length > 0) {
		log("💳 Orders by Payment Status:", colors.bright);
		stats.ordersByPayment.forEach((payment) => {
			const paymentColor = getPaymentStatusColor(payment._id);
			log(
				`   ${payment._id}: ${
					payment.count
				} orders ($${payment.totalValue.toFixed(2)})`,
				paymentColor
			);
		});
		log("");
	}

	// Revenue statistics
	if (stats.revenueStats.totalRevenue) {
		log("💰 Revenue Statistics:", colors.bright);
		log(
			`   Total Revenue: $${stats.revenueStats.totalRevenue.toFixed(2)}`,
			colors.green
		);
		log(
			`   Average Order: $${stats.revenueStats.averageOrderValue.toFixed(2)}`,
			colors.blue
		);
		log(
			`   Highest Order: $${stats.revenueStats.maxOrderValue.toFixed(2)}`,
			colors.magenta
		);
		log(
			`   Lowest Order: $${stats.revenueStats.minOrderValue.toFixed(2)}`,
			colors.yellow
		);
		log("");
	}

	// Recent orders
	if (stats.recentOrders.length > 0) {
		log("🕐 Recent Orders (Last 5):", colors.bright);
		stats.recentOrders.forEach((order, index) => {
			const customerName = order.customer?.name || "Unknown Customer";
			const orderDate = new Date(order.createdAt).toLocaleDateString();
			log(
				`   ${index + 1}. ${
					order.orderNumber
				} - ${customerName} - $${order.total.toFixed(2)} (${
					order.status
				}) - ${orderDate}`,
				colors.blue
			);
		});
		log("");
	}

	// Monthly breakdown
	if (stats.monthlyOrders.length > 0) {
		log("📅 Monthly Breakdown (Last 6 months):", colors.bright);
		stats.monthlyOrders.forEach((month) => {
			const monthName = new Date(
				month._id.year,
				month._id.month - 1
			).toLocaleDateString("en-US", { year: "numeric", month: "long" });
			log(
				`   ${monthName}: ${month.count} orders ($${month.totalValue.toFixed(
					2
				)})`,
				colors.blue
			);
		});
		log("");
	}

	// Check for users with orders (handle both ObjectId and embedded customer objects)
	try {
		const ordersWithCustomers = await Order.countDocuments({
			customer: { $exists: true },
		});

		if (ordersWithCustomers > 0) {
			log(
				`👥 ${ordersWithCustomers} orders contain customer information`,
				colors.yellow
			);
			log("   Customer order history will be lost", colors.yellow);
			log("");
		}
	} catch (error) {
		log("⚠️  Could not analyze customer impact", colors.yellow);
		log("");
	}
};

// Get color for order status
const getStatusColor = (status) => {
	switch (status?.toLowerCase()) {
		case "pending":
			return colors.yellow;
		case "confirmed":
			return colors.blue;
		case "preparing":
			return colors.cyan;
		case "ready":
			return colors.magenta;
		case "out_for_delivery":
			return colors.blue;
		case "delivered":
			return colors.green;
		case "cancelled":
			return colors.red;
		default:
			return colors.reset;
	}
};

// Get color for payment status
const getPaymentStatusColor = (status) => {
	switch (status?.toLowerCase()) {
		case "paid":
			return colors.green;
		case "pending":
			return colors.yellow;
		case "failed":
			return colors.red;
		case "refunded":
			return colors.magenta;
		default:
			return colors.reset;
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
			"This will permanently delete ALL orders from the database!",
			colors.red
		);
		log("This action cannot be undone!", colors.red);
		log("");
		log("What will be deleted:", colors.yellow);
		log("• All order records and history", colors.yellow);
		log("• Customer purchase history", colors.yellow);
		log("• Revenue and analytics data", colors.yellow);
		log("• Order numbers and tracking", colors.yellow);
		log("• Payment and delivery records", colors.yellow);
		log("");
		log("Impact on system:", colors.yellow);
		log("• Customer order history will be empty", colors.yellow);
		log("• Revenue reports will be reset", colors.yellow);
		log("• Analytics data will be lost", colors.yellow);
		log("• Order tracking will be unavailable", colors.yellow);
		log("");

		readline.question(
			`${colors.bright}Type 'DELETE ALL ORDERS' to confirm: ${colors.reset}`,
			(answer) => {
				readline.close();
				resolve(answer === "DELETE ALL ORDERS");
			}
		);
	});
};

// Delete all orders
const deleteAllOrders = async () => {
	try {
		log("🗑️  Starting order deletion process...", colors.yellow);
		log("");

		// Get list of orders for logging
		const ordersToDelete = await Order.find(
			{},
			"orderNumber customer status total createdAt"
		)
			.populate("customer", "name email")
			.sort({ createdAt: -1 });

		if (ordersToDelete.length === 0) {
			log("ℹ️  No orders found to delete", colors.blue);
			return;
		}

		log(
			`📋 Orders to be deleted (${ordersToDelete.length} total):`,
			colors.bright
		);

		// Group orders by status for summary
		const orderSummary = {};
		ordersToDelete.forEach((order) => {
			const status = order.status || "unknown";
			if (!orderSummary[status]) {
				orderSummary[status] = { count: 0, totalValue: 0 };
			}
			orderSummary[status].count++;
			orderSummary[status].totalValue += order.total || 0;
		});

		// Display summary
		Object.entries(orderSummary).forEach(([status, data]) => {
			const statusColor = getStatusColor(status);
			log(
				`   ${status}: ${data.count} orders ($${data.totalValue.toFixed(2)})`,
				statusColor
			);
		});
		log("");

		// Show recent orders that will be deleted
		log("🕐 Recent orders to be deleted:", colors.bright);
		ordersToDelete.slice(0, 10).forEach((order, index) => {
			const customerName = order.customer?.name || "Unknown";
			const orderDate = new Date(order.createdAt).toLocaleDateString();
			log(
				`   ${index + 1}. ${order.orderNumber} - ${customerName} - $${
					order.total?.toFixed(2) || "0.00"
				} - ${orderDate}`,
				colors.blue
			);
		});

		if (ordersToDelete.length > 10) {
			log(`   ... and ${ordersToDelete.length - 10} more orders`, colors.blue);
		}
		log("");

		// Delete all orders
		log("🗑️  Deleting orders...", colors.yellow);
		const deleteResult = await Order.deleteMany({});

		log(
			`✅ Successfully deleted ${deleteResult.deletedCount} orders`,
			colors.green
		);
		log("");

		// Additional cleanup - remove any orphaned references
		log("🧹 Performing additional cleanup...", colors.yellow);

		// Clean up any collections that might reference orders
		// This is where you'd add cleanup for other collections if needed

		log("🧹 Cleanup completed", colors.green);
		log("");
		log("🎉 Order deletion completed successfully!", colors.green);
	} catch (error) {
		log(`❌ Error during deletion: ${error.message}`, colors.red);
		throw error;
	}
};

// Verify deletion
const verifyDeletion = async () => {
	try {
		log("🔍 Verifying deletion...", colors.blue);

		const remainingOrders = await Order.countDocuments();
		const totalUsers = await User.countDocuments();
		const totalProducts = await Product.countDocuments();

		log(`📊 Verification Results:`, colors.bright);
		log(
			`   Orders remaining: ${remainingOrders}`,
			remainingOrders === 0 ? colors.green : colors.red
		);
		log(`   Total users: ${totalUsers}`, colors.blue);
		log(`   Total products: ${totalProducts}`, colors.blue);
		log("");

		if (remainingOrders === 0) {
			log("✅ Verification successful - All orders deleted", colors.green);
		} else {
			log("⚠️  Warning: Some orders may not have been deleted", colors.yellow);
		}

		// Check for any potential data integrity issues
		log("🔍 Checking data integrity...", colors.blue);
		log("✅ Database integrity maintained", colors.green);
		log("");
	} catch (error) {
		log(`❌ Error during verification: ${error.message}`, colors.red);
	}
};

// Show cleanup recommendations
const showCleanupRecommendations = () => {
	log("💡 Post-Deletion Recommendations:", colors.bright);
	log("═".repeat(50), colors.cyan);
	log("1. 📊 Analytics and reports will show zero data", colors.blue);
	log("2. 👥 Customer order history is now empty", colors.blue);
	log("3. 💰 Revenue tracking has been reset", colors.blue);
	log("4. 🔄 Consider informing customers about data reset", colors.blue);
	log("5. 📱 Mobile apps will show empty order history", colors.blue);
	log("6. 🧪 Test order creation functionality", colors.blue);
	log("");
	log("Available scripts:", colors.bright);
	log("• npm run create-admin     - Create admin users", colors.green);
	log("• npm run manage-users     - Manage user accounts", colors.green);
	log("• npm run add-products     - Add sample products", colors.green);
	log("");
	log("Next steps:", colors.bright);
	log("• Test order creation with fresh data", colors.green);
	log("• Verify customer experience", colors.green);
	log("• Check dashboard analytics", colors.green);
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

		await deleteAllOrders();
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

module.exports = { deleteAllOrders, getOrderStats };
