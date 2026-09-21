const mongoose = require("mongoose");
const { escapeRegex } = require("../utils/sanitize");

const zoneSchema = new mongoose.Schema(
	{
		zoneName: {
			type: String,
			required: [true, "Zone name is required"],
			trim: true,
			maxlength: [100, "Zone name cannot exceed 100 characters"],
		},
		distance: {
			type: Number,
			required: [true, "Distance is required"],
			min: [0, "Distance cannot be negative"],
			max: [1000, "Distance cannot exceed 1000 units"],
		},
		distanceUnit: {
			type: String,
			enum: ["km", "miles"],
			default: "km",
		},
		description: {
			type: String,
			trim: true,
			maxlength: [500, "Description cannot exceed 500 characters"],
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		estimatedDeliveryTime: {
			type: Number, // in minutes
			min: [1, "Estimated delivery time must be at least 1 minute"],
			max: [1440, "Estimated delivery time cannot exceed 24 hours"],
			default: 30,
		},
		priority: {
			type: Number,
			min: [1, "Priority must be at least 1"],
			max: [100, "Priority cannot exceed 100"],
			default: 1,
		},
		coordinates: {
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
		},
		boundaries: {
			type: [
				{
					latitude: Number,
					longitude: Number,
				},
			],
			default: [],
		},
		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: false,
		},
		updatedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
		// Optional tenant link. When null, the zone is global (admin-owned).
		// When set, it belongs to a specific market and is only visible to that market.
		market: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Market",
			default: null,
			index: true,
		},
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

// Index for better query performance
zoneSchema.index({ market: 1, zoneName: 1 }, { unique: true });
zoneSchema.index({ isActive: 1 });
zoneSchema.index({ priority: -1 });

// Virtual for formatted distance
zoneSchema.virtual("formattedDistance").get(function () {
	return `${this.distance} ${this.distanceUnit}`;
});

// Static method to find active zones by name
zoneSchema.statics.findByName = function (zoneName) {
	return this.findOne({
		zoneName: { $regex: `^${escapeRegex(zoneName)}$`, $options: "i" },
		isActive: true,
	});
};

// Static method to find active zones
zoneSchema.statics.findActiveZones = function () {
	return this.find({ isActive: true }).sort({ priority: -1, zoneName: 1 });
};

// Pre-save middleware to set updatedBy field
zoneSchema.pre("save", function (next) {
	if (this.isModified() && !this.isNew) {
		this.updatedBy = this.createdBy; // In a real app, this would be the current user
	}
	next();
});

module.exports = mongoose.model("Zone", zoneSchema);
