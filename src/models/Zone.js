const mongoose = require("mongoose");

const zoneSchema = new mongoose.Schema(
	{
		zoneName: {
			type: String,
			required: [true, "Zone name is required"],
			trim: true,
			maxlength: [100, "Zone name cannot exceed 100 characters"],
			unique: true,
		},
		zipCode: {
			type: String,
			required: [true, "Zip code is required"],
			trim: true,
			maxlength: [20, "Zip code cannot exceed 20 characters"],
			validate: {
				validator: function (v) {
					// Basic zip code validation (supports US and international formats)
					return /^[0-9A-Za-z\s\-]{3,20}$/.test(v);
				},
				message: "Please provide a valid zip code",
			},
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
		deliveryFee: {
			type: Number,
			min: [0, "Delivery fee cannot be negative"],
			default: 0,
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
			required: true,
		},
		updatedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

// Index for better query performance
zoneSchema.index({ zoneName: 1 });
zoneSchema.index({ zipCode: 1 });
zoneSchema.index({ isActive: 1 });
zoneSchema.index({ priority: -1 });

// Virtual for formatted distance
zoneSchema.virtual("formattedDistance").get(function () {
	return `${this.distance} ${this.distanceUnit}`;
});

// Virtual for delivery info
zoneSchema.virtual("deliveryInfo").get(function () {
	return {
		fee: this.deliveryFee,
		estimatedTime: this.estimatedDeliveryTime,
		formattedTime: `${this.estimatedDeliveryTime} minutes`,
	};
});

// Static method to find zones by zip code
zoneSchema.statics.findByZipCode = function (zipCode) {
	return this.findOne({ zipCode: zipCode, isActive: true });
};

// Static method to find active zones
zoneSchema.statics.findActiveZones = function () {
	return this.find({ isActive: true }).sort({ priority: -1, zoneName: 1 });
};

// Instance method to calculate delivery fee based on distance
zoneSchema.methods.calculateDeliveryFee = function (baseRate = 2) {
	if (this.deliveryFee > 0) {
		return this.deliveryFee;
	}
	// Calculate based on distance if no fixed fee is set
	return Math.max(baseRate, this.distance * 0.5);
};

// Pre-save middleware to ensure zip code is uppercase
zoneSchema.pre("save", function (next) {
	if (this.zipCode) {
		this.zipCode = this.zipCode.toUpperCase();
	}
	next();
});

// Pre-save middleware to set updatedBy field
zoneSchema.pre("save", function (next) {
	if (this.isModified() && !this.isNew) {
		this.updatedBy = this.createdBy; // In a real app, this would be the current user
	}
	next();
});

module.exports = mongoose.model("Zone", zoneSchema);
