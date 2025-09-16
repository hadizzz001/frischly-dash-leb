// Script to add German zones to the database
// Usage: node scripts/addGermanZones.js

const mongoose = require("mongoose");
const Zone = require("../src/models/Zone");
const User = require("../src/models/User");
require("dotenv").config();

const germanZones = [
	{
		zoneName: "Barrien-Heide",
		zipCode: "28857",
		distance: 3.9,
		distanceUnit: "km",
		description: "Delivery zone for Barrien-Heide area",
		isActive: true,
		deliveryFee: 2.5,
		estimatedDeliveryTime: 25,
		priority: 1,
	},
	{
		zoneName: "Clues (Niedersachsen)",
		zipCode: "28857",
		distance: 3.9,
		distanceUnit: "km",
		description: "Delivery zone for Clues, Niedersachsen area",
		isActive: true,
		deliveryFee: 2.5,
		estimatedDeliveryTime: 25,
		priority: 2,
	},
	{
		zoneName: "Ristedt bei Syke",
		zipCode: "28857",
		distance: 4.0,
		distanceUnit: "km",
		description: "Delivery zone for Ristedt bei Syke area",
		isActive: true,
		deliveryFee: 2.5,
		estimatedDeliveryTime: 30,
		priority: 3,
	},
	{
		zoneName: "Sörhausen bei Syke",
		zipCode: "28857",
		distance: 4.5,
		distanceUnit: "km",
		description: "Delivery zone for Sörhausen bei Syke area",
		isActive: true,
		deliveryFee: 3.0,
		estimatedDeliveryTime: 30,
		priority: 4,
	},
	{
		zoneName: "Osterholz bei Syke",
		zipCode: "28857",
		distance: 4.7,
		distanceUnit: "km",
		description: "Delivery zone for Osterholz bei Syke area",
		isActive: true,
		deliveryFee: 3.0,
		estimatedDeliveryTime: 35,
		priority: 5,
	},
	{
		zoneName: "Halbetzen, Niedersachsen",
		zipCode: "28857",
		distance: 4.8,
		distanceUnit: "km",
		description: "Delivery zone for Halbetzen, Niedersachsen area",
		isActive: true,
		deliveryFee: 3.0,
		estimatedDeliveryTime: 35,
		priority: 6,
	},
	{
		zoneName: "Weyhe",
		zipCode: "28844",
		distance: 6.7,
		distanceUnit: "km",
		description: "Delivery zone for Weyhe area",
		isActive: true,
		deliveryFee: 4.0,
		estimatedDeliveryTime: 40,
		priority: 7,
	},
	{
		zoneName: "Süstedt",
		zipCode: "27305",
		distance: 9.2,
		distanceUnit: "km",
		description: "Delivery zone for Süstedt area",
		isActive: true,
		deliveryFee: 5.0,
		estimatedDeliveryTime: 50,
		priority: 8,
	},
	{
		zoneName: "Bassum",
		zipCode: "27211",
		distance: 9.7,
		distanceUnit: "km",
		description: "Delivery zone for Bassum area",
		isActive: true,
		deliveryFee: 5.0,
		estimatedDeliveryTime: 55,
		priority: 9,
	},
	{
		zoneName: "Emtinghausen",
		zipCode: "27321",
		distance: 9.9,
		distanceUnit: "km",
		description: "Delivery zone for Emtinghausen area",
		isActive: true,
		deliveryFee: 5.5,
		estimatedDeliveryTime: 55,
		priority: 10,
	},
];

async function addGermanZones() {
	try {
		await mongoose.connect(process.env.MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
		console.log("Connected to MongoDB");

		// Get admin user for createdBy field
		const adminUser = await User.findOne({ email: "admin@frischly.com" });
		if (!adminUser) {
			throw new Error(
				"Admin user not found. Please ensure admin@frischly.com exists."
			);
		}
		console.log(`Using admin user: ${adminUser.name} (${adminUser.email})`);

		let added = 0;
		let skipped = 0;

		for (const zoneData of germanZones) {
			try {
				// Check if zone already exists
				const existingZone = await Zone.findOne({
					$or: [
						{ zoneName: zoneData.zoneName },
						{ zipCode: zoneData.zipCode, distance: zoneData.distance },
					],
				});

				if (existingZone) {
					console.log(
						`⚠️  Zone "${zoneData.zoneName}" already exists, skipping...`
					);
					skipped++;
					continue;
				}

				// Create new zone with createdBy field
				const zoneDataWithUser = {
					...zoneData,
					createdBy: adminUser._id,
				};
				const zone = await Zone.create(zoneDataWithUser);
				console.log(
					`✅ Added zone: ${zone.zoneName} (${zone.zipCode}) - ${zone.distance}km`
				);
				added++;
			} catch (error) {
				console.error(
					`❌ Failed to add zone "${zoneData.zoneName}":`,
					error.message
				);
			}
		}

		console.log(`\n📊 Summary:`);
		console.log(`   ✅ Added: ${added} zones`);
		console.log(`   ⚠️  Skipped: ${skipped} zones`);
		console.log(`   📦 Total zones processed: ${germanZones.length}`);

		mongoose.disconnect();
		console.log("\nDatabase connection closed");
	} catch (error) {
		console.error("❌ Error adding zones:", error.message);
		process.exit(1);
	}
}

addGermanZones();
