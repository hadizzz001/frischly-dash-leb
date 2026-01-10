const admin = require("firebase-admin");
const User = require("../models/User");
const { Expo } = require("expo-server-sdk");
const expo = new Expo();

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

			const response = await admin.messaging().sendEach(messages);
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
				role: "customer",
			});
			if (users.length === 0) {
				throw new Error("No active customers found with FCM tokens");
			}

			console.log(
				`📤 Sending notifications to ${users.length} customers via Firebase & Expo...`
			);

			// Send through both Firebase and Expo simultaneously
			const [firebaseResult, expoResult] = await Promise.allSettled([
				// Firebase FCM
				(async () => {
					try {
						const messages = users.map((user) => ({
							token: user.fcmToken,
							notification: { title, body },
							data: { ...data, userId: user._id.toString() },
						}));

						// Send in batches of 500 (FCM limit)
						const batchSize = 500;
						const results = [];

						for (let i = 0; i < messages.length; i += batchSize) {
							const batch = messages.slice(i, i + batchSize);
							const response = await admin.messaging().sendEach(batch);
							results.push(...response.responses);
						}

						const successCount = results.filter((r) => r.success).length;
						console.log(
							`✅ Firebase: Sent to ${successCount}/${users.length} customers`
						);
						return {
							success: true,
							totalSent: successCount,
							responses: results,
						};
					} catch (error) {
						console.error(
							"❌ Firebase: Failed to send notifications:",
							error.message
						);
						return { success: false, error: error.message };
					}
				})(),

				// Expo Push Notifications
				(async () => {
					try {
						const expoMessages = users
							.filter((user) => Expo.isExpoPushToken(user.fcmToken))
							.map((user) => ({
								to: user.fcmToken,
								sound: "default",
								title,
								body,
								data: { ...data, userId: user._id.toString() },
							}));

						if (expoMessages.length === 0) {
							console.log("⚠️  Expo: No valid Expo push tokens found");
							return { success: true, totalSent: 0, tickets: [] };
						}

						// Send in chunks (Expo recommends batches of 100)
						const chunks = expo.chunkPushNotifications(expoMessages);
						const tickets = [];

						for (const chunk of chunks) {
							const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
							tickets.push(...ticketChunk);
						}

						console.log(`✅ Expo: Sent to ${expoMessages.length} customers`);
						return { success: true, totalSent: expoMessages.length, tickets };
					} catch (error) {
						console.error(
							"❌ Expo: Failed to send notifications:",
							error.message
						);
						return { success: false, error: error.message };
					}
				})(),
			]);

			// Combine results
			const firebaseData =
				firebaseResult.status === "fulfilled"
					? firebaseResult.value
					: { success: false };
			const expoData =
				expoResult.status === "fulfilled"
					? expoResult.value
					: { success: false };

			console.log("\n📊 Notification Results:");
			console.log(
				`Firebase: ${firebaseData.success ? "✅ Success" : "❌ Failed"}`
			);
			console.log(`Expo: ${expoData.success ? "✅ Success" : "❌ Failed"}\n`);

			return {
				success: true,
				totalSent: users.length,
				firebase: firebaseData,
				expo: expoData,
			};
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

			console.log(
				`📤 Sending notifications to ${users.length} ${role}s via Firebase & Expo...`
			);

			// Send through both Firebase and Expo simultaneously
			const [firebaseResult, expoResult] = await Promise.allSettled([
				// Firebase FCM
				(async () => {
					try {
						const messages = users.map((user) => ({
							token: user.fcmToken,
							notification: { title, body },
							data: { ...data, userId: user._id.toString() },
						}));

						const response = await admin.messaging().sendEach(messages);
						const successCount = response.responses.filter(
							(r) => r.success
						).length;
						console.log(
							`✅ Firebase: Sent to ${successCount}/${users.length} ${role}s`
						);
						return {
							success: true,
							totalSent: successCount,
							responses: response.responses,
						};
					} catch (error) {
						console.error(
							`❌ Firebase: Failed to send to ${role}s:`,
							error.message
						);
						return { success: false, error: error.message };
					}
				})(),

				// Expo Push Notifications
				(async () => {
					try {
						const expoMessages = users
							.filter((user) => Expo.isExpoPushToken(user.fcmToken))
							.map((user) => ({
								to: user.fcmToken,
								sound: "default",
								title,
								body,
								data: { ...data, userId: user._id.toString() },
							}));

						if (expoMessages.length === 0) {
							console.log(
								`⚠️  Expo: No valid Expo push tokens found for ${role}s`
							);
							return { success: true, totalSent: 0, tickets: [] };
						}

						const chunks = expo.chunkPushNotifications(expoMessages);
						const tickets = [];

						for (const chunk of chunks) {
							const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
							tickets.push(...ticketChunk);
						}

						console.log(`✅ Expo: Sent to ${expoMessages.length} ${role}s`);
						return { success: true, totalSent: expoMessages.length, tickets };
					} catch (error) {
						console.error(
							`❌ Expo: Failed to send to ${role}s:`,
							error.message
						);
						return { success: false, error: error.message };
					}
				})(),
			]);

			// Combine results
			const firebaseData =
				firebaseResult.status === "fulfilled"
					? firebaseResult.value
					: { success: false };
			const expoData =
				expoResult.status === "fulfilled"
					? expoResult.value
					: { success: false };

			console.log("\n📊 Notification Results:");
			console.log(
				`Firebase: ${firebaseData.success ? "✅ Success" : "❌ Failed"}`
			);
			console.log(`Expo: ${expoData.success ? "✅ Success" : "❌ Failed"}\n`);

			return {
				success: true,
				totalSent: users.length,
				firebase: firebaseData,
				expo: expoData,
			};
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
