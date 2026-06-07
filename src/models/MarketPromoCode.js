const mongoose = require("mongoose");

const marketPromoCodeSchema = new mongoose.Schema(
	{
		market: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Market",
			required: true,
			index: true,
		},
		companyName: { type: String, trim: true },
		code: { type: String, required: true, trim: true, uppercase: true },
		description: { type: String, trim: true, maxlength: 500 },
		// true = the market's own promo code, false = a one-time/partner code.
		// The dashboard splits promos into two tabs based on this flag, so it
		// must be stored explicitly (defaulting to own-company).
		isFromOwnCompany: { type: Boolean, default: true },
		triggerCondition: {
			minOrderTotal: { type: Number, default: null },
		},
		emailSubject: { type: String, default: null },
		emailMessage: { type: String, default: null },
		discountType: {
			type: String,
			enum: ["percentage", "cash"],
			default: "percentage",
		},
		discountValue: { type: Number, required: true, min: 0 },
		minOrderTotal: { type: Number, default: 0, min: 0 },
		usageLimit: { type: Number, default: 0, min: 0 }, // 0 = unlimited
		usageCount: { type: Number, default: 0, min: 0 },
		startsAt: { type: Date },
		expiresAt: { type: Date },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true },
);

// Code unique within a single market
marketPromoCodeSchema.index({ market: 1, code: 1 }, { unique: true });
marketPromoCodeSchema.index({ market: 1, isActive: 1 });

module.exports = mongoose.model("MarketPromoCode", marketPromoCodeSchema);
