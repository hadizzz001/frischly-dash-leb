const mongoose = require("mongoose");

const marketPromoCodeSchema = new mongoose.Schema(
	{
		market: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Market",
			required: true,
			index: true,
		},
		code: { type: String, required: true, trim: true, uppercase: true },
		description: { type: String, trim: true, maxlength: 500 },
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
