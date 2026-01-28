const mongoose = require("mongoose");

const promoCodeSchema = new mongoose.Schema(
	{
		companyName: {
			type: String,
			required: [true, "Please provide a company name"],
			trim: true,
		},
		code: {
			type: String,
			required: [true, "Please provide a promo code"],
			unique: true,
			trim: true,
			uppercase: true,
		},
		description: {
			type: String,
			trim: true,
		},
		discountType: {
			type: String,
			required: [true, "Please specify discount type"],
			enum: ["percentage", "cash"],
			default: "percentage",
		},
		discountValue: {
			type: Number,
			required: [true, "Please provide discount value"],
			min: [0, "Discount value cannot be negative"],
		},
		isFromOwnCompany: {
			type: Boolean,
			default: true,
		},
		triggerCondition: {
			minOrderTotal: {
				type: Number,
				min: [0, "Minimum order total cannot be negative"],
				default: null, // Only applicable for other companies' promo codes
			},
		},
		emailSubject: {
			type: String,
			trim: true,
			default: null, // Only applicable for other companies' promo codes
		},
		emailMessage: {
			type: String,
			trim: true,
			default: null, // Only applicable for other companies' promo codes
		},
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	{ timestamps: true },
);

module.exports = mongoose.model("PromoCode", promoCodeSchema);
