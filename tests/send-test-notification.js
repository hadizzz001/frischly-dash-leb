// Send a test push to every device signed in to one account, then report what
// Expo — and through it Apple/Google — said about each device.
//
//   node tests/send-test-notification.js <email>
//
// Reads the user from the database in .env and only pushes to that user's own
// devices. "Delivered" means Expo handed the push to Apple/Google; an error
// names the reason (DeviceNotRegistered = app removed or token stale,
// InvalidCredentials = FCM/APNs key missing on EAS for that app).
require("dotenv").config();
const mongoose = require("mongoose");
const { Expo } = require("expo-server-sdk");
const admin = require("firebase-admin");
const User = require("../src/models/User");
const { pushTokensOf } = require("../src/services/pushTokens");

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });
const RECEIPT_WAIT_MS = 30 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const short = (token) => (token.length > 40 ? `${token.slice(0, 30)}…${token.slice(-6)}` : token);

async function sendToRawFcm(token, title, body) {
	if (!admin.apps.length) {
		admin.initializeApp({ credential: admin.credential.cert(require("../src/config/firebase-service-account.json")) });
	}
	await admin.messaging().send({ token, notification: { title, body }, data: { type: "test" } });
}

async function main() {
	const email = process.argv[2];
	if (!email) {
		console.log("Usage: node tests/send-test-notification.js <email>");
		process.exit(1);
	}

	await mongoose.connect(process.env.MONGODB_URI);
	try {
		const user = await User.findOne({ email: email.trim().toLowerCase() });
		if (!user) throw new Error(`User ${email} not found`);

		const tokens = pushTokensOf(user);
		console.log(`👤 ${user.name} (${user.email}), role ${user.role} — ${tokens.length} device(s)`);
		if (tokens.length === 0) {
			console.log("⚠️  No device registered. Open the app while signed in, allow notifications, then retry.");
			return;
		}

		const title = "Freshly LB test";
		const body = `Test notification sent ${new Date().toLocaleTimeString()}`;
		const sent = [];
		for (const token of tokens) {
			if (!Expo.isExpoPushToken(token)) {
				try {
					await sendToRawFcm(token, title, body);
					console.log(`✅ ${short(token)} — sent through Firebase`);
				} catch (error) {
					console.log(`❌ ${short(token)} — Firebase refused: ${error.message}`);
				}
				continue;
			}
			const [ticket] = await expo.sendPushNotificationsAsync([
				{ to: token, title, body, data: { type: "test" }, sound: "default", priority: "high", channelId: "default" },
			]);
			if (ticket.status === "ok") {
				sent.push({ token, id: ticket.id });
			} else {
				console.log(`❌ ${short(token)} — Expo refused (${ticket.details?.error || "unknown"}): ${ticket.message}`);
			}
		}

		if (sent.length === 0) return;
		console.log(`⏳ Waiting ${RECEIPT_WAIT_MS / 1000}s for delivery receipts…`);
		await sleep(RECEIPT_WAIT_MS);
		const receipts = await expo.getPushNotificationReceiptsAsync(sent.map((s) => s.id));
		for (const { token, id } of sent) {
			const receipt = receipts[id];
			if (!receipt) console.log(`⏳ ${short(token)} — no receipt yet (ticket ${id}); check again later`);
			else if (receipt.status === "ok") console.log(`✅ ${short(token)} — delivered to Apple/Google`);
			else console.log(`❌ ${short(token)} — not delivered (${receipt.details?.error || "unknown"}): ${receipt.message}`);
		}
	} finally {
		await mongoose.connection.close();
	}
}

main().catch((error) => {
	console.error("❌ Error sending test notification:", error.message);
	process.exitCode = 1;
});
