const mongoose = require("mongoose");

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
			sparse: true, // Allow null values but ensure uniqueness for non-null values
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

// Generate slug from name
subcategorySchema.pre("save", async function (next) {
	if (this.isModified("name") || this.isNew || !this.slug) {
		let baseSlug = this.name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9\s-]/g, "") // Remove special characters
			.replace(/\s+/g, "-") // Replace spaces with hyphens
			.replace(/-+/g, "-") // Replace multiple hyphens with single
			.replace(/^-|-$/g, ""); // Remove leading/trailing hyphens

		if (!baseSlug) {
			baseSlug = "subcategory";
		}

		let slug = baseSlug;
		let counter = 1;

		// Ensure slug is unique
		while (
			await mongoose.models.Subcategory.findOne({
				slug,
				_id: { $ne: this._id },
			})
		) {
			slug = `${baseSlug}-${counter}`;
			counter++;
		}

		this.slug = slug;
	}
	next();
});

subcategorySchema.index({ parentCategory: 1 });
subcategorySchema.index({ isActive: 1 });
subcategorySchema.index({ sortorder: 1 });

module.exports = mongoose.model("Subcategory", subcategorySchema);
