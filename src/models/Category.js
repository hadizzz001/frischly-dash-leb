const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, "Please provide a category name"],
			unique: true,
			trim: true,
			maxlength: [100, "Category name cannot be more than 100 characters"],
			minlength: [2, "Category name must be at least 2 characters"],
		},
		description: {
			type: String,
			trim: true,
			maxlength: [500, "Description cannot be more than 500 characters"],
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		image: {
			type: String,
			trim: true,
			validate: {
				validator: function (v) {
					if (!v) return true; // Optional field
					// Validate URL format for image URLs or local file paths
					return (
						/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?(\.(jpg|jpeg|png|gif|webp|bmp|svg))?$/i.test(
							v
						) ||
						/^\/images\/[\w\-_.]+\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(v)
					);
				},
				message: "Please provide a valid image URL or file path",
			},
		},
		icon: {
			type: String,
			trim: true,
			maxlength: [50, "Icon name cannot be more than 50 characters"],
		},
		sortOrder: {
			type: Number,
			default: 0,
			min: [0, "Sort order cannot be negative"],
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

// Indexes for better query performance
categorySchema.index({ name: 1 }, { unique: true });
categorySchema.index({ isActive: 1 });
categorySchema.index({ sortOrder: 1 });
categorySchema.index({ createdAt: -1 });

// Virtual for product count (will be populated when needed)
categorySchema.virtual("productCount", {
	ref: "Product",
	localField: "_id",
	foreignField: "category",
	count: true,
});

// Virtual for subcategories
categorySchema.virtual("subcategories", {
	ref: "Subcategory",
	localField: "_id",
	foreignField: "parentCategory",
	justOne: false,
});

// Static method to find active categories
categorySchema.statics.findActive = function () {
	return this.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
};

// Instance method to get category with product count
categorySchema.methods.withProductCount = function () {
	return this.populate("productCount");
};

// Pre-save middleware to handle name formatting
categorySchema.pre("save", function (next) {
	if (this.name) {
		// Capitalize first letter of each word
		this.name = this.name
			.toLowerCase()
			.split(" ")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	}
	next();
});

// Pre-remove middleware to check if category has products
categorySchema.pre("remove", async function (next) {
	const Product = mongoose.model("Product");
	const productCount = await Product.countDocuments({ category: this._id });

	if (productCount > 0) {
		const error = new Error(
			`Cannot delete category "${this.name}" because it has ${productCount} associated products`
		);
		error.statusCode = 400;
		return next(error);
	}

	next();
});

module.exports = mongoose.model("Category", categorySchema);
