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
