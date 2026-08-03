const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, "Please provide a product name"],
			trim: true,
			maxlength: [200, "Product name cannot be more than 200 characters"],
		},
		barcode: {
			type: String,
			required: [true, "Please provide a barcode"],
			trim: true,
			set: (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
			validate: {
				validator: function (v) {
					// Basic barcode validation - alphanumeric, 1-50 characters
					return /^[A-Za-z0-9]{1,50}$/.test(v);
				},
				message: "Barcode must be 1-50 alphanumeric characters",
			},
		},
		shelfNumber: {
			type: String,
			required: [true, "Please provide a shelf number"],
			trim: true,
			set: (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
			maxlength: [20, "Shelf number cannot be more than 20 characters"],
		},
		description: {
			type: String,
			trim: true,
			maxlength: [1000, "Description cannot be more than 1000 characters"],
		},
		picture: {
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
		imagePublicId: {
			type: String,
			trim: true,
		},
		category: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Category",
		},
		subcategory: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Subcategory",
			required: [true, "Please provide a subcategory"],
		},
		price: {
			type: Number,
			min: [0, "Price cannot be negative"],
			validate: {
				validator: function (v) {
					// Allow up to 2 decimal places
					return v === undefined || /^\d+(\.\d{1,2})?$/.test(v.toString());
				},
				message: "Price must have at most 2 decimal places",
			},
		},
		tax: {
			type: Number,
			default: 0,
			min: [0, "Tax cannot be negative"],
			max: [100, "Tax cannot exceed 100%"],
			validate: {
				validator: function (v) {
					// Allow up to 2 decimal places for tax percentage
					return v === undefined || /^\d+(\.\d{1,2})?$/.test(v.toString());
				},
				message: "Tax must have at most 2 decimal places",
			},
		},
		bottlerefund: {
			type: Number,
			default: 0,
			min: [0, "Bottle refund cannot be negative"],
			validate: {
				validator: function (v) {
					// Allow up to 2 decimal places for bottle refund amount
					return v === undefined || /^\d+(\.\d{1,2})?$/.test(v.toString());
				},
				message: "Bottle refund must have at most 2 decimal places",
			},
		},
		discount: {
			type: Number,
			default: 0,
			min: [0, "Discount cannot be negative"],
			max: [100, "Discount cannot exceed 100%"],
			validate: {
				validator: function (v) {
					// Allow up to 2 decimal places for discount percentage
					return v === undefined || /^\d+(\.\d{1,2})?$/.test(v.toString());
				},
				message: "Discount must have at most 2 decimal places",
			},
		},
		stock: {
			type: Number,
			default: 0,
			min: [0, "Stock cannot be negative"],
			validate: {
				validator: Number.isInteger,
				message: "Stock must be a whole number",
			},
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		inAds: {
			type: Boolean,
			default: false,
		},
		is18Plus: {
			type: Boolean,
			default: false,
		},
		sortOrder: {
			type: Number,
			default: 0,
			min: [0, "Sort order cannot be negative"],
		},
		tags: [
			{
				type: String,
				trim: true,
				maxlength: [50, "Tag cannot be more than 50 characters"],
			},
		],
		dimensions: {
			length: {
				type: Number,
				min: [0, "Length cannot be negative"],
			},
			width: {
				type: Number,
				min: [0, "Width cannot be negative"],
			},
			height: {
				type: Number,
				min: [0, "Height cannot be negative"],
			},
			unit: {
				type: String,
				enum: ["mm", "cm", "m", "in", "ft"],
				default: "cm",
			},
		},
		// Optional free-form weight label shown to customers, e.g. "500g", "1.5kg", "250 ml".
		// Applies to both Frischly (main store) and Market products.
		weight: {
			type: String,
			trim: true,
			maxlength: [30, "Weight cannot be more than 30 characters"],
		},
		supplier: {
			name: String,
			contact: String,
			email: String,
		},
		lastRestocked: {
			type: Date,
		},
		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
		// Optional reference to the Market that owns this product.
		// If null/undefined the product belongs to the main store.
		market: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Market",
			default: null,
			index: true,
		},
	},
	{
		timestamps: true,
	}
);

// Indexes for better query performance
productSchema.index({ market: 1, barcode: 1 }, { unique: true });
productSchema.index({ shelfNumber: 1 });
productSchema.index({ name: 1 });
productSchema.index({ subcategory: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ inAds: 1 });
productSchema.index({ is18Plus: 1 });
productSchema.index({ sortOrder: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ tax: 1 });
productSchema.index({ discount: 1 });
productSchema.index({ bottlerefund: 1 });

// Virtual for formatted price
productSchema.virtual("formattedPrice").get(function () {
	if (this.price === undefined) return "N/A";
	return `$${this.price.toFixed(2)}`;
});

// Virtual for price after discount
productSchema.virtual("discountedPrice").get(function () {
	if (this.price === undefined) return 0;
	const discountAmount = (this.price * (this.discount || 0)) / 100;
	return this.price - discountAmount;
});

// Virtual for final price after discount, tax, and bottle refund
productSchema.virtual("finalPrice").get(function () {
	const discountedPrice = this.discountedPrice;
	const taxAmount = (discountedPrice * (this.tax || 0)) / 100;
	const bottleRefundAmount = this.bottlerefund || 0;
	return discountedPrice + taxAmount + bottleRefundAmount;
});

// Virtual for formatted final price
productSchema.virtual("formattedFinalPrice").get(function () {
	return `$${this.finalPrice.toFixed(2)}`;
});

// Virtual for stock status
productSchema.virtual("stockStatus").get(function () {
	if (this.stock === 0) return "Out of Stock";
	if (this.stock <= 10) return "Low Stock";
	return "In Stock";
});

// Virtual for parent category through subcategory
// Note: This requires the subcategory to be populated first to access parentCategory
productSchema.virtual("parentCategory").get(function () {
	return this.subcategory && this.subcategory.parentCategory
		? this.subcategory.parentCategory
		: null;
});

// Static method to find by barcode
productSchema.statics.findByBarcode = function (barcode) {
	return this.findOne({ barcode, isActive: true });
};

// Static method to find by shelf number
productSchema.statics.findByShelfNumber = function (shelfNumber) {
	return this.find({ shelfNumber, isActive: true });
};

// Instance method to update stock
productSchema.methods.updateStock = function (quantity, operation = "set") {
	if (operation === "add") {
		this.stock += quantity;
	} else if (operation === "subtract") {
		this.stock = Math.max(0, this.stock - quantity);
	} else {
		this.stock = Math.max(0, quantity);
	}
	// Validate ONLY the fields we actually touched. A plain save() re-validates
	// the whole document, so a single legacy field left over from an older
	// schema (e.g. weight stored as { unit: "g" } when it is now a String) made
	// every stock movement throw — which is what blocked recording waste.
	return this.save({ validateModifiedOnly: true });
};

// Pre-save middleware to format barcode and shelf number
productSchema.pre("save", function (next) {
	if (this.barcode) {
		this.barcode = this.barcode.toUpperCase();
	}
	if (this.shelfNumber) {
		this.shelfNumber = this.shelfNumber.toUpperCase();
	}
	next();
});

// Schema options to include virtuals in JSON output
productSchema.set("toJSON", { virtuals: false });
productSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("Product", productSchema);
