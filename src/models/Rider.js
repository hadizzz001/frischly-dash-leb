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
		zones: [
			{
				type: String,
				required: [true, "At least one zone is required"],
				trim: true,
				maxlength: [100, "Zone cannot be more than 100 characters"],
				validate: {
					validator: function (v) {
						return v && v.length > 0;
					},
					message: "Zone name cannot be empty",
				},
			},
		],
		// Keep zone field for backward compatibility (deprecated)
		// zone: {
		// 	type: String,
		// 	trim: true,
		// 	maxlength: [100, "Zone cannot be more than 100 characters"],
		// },
		status: {
			type: String,
			enum: {
				values: ["available", "busy", "offline", "on-break"],
				message: "Status must be one of: available, busy, offline, on-break",
			},
			default: "available",
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
			default: true,
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
	match: { status: { $in: ["confirmed", "processing", "OnTheWay"] } },
});

// Index for efficient queries
riderSchema.index({ zones: 1, status: 1 });
riderSchema.index({ zones: 1 });
riderSchema.index({ user: 1 });
riderSchema.index({ isActive: 1, status: 1 });

// Custom validation to ensure zones array is not empty
riderSchema.path("zones").validate(function (value) {
	return value && value.length > 0;
}, "At least one zone must be specified");

// Pre-save middleware to update lastActiveAt when status changes to available or busy
riderSchema.pre("save", function (next) {
	// Migrate old zone field to zones array if needed
	if (this.zone && (!this.zones || this.zones.length === 0)) {
		this.zones = [this.zone];
		console.log(
			`Auto-migrating rider ${this._id}: zone "${
				this.zone
			}" -> zones [${this.zones.join(", ")}]`
		);
	}

	// Ensure zones array is not empty - if no zones and no zone, set a default
	if (!this.zones || this.zones.length === 0) {
		if (this.zone) {
			this.zones = [this.zone];
		} else {
			// Set a default zone if none exists (this shouldn't happen in normal operation)
			this.zones = ["Default"];
			console.warn(
				`Warning: Rider ${this._id} had no zones, setting default zone`
			);
		}
	}

	// Update the deprecated zone field for backward compatibility
	if (this.zones && this.zones.length > 0 && !this.zone) {
		this.zone = this.zones[0];
	}

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
		zones: this.zones, // Return array of zones
		zone: this.zones && this.zones.length > 0 ? this.zones[0] : this.zone, // Backward compatibility
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
		zones: zone, // Check if zone is in the zones array
		status: "available",
		isActive: true,
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
							status: { $in: ["confirmed", "processing", "OnTheWay"] },
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
				zones: {
					$cond: {
						if: { $ifNull: ["$zones", false] },
						then: "$zones",
						else: { $cond: { if: "$zone", then: ["$zone"], else: [] } },
					},
				},
				zone: {
					$cond: {
						if: { $ifNull: ["$zones", false] },
						then: { $arrayElemAt: ["$zones", 0] },
						else: "$zone",
					},
				},
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
				currentLocation: 1,
				createdAt: 1,
				"userInfo.name": 1,
				"userInfo.email": 1,
				"userInfo.phoneNumber": 1,
			},
		},
		{ $sort: { createdAt: -1 } },
	]);
};

// Static method to migrate old zone field to zones array
riderSchema.statics.migrateZones = async function () {
	try {
		const riders = await this.find({
			zone: { $exists: true, $ne: null },
			$or: [{ zones: { $exists: false } }, { zones: { $size: 0 } }],
		});

		console.log(`Found ${riders.length} riders to migrate`);

		for (const rider of riders) {
			rider.zones = [rider.zone];
			await rider.save();
			console.log(
				`Migrated rider ${rider._id}: ${rider.zone} -> [${rider.zones.join(
					", "
				)}]`
			);
		}

		console.log("Migration completed successfully");
		return { migrated: riders.length };
	} catch (error) {
		console.error("Migration failed:", error);
		throw error;
	}
};

module.exports = mongoose.model("Rider", riderSchema);
