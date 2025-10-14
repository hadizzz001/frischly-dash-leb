const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const User = require("../src/models/User");

const connectDB = async () => {
	try {
		await mongoose.connect(process.env.MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
		console.log("✅ Connected to MongoDB\n");
	} catch (error) {
		console.error("❌ Failed to connect to MongoDB:", error.message);
		process.exit(1);
	}
};

const disconnectDB = async () => {
	try {
		await mongoose.disconnect();
		console.log("\n🔌 Disconnected from MongoDB");
	} catch (error) {
		console.error("❌ Error disconnecting from MongoDB:", error.message);
	}
};

const confirmAllUsers = async () => {
	const confirmOnlyFlag = process.env.CONFIRM_ONLY === "true";
	const includeInactiveFlag = process.env.CONFIRM_INCLUDE_INACTIVE === "true";

	const filter = {};

	if (confirmOnlyFlag) {
		filter.emailConfirmed = { $ne: true };
	}

	if (!includeInactiveFlag) {
		filter.isActive = { $ne: false };
	}

	try {
		const now = new Date();
		const result = await User.updateMany(filter, {
			emailConfirmed: true,
			emailConfirmedAt: now,
			emailToken: undefined,
			emailTokenExpires: undefined,
		});

		const matched = result.matchedCount ?? result.n ?? 0;
		const modified = result.modifiedCount ?? result.nModified ?? 0;

		console.log("⚙️  Confirmation run completed:");
		console.log("   • Matched users:", matched);
		console.log("   • Updated users:", modified);
		console.log("   • Only confirmed pending users:", confirmOnlyFlag);
		console.log("   • Included inactive users:", includeInactiveFlag);
	} catch (error) {
		console.error("❌ Error confirming users:", error.message);
	} finally {
		await disconnectDB();
	}
};

(async () => {
	await connectDB();
	await confirmAllUsers();
	process.exit(0);
})();
