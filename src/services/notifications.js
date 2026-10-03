const admin = require("firebase-admin");
const { Expo } = require("expo-server-sdk");
const User = require("../models/User");
const { sendExpoPushes } = require("./expoNotification");
const {
	withPushToken,
	pushTokensOf,
	addPushToken,
	removePushToken,
	clearPushTokens,
	dropPushToken,
} = require("./pushTokens");

// FCM accepts at most 500 messages per sendEach call.
const FCM_BATCH_SIZE = 500;

// FCM rejects data payloads with non-string values.
const stringValues = (data) =>
	Object.fromEntries(
		Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
	);

// A token Expo no longer knows (app uninstalled, phone wiped) will never work
// again: forget it so the account only keeps devices that can still receive.
function forgetDeadToken(token, code) {
	if (code !== "DeviceNotRegistered") return;
	dropPushToken(token).catch((e) => console.error("❌ Could not clear stale push token:", e.message));
}

class NotificationService {
	/**
	 * Push to every device of every given user. Expo push tokens (both mobile
	 * apps register ExponentPushToken[...]) go through Expo; anything else is a
	 * raw FCM registration token and goes through Firebase.
	 *
	 * Never throws — each channel reports its own outcome.
	 *
	 * @param {Array<object>} users - User documents (need _id, fcmToken, pushTokens)
	 * @param {string} title
	 * @param {string} body
	 * @param {object} [data] - Payload for the app. `channelId` is lifted out and
	 *   used as the Android notification channel (the scanner app's ringing
	 *   "new orders" channel); every other key is delivered to the app.
	 * @param {string} [audience] - Who these users are, for the log line.
	 */
	async deliver(users, title, body, data = {}, audience = "users") {
		const { channelId, ...payload } = data || {};
		const expoMessages = [];
		const fcmMessages = [];
		for (const user of users) {
			const userData = { ...payload, userId: user._id.toString() };
			for (const token of pushTokensOf(user)) {
				if (Expo.isExpoPushToken(token)) {
					expoMessages.push({ to: token, title, body, data: userData, ...(channelId ? { channelId } : {}) });
				} else {
					fcmMessages.push({ token, notification: { title, body }, data: stringValues(userData) });
				}
			}
		}

		const [firebase, expo] = await Promise.all([
			this.sendFcmMessages(fcmMessages),
			this.sendExpoMessages(expoMessages),
		]);

		console.log(
			`📤 Notified ${users.length} ${audience} on ${fcmMessages.length + expoMessages.length} devices ` +
				`(Firebase ${firebase.totalSent}/${fcmMessages.length}, Expo ${expo.totalSent}/${expoMessages.length} accepted)`,
		);

		return {
			success: true,
			totalSent: users.length,
			devices: fcmMessages.length + expoMessages.length,
			firebase,
			expo,
			responses: [...firebase.responses, ...expo.results],
			tickets: expo.tickets,
		};
	}

	async sendFcmMessages(messages) {
		if (messages.length === 0) return { success: true, totalSent: 0, responses: [] };
		try {
			const responses = [];
			for (let i = 0; i < messages.length; i += FCM_BATCH_SIZE) {
				const response = await admin.messaging().sendEach(messages.slice(i, i + FCM_BATCH_SIZE));
				responses.push(...response.responses);
			}
			return { success: true, totalSent: responses.filter((r) => r.success).length, responses };
		} catch (error) {
			console.error("❌ Firebase: Failed to send notifications:", error.message);
			return {
				success: false,
				error: error.message,
				totalSent: 0,
				responses: messages.map(() => ({ success: false, error: error.message })),
			};
		}
	}

	async sendExpoMessages(messages) {
		if (messages.length === 0) return { success: true, totalSent: 0, tickets: [], results: [] };
		const results = await sendExpoPushes(messages, { onDeliveryError: forgetDeadToken });
		return {
			success: results.some((r) => r.success),
			totalSent: results.filter((r) => r.success).length,
			tickets: results.map((r) => r.ticket).filter(Boolean),
			results,
		};
	}

	/**
	 * Send notification to a single user (every device they're signed in on)
	 * @param {string} userId - User ID
	 * @param {string} title - Notification title
	 * @param {string} body - Notification body
	 * @param {object} data - Additional data payload
	 */
	async sendToUser(userId, title, body, data = {}) {
		const user = await User.findById(userId);
		if (!user || pushTokensOf(user).length === 0) {
			throw new Error("User not found or FCM token not available");
		}
		return this.deliver([user], title, body, data, "user");
	}

	/**
	 * Send notification to multiple users
	 * @param {Array<string>} userIds - Array of user IDs
	 * @param {string} title - Notification title
	 * @param {string} body - Notification body
	 * @param {object} data - Additional data payload
	 */
	async sendToUsers(userIds, title, body, data = {}) {
		const users = await User.find(withPushToken({ _id: { $in: userIds } }));
		if (users.length === 0) {
			throw new Error("No users found with FCM tokens");
		}
		return this.deliver(users, title, body, data, "users");
	}

	/**
	 * Send notification to all active customers with a device registered
	 * @param {string} title - Notification title
	 * @param {string} body - Notification body
	 * @param {object} data - Additional data payload
	 */
	async sendToAllUsers(title, body, data = {}) {
		const users = await User.find(withPushToken({ isActive: true, role: "customer" }));
		if (users.length === 0) {
			throw new Error("No active customers found with FCM tokens");
		}
		return this.deliver(users, title, body, data, "customers");
	}

	/**
	 * Send notification to users by role
	 * @param {string} role - User role (customer, rider, staff, admin, etc.)
	 * @param {string} title - Notification title
	 * @param {string} body - Notification body
	 * @param {object} data - Additional data payload
	 */
	async sendToRole(role, title, body, data = {}) {
		const users = await User.find(withPushToken({ role, isActive: true }));
		if (users.length === 0) {
			throw new Error(`No active ${role}s found with FCM tokens`);
		}
		return this.deliver(users, title, body, data, `${role}s`);
	}

	/**
	 * Send a notification to every customer who has placed at least one order
	 * with a specific market. Used by the MARKET dashboard's "Send to All
	 * Customers" button — a market admin should only be able to broadcast to
	 * customers who've actually ordered from their store, not every customer
	 * in the whole app (that's reserved for the main admin's own broadcast,
	 * see sendToAllUsers above).
	 * @param {string} marketId - Market ObjectId
	 * @param {string} title - Notification title
	 * @param {string} body - Notification body
	 * @param {object} data - Additional data payload
	 */
	async sendToMarketCustomers(marketId, title, body, data = {}) {
		const Order = require("../models/Order");
		const customerEmails = await Order.distinct("customer.email", {
			market: marketId,
		});
		if (!customerEmails || customerEmails.length === 0) {
			throw new Error("No customers found for this market");
		}

		const users = await User.find(
			withPushToken({ email: { $in: customerEmails }, role: "customer", isActive: true }),
		);
		if (users.length === 0) {
			throw new Error("No active customers of this market have FCM tokens");
		}
		return this.deliver(users, title, body, data, `customers of market ${marketId}`);
	}

	/**
	 * Register a device's push token for a user (added to their devices)
	 * @param {string} userId - User ID
	 * @param {string} fcmToken - Expo push token or FCM token
	 */
	async updateUserToken(userId, fcmToken) {
		const user = await addPushToken(userId, fcmToken);
		console.log(
			`✅ Push token registered for user ${userId} (${user ? pushTokensOf(user).length : 0} device(s))`,
		);
		return { success: true };
	}

	/**
	 * Remove a user's push token — just that device's when `fcmToken` is given
	 * (current apps send it on logout), every device otherwise (older builds).
	 * @param {string} userId - User ID
	 * @param {string} [fcmToken] - The signing-out device's token
	 */
	async removeUserToken(userId, fcmToken) {
		if (fcmToken) {
			await removePushToken(userId, fcmToken);
			console.log(`✅ Push token of one device removed for user ${userId}`);
		} else {
			await clearPushTokens(userId);
			console.log(`✅ All push tokens removed for user ${userId}`);
		}
		return { success: true };
	}
}

module.exports = new NotificationService();
