const Order = require("../models/Order");
const Product = require("../models/Product");
const Rider = require("../models/Rider");
const mongoose = require("mongoose");
const Zone = require("../models/Zone");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
			.populate(
				"items.product",
				"name barcode shelfNumber price discount tax bottlerefund picture"
			)
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
			.populate(
				"items.product",
				"name barcode shelfNumber price discount tax bottlerefund picture"
			)
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
			.populate(
				"items.product",
				"name barcode shelfNumber price discount tax bottlerefund picture"
			);

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
	// return res.status(400).json({
	// 	success: false,
	// 	message: "This Feature is not available until Opening in 7 Dec ",
	// });

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
			if (!item.product || !item.quantity) {
				return res.status(400).json({
					success: false,
					message: "Each item must have product, quantity",
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
				product.price *
					(1 + (product.tax || 0) / 100) *
					(1 - (product.discount || 0) / 100) +
				(product.bottlerefund || 0);
			subtotal += item.quantity * totalPrice;

			processedItems.push({
				product: product,

				quantity: item.quantity,

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

		// Calculate processing fee: 2.9% + 0.30
		const processingFee = (subtotal + delivery) * 0.029 + 0.3;
		// Round to 2 decimal places
		const fees = Math.round(processingFee * 100) / 100;

		const total = subtotal + delivery + fees;

		const order = new Order({
			customer: dbCustomer,
			items: processedItems,
			subtotal: subtotal,

			delivery: delivery,
			fees: fees,
			total: total,
			paymentMethod,
			shelfNumber,
			notes,
			status: "pending",
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
			.populate("customer", "name address")
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate(
				"items.product",
				"name barcode shelfNumber price discount tax bottlerefund"
			);

		// Set default payment URL
		let paymentUrl;
		if (paymentMethod === "online" || paymentMethod === "card") {
			try {
				const lineItems = populatedOrder.items.map((item) => ({
					price_data: {
						currency: "eur",
						product_data: {
							name: item.product.name,
						},
						unit_amount: Math.round(item.totalPrice * 100), // Price in cents
					},
					quantity: item.quantity,
				}));

				if (populatedOrder.delivery > 0) {
					lineItems.push({
						price_data: {
							currency: "eur",
							product_data: {
								name: "Delivery Fee",
							},
							unit_amount: Math.round(populatedOrder.delivery * 100),
						},
						quantity: 1,
					});
				}

				if (populatedOrder.fees > 0) {
					lineItems.push({
						price_data: {
							currency: "eur",
							product_data: {
								name: "Processing Fee",
							},
							unit_amount: Math.round(populatedOrder.fees * 100),
						},
						quantity: 1,
					});
				}

				const session = await stripe.checkout.sessions.create({
					payment_method_types: ["card"],
					line_items: lineItems,
					mode: "payment",
					success_url: `${
						process.env.SERVER_URL || "https://frischlyshop-server.onrender.com"
					}/payment/stripe-success.html?session_id={CHECKOUT_SESSION_ID}&order=${
						populatedOrder._id
					}`,
					cancel_url: `${
						process.env.SERVER_URL || "https://frischlyshop-server.onrender.com"
					}/payment/cancel.html?order=${populatedOrder._id}`,
					client_reference_id: populatedOrder._id.toString(),
					customer_email: populatedOrder.customer.email,
				});

				paymentUrl = session.url;

				// Update order with session ID
				order.paymentLinkId = session.id;
				await order.save();
			} catch (error) {
				console.error("Stripe session creation failed:", error);
			}
		}

		res.status(201).json({
			success: true,
			message: "Order created successfully",
			data: populatedOrder,
			paymentUrl: paymentUrl,
		});

		// Send confirmation email to customer
		try {
			const emailSubject = `Order Confirmation - Order #${populatedOrder._id}`;
			const emailHtml = `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
					<h2 style="color: #333; text-align: center;">Order Confirmation</h2>
					<p>Dear ${populatedOrder.customer.name},</p>
					<p>Thank you for your order! We have received your order and it is being processed. Here are the details:</p>
					
					<h3>Order Details</h3>
					<p><strong>Order ID:</strong> ${populatedOrder._id}</p>
					<p><strong>Order Date:</strong> ${new Date(
						populatedOrder.createdAt
					).toLocaleDateString()}</p>
					<p><strong>Status:</strong> ${populatedOrder.status}</p>
					<p><strong>Payment Method:</strong> ${populatedOrder.paymentMethod}</p>
					<p><strong>Complete your order at:</strong> <a href="${paymentUrl}" style="color: #007bff;">${paymentUrl}</a></p>
					
					<h3>Items Ordered</h3>
					<table style="width: 100%; border-collapse: collapse;">
						<thead>
							<tr style="background-color: #f2f2f2;">
								<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Product</th>
								<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Quantity</th>
								<th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Price</th>
								<th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total</th>
							</tr>
						</thead>
						<tbody>
							${populatedOrder.items
								.map(
									(item) => `
								<tr>
									<td style="border: 1px solid #ddd; padding: 8px;">${item.product.name}</td>
									<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${
										item.quantity
									}</td>
									<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">€${item.totalPrice.toFixed(
										2
									)}</td>
									<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">€${
										item.totalPrice.toFixed(2) * item.quantity
									}</td>
								</tr>
							`
								)
								.join("")}
						</tbody>
					</table>
					
					<h3>Order Summary</h3>
					<p><strong>Subtotal:</strong> €${populatedOrder.subtotal.toFixed(2)}</p>
					<p><strong>Delivery Fee:</strong> €${populatedOrder.delivery.toFixed(2)}</p>
					<p><strong>Processing Fee:</strong> €${(populatedOrder.fees || 0).toFixed(
						2
					)}</p>
					<p><strong>Total:</strong> €${populatedOrder.total.toFixed(2)}</p>
					
					${
						populatedOrder.notes
							? `<p><strong>Notes:</strong> ${populatedOrder.notes}</p>`
							: ""
					}
					
					<p>If you have any questions about your order, please contact us at info@frischlyshop.com .</p>
					
					<p>Thank you for choosing Frischly!</p>
					
					<p>Best regards,<br>The Frischly Team</p>
					
					<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
					
					<h2 style="color: #333; text-align: center;">Bestellbestätigung</h2>
					<p>Liebe/r ${populatedOrder.customer.name},</p>
					<p>Vielen Dank für Ihre Bestellung! Wir haben Ihre Bestellung erhalten und sie wird bearbeitet. Hier sind die Details:</p>
					
					<h3>Bestelldetails</h3>
					<p><strong>Bestell-ID:</strong> ${populatedOrder._id}</p>
					<p><strong>Bestelldatum:</strong> ${new Date(
						populatedOrder.createdAt
					).toLocaleDateString("de-DE")}</p>
					<p><strong>Status:</strong> ${populatedOrder.status}</p>
					<p><strong>Zahlungsmethode:</strong> ${populatedOrder.paymentMethod}</p>
					<p><strong>Schließen Sie Ihre Bestellung ab unter:</strong> <a href="${paymentUrl}" style="color: #007bff;">${paymentUrl}</a></p>
					
					<h3>Bestellte Artikel</h3>
					<table style="width: 100%; border-collapse: collapse;">
						<thead>
							<tr style="background-color: #f2f2f2;">
								<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Produkt</th>
								<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Menge</th>
								<th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Preis</th>
								<th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Gesamt</th>
							</tr>
						</thead>
						<tbody>
							${populatedOrder.items
								.map(
									(item) => `
								<tr>
									<td style="border: 1px solid #ddd; padding: 8px;">${item.product.name}</td>
									<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${
										item.quantity
									}</td>
									<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">€${item.totalPrice.toFixed(
										2
									)}</td>
									<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">€${
										item.totalPrice.toFixed(2) * item.quantity
									}</td>
								</tr>
							`
								)
								.join("")}
						</tbody>
					</table>
					
					<h3>Bestellübersicht</h3>
					<p><strong>Zwischensumme:</strong> €${populatedOrder.subtotal.toFixed(2)}</p>
					<p><strong>Liefergebühr:</strong> €${populatedOrder.delivery.toFixed(2)}</p>
					<p><strong>Bearbeitungsgebühr:</strong> €${(populatedOrder.fees || 0).toFixed(
						2
					)}</p>
					<p><strong>Gesamt:</strong> €${populatedOrder.total.toFixed(2)}</p>
					
					${
						populatedOrder.notes
							? `<p><strong>Notizen:</strong> ${populatedOrder.notes}</p>`
							: ""
					}
					
					<p>Bei Fragen zu Ihrer Bestellung kontaktieren Sie uns bitte unter info@frischlyshop.com.</p>
					
					<p>Vielen Dank, dass Sie sich für Frischly entschieden haben!</p>
					
					<p>Mit freundlichen Grüßen,<br>Das Frischly Team</p>
					
					<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
					<p style="font-size: 12px; color: #666; text-align: center;">
						Dies ist eine automatische E-Mail. Bitte antworten Sie nicht auf diese Nachricht.
					</p>
				</div>
			`;

			await sendEmail({
				to: populatedOrder.customer.email,
				subject: emailSubject,
				html: emailHtml,
			});
		} catch (emailError) {
			console.error("Error sending order confirmation email:", emailError);
			// Don't fail the order creation if email fails
		}
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
			.populate(
				"items.product",
				"name barcode shelfNumber price discount tax bottlerefund picture"
			);

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
		console.log("=== ORDER CANCELLATION STARTED ===");
		const { id } = req.params;
		const { reason } = req.body;

		console.log(`Step 1: Received cancellation request for order ID: ${id}`);
		console.log(`Step 1: Cancellation reason: ${reason || "Not provided"}`);
		console.log(
			`Step 1: Request made by user ID: ${req.user?.id || "Unknown"}`
		);

		// Step 2: Validate order ID
		console.log("Step 2: Validating order ID format...");
		if (!mongoose.Types.ObjectId.isValid(id)) {
			console.log("❌ Step 2: Invalid order ID format");
			return res.status(400).json({
				success: false,
				message: "Invalid order ID",
			});
		}
		console.log("✅ Step 2: Order ID format is valid");

		// Step 3: Find the order
		console.log("Step 3: Looking up order in database...");
		const order = await Order.findById(id);
		if (!order) {
			console.log("❌ Step 3: Order not found in database");
			return res.status(404).json({
				success: false,
				message: "Order not found",
			});
		}
		console.log(
			`✅ Step 3: Order found - Status: ${order.status}, Payment: ${order.paymentStatus}, Total: €${order.total}`
		);

		// Step 4: Check if order is already cancelled
		console.log("Step 4: Checking if order is already cancelled...");
		if (order.status === "cancelled") {
			console.log("❌ Step 4: Order is already cancelled");
			return res.status(400).json({
				success: false,
				message: "Order is already cancelled",
			});
		}
		console.log("✅ Step 4: Order is not already cancelled");

		// Step 5: Check if order can be cancelled
		console.log("Step 5: Checking if order can be cancelled...");
		if (order.status === "delivered" || order.status === "OnTheWay") {
			console.log(
				`❌ Step 5: Cannot cancel order with status '${order.status}'`
			);
			return res.status(400).json({
				success: false,
				message: "Cannot cancel delivered or on-the-way order",
			});
		}
		console.log("✅ Step 5: Order can be cancelled");

		// Handle Stripe Payment (Refund or Expire Link)
		if (
			order.paymentLinkId &&
			(order.paymentMethod === "online" || order.paymentMethod === "card")
		) {
			try {
				if (order.paymentStatus === "paid") {
					console.log("Processing refund for paid order...");
					// Retrieve session to get payment_intent
					const session = await stripe.checkout.sessions.retrieve(
						order.paymentLinkId
					);
					if (session.payment_intent) {
						// Refund subtotal + delivery (excluding processing fees)
						const refundAmount = Math.round(
							(order.subtotal + (order.delivery || 0)) * 100
						);

						await stripe.refunds.create({
							payment_intent: session.payment_intent,
							amount: refundAmount,
							reason: "requested_by_customer",
						});
						console.log(
							`✅ Refund processed successfully: €${(
								order.subtotal + (order.delivery || 0)
							).toFixed(2)}`
						);
						order.paymentStatus = "refunded";
						order.status = "cancelled";
						// Send refund email
						try {
							const emailSubject = `Refund Processed - Order #${order._id}`;
							const refundAmountEur = (
								order.subtotal + (order.delivery || 0)
							).toFixed(2);
							const emailHtml = `
								<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
									<h2 style="color: #333; text-align: center;">Refund Processed</h2>
									<p>Dear ${order.customer.name},</p>
									<p>Your order #${
										order._id
									} has been cancelled and a refund has been processed.</p>
									
									<h3>Refund Details</h3>
									<p><strong>Refund Amount:</strong> €${refundAmountEur}</p>
									<p><strong>Original Order Total:</strong> €${order.total.toFixed(2)}</p>
									<p><strong>Processing Fees (Non-refundable):</strong> €${(
										order.fees || 0
									).toFixed(2)}</p>
									
									<p>Please note that the refund amount does not include the processing fees as they are non-refundable.</p>
									<p>The refund should appear on your statement within 5-10 business days.</p>
									
									<p>If you have any questions, please contact us at info@frischlyshop.com.</p>
									
									<p>Best regards,<br>The Frischly Team</p>

									<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
									
									<h2 style="color: #333; text-align: center;">Rückerstattung bearbeitet</h2>
									<p>Liebe/r ${order.customer.name},</p>
									<p>Ihre Bestellung #${
										order._id
									} wurde storniert und eine Rückerstattung wurde veranlasst.</p>
									
									<h3>Details zur Rückerstattung</h3>
									<p><strong>Rückerstattungsbetrag:</strong> €${refundAmountEur}</p>
									<p><strong>Ursprünglicher Bestellwert:</strong> €${order.total.toFixed(2)}</p>
									<p><strong>Bearbeitungsgebühren (nicht erstattungsfähig):</strong> €${(
										order.fees || 0
									).toFixed(2)}</p>
									
									<p>Bitte beachten Sie, dass der Rückerstattungsbetrag keine Bearbeitungsgebühren enthält, da diese nicht erstattungsfähig sind.</p>
									<p>Die Rückerstattung sollte innerhalb von 5-10 Werktagen auf Ihrem Kontoauszug erscheinen.</p>
									
									<p>Bei Fragen kontaktieren Sie uns bitte unter info@frischlyshop.com.</p>
									
									<p>Mit freundlichen Grüßen,<br>Das Frischly Team</p>
								</div>
							`;

							await sendEmail({
								to: order.customer.email,
								subject: emailSubject,
								html: emailHtml,
							});
							console.log(`✅ Refund email sent to ${order.customer.email}`);
						} catch (emailError) {
							console.error("Error sending refund email:", emailError);
						}

						order.notes = `${
							order.notes || ""
						}\nRefund processed via Stripe (excluding processing fees).`.trim();
					}
				} else {
					console.log("Deactivating unpaid payment link...");
					try {
						await stripe.checkout.sessions.expire(order.paymentLinkId);
						console.log("✅ Payment link deactivated");
						order.status = "cancelled";
						order.paymentStatus = "cancelled";
						order.notes = `${
							order.notes || ""
						}\nPayment link expired upon order cancellation.`.trim();
						await order.save();
					} catch (err) {
						// Ignore error if session is already expired or invalid
						console.log(`⚠️ Could not expire session: ${err.message}`);
					}
				}
			} catch (error) {
				console.error("❌ Error handling Stripe payment:", error);
				order.notes = `${order.notes || ""}\nPayment handling error: ${
					error.message
				}`.trim();
			}
		}

		// Step 6: Restore product stock
		console.log("Step 6: Restoring product stock...");
		let restoredCount = 0;
		for (const item of order.items) {
			await Product.findByIdAndUpdate(item.product, {
				$inc: { stock: item.quantity },
			});
			restoredCount += item.quantity;
			console.log(
				`   - Restored ${item.quantity} units of product ${item.product}`
			);
		}
		console.log(`✅ Step 6: Restored total of ${restoredCount} product units`);

		// Step 7: Update order status to cancelled
		console.log("Step 7: Updating order status to cancelled...");
		order.status = "cancelled";

		order.notes = reason
			? `${order.notes || ""}\nCancellation reason: ${reason}`.trim()
			: order.notes;
		order.updatedBy = req.user.id;
		await order.save();
		console.log("✅ Step 7: Order status updated to cancelled");

		console.log("Step 8: Fetching updated order data for response...");
		const updatedOrder = await Order.findById(id)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate(
				"items.product",
				"name barcode  price discount tax bottlerefund picture"
			);

		console.log("=== ORDER CANCELLATION COMPLETED SUCCESSFULLY ===");
		console.log(`Final Status: ${updatedOrder.status}`);

		res.json({
			success: true,
			message: "Order cancelled successfully",
			data: updatedOrder,
		});
	} catch (error) {
		console.log("=== ORDER CANCELLATION FAILED ===");
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
			.populate(
				"items.product",
				"name barcode shelfNumber price discount tax bottlerefund picture"
			);

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
			//order.paymentStatus = "paid";
		}

		await order.save();

		const updatedOrder = await Order.findById(id)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate("assignedRider", "name email phone")
			.populate(
				"items.product",
				"name barcode shelfNumber price discount tax bottlerefund picture"
			);

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

// @desc    Verify Stripe Payment
// @route   POST /api/orders/verify-payment
// @access  Public
exports.verifyStripePayment = async (req, res) => {
	try {
		const { sessionId, orderId } = req.body;

		if (!sessionId || !orderId) {
			return res.status(400).json({
				success: false,
				message: "Session ID and Order ID are required",
			});
		}

		const session = await stripe.checkout.sessions.retrieve(sessionId);

		if (!session) {
			return res.status(404).json({
				success: false,
				message: "Session not found",
			});
		}

		if (session.payment_status === "paid") {
			const order = await Order.findById(orderId);
			if (!order) {
				return res.status(404).json({
					success: false,
					message: "Order not found",
				});
			}

			if (order.paymentStatus !== "paid") {
				order.paymentStatus = "paid";
				order.status = "confirmed"; // Update order status upon payment
				order.paymentMethod = "online"; // Ensure it's marked as online
				await order.save();
			}

			return res.json({
				success: true,
				message: "Payment verified successfully",
			});
		} else {
			return res.status(400).json({
				success: false,
				message: "Payment not completed",
			});
		}
	} catch (error) {
		console.error("Error verifying payment:", error);
		res.status(500).json({
			success: false,
			message: "Error verifying payment",
			error: error.message,
		});
	}
};
