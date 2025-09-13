const mongoose = require("mongoose");

const riderSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: [true, "User reference is required"],
			unique: true,
		},
		// Rider specific details
		zone: {
			type: String,
			required: [true, "Zone is required"],
			trim: true,
			maxlength: [100, "Zone cannot be more than 100 characters"],
		},
		status: {
			type: String,
			enum: {
				values: ["available", "busy", "offline", "on-break"],
				message: "Status must be one of: available, busy, offline, on-break",
			},
			default: "offline",
			index: true,
		},
		vehicleType: {
			type: String,
			enum: ["bike", "motorbike", "car", "bicycle"],
			required: [true, "Vehicle type is required"],
		},
		vehicleNumber: {
			type: String,
			trim: true,
			maxlength: [20, "Vehicle number cannot be more than 20 characters"],
		},
		// Performance metrics
		ordersPickedCount: {
			type: Number,
			default: 0,
			min: [0, "Orders picked count cannot be negative"],
		},
		ordersDeliveredCount: {
			type: Number,
			default: 0,
			min: [0, "Orders delivered count cannot be negative"],
		},
		totalEarnings: {
			type: Number,
			default: 0,
			min: [0, "Total earnings cannot be negative"],
		},
		// Current location (optional for tracking)
		currentLocation: {
			latitude: {
				type: Number,
				min: [-90, "Latitude must be between -90 and 90"],
				max: [90, "Latitude must be between -90 and 90"],
			},
			longitude: {
				type: Number,
				min: [-180, "Longitude must be between -180 and 180"],
				max: [180, "Longitude must be between -180 and 180"],
			},
			lastUpdated: {
				type: Date,
				default: Date.now,
			},
		},
		// Working hours
		workingHours: {
			start: {
				type: String,
				match: [
					/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
					"Start time must be in HH:mm format",
				],
			},
			end: {
				type: String,
				match: [
					/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
					"End time must be in HH:mm format",
				],
			},
		},
		// Rating system
		rating: {
			average: {
				type: Number,
				default: 0,
				min: [0, "Rating cannot be negative"],
				max: [5, "Rating cannot be more than 5"],
			},
			totalRatings: {
				type: Number,
				default: 0,
				min: [0, "Total ratings cannot be negative"],
			},
		},
		// Additional info
		isVerified: {
			type: Boolean,
			default: false,
		},
		verificationDocuments: {
			license: {
				type: String,
				trim: true,
			},
			insurance: {
				type: String,
				trim: true,
			},
			identity: {
				type: String,
				trim: true,
			},
		},
		lastActiveAt: {
			type: Date,
			default: Date.now,
		},
		isActive: {
			type: Boolean,
			default: true,
			index: true,
		},
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

// Virtual to populate user details
riderSchema.virtual("userDetails", {
	ref: "User",
	localField: "user",
	foreignField: "_id",
	justOne: true,
});

// Virtual to get current orders assigned to rider
riderSchema.virtual("currentOrders", {
	ref: "Order",
	localField: "_id",
	foreignField: "assignedRider",
	match: { status: { $in: ["confirmed", "processing", "shipped"] } },
});

// Index for efficient queries
riderSchema.index({ zone: 1, status: 1 });
riderSchema.index({ user: 1 });
riderSchema.index({ isActive: 1, status: 1 });

// Pre-save middleware to update lastActiveAt when status changes to available or busy
riderSchema.pre("save", function (next) {
	if (
		this.isModified("status") &&
		(this.status === "available" || this.status === "busy")
	) {
		this.lastActiveAt = new Date();
	}
	next();
});

// Instance method to calculate completion rate
riderSchema.methods.getCompletionRate = function () {
	if (this.ordersPickedCount === 0) return 0;
	return ((this.ordersDeliveredCount / this.ordersPickedCount) * 100).toFixed(
		2
	);
};

// Instance method to get rider summary
riderSchema.methods.getSummary = function () {
	return {
		riderId: this._id,
		zone: this.zone,
		status: this.status,
		ordersPickedCount: this.ordersPickedCount,
		ordersDeliveredCount: this.ordersDeliveredCount,
		completionRate: this.getCompletionRate(),
		rating: this.rating.average,
		totalEarnings: this.totalEarnings,
		vehicleType: this.vehicleType,
		isVerified: this.isVerified,
	};
};

// Static method to find available riders in a zone
riderSchema.statics.findAvailableInZone = function (zone) {
	return this.find({
		zone: zone,
		status: "available",
		isActive: true,
		isVerified: true,
	}).populate("user", "name email phoneNumber");
};

// Static method to get riders with performance stats
riderSchema.statics.getRidersWithStats = function (filter = {}) {
	return this.aggregate([
		{ $match: { isActive: true, ...filter } },
		{
			$lookup: {
				from: "users",
				localField: "user",
				foreignField: "_id",
				as: "userInfo",
			},
		},
		{ $unwind: "$userInfo" },
		{
			$lookup: {
				from: "orders",
				let: { riderId: "$_id" },
				pipeline: [
					{
						$match: {
							$expr: { $eq: ["$assignedRider", "$$riderId"] },
							status: { $in: ["confirmed", "processing", "shipped"] },
						},
					},
				],
				as: "activeOrders",
			},
		},
		{
			$addFields: {
				activeOrdersCount: { $size: "$activeOrders" },
				completionRate: {
					$cond: {
						if: { $eq: ["$ordersPickedCount", 0] },
						then: 0,
						else: {
							$multiply: [
								{ $divide: ["$ordersDeliveredCount", "$ordersPickedCount"] },
								100,
							],
						},
					},
				},
			},
		},
		{
			$project: {
				zone: 1,
				status: 1,
				vehicleType: 1,
				vehicleNumber: 1,
				ordersPickedCount: 1,
				ordersDeliveredCount: 1,
				activeOrdersCount: 1,
				completionRate: 1,
				totalEarnings: 1,
				rating: 1,
				isVerified: 1,
				lastActiveAt: 1,
				createdAt: 1,
				"userInfo.name": 1,
				"userInfo.email": 1,
				"userInfo.phoneNumber": 1,
			},
		},
		{ $sort: { createdAt: -1 } },
	]);
};

module.exports = mongoose.model("Rider", riderSchema);
