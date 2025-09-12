const mongoose = require("mongoose");

const connectDB = async () => {
	try {
		console.log("🔗 Connecting to MongoDB...");
		const conn = await mongoose.connect(process.env.MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
		console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
		console.log(`📊 Database: ${conn.connection.name}`);
	} catch (error) {
		console.error("❌ Error connecting to MongoDB:", error.message);
		console.error("🔧 Please check your MONGODB_URI in .env file");
		process.exit(1);
	}
};

module.exports = connectDB;
