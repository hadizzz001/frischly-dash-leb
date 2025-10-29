const mongoose = require("mongoose");

const shelfSchema = new mongoose.Schema(
	{
		shelfNumber: {
			type: String,
			required: [true, "Please provide a shelf number"],
			unique: true,
			trim: true,
			uppercase: true,
			maxlength: [50, "Shelf number cannot be more than 50 characters"],
			minlength: [1, "Shelf number must be at least 1 character"],
		},
		barcode: {
			type: String,
			trim: true,
			unique: true,
			sparse: true,
			maxlength: [100, "Barcode cannot be more than 100 characters"],
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
		// Reference to products stored on this shelf
		products: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "Product",
			},
		],
		// Reference to orders assigned to this shelf
		orders: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "Order",
			},
		],
		location: {
			type: String,
			trim: true,
			maxlength: [200, "Location cannot be more than 200 characters"],
		},
		capacity: {
			type: Number,
			default: 0,
			min: [0, "Capacity cannot be negative"],
		},
		currentLoad: {
			type: Number,
			default: 0,
			min: [0, "Current load cannot be negative"],
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
shelfSchema.index({ shelfNumber: 1 }, { unique: true });
shelfSchema.index({ isActive: 1 });
shelfSchema.index({ createdAt: -1 });

// Virtual for available capacity
shelfSchema.virtual("availableCapacity").get(function () {
	return this.capacity - this.currentLoad;
});

// Virtual for utilization percentage
shelfSchema.virtual("utilizationPercentage").get(function () {
	if (this.capacity === 0) return 0;
	return Math.round((this.currentLoad / this.capacity) * 100);
});

// Static method to find active shelves
shelfSchema.statics.findActive = function () {
	return this.find({ isActive: true }).sort({ shelfNumber: 1 });
};

// Static method to find available shelves (with capacity)
shelfSchema.statics.findAvailable = function () {
	return this.find({
		isActive: true,
		$expr: { $lt: ["$currentLoad", "$capacity"] },
	}).sort({ shelfNumber: 1 });
};

// Instance method to check if shelf has space
shelfSchema.methods.hasSpace = function (requiredSpace = 1) {
	if (this.capacity === 0) return true; // Unlimited capacity
	return this.currentLoad + requiredSpace <= this.capacity;
};

// Instance method to add product to shelf
shelfSchema.methods.addProduct = async function (productId) {
	if (!this.products.includes(productId)) {
		this.products.push(productId);
		this.currentLoad += 1;
		await this.save();
	}
	return this;
};

// Instance method to remove product from shelf
shelfSchema.methods.removeProduct = async function (productId) {
	const index = this.products.indexOf(productId);
	if (index > -1) {
		this.products.splice(index, 1);
		this.currentLoad = Math.max(0, this.currentLoad - 1);
		await this.save();
	}
	return this;
};

// Instance method to add order to shelf
shelfSchema.methods.addOrder = async function (orderId) {
	if (!this.orders.includes(orderId)) {
		this.orders.push(orderId);
		this.currentLoad += 1;
		await this.save();
	}
	return this;
};

// Instance method to remove order from shelf
shelfSchema.methods.removeOrder = async function (orderId) {
	const index = this.orders.indexOf(orderId);
	if (index > -1) {
		this.orders.splice(index, 1);
		this.currentLoad = Math.max(0, this.currentLoad - 1);
		await this.save();
	}
	return this;
};

// Pre-save middleware to validate current load
shelfSchema.pre("save", function (next) {
	// Auto-uppercase shelf number
	if (this.shelfNumber) {
		this.shelfNumber = this.shelfNumber.toUpperCase().trim();
	}

	// Validate that current load doesn't exceed capacity (if capacity is set)
	if (this.capacity > 0 && this.currentLoad > this.capacity) {
		const error = new Error(
			`Current load (${this.currentLoad}) exceeds shelf capacity (${this.capacity})`
		);
		error.statusCode = 400;
		return next(error);
	}

	next();
});

// Pre-remove middleware to handle cleanup
shelfSchema.pre("remove", async function (next) {
	// You might want to handle what happens to products/orders when shelf is removed
	// For now, we'll just warn if there are items on the shelf
	if (this.products.length > 0 || this.orders.length > 0) {
		const error = new Error(
			`Cannot delete shelf "${this.shelfNumber}" because it has ${this.products.length} products and ${this.orders.length} orders`
		);
		error.statusCode = 400;
		return next(error);
	}

	next();
});

// Configure toJSON to include virtuals
shelfSchema.set("toJSON", { virtuals: true });
shelfSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Shelf", shelfSchema);
