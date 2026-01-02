const { Expo } = require("expo-server-sdk");
const expo = new Expo();

async function sendExpoNotification(token, title, body, data = {}) {
	if (!Expo.isExpoPushToken(token)) {
		console.error("❌ Invalid Expo push token:", token);
		return { success: false, error: "Invalid Expo push token" };
	}
	const messages = [
		{
			to: token,
			sound: "default",
			title,
			body,
			data,
		},
	];
	try {
		let ticketChunk = await expo.sendPushNotificationsAsync(messages);
		console.log("✅ Expo notification sent! Ticket:", ticketChunk);
		return { success: true, ticket: ticketChunk };
	} catch (error) {
		console.error("❌ Error sending Expo notification:", error.message);
		return { success: false, error: error.message };
	}
}

module.exports = sendExpoNotification;
