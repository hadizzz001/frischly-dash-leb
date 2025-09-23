const mongoose = require("mongoose");
const User = require("../src/models/User");
const Rider = require("../src/models/Rider");
require("dotenv").config();

async function checkOrCreateRider() {
	try {
		// Connect to MongoDB
		await mongoose.connect(process.env.MONGO_URI);
		console.log("✅ Connected to MongoDB");

		// Check if rider user exists
		let riderUser = await User.findOne({ email: "rider@frischly.com" });

		if (!riderUser) {
			console.log("🔨 Creating rider user...");
			riderUser = await User.create({
				name: "Test Rider",
				email: "rider@frischly.com",
				password: "rider123",
				role: "rider",
				phone: "+1234567890",
			});
			console.log("✅ Rider user created");
		} else {
			console.log("✅ Rider user already exists");
		}

		// Check if rider profile exists
		let riderProfile = await Rider.findOne({ user: riderUser._id });

		if (!riderProfile) {
			console.log("🔨 Creating rider profile...");
			riderProfile = await Rider.create({
				user: riderUser._id,
				zones: ["Zone1", "Zone2"], // Add some test zones
				status: "available",
				isActive: true,
			});
			console.log("✅ Rider profile created");
		} else {
			console.log("✅ Rider profile already exists");
		}

		console.log("\n📋 Rider Information:");
		console.log(`   User ID: ${riderUser._id}`);
		console.log(`   Name: ${riderUser.name}`);
		console.log(`   Email: ${riderUser.email}`);
		console.log(`   Role: ${riderUser.role}`);
		console.log(`   Rider ID: ${riderProfile._id}`);
		console.log(`   Zones: ${riderProfile.zones.join(", ")}`);
		console.log(`   Status: ${riderProfile.status}`);
	} catch (error) {
		console.error("❌ Error:", error.message);
	} finally {
		await mongoose.disconnect();
		console.log("\n🔌 Disconnected from MongoDB");
	}
}

checkOrCreateRider();
