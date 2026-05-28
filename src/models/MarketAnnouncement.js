const mongoose = require("mongoose");

const marketAnnouncementSchema = new mongoose.Schema(
	{
		market: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Market",
			required: true,
			index: true,
		},
		title: { type: String, required: true, trim: true, maxlength: 200 },
		message: { type: String, required: true, trim: true, maxlength: 2000 },
		audience: {
			type: String,
			enum: ["customers", "staff", "riders", "all"],
			default: "customers",
		},
		image: { type: String, trim: true },
		startsAt: { type: Date, default: Date.now },
		expiresAt: { type: Date },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true },
);

marketAnnouncementSchema.index({ market: 1, isActive: 1, startsAt: -1 });

module.exports = mongoose.model("MarketAnnouncement", marketAnnouncementSchema);
