// Quick test script to verify zones and edit functionality
const mongoose = require("mongoose");
const Zone = require("../src/models/Zone");
require("dotenv").config();

async function testZones() {
	try {
		await mongoose.connect(process.env.MONGODB_URI);
		console.log("Connected to MongoDB");

		const zones = await Zone.find({}).select(
			"zoneName zipCode distance deliveryFee isActive"
		);
		console.log(`\nFound ${zones.length} zones:`);

		zones.forEach((zone, index) => {
			console.log(
				`${index + 1}. ${zone.zoneName} (${zone.zipCode}) - ${
					zone.distance
				}km - €${zone.deliveryFee || 0} - ${
					zone.isActive ? "Active" : "Inactive"
				}`
			);
		});

		// Test edit functionality by updating the first zone
		if (zones.length > 0) {
			const firstZone = zones[0];
			console.log(`\n🔧 Testing edit functionality on: ${firstZone.zoneName}`);

			const originalDeliveryFee = firstZone.deliveryFee;
			const newDeliveryFee = (originalDeliveryFee || 0) + 0.5;

			const updatedZone = await Zone.findByIdAndUpdate(
				firstZone._id,
				{ deliveryFee: newDeliveryFee },
				{ new: true, runValidators: true }
			);

			console.log(
				`✅ Updated ${updatedZone.zoneName} delivery fee: €${
					originalDeliveryFee || 0
				} → €${updatedZone.deliveryFee}`
			);

			// Revert the change
			await Zone.findByIdAndUpdate(firstZone._id, {
				deliveryFee: originalDeliveryFee,
			});
			console.log(
				`↩️  Reverted ${updatedZone.zoneName} delivery fee back to €${
					originalDeliveryFee || 0
				}`
			);
		}

		mongoose.disconnect();
		console.log("\n✅ Zone edit functionality test completed successfully!");
	} catch (error) {
		console.error("❌ Error:", error.message);
		process.exit(1);
	}
}

testZones();
