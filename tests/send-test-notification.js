require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");
const sendExpoNotification = require("../src/services/expoNotification");
const admin = require("firebase-admin");
const serviceAccount = require("../src/config/firebase-service-account.json");

// Initialize Firebase Admin
if (!admin.apps.length) {
	admin.initializeApp({
		credential: admin.credential.cert(serviceAccount),
	});
}

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
		console.log(`📱 Token: ${user.fcmToken}`);
		if (!user.fcmToken) {
			console.log("⚠️  User does not have a token. Cannot send notification.");
			process.exit(1);
		}

		// Prepare notification data
		const title = "Frischly GmbH";
		const body = "Benachrichtigungen über Verkäufe und Angebote💛";
		const data = {
			type: "test",
			timestamp: new Date().toISOString(),
			testId: user.role + Date.now(),
		};

		console.log("\n📤 Sending notifications via both Firebase and Expo...\n");

		// Send through both services simultaneously
		const [firebaseResult, expoResult] = await Promise.allSettled([
			// Firebase notification
			(async () => {
				try {
					console.log("🔥 Sending via Firebase FCM...");
					const message = {
						token: user.fcmToken,
						notification: {
							title,
							body,
						},
						data: {
							...data,
							userId: user._id.toString(),
						},
					};
					const response = await admin.messaging().send(message);
					console.log("✅ Firebase notification sent! Message ID:", response);
					return { success: true, messageId: response };
				} catch (error) {
					console.error("❌ Firebase notification failed:", error.message);
					return { success: false, error: error.message };
				}
			})(),

			// Expo notification
			(async () => {
				try {
					console.log("📱 Sending via Expo...");
					const result = await sendExpoNotification(
						user.fcmToken,
						title,
						body,
						data
					);
					if (result && result.success) {
						console.log("✅ Expo notification sent! Ticket:", result.ticket);
						return result;
					} else {
						console.error("❌ Expo notification failed:", result.error);
						return result;
					}
				} catch (error) {
					console.error("❌ Expo notification failed:", error.message);
					return { success: false, error: error.message };
				}
			})(),
		]);

		// Summary of results
		console.log("\n📊 Results Summary:");
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		console.log(
			`Firebase: ${
				firebaseResult.status === "fulfilled" && firebaseResult.value.success
					? "✅ Success"
					: "❌ Failed"
			}`
		);
		console.log(
			`Expo: ${
				expoResult.status === "fulfilled" && expoResult.value.success
					? "✅ Success"
					: "❌ Failed"
			}`
		);
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
	} catch (error) {
		console.error("❌ Error sending test notification:", error.message);
	} finally {
		await mongoose.connection.close();
		console.log("🔌 Database connection closed");
		process.exit(0);
	}
};

sendTestNotification();
