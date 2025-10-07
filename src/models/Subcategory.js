const mongoose = require("mongoose");

const subcategorySchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, "Please provide a subcategory name"],
			trim: true,
			maxlength: [100, "Subcategory name cannot be more than 100 characters"],
		},
		parentCategory: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Category",
			required: [true, "Please provide a parent category"],
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		sortorder: {
			type: Number,
			default: 0,
		},
		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	{
		timestamps: true,
	}
);

subcategorySchema.index({ parentCategory: 1 });
subcategorySchema.index({ isActive: 1 });
subcategorySchema.index({ sortorder: 1 });

module.exports = mongoose.model("Subcategory", subcategorySchema);
