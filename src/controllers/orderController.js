const Order = require("../models/Order");
const Product = require("../models/Product");
const Rider = require("../models/Rider");
const mongoose = require("mongoose");
const Zone = require("../models/Zone");
const User = require("../models/User");

// @desc    Get all orders with enhanced filtering options
// @route   GET /api/orders
// @access  Private
exports.getOrders = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 20,
			status,
			paymentStatus,
			isActive = "true",
			sortBy = "createdAt",
			sortOrder = "desc",
			search,
			dateFrom,
			dateTo,
			assignedRider,
			minTotal,
			maxTotal,
		} = req.query;

		const pageNum = parseInt(page);
		const limitNum = parseInt(limit);
		const skip = (pageNum - 1) * limitNum;

		// Build filter object
		const filter = {};

		// Handle isActive filter
		if (isActive !== "all") {
			filter.isActive = isActive === "true";
		}

		// Enhanced status filtering
		if (status) {
			if (status.includes(",")) {
				// Multiple status values separated by comma
				const statusArray = status.split(",").map((s) => s.trim());
				filter.status = { $in: statusArray };
			} else if (status.startsWith("!")) {
				// Exclude specific status (e.g., !cancelled)
				const excludeStatus = status.substring(1);
				filter.status = { $ne: excludeStatus };
			} else {
				// Single status value
				filter.status = status;
			}
		}

		if (paymentStatus) {
			if (paymentStatus.includes(",")) {
				// Multiple payment status values separated by comma
				const paymentStatusArray = paymentStatus
					.split(",")
					.map((s) => s.trim());
				filter.paymentStatus = { $in: paymentStatusArray };
			} else {
				// Single payment status value
				filter.paymentStatus = paymentStatus;
			}
		}

		// Date range filtering
		if (dateFrom || dateTo) {
			const dateFilter = {};
			if (dateFrom) {
				const fromDate = new Date(dateFrom);
				if (!isNaN(fromDate.getTime())) {
					dateFilter.$gte = fromDate;
				}
			}
			if (dateTo) {
				const toDate = new Date(dateTo);
				if (!isNaN(toDate.getTime())) {
					// Include the entire day by setting to end of day
					toDate.setHours(23, 59, 59, 999);
					dateFilter.$lte = toDate;
				}
			}
			if (Object.keys(dateFilter).length > 0) {
				filter.createdAt = dateFilter;
			}
		}

		// Assigned rider filtering
		if (assignedRider) {
			if (assignedRider === "unassigned") {
				filter.assignedRider = { $exists: false };
			} else if (assignedRider === "assigned") {
				filter.assignedRider = { $exists: true };
			} else {
				// Specific rider ID
				filter.assignedRider = assignedRider;
			}
		}

		// Total amount filtering
		if (minTotal || maxTotal) {
			const totalFilter = {};
			if (minTotal) {
				const min = parseFloat(minTotal);
				if (!isNaN(min)) {
					totalFilter.$gte = min;
				}
			}
			if (maxTotal) {
				const max = parseFloat(maxTotal);
				if (!isNaN(max)) {
					totalFilter.$lte = max;
				}
			}
			if (Object.keys(totalFilter).length > 0) {
				filter.total = totalFilter;
			}
		}

		// Filter orders based on user role
		// Customers can only see their own orders
		if (req.user.role === "customer") {
			filter["customer.email"] = req.user.email;
		}

		// Search functionality
		if (search) {
			filter.$or = [
				{ orderNumber: { $regex: search, $options: "i" } },
				{ "customer.name": { $regex: search, $options: "i" } },
				{ "customer.email": { $regex: search, $options: "i" } },
				{ "customer.phone": { $regex: search, $options: "i" } },
			];
		}

		// Build sort object
		const sortOptions = {};
		sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

		const orders = await Order.find(filter)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate("assignedRider", "name email phone")
			.populate("items.product", "name barcode")
			.sort(sortOptions)
			.skip(skip)
			.limit(limitNum);

		const totalOrders = await Order.countDocuments(filter);
		const totalPages = Math.ceil(totalOrders / limitNum);

		res.json({
			success: true,
			data: orders,
			pagination: {
				currentPage: pageNum,
				totalPages,
				totalOrders,
				hasNextPage: pageNum < totalPages,
				hasPrevPage: pageNum > 1,
			},
		});
	} catch (error) {
		console.error("Error fetching orders:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching orders",
			error: error.message,
		});
	}
};

// @desc    Get all orders excluding pending, confirmed, and processing
// @route   GET /api/orders/runningOrder
// @access  Private
exports.getOrdersForRiders = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 20,
			status,
			paymentStatus,
			isActive = "true",
			sortBy = "createdAt",
			sortOrder = "desc",
			search,
		} = req.query;

		const pageNum = parseInt(page);
		const limitNum = parseInt(limit);
		const skip = (pageNum - 1) * limitNum;

		// Build filter object
		const filter = {};

		// Exclude pending, confirmed, and processing orders
		filter.status = { $nin: ["pending", "confirmed", "processing"] };

		// Handle isActive filter
		if (isActive !== "all") {
			filter.isActive = isActive === "true";
		}

		// Additional status filter if provided (will be combined with exclusion)
		if (status) {
			filter.status = { ...filter.status, $eq: status };
		}

		if (paymentStatus) {
			filter.paymentStatus = paymentStatus;
		}

		// Filter orders based on user role
		// Customers can only see their own orders
		if (req.user.role === "customer") {
			filter["customer.email"] = req.user.email;
		}

		// Riders can only see orders in their assigned zones
		if (req.user.role === "rider") {
			console.log("Rider email:", req.user.email);
			const rider = await Rider.findOne({ user: req.user.id });
			console.log("Rider zones:", rider ? rider.zones : "No rider found");
			if (rider && rider.zones && rider.zones.length > 0) {
				// Get zip codes for the rider's zone names
				const zones = await Zone.find({
					zoneName: { $in: rider.zones },
					isActive: true,
				});
				const zipCodes = zones.map((zone) => zone.zipCode);
				console.log("Rider zone zip codes:", zipCodes);

				if (zipCodes.length > 0) {
					filter["customer.address.zipCode"] = { $in: zipCodes };
				} else {
					// If no valid zones found, return no orders
					filter["customer.address.zipCode"] = null;
				}
			} else {
				// If rider has no zones assigned, return no orders
				filter["customer.address.zipCode"] = null;
			}
		}

		// Search functionality
		if (search) {
			filter.$or = [
				{ orderNumber: { $regex: search, $options: "i" } },
				{ "customer.name": { $regex: search, $options: "i" } },
				{ "customer.email": { $regex: search, $options: "i" } },
				{ "customer.phone": { $regex: search, $options: "i" } },
			];
		}

		// Build sort object
		const sortOptions = {};
		sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

		const orders = await Order.find(filter)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate("assignedRider", "name email phone")
			.populate("items.product", "name barcode")
			.sort(sortOptions)
			.skip(skip)
			.limit(limitNum);

		const totalOrders = await Order.countDocuments(filter);
		const totalPages = Math.ceil(totalOrders / limitNum);

		res.json({
			success: true,
			data: orders,
			pagination: {
				currentPage: pageNum,
				totalPages,
				totalOrders,
				hasNextPage: pageNum < totalPages,
				hasPrevPage: pageNum > 1,
			},
		});
	} catch (error) {
		console.error("Error fetching completed orders:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching completed orders",
			error: error.message,
		});
	}
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid order ID",
			});
		}

		const order = await Order.findById(id)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate("assignedRider", "name email phone")
			.populate("items.product", "name barcode shelfNumber");

		if (!order) {
			return res.status(404).json({
				success: false,
				message: "Order not found",
			});
		}

		// Check if user is authorized to view this order
		// Customers can only view their own orders
		if (
			req.user.role === "customer" &&
			order.customer.email !== req.user.email
		) {
			return res.status(403).json({
				success: false,
				message: "You are not authorized to view this order",
			});
		}

		res.json({
			success: true,
			data: order,
		});
	} catch (error) {
		console.error("Error fetching order:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching order",
			error: error.message,
		});
	}
};

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res) => {
	try {
		const {
			customer,
			items,
			paymentMethod = "card",
			shelfNumber = 0,
			notes,
		} = req.body;

		// Validate required fields
		const dbCustomer = await User.findById(customer.id);
		if (
			!dbCustomer ||
			!dbCustomer.name ||
			!dbCustomer.id ||
			!dbCustomer.email ||
			!dbCustomer.phoneNumber
		) {
			return res.status(400).json({
				success: false,
				message: "Customer name, ID, email, and phone are required",
			});
		}

		if (!items || !Array.isArray(items) || items.length === 0) {
			return res.status(400).json({
				success: false,
				message: "Order must contain at least one item",
			});
		}

		// Validate and process items
		const processedItems = [];
		let subtotal = 0;

		for (const item of items) {
			if (!item.product || !item.quantity || !item.unitPrice) {
				return res.status(400).json({
					success: false,
					message: "Each item must have product, quantity, and unit price",
				});
			}

			// Verify product exists
			const product = await Product.findById(item.product);
			if (!product) {
				return res.status(400).json({
					success: false,
					message: `Product with ID ${item.product} not found`,
				});
			}

			// Check stock availability
			if (product.stock < item.quantity) {
				return res.status(400).json({
					success: false,
					message: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
				});
			}

			const totalPrice =
				item.quantity *
				(product.price *
					(1 + (product.tax || 0) / 100) *
					(1 - (product.discount || 0) / 100) +
					(product.bottlerefund || 0));
			subtotal += totalPrice;

			processedItems.push({
				product: product._id,
				productName: product.name,
				productBarcode: product.barcode,
				productImage: product.picture,
				quantity: item.quantity,

				unitPrice:
					product.price *
						(1 + (product.tax || 0) / 100) *
						(1 - (product.discount || 0) / 100) +
					(product.bottlerefund || 0),
				totalPrice,
			});
		}

		// Create order
		// Calculate delivery charge based on customer's zone
		let delivery = 0;
		if (dbCustomer.address && dbCustomer.address.zipCode) {
			try {
				const zone = await Zone.findOne({
					zipCode: dbCustomer.address.zipCode,
					isActive: true,
				});
				if (zone && zone.deliveryFee) {
					delivery = zone.deliveryFee;
				}
			} catch (error) {
				console.warn("Error fetching delivery fee from zone:", error.message);
				// Continue with delivery = 0 if zone lookup fails
			}
		}

		const total = subtotal + delivery;

		const order = new Order({
			customer: dbCustomer,
			items: processedItems,
			subtotal: subtotal,

			delivery: delivery,
			total: total,
			paymentMethod,
			shelfNumber,
			notes,
			createdBy: req.user.id,
		});

		await order.save();

		// Update product stock
		for (const item of processedItems) {
			await Product.findByIdAndUpdate(item.product, {
				$inc: { stock: -item.quantity },
			});
		}

		// Populate the created order
		const populatedOrder = await Order.findById(order._id)
			.populate("createdBy", "name email")
			.populate("items.product", "name barcode");

		res.status(201).json({
			success: true,
			message: "Order created successfully",
			data: populatedOrder,
		});
	} catch (error) {
		console.error("Error creating order:", error);
		res.status(500).json({
			success: false,
			message: "Error creating order",
			error: error.message,
		});
	}
};

// @desc    Update order
// @route   PUT /api/orders/:id
// @access  Private
exports.updateOrder = async (req, res) => {
	try {
		const { id } = req.params;
		const {
			customer,
			status,
			paymentStatus,
			paymentMethod,
			shelfNumber,
			notes,
			tax,
			discount,
			assignedRider,
			riderAssignedAt,
		} = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid order ID",
			});
		}

		const order = await Order.findById(id);
		if (!order) {
			return res.status(404).json({
				success: false,
				message: "Order not found",
			});
		}

		// Check if order can be modified
		if (order.status === "cancelled" || order.status === "delivered") {
			return res.status(400).json({
				success: false,
				message: "Cannot modify cancelled or delivered orders",
			});
		}

		// Update fields
		if (customer) order.customer = { ...order.customer, ...customer };
		if (status) order.status = status;
		if (paymentStatus) order.paymentStatus = paymentStatus;
		if (paymentMethod) order.paymentMethod = paymentMethod;
		if (shelfNumber !== undefined) order.shelfNumber = shelfNumber;
		if (notes !== undefined) order.notes = notes;
		if (tax !== undefined) order.tax = tax;
		if (discount !== undefined) order.discount = discount;
		if (assignedRider !== undefined) order.assignedRider = assignedRider;
		if (riderAssignedAt !== undefined) order.riderAssignedAt = riderAssignedAt;

		order.updatedBy = req.user.id;

		await order.save();

		const updatedOrder = await Order.findById(id)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate("assignedRider", "name email phone")
			.populate("items.product", "name barcode");

		res.json({
			success: true,
			message: "Order updated successfully",
			data: updatedOrder,
		});
	} catch (error) {
		console.error("Error updating order:", error);
		res.status(500).json({
			success: false,
			message: "Error updating order",
			error: error.message,
		});
	}
};

// @desc    Delete order (soft delete)
// @route   DELETE /api/orders/:id
// @access  Private (Admin)
exports.deleteOrder = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid order ID",
			});
		}

		const order = await Order.findByIdAndUpdate(
			id,
			{ isActive: false, updatedBy: req.user.id },
			{ new: true }
		);

		if (!order) {
			return res.status(404).json({
				success: false,
				message: "Order not found",
			});
		}

		res.json({
			success: true,
			message: "Order deleted successfully",
			data: order,
		});
	} catch (error) {
		console.error("Error deleting order:", error);
		res.status(500).json({
			success: false,
			message: "Error deleting order",
			error: error.message,
		});
	}
};

// @desc    Get order statistics
// @route   GET /api/orders/stats
// @access  Private
exports.getOrderStats = async (req, res) => {
	try {
		const stats = await Order.getOrderStats();

		// Additional stats
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const todayOrders = await Order.countDocuments({
			isActive: true,
			createdAt: { $gte: today },
		});

		const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
		const monthlyOrders = await Order.countDocuments({
			isActive: true,
			createdAt: { $gte: thisMonth },
		});

		const monthlyRevenue = await Order.aggregate([
			{
				$match: {
					isActive: true,
					paymentStatus: "paid",
					createdAt: { $gte: thisMonth },
				},
			},
			{
				$group: {
					_id: null,
					total: { $sum: "$total" },
				},
			},
		]);

		res.json({
			success: true,
			data: {
				...stats,
				todayOrders,
				monthlyOrders,
				monthlyRevenue: monthlyRevenue[0]?.total || 0,
			},
		});
	} catch (error) {
		console.error("Error fetching order stats:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching order statistics",
			error: error.message,
		});
	}
};

// @desc    Cancel order
// @route   PATCH /api/orders/:id/cancel
// @access  Private
exports.cancelOrder = async (req, res) => {
	try {
		const { id } = req.params;
		const { reason } = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid order ID",
			});
		}

		const order = await Order.findById(id);
		if (!order) {
			return res.status(404).json({
				success: false,
				message: "Order not found",
			});
		}

		if (order.status === "cancelled") {
			return res.status(400).json({
				success: false,
				message: "Order is already cancelled",
			});
		}

		if (order.status === "delivered") {
			return res.status(400).json({
				success: false,
				message: "Cannot cancel delivered order",
			});
		}

		// Restore product stock
		for (const item of order.items) {
			await Product.findByIdAndUpdate(item.product, {
				$inc: { stock: item.quantity },
			});
		}

		order.status = "cancelled";
		order.notes = reason
			? `${order.notes || ""}\nCancellation reason: ${reason}`.trim()
			: order.notes;
		order.updatedBy = req.user.id;

		await order.save();

		const updatedOrder = await Order.findById(id)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate("items.product", "name barcode");

		res.json({
			success: true,
			message: "Order cancelled successfully",
			data: updatedOrder,
		});
	} catch (error) {
		console.error("Error cancelling order:", error);
		res.status(500).json({
			success: false,
			message: "Error cancelling order",
			error: error.message,
		});
	}
};

// @desc    Update order shelf number
// @route   PATCH /api/orders/:id/shelf
// @access  Private (Admin, Manager, Staff)
exports.updateOrderShelfNumber = async (req, res) => {
	try {
		const { id } = req.params;
		const { shelfNumber } = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid order ID",
			});
		}

		if (shelfNumber === undefined || shelfNumber === null) {
			return res.status(400).json({
				success: false,
				message: "Shelf number is required",
			});
		}

		// Convert to number if it's a valid number string
		const shelfNum =
			typeof shelfNumber === "string" ? parseFloat(shelfNumber) : shelfNumber;

		if (isNaN(shelfNum) || shelfNum < 0) {
			return res.status(400).json({
				success: false,
				message: "Shelf number must be a valid non-negative number",
			});
		}

		const order = await Order.findById(id);

		if (!order) {
			return res.status(404).json({
				success: false,
				message: "Order not found",
			});
		}

		// Check if order can be modified
		if (order.status === "cancelled" || order.status === "delivered") {
			return res.status(400).json({
				success: false,
				message: "Cannot modify shelf number for cancelled or delivered orders",
			});
		}

		order.shelfNumber = shelfNum;
		order.updatedBy = req.user.id;
		order.updatedAt = new Date();
		await order.save();

		const updatedOrder = await Order.findById(id)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate("assignedRider", "name email phone")
			.populate("items.product", "name barcode");

		res.json({
			success: true,
			message: "Order shelf number updated successfully",
			data: updatedOrder,
		});
	} catch (error) {
		console.error("Error updating order shelf number:", error);
		res.status(500).json({
			success: false,
			message: "Error updating order shelf number",
			error: error.message,
		});
	}
};

// @desc    Update order status
// @route   PATCH /api/orders/:id/status
// @access  Private (Admin, Manager, Staff, Rider)
exports.updateOrderStatus = async (req, res) => {
	try {
		const { id } = req.params;
		const { status } = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid order ID",
			});
		}

		if (!status) {
			return res.status(400).json({
				success: false,
				message: "Status is required",
			});
		}

		// Valid status values from the Order model
		const validStatuses = [
			"pending",
			"confirmed",
			"processing",
			"ready for pickup",
			"OnTheWay",
			"delivered",
			"cancelled",
		];

		if (!validStatuses.includes(status)) {
			return res.status(400).json({
				success: false,
				message: `Status must be one of: ${validStatuses.join(", ")}`,
			});
		}

		const order = await Order.findById(id);

		if (!order) {
			return res.status(404).json({
				success: false,
				message: "Order not found",
			});
		}

		// Role-based status update permissions
		const userRole = req.user.role;

		// Define which roles can update to which statuses
		const statusPermissions = {
			admin: validStatuses, // Admin can update to any status
			manager: validStatuses, // Manager can update to any status
			staff: validStatuses, // Staff can update to any status
			rider: ["ready for pickup", "OnTheWay", "delivered"], // Riders can only update delivery-related statuses
		};

		const allowedStatuses = statusPermissions[userRole] || [];

		if (!allowedStatuses.includes(status)) {
			return res.status(403).json({
				success: false,
				message: `${userRole} role is not permitted to update status to '${status}'`,
			});
		}

		// Additional business logic for riders
		if (userRole === "rider") {
			// Check if the rider is assigned to this order
			const rider = await Rider.findOne({ user: req.user.id });

			if (!rider) {
				return res.status(403).json({
					success: false,
					message: "Rider profile not found",
				});
			}

			// Check if the order is assigned to this rider or if rider can access orders in their zones
			if (order.assignedRider && !order.assignedRider.equals(rider._id)) {
				// If order has an assigned rider and it's not this rider, check zone permissions
				if (rider.zones && rider.zones.length > 0) {
					const orderZone = order.customer?.address?.zipCode;
					if (orderZone) {
						const zones = await Zone.find({
							zoneName: { $in: rider.zones },
							zipCode: orderZone,
						});

						if (zones.length === 0) {
							return res.status(403).json({
								success: false,
								message: "You are not authorized to update this order",
							});
						}
					}
				} else {
					return res.status(403).json({
						success: false,
						message: "You are not authorized to update this order",
					});
				}
			}

			// Assign rider to order if not already assigned and status is being updated to delivery-related
			if (
				!order.assignedRider &&
				["ready for pickup", "OnTheWay", "delivered"].includes(status)
			) {
				order.assignedRider = rider._id;
				order.riderAssignedAt = new Date();
			}
		}

		// Prevent updating already completed orders
		if (["delivered", "cancelled"].includes(order.status)) {
			return res.status(400).json({
				success: false,
				message: "Cannot update status of delivered or cancelled orders",
			});
		}

		// Business logic validations
		if (status === "cancelled" && order.status === "delivered") {
			return res.status(400).json({
				success: false,
				message: "Cannot cancel a delivered order",
			});
		}

		// Update the order status
		const previousStatus = order.status;
		order.status = status;
		order.updatedBy = req.user.id;
		order.updatedAt = new Date();

		// Set delivery date if status is delivered
		if (status === "delivered" && previousStatus !== "delivered") {
			order.deliveredAt = new Date();
		}

		await order.save();

		const updatedOrder = await Order.findById(id)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate("assignedRider", "name email phone")
			.populate("items.product", "name barcode");

		res.json({
			success: true,
			message: `Order status updated from '${previousStatus}' to '${status}' successfully`,
			data: updatedOrder,
		});
	} catch (error) {
		console.error("Error updating order status:", error);
		res.status(500).json({
			success: false,
			message: "Error updating order status",
			error: error.message,
		});
	}
};

// @desc    Get total count of all orders
// @route   GET /api/orders/count
// @access  Private (Admin, Manager, Staff)
exports.getOrdersCount = async (req, res) => {
	try {
		const totalOrders = await Order.countDocuments({ isActive: true });

		res.json({
			success: true,
			count: totalOrders,
			message: `Total active orders: ${totalOrders}`,
		});
	} catch (error) {
		console.error("Error getting orders count:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving orders count",
			error: error.message,
		});
	}
};
