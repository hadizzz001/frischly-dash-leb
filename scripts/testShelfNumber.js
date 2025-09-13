const mongoose = require("mongoose");
require("dotenv").config();

// Import models
const Order = require("../src/models/Order");

// Connect to MongoDB
const connectDB = async () => {
	try {
		const conn = await mongoose.connect(process.env.MONGODB_URI);
		console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
		console.log(`📊 Database: ${conn.connection.name}`);
	} catch (error) {
		console.error("❌ Database connection failed:", error.message);
		process.exit(1);
	}
};

// Test shelf number field
const testShelfNumber = async () => {
	try {
		console.log("🔍 Testing shelf number field...");

		// Get the latest order
		const latestOrder = await Order.findOne().sort({ createdAt: -1 });

		if (!latestOrder) {
			console.log("❌ No orders found in database");
			return;
		}

		console.log(`📦 Latest Order: ${latestOrder.orderNumber}`);
		console.log(`🏷️  Customer: ${latestOrder.customer.name}`);
		console.log(`🏪 Shelf Number: ${latestOrder.shelfNumber}`);
		console.log(`💰 Total: $${latestOrder.total.toFixed(2)}`);
		console.log(`📅 Created: ${latestOrder.createdAt}`);

		// Test updating shelf number
		console.log("\n🔄 Testing shelf number update...");
		latestOrder.shelfNumber = 5;
		await latestOrder.save();

		console.log(`✅ Updated shelf number to: ${latestOrder.shelfNumber}`);

		// Verify update
		const updatedOrder = await Order.findById(latestOrder._id);
		console.log(`✅ Verified shelf number: ${updatedOrder.shelfNumber}`);

		// Get all orders with their shelf numbers
		console.log("\n📊 All orders with shelf numbers:");
		const allOrders = await Order.find({ isActive: true })
			.select("orderNumber customer.name shelfNumber total createdAt")
			.sort({ createdAt: -1 })
			.limit(10);

		allOrders.forEach((order, index) => {
			console.log(
				`   ${index + 1}. ${order.orderNumber} - ${
					order.customer.name
				} - Shelf: ${order.shelfNumber} - $${order.total.toFixed(2)}`
			);
		});
	} catch (error) {
		console.error("❌ Error testing shelf number:", error);
	}
};

// Main execution
const main = async () => {
	console.log("🚀 Starting shelf number test...");
	console.log("==================================");

	await connectDB();
	await testShelfNumber();

	console.log("\n✅ Shelf number test completed!");

	mongoose.connection.close();
	process.exit(0);
};

// Handle errors
process.on("unhandledRejection", (err) => {
	console.error("❌ Unhandled Promise Rejection:", err);
	process.exit(1);
});

// Run the script
main().catch(console.error);
