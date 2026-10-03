const { Expo } = require("expo-server-sdk");

// An access token is only required when "Enhanced Security for Push
// Notifications" is switched on for the Expo project. Harmless when unset.
const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });

// Android channel the mobile app creates on start-up (hooks/useNotifications.ts):
// MAX importance + vibration pattern, so pushes pop as heads-up banners. If the
// channel doesn't exist on the device expo-notifications falls back to its own
// high-importance channel, so this can never make a push disappear.
const ANDROID_CHANNEL_ID = "default";

// Expo accepts at most 100 messages per request.
const EXPO_BATCH_SIZE = 100;

// A ticket only says Expo *accepted* the push. Whether the device actually got
// it (DeviceNotRegistered = app uninstalled / stale token, InvalidCredentials =
// FCM/APNs not set up) shows up in the receipt. Receipts are usually ready
// within seconds, so look after a minute — while whoever is testing is still
// watching the logs — and once more at Expo's recommended 15 minutes for any
// that weren't ready yet. Times are measured from the send.
const RECEIPT_CHECKS_AT_MS = [60 * 1000, 15 * 60 * 1000];

const chunk = (items, size) => {
	const out = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
};

function reportDeliveryError(onDeliveryError, token, code) {
	if (typeof onDeliveryError !== "function") return;
	try {
		onDeliveryError(token, code);
	} catch (err) {
		console.error("❌ onDeliveryError handler failed:", err.message);
	}
}

// Best effort: log (and report) failed deliveries once their receipts are in.
// Timers are unref'd so they never keep the process alive.
function scheduleReceiptChecks(sent, onDeliveryError, attempt = 0) {
	if (sent.length === 0 || attempt >= RECEIPT_CHECKS_AT_MS.length) return;
	const wait = RECEIPT_CHECKS_AT_MS[attempt] - (attempt ? RECEIPT_CHECKS_AT_MS[attempt - 1] : 0);
	const timer = setTimeout(async () => {
		const notReady = [];
		let delivered = 0;
		for (const batch of chunk(sent, 300)) {
			try {
				const receipts = await expo.getPushNotificationReceiptsAsync(batch.map((s) => s.id));
				for (const s of batch) {
					const receipt = receipts[s.id];
					if (!receipt) {
						notReady.push(s);
					} else if (receipt.status === "ok") {
						delivered += 1;
					} else {
						const code = (receipt.details && receipt.details.error) || "unknown";
						console.error(`❌ Push ${s.id} was not delivered (${code}):`, receipt.message);
						reportDeliveryError(onDeliveryError, s.token, code);
					}
				}
			} catch (err) {
				console.error("❌ Could not fetch Expo push receipts:", err.message);
				notReady.push(...batch);
			}
		}
		if (delivered > 0) {
			console.log(`📬 Expo handed ${delivered} push(es) to Apple/Google for delivery`);
		}
		scheduleReceiptChecks(notReady, onDeliveryError, attempt + 1);
	}, wait);
	if (typeof timer.unref === "function") timer.unref();
}

/**
 * Send push notifications through Expo's push service. Never throws.
 *
 * @param {Array<{to: string, title: string, body: string, data?: object, channelId?: string}>} messages
 *   One message per device. Sound, high priority and the app's heads-up
 *   Android channel are filled in unless the message sets its own.
 * @param {object} [opts]
 * @param {(token: string, code: string) => void} [opts.onDeliveryError]  Called
 *   with the device token and Expo's error code (e.g. "DeviceNotRegistered")
 *   when the ticket or the later receipt says the push could not be delivered.
 * @returns {Promise<Array<{success: boolean, ticket?: object, error?: string, code?: string}>>}
 *   One result per message, in order.
 */
async function sendExpoPushes(messages, opts = {}) {
	const results = new Array(messages.length);
	const queue = [];
	messages.forEach((message, index) => {
		if (Expo.isExpoPushToken(message.to)) {
			queue.push({
				index,
				message: { sound: "default", priority: "high", channelId: ANDROID_CHANNEL_ID, ...message },
			});
		} else {
			console.error("❌ Invalid Expo push token:", message.to);
			results[index] = { success: false, error: "Invalid Expo push token" };
		}
	});

	const sent = [];
	for (const batch of chunk(queue, EXPO_BATCH_SIZE)) {
		let tickets;
		try {
			tickets = await expo.sendPushNotificationsAsync(batch.map((q) => q.message));
		} catch (error) {
			console.error("❌ Error sending Expo notification:", error.message);
			for (const q of batch) results[q.index] = { success: false, error: error.message };
			continue;
		}
		batch.forEach((q, i) => {
			const ticket = tickets[i];
			const token = q.message.to;
			if (ticket && ticket.status === "ok") {
				console.log("✅ Expo accepted push, ticket:", ticket.id);
				sent.push({ id: ticket.id, token });
				results[q.index] = { success: true, ticket };
				return;
			}
			const code = (ticket && ticket.details && ticket.details.error) || "unknown";
			const message = (ticket && ticket.message) || "Expo rejected the push";
			console.error(`❌ Expo rejected push (${code}):`, message);
			reportDeliveryError(opts.onDeliveryError, token, code);
			results[q.index] = { success: false, error: message, code, ticket };
		});
	}

	scheduleReceiptChecks(sent, opts.onDeliveryError);
	return results;
}

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
	const onDeliveryError =
		typeof opts.onDeliveryError === "function" ? (_token, code) => opts.onDeliveryError(code) : undefined;
	const [result] = await sendExpoPushes([{ to: token, title, body, data }], { onDeliveryError });
	return result;
}

module.exports = sendExpoNotification;
module.exports.sendExpoPushes = sendExpoPushes;
