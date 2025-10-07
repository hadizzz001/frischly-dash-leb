const mongoose = require("mongoose");
const slugify = require("slugify");

const subcategorySchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, "Please provide a subcategory name"],
			trim: true,
			maxlength: [100, "Subcategory name cannot be more than 100 characters"],
		},
		slug: {
			type: String,
			unique: true,
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
		sortnumber: {
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

subcategorySchema.index({ slug: 1 }, { unique: true });
subcategorySchema.index({ parentCategory: 1 });
subcategorySchema.index({ isActive: 1 });
subcategorySchema.index({ sortnumber: 1 });

subcategorySchema.pre("save", function (next) {
	if (this.name && !this.slug) {
		this.slug = slugify(this.name, { lower: true, strict: true });
	}
	next();
});

module.exports = mongoose.model("Subcategory", subcategorySchema);
