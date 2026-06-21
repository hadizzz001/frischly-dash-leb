const mongoose = require("mongoose");

// Kitchen categories group kitchens together (e.g. "Bakery", "Grill",
// "Salads"). Each Kitchen may belong to one KitchenCategory.
//
// `market`:
//   - null/undefined => owned by the main store (visible to main admin)
//   - ObjectId       => owned by that Market (tenant scoped)
const kitchenCategorySchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, "Please provide a kitchen category name"],
			trim: true,
			maxlength: [120, "Name cannot be more than 120 characters"],
		},
		description: {
			type: String,
			default: "",
			trim: true,
			maxlength: [500, "Description cannot be more than 500 characters"],
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		picture: {
			type: String,
			default: "",
			trim: true,
		},
		picturePublicId: {
			type: String,
			default: "",
		},
		sortOrder: {
			type: Number,
			default: 0,
			index: true,
		},
		market: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Market",
			default: null,
			index: true,
		},
		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	{ timestamps: true },
);

kitchenCategorySchema.index({ market: 1, name: 1 });

module.exports = mongoose.model("KitchenCategory", kitchenCategorySchema);
