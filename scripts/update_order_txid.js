require("dotenv").config();
const connectDB = require("../src/config/database");
const Order = require("../src/models/Order");

async function updateOrderTxid() {
	try {
		console.log("🔄 Connecting to database...");
		await connectDB();

		console.log('📝 Updating all orders txid to "0"...');
		const result = await Order.updateMany({}, { txid: "0" });

		console.log(`✅ Successfully updated ${result.modifiedCount} orders`);
		console.log(`📊 Total matched: ${result.matchedCount}`);

		process.exit(0);
	} catch (error) {
		console.error("❌ Error updating orders:", error.message);
		process.exit(1);
	}
}

updateOrderTxid();
