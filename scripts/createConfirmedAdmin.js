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

const ensureConfirmedAdmin = async () => {
	const emailFromArgs = process.argv[2];
	const email =
		emailFromArgs || process.env.ADMIN_EMAIL || "admin@frischly.com";
	const name = process.env.ADMIN_NAME || "System Administrator";
	const phoneNumber = process.env.ADMIN_PHONE || "+1234567890";
	const password = process.env.ADMIN_PASSWORD || "Admin123!";
	const shouldResetPassword =
		process.env.ADMIN_RESET_PASSWORD === "true" || false;

	const address = {
		street: process.env.ADMIN_STREET || "123 Admin Street",
		city: process.env.ADMIN_CITY || "Admin City",
		state: process.env.ADMIN_STATE || "Admin State",
		zipCode: process.env.ADMIN_ZIP || "12345",
		country: process.env.ADMIN_COUNTRY || "USA",
	};

	try {
		let user = await User.findOne({ email });

		if (user) {
			console.log(
				`ℹ️  Admin user already exists for ${email}. Updating status.`
			);
			user.name = name;
			user.phoneNumber = phoneNumber;
			user.address = address;
			user.role = "admin";
			user.isActive = true;
			user.emailConfirmed = true;
			user.emailConfirmedAt = new Date();
			user.emailToken = undefined;
			user.emailTokenExpires = undefined;

			if (shouldResetPassword) {
				user.password = password;
				console.log(
					"🔐 Password reset requested via ADMIN_RESET_PASSWORD=true."
				);
			}

			await user.save();

			console.log("✅ Admin user updated and confirmed.");
		} else {
			console.log(`ℹ️  No admin user found for ${email}. Creating one now.`);
			user = await User.create({
				name,
				phoneNumber,
				email,
				password,
				role: "admin",
				address,
				isActive: true,
				emailConfirmed: true,
				emailConfirmedAt: new Date(),
				emailToken: undefined,
				emailTokenExpires: undefined,
			});

			console.log("✅ Admin user created and confirmed.");
		}

		console.log("\n📧 Email:", email);
		console.log("👤 Name:", user.name);
		console.log("📞 Phone:", user.phoneNumber);
		console.log("👮 Role:", user.role);
		console.log(
			shouldResetPassword
				? "🔑 Password was reset as requested."
				: "🔑 Existing password retained (set ADMIN_RESET_PASSWORD=true to reset)."
		);
		console.log(
			"📅 Email confirmation timestamp:",
			user.emailConfirmedAt ? user.emailConfirmedAt.toISOString() : "N/A"
		);
	} catch (error) {
		console.error("❌ Error ensuring confirmed admin user:", error.message);
	} finally {
		await disconnectDB();
	}
};

(async () => {
	await connectDB();
	await ensureConfirmedAdmin();
	process.exit(0);
})();
