const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
	product: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Product",
		required: [true, "Product is required"],
	},

	quantity: {
		type: Number,
		required: [true, "Quantity is required"],
		min: [1, "Quantity must be at least 1"],
	},

	totalPrice: {
		type: Number,
		required: [true, "Total price is required"],
		min: [0, "Total price cannot be negative"],
	},
});

const orderSchema = new mongoose.Schema(
	{
		orderNumber: {
			type: String,
			unique: true,
			index: true,
		},
		customer: {
			name: {
				type: String,
				required: [true, "Customer name is required"],
				trim: true,
			},
			email: {
				type: String,
				trim: true,
				lowercase: true,
				match: [
					/^[^\s@]+@[^\s@]+\.[^\s@]+$/,
					"Please provide a valid email address",
				],
			},
			phoneNumber: {
				type: String,
				trim: true,
			},
			address: {
				street: String,
				city: String,
				state: String,
				zipCode: String,
				country: String,
			},
		},
		items: {
			type: [orderItemSchema],
			required: [true, "Order must have at least one item"],
			validate: {
				validator: function (items) {
					return items && items.length > 0;
				},
				message: "Order must contain at least one item",
			},
		},
		subtotal: {
			type: Number,
			default: 0,
			min: [0, "Subtotal cannot be negative"],
		},

		delivery: {
			type: Number,
			default: 0,
			min: [0, "delivery cannot be negative"],
		},

		fees: {
			type: Number,
			default: 0,
			min: [0, "Fees cannot be negative"],
		},

		total: {
			type: Number,
			default: 0,
			min: [0, "Total cannot be negative"],
		},
		status: {
			type: String,
			enum: {
				values: [
					"pending",
					"confirmed",
					"processing",
					"ready for pickup",
					"OnTheWay",
					"delivered",
					"cancelled",
				],
				message:
					"Status must be one of: pending, confirmed, processing, OnTheWay, delivered, cancelled",
			},
			default: "pending",
			index: true,
		},
		// DEPRECATED: Payment integration removed - these fields are kept for historical data only
		paymentStatus: {
			type: String,
			enum: {
				values: ["pending", "paid", "failed", "refunded", "cancelled"],
				message:
					"Payment status must be one of: pending, paid, failed, refunded",
			},
			default: "pending",
			index: true,
			required: false, // Optional for backward compatibility
		},
		// DEPRECATED: PAYONE payment link ID - no longer generated for new orders
		paymentLinkId: {
			type: String,
			index: true,
			required: false,
		},
		// DEPRECATED: PAYONE transaction ID - no longer used for new orders
		txid: {
			type: String,
			trim: true,
			index: true,
			required: false,
		},
		// DEPRECATED: Payment method field - kept for historical records
		paymentMethod: {
			type: String,
			enum: ["cash", "card", "online", "wallet"],
			default: "online",
			required: false,
		},
		paymentUrl: {
			type: String,
			trim: true,
			required: false,
		},
		shelfNumber: {
			type: String,
			default: "",
			trim: true,
			maxlength: [20, "Shelf number cannot be more than 20 characters"],
		},
		assignedRider: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Rider",
			index: true,
		},
		riderAssignedAt: {
			type: Date,
		},
		deliveryStartedAt: {
			type: Date,
		},
		deliveryCompletedAt: {
			type: Date,
		},
		notes: {
			type: String,
			trim: true,
		},
		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: [true, "Created by user is required"],
		},
		updatedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
		isActive: {
			type: Boolean,
			default: true,
			index: true,
		},
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

// Indexes for better performance
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ "customer.email": 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ isActive: 1, createdAt: -1 });

// Virtual for order age in days
orderSchema.virtual("ageInDays").get(function () {
	return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to generate order number
orderSchema.pre("save", async function (next) {
	if (this.isNew) {
		// Generate order number: ORD-YYYYMMDD-XXXX
		const today = new Date();
		const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

		// Find the highest order number for today
		const lastOrder = await this.constructor
			.findOne({
				orderNumber: new RegExp(`^ORD-${dateStr}-`),
			})
			.sort({ orderNumber: -1 });

		let sequence = 1;
		if (lastOrder) {
			const lastSequence = parseInt(lastOrder.orderNumber.split("-")[2]);
			sequence = lastSequence + 1;
		}

		this.orderNumber = `ORD-${dateStr}-${sequence.toString().padStart(4, "0")}`;
	}

	// Calculate totals
	//this.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
	//this.total = this.subtotal + this.tax - this.discount;

	next();
});

// Pre-save middleware to calculate item totals
orderSchema.pre("save", function (next) {
	this.items.forEach((item) => {
		item.totalPrice =
			item.quantity * item.unitPrice * (1 - (item.discount || 0) / 100) +
			(this.delivery || 0);
	});
	next();
});

// Static method to get order statistics
orderSchema.statics.getOrderStats = async function () {
	const stats = await this.aggregate([
		{
			$match: { isActive: true },
		},
		{
			$group: {
				_id: "$status",
				count: { $sum: 1 },
				totalValue: { $sum: "$total" },
			},
		},
	]);

	const totalOrders = await this.countDocuments({ isActive: true });
	const totalRevenue = await this.aggregate([
		{ $match: { isActive: true, paymentStatus: "paid" } },
		{ $group: { _id: null, total: { $sum: "$total" } } },
	]);

	return {
		totalOrders,
		totalRevenue: totalRevenue[0]?.total || 0,
		statusBreakdown: stats,
	};
};

module.exports = mongoose.model("Order", orderSchema);
