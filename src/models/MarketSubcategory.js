const mongoose = require("mongoose");

const marketSubcategorySchema = new mongoose.Schema(
	{
		market: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Market",
			required: true,
			index: true,
		},
		category: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "MarketCategory",
			required: [true, "Please provide a parent category"],
		},
		name: {
			type: String,
			required: [true, "Please provide a subcategory name"],
			trim: true,
			maxlength: 100,
			minlength: 2,
		},
		description: { type: String, trim: true, maxlength: 500 },
		image: { type: String, trim: true },
		icon: { type: String, trim: true, maxlength: 50 },
		sortOrder: { type: Number, default: 0, min: 0 },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true },
);

marketSubcategorySchema.index({ market: 1, category: 1, name: 1 }, { unique: true });
marketSubcategorySchema.index({ market: 1, isActive: 1 });

module.exports = mongoose.model("MarketSubcategory", marketSubcategorySchema);
