const { Expo } = require("expo-server-sdk");

// An access token is only required when "Enhanced Security for Push
// Notifications" is switched on for the Expo project. Harmless when unset.
const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });

// Android channel the mobile app creates on start-up (hooks/useNotifications.ts):
// MAX importance + vibration pattern, so pushes pop as heads-up banners. If the
// channel doesn't exist on the device expo-notifications falls back to its own
// high-importance channel, so this can never make a push disappear.
const ANDROID_CHANNEL_ID = "default";

// A ticket only says Expo *accepted* the push. Whether the device actually got
// it (DeviceNotRegistered = app uninstalled / stale token, InvalidCredentials =
// FCM/APNs not set up) shows up in the receipt, which Expo says to fetch about
// 15 minutes later.
const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;

/**
 * Send one push notification through Expo's push service.
 *
 * @param {string} token  ExponentPushToken[...]
 * @param {string} title
 * @param {string} body
 * @param {object} [data]  Arbitrary payload delivered to the app.
 * @param {object} [opts]
 * @param {(code: string) => void} [opts.onDeliveryError]  Called with Expo's
 *   error code (e.g. "DeviceNotRegistered") when the ticket or the later
 *   receipt says the push could not be delivered.
 */
async function sendExpoNotification(token, title, body, data = {}, opts = {}) {
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
			priority: "high",
			channelId: ANDROID_CHANNEL_ID,
		},
	];
	try {
		const [ticket] = await expo.sendPushNotificationsAsync(messages);
		if (!ticket || ticket.status !== "ok") {
			const code = (ticket && ticket.details && ticket.details.error) || "unknown";
			const message = (ticket && ticket.message) || "Expo rejected the push";
			console.error(`❌ Expo rejected push (${code}):`, message);
			reportDeliveryError(opts.onDeliveryError, code);
			return { success: false, error: message, code };
		}
		console.log("✅ Expo accepted push, ticket:", ticket.id);
		scheduleReceiptCheck(ticket.id, opts.onDeliveryError);
		return { success: true, ticket };
	} catch (error) {
		console.error("❌ Error sending Expo notification:", error.message);
		return { success: false, error: error.message };
	}
}

function reportDeliveryError(onDeliveryError, code) {
	if (typeof onDeliveryError !== "function") return;
	try {
		onDeliveryError(code);
	} catch (err) {
		console.error("❌ onDeliveryError handler failed:", err.message);
	}
}

// Best effort: log (and report) a failed delivery once the receipt is in. The
// timer is unref'd so it never keeps the process alive.
function scheduleReceiptCheck(ticketId, onDeliveryError) {
	if (!ticketId) return;
	const timer = setTimeout(async () => {
		try {
			const receipts = await expo.getPushNotificationReceiptsAsync([ticketId]);
			const receipt = receipts[ticketId];
			if (!receipt || receipt.status === "ok") return;
			const code = (receipt.details && receipt.details.error) || "unknown";
			console.error(`❌ Push ${ticketId} was not delivered (${code}):`, receipt.message);
			reportDeliveryError(onDeliveryError, code);
		} catch (err) {
			console.error("❌ Could not fetch Expo push receipt:", err.message);
		}
	}, RECEIPT_CHECK_DELAY_MS);
	if (typeof timer.unref === "function") timer.unref();
}

module.exports = sendExpoNotification;
