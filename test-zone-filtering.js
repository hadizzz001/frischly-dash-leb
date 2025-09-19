const mongoose = require("mongoose");
const Rider = require("./src/models/Rider");
const Zone = require("./src/models/Zone");
const Order = require("./src/models/Order");

// Test zone filtering logic
async function testZoneFiltering() {
	try {
		// Connect to MongoDB (adjust connection string as needed)
		await mongoose.connect("mongodb://localhost:27017/frischly", {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});

		console.log("Connected to MongoDB");

		// Test 1: Get a rider and their zones
		const rider = await Rider.findOne().populate("user");
		if (rider) {
			console.log("\n=== Test 1: Rider Zone Information ===");
			console.log("Rider zones (names):", rider.zones);

			// Test 2: Get corresponding zip codes
			const zones = await Zone.find({
				zoneName: { $in: rider.zones },
				isActive: true,
			});
			const zipCodes = zones.map((zone) => zone.zipCode);
			console.log("Corresponding zip codes:", zipCodes);

			// Test 3: Find orders in those zip codes
			const orders = await Order.find({
				"customer.address.zipCode": { $in: zipCodes },
				status: { $nin: ["pending", "confirmed", "processing"] },
			}).limit(5);

			console.log("\n=== Test 3: Orders in Rider Zones ===");
			console.log(`Found ${orders.length} orders in rider's zones`);
			orders.forEach((order, index) => {
				console.log(
					`${index + 1}. Order ${order.orderNumber} - Zip: ${
						order.customer.address.zipCode
					}`
				);
			});
		} else {
			console.log("No riders found in database");
		}
	} catch (error) {
		console.error("Test failed:", error);
	} finally {
		await mongoose.connection.close();
		console.log("\nDatabase connection closed");
	}
}

testZoneFiltering();
