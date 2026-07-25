const mongoose = require("mongoose");

const SettingSchema = new mongoose.Schema(
	{
		isMaintenanceMode: {
			type: Boolean,
			default: false,
		},
		areOrdersDisabled: {
			type: Boolean,
			default: false,
		},
		maintenanceMessage: {
			type: String,
			default:
				"We are currently undergoing maintenance. Please check back later.",
		},
		minimumOrderValue: {
			type: Number,
			default: 10,
		},
		// Delivery/coverage zones for the main (Freshly) admin store — the global
		// equivalent of a market's `deliveryZones` and a driver's `zones`. Each
		// name refers to a global Zone document (market: null) configured on the
		// Zones management page.
		deliveryZones: {
			type: [String],
			default: [],
		},
		// Multi-pin delivery coverage for the main (Freshly) admin store — same
		// concept as a market's `deliveryRegions`: each entry is an independent
		// map pin + radius circle, configured on the admin's Profile page. When
		// this is non-empty, a shopper's exact map pin must fall inside at least
		// one circle to see main-store items/categories/search results; when
		// empty the (legacy) city-based rule above still applies.
		deliveryRegions: {
			type: [
				{
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
					radiusKm: {
						type: Number,
						min: [0.1, "Radius must be at least 0.1 km"],
						max: [1000, "Radius cannot exceed 1000 km"],
					},
				},
			],
			default: [],
		},
	},
	{ timestamps: true }
);

// Ensure only one document exists
SettingSchema.statics.getSettings = async function () {
	const setting = await this.findOne();
	if (setting) {
		return setting;
	}
	return await this.create({});
};

module.exports = mongoose.model("Setting", SettingSchema);
