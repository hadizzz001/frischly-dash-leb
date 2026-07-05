const mongoose = require("mongoose");

// Customer feedback submitted right after placing an order: a 0-5 star rating
// (default unfilled = 0) plus a free-text description for BOTH the order
// itself and the driver who will deliver it. One feedback document per order
// (enforced by the unique index below).
const feedbackSchema = new mongoose.Schema(
	{
		order: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Order",
			required: [true, "Order is required"],
			index: true,
		},
		customer: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: [true, "Customer is required"],
			index: true,
		},
		// Snapshot of the rider assigned to the order at the time feedback was
		// submitted (may be null if no rider had been assigned yet).
		assignedRider: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Rider",
			default: null,
		},
		orderRating: {
			type: Number,
			required: [true, "Order rating is required"],
			min: [0, "Order rating cannot be negative"],
			max: [5, "Order rating cannot be more than 5"],
			default: 0,
		},
		orderDescription: {
			type: String,
			trim: true,
			maxlength: [2000, "Order feedback cannot be more than 2000 characters"],
			default: "",
		},
		driverRating: {
			type: Number,
			min: [0, "Driver rating cannot be negative"],
			max: [5, "Driver rating cannot be more than 5"],
			default: 0,
		},
		driverDescription: {
			type: String,
			trim: true,
			maxlength: [2000, "Driver feedback cannot be more than 2000 characters"],
			default: "",
		},
	},
	{
		timestamps: true,
	}
);

// One feedback per order.
feedbackSchema.index({ order: 1 }, { unique: true });
feedbackSchema.index({ createdAt: -1 });
feedbackSchema.index({ customer: 1, createdAt: -1 });

// Aggregate stats for the admin dashboard's summary boxes.
feedbackSchema.statics.getStats = async function () {
	const [agg] = await this.aggregate([
		{
			$group: {
				_id: null,
				totalFeedback: { $sum: 1 },
				avgOrderRating: { $avg: "$orderRating" },
				avgDriverRating: {
					$avg: {
						$cond: [{ $gt: ["$driverRating", 0] }, "$driverRating", null],
					},
				},
				driverRatedCount: {
					$sum: { $cond: [{ $gt: ["$driverRating", 0] }, 1, 0] },
				},
			},
		},
	]);

	return {
		totalFeedback: agg?.totalFeedback || 0,
		avgOrderRating: agg?.avgOrderRating || 0,
		avgDriverRating: agg?.avgDriverRating || 0,
		driverRatedCount: agg?.driverRatedCount || 0,
	};
};

module.exports = mongoose.model("Feedback", feedbackSchema);
