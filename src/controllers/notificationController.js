const NotificationService = require("../services/notifications");
const User = require("../models/User");
const NotificationCampaign = require("../models/NotificationCampaign");
const { sendSuccess, sendError, sendResponse } = require("../utils/apiResponse");

/**
 * Update user's FCM token
 */
exports.updateFcmToken = async (req, res) => {
	try {
		const { fcmToken } = req.body;
		const userId = req.user.id;

		console.log(`📱 FCM Token Update Request - User: ${userId}`);
		console.log(
			`📱 Token received: ${
				fcmToken ? fcmToken.substring(0, 30) + "..." : "null"
			}`
		);

		if (!fcmToken) {
			console.log(`❌ FCM Token Update Failed - No token provided`);
			return sendError(res, 400, "FCM token is required");
		}

		await NotificationService.updateUserToken(userId, fcmToken);

		// Send confirmation notification if user is a customer
		const user = await User.findById(userId);
		// if (user && user.role === "customer" && user.fcmToken) {
		// 	try {
		// 		await NotificationService.sendToUser(
		// 			userId,
		// 			"Benachrichtigung aktiviert!",
		// 			"You will now receive push notifications from Frischly.",
		// 			{ type: "confirm", timestamp: new Date().toISOString() }
		// 		);
		// 		console.log(
		// 			`✅ Confirmation notification sent to customer ${user.email}`
		// 		);
		// 	} catch (err) {
		// 		console.error(
		// 			"❌ Error sending confirmation notification to customer:",
		// 			err
		// 		);
		// 	}
		// }

		console.log(`✅ FCM Token Updated Successfully - User: ${userId}`);
		sendSuccess(res, null, "FCM token updated successfully");
	} catch (error) {
		console.error("❌ Error updating FCM token:", error);
		sendError(res, 500, "Failed to update FCM token", error.message);
	}
};

/**
 * Remove user's FCM token
 */
exports.removeFcmToken = async (req, res) => {
	try {
		const userId = req.user.id;

		await NotificationService.removeUserToken(userId);

		sendSuccess(res, null, "FCM token removed successfully");
	} catch (error) {
		console.error("Error removing FCM token:", error);
		sendError(res, 500, "Failed to remove FCM token", error.message);
	}
};

/**
 * Send notification to a specific user (admin only)
 */
exports.sendToUser = async (req, res) => {
	try {
		const { userId, title, body, data } = req.body;

		if (!userId || !title || !body) {
			return sendError(res, 400, "userId, title, and body are required");
		}

		const result = await NotificationService.sendToUser(
			userId,
			title,
			body,
			data
		);

		sendSuccess(res, result, "Notification sent successfully");
	} catch (error) {
		console.error("Error sending notification to user:", error);
		sendError(res, 500, "Failed to send notification", error.message);
	}
};

/**
 * Send notification to multiple users (admin only)
 */
exports.sendToUsers = async (req, res) => {
	try {
		const { userIds, title, body, data } = req.body;

		if (
			!userIds ||
			!Array.isArray(userIds) ||
			userIds.length === 0 ||
			!title ||
			!body
		) {
			return sendError(res, 400, "userIds (array), title, and body are required");
		}

		const result = await NotificationService.sendToUsers(
			userIds,
			title,
			body,
			data
		);

		sendSuccess(res, result, `Notifications sent to ${userIds.length} users`);
	} catch (error) {
		console.error("Error sending notifications to users:", error);
		sendError(res, 500, "Failed to send notifications", error.message);
	}
};

/**
 * Send notification to all users (admin only)
 */
exports.sendToAllUsers = async (req, res) => {
	try {
		const { title, body, data } = req.body;

		if (!title || !body) {
			return sendError(res, 400, "title and body are required");
		}

		const result = await NotificationService.sendToAllUsers(title, body, data);

		sendSuccess(res, result, `Notifications sent to ${result.totalSent} customers`);
	} catch (error) {
		console.error("Error sending notifications to all users:", error);
		sendError(res, 500, "Failed to send notifications", error.message);
	}
};

/**
 * Send notification to users by role (admin only)
 */
exports.sendToRole = async (req, res) => {
	try {
		const { role, title, body, data } = req.body;

		if (!role || !title || !body) {
			return sendError(res, 400, "role, title, and body are required");
		}

		const validRoles = [
			"customer",
			"rider",
			"staff",
			"user",
			"manager",
			"admin",
		];
		if (!validRoles.includes(role)) {
			return sendError(res, 400, "Invalid role. Must be one of: " + validRoles.join(", "));
		}

		const result = await NotificationService.sendToRole(
			role,
			title,
			body,
			data
		);

		sendSuccess(res, result, `Notifications sent to ${role}s`);
	} catch (error) {
		console.error("Error sending notifications to role:", error);
		sendError(res, 500, "Failed to send notifications", error.message);
	}
};

/**
 * Get notification statistics
 */
exports.getStats = async (req, res) => {
	try {
		const totalUsers = await User.countDocuments({ isActive: true });
		const usersWithTokens = await User.countDocuments({
			fcmToken: { $ne: null },
			isActive: true,
		});

		const roleStats = await User.aggregate([
			{ $match: { isActive: true, fcmToken: { $ne: null } } },
			{ $group: { _id: "$role", count: { $sum: 1 } } },
		]);

		sendSuccess(res, {
			totalUsers,
			usersWithTokens,
			tokenCoverage:
				totalUsers > 0
					? ((usersWithTokens / totalUsers) * 100).toFixed(2)
					: 0,
			roleBreakdown: roleStats,
		});
	} catch (error) {
		console.error("Error getting notification stats:", error);
		sendError(res, 500, "Failed to get notification statistics", error.message);
	}
};

/**
 * Create a notification campaign
 */
exports.createCampaign = async (req, res) => {
	try {
		const {
			title,
			message,
			targetType,
			targetRole,
			targetUserIds,
			targetSegment,
			data,
			notes,
		} = req.body;

		const campaignData = {
			title,
			message,
			targetType: targetType || "all",
			data: data || {},
			createdBy: req.user.id,
		};

		if (targetType === "role" && targetRole) {
			campaignData.targetRole = targetRole;
		}

		if (targetType === "specific_users" && targetUserIds) {
			campaignData.targetUserIds = targetUserIds;
		}

		if (targetType === "segment" && targetSegment) {
			campaignData.targetSegment = targetSegment;
		}

		if (notes) {
			campaignData.notes = notes;
		}

		const campaign = await NotificationCampaign.create(campaignData);

		sendSuccess(res, campaign, "Notification campaign created successfully", 201);
	} catch (error) {
		console.error("Error creating notification campaign:", error);
		sendError(res, 500, "Failed to create notification campaign", error.message);
	}
};

/**
 * Get all notification campaigns
 */
exports.getCampaigns = async (req, res) => {
	try {
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 10;
		const skip = (page - 1) * limit;

		const campaigns = await NotificationCampaign.find()
			.populate("createdBy", "name email")
			.populate("targetUserIds", "name email")
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit);

		const total = await NotificationCampaign.countDocuments();

		sendResponse(res, 200, true, "Success", campaigns, {
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
			},
		});
	} catch (error) {
		console.error("Error getting notification campaigns:", error);
		sendError(res, 500, "Failed to get notification campaigns", error.message);
	}
};

/**
 * Get a specific notification campaign
 */
exports.getCampaign = async (req, res) => {
	try {
		const campaign = await NotificationCampaign.findById(req.params.id)
			.populate("createdBy", "name email")
			.populate("targetUserIds", "name email");

		if (!campaign) {
			return sendError(res, 404, "Notification campaign not found");
		}

		sendSuccess(res, campaign);
	} catch (error) {
		console.error("Error getting notification campaign:", error);
		sendError(res, 500, "Failed to get notification campaign", error.message);
	}
};

/**
 * Update a notification campaign
 */
exports.updateCampaign = async (req, res) => {
	try {
		const {
			title,
			message,
			targetType,
			targetRole,
			targetUserIds,
			targetSegment,
			data,
			notes,
			status,
		} = req.body;

		const updateData = {};
		if (title) updateData.title = title;
		if (message) updateData.message = message;
		if (targetType) updateData.targetType = targetType;
		if (targetRole) updateData.targetRole = targetRole;
		if (targetUserIds) updateData.targetUserIds = targetUserIds;
		if (targetSegment) updateData.targetSegment = targetSegment;
		if (data) updateData.data = data;
		if (notes !== undefined) updateData.notes = notes;
		if (status) updateData.status = status;

		const campaign = await NotificationCampaign.findByIdAndUpdate(
			req.params.id,
			updateData,
			{ new: true, runValidators: true }
		)
			.populate("createdBy", "name email")
			.populate("targetUserIds", "name email");

		if (!campaign) {
			return sendError(res, 404, "Notification campaign not found");
		}

		sendSuccess(res, campaign, "Notification campaign updated successfully");
	} catch (error) {
		console.error("Error updating notification campaign:", error);
		sendError(res, 500, "Failed to update notification campaign", error.message);
	}
};

/**
 * Delete a notification campaign
 */
exports.deleteCampaign = async (req, res) => {
	try {
		const campaign = await NotificationCampaign.findByIdAndDelete(
			req.params.id
		);

		if (!campaign) {
			return sendError(res, 404, "Notification campaign not found");
		}

		sendSuccess(res, null, "Notification campaign deleted successfully");
	} catch (error) {
		console.error("Error deleting notification campaign:", error);
		sendError(res, 500, "Failed to delete notification campaign", error.message);
	}
};

/**
 * Send a notification campaign
 */
exports.sendCampaign = async (req, res) => {
	try {
		const campaign = await NotificationCampaign.findById(req.params.id);

		if (!campaign) {
			return sendError(res, 404, "Notification campaign not found");
		}

		if (campaign.status === "sent") {
			return sendError(res, 400, "Campaign has already been sent");
		}

		// Update campaign status
		campaign.status = "sending";
		await campaign.save();

		let result;

		try {
			switch (campaign.targetType) {
				case "all":
					result = await NotificationService.sendToAllUsers(
						campaign.title,
						campaign.message,
						campaign.data
					);
					break;
				case "role":
					result = await NotificationService.sendToRole(
						campaign.targetRole,
						campaign.title,
						campaign.message,
						campaign.data
					);
					break;
				case "specific_users":
					result = await NotificationService.sendToUsers(
						campaign.targetUserIds,
						campaign.title,
						campaign.message,
						campaign.data
					);
					break;
				case "segment":
					// For now, treat segment as all users (can be extended later)
					result = await NotificationService.sendToAllUsers(
						campaign.title,
						campaign.message,
						campaign.data
					);
					break;
				default:
					throw new Error("Invalid target type");
			}

			// Update campaign with results
			campaign.status = "sent";
			campaign.sentAt = new Date();
			campaign.sentCount = result.totalSent || result.responses?.length || 0;
			campaign.totalRecipients = campaign.sentCount;
			campaign.failedCount =
				result.responses?.filter((r) => !r.success)?.length || 0;

			await campaign.save();

			sendSuccess(res, {
				campaign,
				result,
			}, "Notification campaign sent successfully");
		} catch (sendError) {
			// Update campaign status to failed
			campaign.status = "failed";
			await campaign.save();

			throw sendError;
		}
	} catch (error) {
		console.error("Error sending notification campaign:", error);
		sendError(res, 500, "Failed to send notification campaign", error.message);
	}
};
