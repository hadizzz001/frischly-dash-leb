const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
	{
		title: {
			type: String,
			required: [true, "Please provide a title"],
			trim: true,
		},
		description: {
			type: String,
			required: [true, "Please provide a description"],
			trim: true,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	{ timestamps: true },
);

module.exports = mongoose.model("Announcement", announcementSchema);
