const admin = require("firebase-admin");
const User = require("../models/User");

class NotificationService {
	/**
	 * Send notification to a single user
	 * @param {string} userId - User ID
	 * @param {string} title - Notification title
	 * @param {string} body - Notification body
	 * @param {object} data - Additional data payload
	 */
	async sendToUser(userId, title, body, data = {}) {
		try {
			const user = await User.findById(userId);
			if (!user || !user.fcmToken) {
				throw new Error("User not found or FCM token not available");
			}

			const message = {
				token: user.fcmToken,
				notification: {
					title,
					body,
				},
				data: {
					...data,
					userId: userId.toString(),
				},
			};

			const response = await admin.messaging().send(message);
			console.log("✅ Notification sent successfully:", response);
			return { success: true, messageId: response };
		} catch (error) {
			console.error("❌ Error sending notification to user:", error);
			throw error;
		}
	}

	/**
	 * Send notification to multiple users
	 * @param {Array<string>} userIds - Array of user IDs
	 * @param {string} title - Notification title
	 * @param {string} body - Notification body
	 * @param {object} data - Additional data payload
	 */
	async sendToUsers(userIds, title, body, data = {}) {
		try {
			const users = await User.find({
				_id: { $in: userIds },
				fcmToken: { $ne: null },
			});
			if (users.length === 0) {
				throw new Error("No users found with FCM tokens");
			}

			const messages = users.map((user) => ({
				token: user.fcmToken,
				notification: {
					title,
					body,
				},
				data: {
					...data,
					userId: user._id.toString(),
				},
			}));

			const response = await admin.messaging().sendAll(messages);
			console.log(`✅ Notifications sent to ${users.length} users`);
			return { success: true, responses: response.responses };
		} catch (error) {
			console.error("❌ Error sending notifications to users:", error);
			throw error;
		}
	}

	/**
	 * Send notification to all users with FCM tokens
	 * @param {string} title - Notification title
	 * @param {string} body - Notification body
	 * @param {object} data - Additional data payload
	 */
	async sendToAllUsers(title, body, data = {}) {
		try {
			const users = await User.find({
				fcmToken: { $ne: null },
				isActive: true,
			});
			if (users.length === 0) {
				throw new Error("No active users found with FCM tokens");
			}

			const messages = users.map((user) => ({
				token: user.fcmToken,
				notification: {
					title,
					body,
				},
				data: {
					...data,
					userId: user._id.toString(),
				},
			}));

			// Send in batches of 500 (FCM limit)
			const batchSize = 500;
			const results = [];

			for (let i = 0; i < messages.length; i += batchSize) {
				const batch = messages.slice(i, i + batchSize);
				const response = await admin.messaging().sendAll(batch);
				results.push(...response.responses);
			}

			console.log(`✅ Notifications sent to ${users.length} users`);
			return { success: true, totalSent: users.length, responses: results };
		} catch (error) {
			console.error("❌ Error sending notifications to all users:", error);
			throw error;
		}
	}

	/**
	 * Send notification to users by role
	 * @param {string} role - User role (customer, rider, staff, admin, etc.)
	 * @param {string} title - Notification title
	 * @param {string} body - Notification body
	 * @param {object} data - Additional data payload
	 */
	async sendToRole(role, title, body, data = {}) {
		try {
			const users = await User.find({
				role,
				fcmToken: { $ne: null },
				isActive: true,
			});
			if (users.length === 0) {
				throw new Error(`No active ${role}s found with FCM tokens`);
			}

			const messages = users.map((user) => ({
				token: user.fcmToken,
				notification: {
					title,
					body,
				},
				data: {
					...data,
					userId: user._id.toString(),
				},
			}));

			const response = await admin.messaging().sendAll(messages);
			console.log(`✅ Notifications sent to ${users.length} ${role}s`);
			return { success: true, responses: response.responses };
		} catch (error) {
			console.error(`❌ Error sending notifications to ${role}s:`, error);
			throw error;
		}
	}

	/**
	 * Update user's FCM token
	 * @param {string} userId - User ID
	 * @param {string} fcmToken - FCM token
	 */
	async updateUserToken(userId, fcmToken) {
		try {
			await User.findByIdAndUpdate(userId, { fcmToken });
			console.log(`✅ FCM token updated for user ${userId}`);
			return { success: true };
		} catch (error) {
			console.error("❌ Error updating FCM token:", error);
			throw error;
		}
	}

	/**
	 * Remove user's FCM token
	 * @param {string} userId - User ID
	 */
	async removeUserToken(userId) {
		try {
			await User.findByIdAndUpdate(userId, { fcmToken: null });
			console.log(`✅ FCM token removed for user ${userId}`);
			return { success: true };
		} catch (error) {
			console.error("❌ Error removing FCM token:", error);
			throw error;
		}
	}
}

module.exports = new NotificationService();
