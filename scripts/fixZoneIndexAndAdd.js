// Script to fix zone index issues and add German zones
// Usage: node scripts/fixZoneIndexAndAdd.js

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

async function fixZoneIndexAndAdd() {
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

		// Check current zones and indexes
		console.log("\n🔍 Checking current zones...");
		const allZones = await Zone.find({});
		console.log(`Found ${allZones.length} zones in database:`);
		allZones.forEach((zone) => {
			console.log(`  - ${zone.zoneName || "NULL NAME"} (ID: ${zone._id})`);
		});

		// Check indexes
		console.log("\n🔍 Checking current indexes...");
		const collection = mongoose.connection.db.collection("zones");
		const indexes = await collection.indexes();
		console.log(
			"Current indexes:",
			indexes.map((idx) => ({ key: idx.key, unique: idx.unique }))
		);

		// Drop the problematic unique index on zoneName/name
		console.log("\n🗑️  Dropping unique indexes...");
		try {
			await collection.dropIndex("zoneName_1");
			console.log("✅ Dropped zoneName_1 index");
		} catch (error) {
			console.log("⚠️  zoneName_1 index not found or already dropped");
		}

		try {
			await collection.dropIndex("name_1");
			console.log("✅ Dropped name_1 index");
		} catch (error) {
			console.log("⚠️  name_1 index not found or already dropped");
		}

		// Remove any zones with null or empty names
		const nullNameZones = await Zone.find({
			$or: [
				{ zoneName: null },
				{ zoneName: "" },
				{ zoneName: { $exists: false } },
			],
		});

		if (nullNameZones.length > 0) {
			console.log(
				`\n🧹 Found ${nullNameZones.length} zones with null/empty names. Cleaning up...`
			);
			const cleanupResult = await Zone.deleteMany({
				$or: [
					{ zoneName: null },
					{ zoneName: "" },
					{ zoneName: { $exists: false } },
				],
			});
			console.log(
				`✅ Cleaned up ${cleanupResult.deletedCount} zones with null/empty names`
			);
		}

		// Delete all remaining zones
		const deleteResult = await Zone.deleteMany({});
		console.log(`\n🗑️  Deleted ${deleteResult.deletedCount} remaining zones`);

		let added = 0;
		let failed = 0;

		// Add new zones
		console.log("\n📦 Adding German zones...");
		for (const zoneData of germanZones) {
			try {
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
				failed++;
			}
		}

		// Recreate the unique index properly
		console.log("\n🔧 Recreating unique index...");
		try {
			await collection.createIndex({ zoneName: 1 }, { unique: true });
			console.log("✅ Created unique index on zoneName");
		} catch (error) {
			console.log("⚠️  Could not create unique index:", error.message);
		}

		console.log(`\n📊 Summary:`);
		console.log(`   🗑️  Deleted: ${deleteResult.deletedCount} zones`);
		console.log(`   ✅ Added: ${added} zones`);
		console.log(`   ❌ Failed: ${failed} zones`);
		console.log(`   📦 Total zones processed: ${germanZones.length}`);

		mongoose.disconnect();
		console.log("\nDatabase connection closed");
	} catch (error) {
		console.error("❌ Error processing zones:", error.message);
		console.error(error.stack);
		process.exit(1);
	}
}

fixZoneIndexAndAdd();
