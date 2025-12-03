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
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	{ timestamps: true }
);

module.exports = mongoose.model("PromoCode", promoCodeSchema);
