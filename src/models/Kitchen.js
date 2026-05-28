const mongoose = require("mongoose");

// "For Kitchens" entries. Each kitchen has a name and a list of products that
// the kitchen needs. Selecting products here does NOT touch product stock.
//
// `market`:
//   - null/undefined => owned by the main store (visible to main admin)
//   - ObjectId       => owned by that Market (tenant scoped)
const kitchenSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, "Please provide a kitchen name"],
			trim: true,
			maxlength: [120, "Name cannot be more than 120 characters"],
		},
		items: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "Product",
			},
		],
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

kitchenSchema.index({ market: 1, name: 1 });

module.exports = mongoose.model("Kitchen", kitchenSchema);
