const mongoose = require("mongoose");

const wasteSchema = new mongoose.Schema(
	{
		barcode: {
			type: String,
			required: [true, "Please provide a product barcode"],
			trim: true,
			maxlength: [50, "Barcode cannot be more than 50 characters"],
		},
		productName: {
			type: String,
			trim: true,
			maxlength: [200, "Product name cannot be more than 200 characters"],
		},
		productId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Product",
		},
		quantity: {
			type: Number,
			required: [true, "Please provide a quantity"],
			min: [0.01, "Quantity must be greater than 0"],
		},
		reason: {
			type: String,
			required: [true, "Please provide a reason for waste"],
			enum: [
				"Expired",
				"Damaged",
				"Quality Issues",
				"Overproduction",
				"Spoiled",
				"Recall",
				"Other",
			],
		},
		notes: {
			type: String,
			trim: true,
			maxlength: [1000, "Notes cannot be more than 1000 characters"],
		},
		recordedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: [true, "Please provide the user who recorded this waste"],
		},
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	{
		timestamps: true,
	}
);

// Indexes for better query performance
wasteSchema.index({ barcode: 1 });
wasteSchema.index({ productName: 1 });
wasteSchema.index({ productId: 1 });
wasteSchema.index({ reason: 1 });
wasteSchema.index({ recordedBy: 1 });
wasteSchema.index({ createdAt: -1 });
wasteSchema.index({ isActive: 1 });

// Static method to get waste reports by date range
wasteSchema.statics.getWasteByDateRange = function (startDate, endDate) {
	return this.find({
		createdAt: {
			$gte: new Date(startDate),
			$lte: new Date(endDate),
		},
		isActive: true,
	}).populate("recordedBy", "name email");
};

// Static method to get waste reports by reason
wasteSchema.statics.getWasteByReason = function (reason) {
	return this.find({
		reason,
		isActive: true,
	}).populate("recordedBy", "name email");
};

// Static method to get waste summary
wasteSchema.statics.getWasteSummary = async function () {
	return this.aggregate([
		{ $match: { isActive: true } },
		{
			$group: {
				_id: "$reason",
				totalQuantity: { $sum: "$quantity" },
				count: { $sum: 1 },
			},
		},
		{ $sort: { totalQuantity: -1 } },
	]);
};

module.exports = mongoose.model("Waste", wasteSchema);
