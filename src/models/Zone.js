const mongoose = require("mongoose");

const zoneSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, "Zone name is required"],
			trim: true,
			maxlength: [100, "Zone name cannot be more than 100 characters"],
			unique: true,
		},
		maxDistance: {
			type: Number,
			required: [true, "Maximum delivery distance is required"],
			min: [0, "Maximum distance cannot be negative"],
			default: 10, // Default max distance in kilometers or miles
		},
		zipCodes: {
			type: [String],
			validate: {
				validator: function (zipCodes) {
					// Optional, but if provided, must be valid zip codes
					if (zipCodes.length === 0) return true;

					// Basic zip code validation - can be customized based on your country format
					const zipRegex = /^[0-9]{5}(-[0-9]{4})?$/;
					return zipCodes.every((zip) => zipRegex.test(zip));
				},
				message: (props) => `${props.value} contains invalid zip code(s)`,
			},
			default: [],
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		description: {
			type: String,
			trim: true,
			maxlength: [500, "Description cannot be more than 500 characters"],
		},
		deliveryFee: {
			type: Number,
			min: [0, "Delivery fee cannot be negative"],
			default: 0,
		},
		minDeliveryTime: {
			type: Number, // In minutes
			min: [0, "Minimum delivery time cannot be negative"],
			default: 30,
		},
		maxDeliveryTime: {
			type: Number, // In minutes
			min: [0, "Maximum delivery time cannot be negative"],
			default: 60,
		},
	},
	{
		timestamps: true,
	}
);

// Index for efficient queries
zoneSchema.index({ name: 1 });
zoneSchema.index({ zipCodes: 1 });
zoneSchema.index({ isActive: 1 });

// Static method to find active zones
zoneSchema.statics.findActiveZones = function () {
	return this.find({ isActive: true }).sort({ name: 1 });
};

// Static method to find zone by zip code
zoneSchema.statics.findByZipCode = function (zipCode) {
	return this.findOne({
		zipCodes: zipCode,
		isActive: true,
	});
};

module.exports = mongoose.model("Zone", zoneSchema);
