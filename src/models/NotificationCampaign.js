const mongoose = require("mongoose");

const notificationCampaignSchema = new mongoose.Schema(
	{
		title: {
			type: String,
			required: [true, "Campaign title is required"],
			trim: true,
			maxlength: [200, "Title cannot be more than 200 characters"],
		},
		message: {
			type: String,
			required: [true, "Campaign message is required"],
			trim: true,
			maxlength: [500, "Message cannot be more than 500 characters"],
		},
		targetType: {
			type: String,
			enum: ["all", "role", "specific_users", "segment"],
			required: [true, "Target type is required"],
			default: "all",
		},
		targetRole: {
			type: String,
			enum: ["customer", "rider", "staff", "user", "manager", "admin"],
			required: function () {
				return this.targetType === "role";
			},
		},
		targetUserIds: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "User",
				required: function () {
					return this.targetType === "specific_users";
				},
			},
		],
		targetSegment: {
			type: String,
			trim: true,
			required: function () {
				return this.targetType === "segment";
			},
		},
		sentAt: {
			type: Date,
			default: null,
		},
		status: {
			type: String,
			enum: ["draft", "sending", "sent", "failed"],
			default: "draft",
		},
		sentCount: {
			type: Number,
			default: 0,
		},
		failedCount: {
			type: Number,
			default: 0,
		},
		totalRecipients: {
			type: Number,
			default: 0,
		},
		data: {
			type: mongoose.Schema.Types.Mixed,
			default: {},
		},
		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: false,
		},
		notes: {
			type: String,
			trim: true,
			maxlength: [500, "Notes cannot be more than 500 characters"],
		},
	},
	{
		timestamps: true,
	}
);

// Index for efficient queries
notificationCampaignSchema.index({ status: 1 });
notificationCampaignSchema.index({ createdBy: 1 });

module.exports = mongoose.model(
	"NotificationCampaign",
	notificationCampaignSchema
);
