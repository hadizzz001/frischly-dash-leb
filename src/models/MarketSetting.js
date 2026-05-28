const mongoose = require("mongoose");

// Single document per market — store key/value config for the market admin app.
const marketSettingSchema = new mongoose.Schema(
	{
		market: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Market",
			required: true,
			unique: true,
			index: true,
		},
		businessHours: { type: String, trim: true, maxlength: 200 },
		deliveryFee: { type: Number, default: 0, min: 0 },
		minOrderAmount: { type: Number, default: 0, min: 0 },
		freeDeliveryThreshold: { type: Number, default: 0, min: 0 },
		taxRate: { type: Number, default: 0, min: 0 },
		currency: { type: String, default: "USD", trim: true, maxlength: 10 },
		acceptingOrders: { type: Boolean, default: true },
		notes: { type: String, trim: true, maxlength: 1000 },
		// Free-form extensibility
		extras: { type: mongoose.Schema.Types.Mixed, default: {} },
	},
	{ timestamps: true },
);

module.exports = mongoose.model("MarketSetting", marketSettingSchema);
