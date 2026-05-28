const mongoose = require("mongoose");
const Product = require("../models/Product");

const ensureProductIndexes = async () => {
	await Product.collection.createIndex(
		{ market: 1, barcode: 1 },
		{ unique: true, name: "market_1_barcode_1" },
	);

	const indexes = await Product.collection.indexes();
	const legacyBarcodeIndex = indexes.find(
		(index) => index.name === "barcode_1" && index.unique,
	);
	if (legacyBarcodeIndex) {
		await Product.collection.dropIndex("barcode_1");
		console.log("✅ Dropped legacy global product barcode index");
	}
};

const connectDB = async () => {
	try {
		console.log("🔗 Connecting to MongoDB...");
		mongoose.set("debug", process.env.NODE_ENV === "development");
		const conn = await mongoose.connect(process.env.MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
		console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
		console.log(`📊 Database: ${conn.connection.name}`);
		try {
			await ensureProductIndexes();
		} catch (indexError) {
			console.warn(
				"⚠️ Product barcode index migration skipped:",
				indexError.message,
			);
		}
	} catch (error) {
		console.error("❌ Error connecting to MongoDB:", error.message);
		console.error("🔧 Please check your MONGODB_URI in .env file");
		process.exit(1);
	}
};

module.exports = connectDB;
