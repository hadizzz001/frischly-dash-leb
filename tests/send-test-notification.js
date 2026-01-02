require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");
const NotificationService = require("../src/services/notifications");
const initializeFirebase = require("../src/config/firebase");

const connectDB = async () => {
	try {
		console.log("🔗 Connecting to MongoDB...");
		await mongoose.connect(process.env.MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
		console.log("✅ MongoDB Connected");
	} catch (error) {
		console.error("❌ Error connecting to MongoDB:", error.message);
		process.exit(1);
	}
};

const sendTestNotification = async () => {
	try {
		await connectDB();

		// Initialize Firebase
		const firebase = initializeFirebase();
		if (!firebase) {
			throw new Error("Failed to initialize Firebase");
		}

		// Get email from command line argument
		const email = process.argv[2];
		if (!email) {
			console.log("❌ Usage: node send-test-notification.js <email>");
			console.log("Example: node send-test-notification.js user@example.com");
			process.exit(1);
		}

		// Find the user
		const user = await User.findOne({ email: email });

		if (!user) {
			console.log(`❌ User ${email} not found`);
			process.exit(1);
		}

		console.log(`👤 Found user: ${user.name} (${user.email})`);
		console.log(`Role: ${user.role}`);
		console.log(`📱 Token: ${user.fcmToken ? "Present" : "Not set"}`);
		if (!user.fcmToken) {
			console.log("⚠️  User does not have a token. Cannot send notification.");
			process.exit(1);
		}

		// Send notification via Firebase
		const title = "Test Notification";
		const body = "This is a test notification sent via Firebase!";
		const data = {
			type: "test",
			timestamp: new Date().toISOString(),
			testId: user.role + Date.now(),
		};

		console.log("📤 Sending via Firebase (FCM)...");
		const result = await NotificationService.sendToUser(
			user._id.toString(),
			title,
			body,
			data
		);
		if (result && result.success) {
			console.log(
				"✅ Firebase notification sent! Message ID:",
				result.messageId || result
			);
		} else {
			console.error("❌ Failed to send Firebase notification.");
		}
	} catch (error) {
		console.error("❌ Error sending test notification:", error.message);
	} finally {
		await mongoose.connection.close();
		console.log("🔌 Database connection closed");
		process.exit(0);
	}
};

sendTestNotification();
