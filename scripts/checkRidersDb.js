// Simple script to check riders count in database
const mongoose = require("mongoose");
require("dotenv").config();

async function checkRiders() {
	try {
		await mongoose.connect(process.env.MONGODB_URI);
		console.log("Connected to MongoDB");

		// Check if riders collection exists and has documents
		const db = mongoose.connection.db;
		const collections = await db.listCollections({ name: "riders" }).toArray();

		if (collections.length === 0) {
			console.log('❌ No "riders" collection found in database');
		} else {
			console.log('✅ "riders" collection exists');

			// Count documents
			const ridersCount = await db.collection("riders").countDocuments();
			console.log(`📊 Total riders in database: ${ridersCount}`);

			if (ridersCount > 0) {
				// Get a sample rider to see structure
				const sampleRider = await db.collection("riders").findOne();
				console.log("\n📋 Sample rider structure:");
				console.log(JSON.stringify(sampleRider, null, 2));
			}
		}

		mongoose.disconnect();
		console.log("\nDatabase connection closed");
	} catch (error) {
		console.error("❌ Error:", error.message);
		process.exit(1);
	}
}

checkRiders();
