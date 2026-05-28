const mongoose = require("mongoose");

// Tenant-scoped category for a single market admin.
// Fully isolated from the main-admin `Category` collection.
const marketCategorySchema = new mongoose.Schema(
	{
		market: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Market",
			required: true,
			index: true,
		},
		name: {
			type: String,
			required: [true, "Please provide a category name"],
			trim: true,
			maxlength: [100, "Category name cannot be more than 100 characters"],
			minlength: [2, "Category name must be at least 2 characters"],
		},
		description: {
			type: String,
			trim: true,
			maxlength: [500, "Description cannot be more than 500 characters"],
		},
		image: { type: String, trim: true },
		icon: { type: String, trim: true, maxlength: 50 },
		sortOrder: { type: Number, default: 0, min: 0 },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true },
);

// Name unique only within a single market
marketCategorySchema.index({ market: 1, name: 1 }, { unique: true });
marketCategorySchema.index({ market: 1, sortOrder: 1 });
marketCategorySchema.index({ market: 1, isActive: 1 });

module.exports = mongoose.model("MarketCategory", marketCategorySchema);
