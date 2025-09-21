const mongoose = require("mongoose");
const Rider = require("./src/models/Rider");

// Connect to MongoDB
const connectDB = async () => {
	try {
		const conn = await mongoose.connect(
			process.env.MONGO_URI || "mongodb://localhost:27017/frischly",
			{
				useNewUrlParser: true,
				useUnifiedTopology: true,
			}
		);
		console.log(`MongoDB Connected: ${conn.connection.host}`);
	} catch (error) {
		console.error("Database connection error:", error);
		process.exit(1);
	}
};

// Migration function
const migrateRiderZones = async () => {
	try {
		console.log("Starting rider zones migration...");

		const result = await Rider.migrateZones();

		console.log(`Migration completed: ${result.migrated} riders migrated`);
	} catch (error) {
		console.error("Migration failed:", error);
	} finally {
		await mongoose.connection.close();
		console.log("Database connection closed");
	}
};

// Run migration
if (require.main === module) {
	connectDB().then(() => {
		migrateRiderZones();
	});
}

module.exports = { migrateRiderZones };
