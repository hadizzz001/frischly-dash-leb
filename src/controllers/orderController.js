const Order = require("../models/Order");
const Product = require("../models/Product");
const Rider = require("../models/Rider");
const PromoCode = require("../models/PromoCode");
const mongoose = require("mongoose");
const Zone = require("../models/Zone");
const User = require("../models/User");
const Setting = require("../models/Setting");
const sendEmail = require("../utils/sendEmail");
const NotificationService = require("../services/notifications");
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
				"name barcode shelfNumber price discount tax bottlerefund picture",
			)
			.sort(sortOptions)
			.skip(skip)
			.limit(limitNum);

		// Sort items by shelfNumber
		orders.forEach((order) => {
			if (order.items && order.items.length > 0) {
				order.items.sort((a, b) => {
					const shelfA =
						a.product && a.product.shelfNumber
							? a.product.shelfNumber.toString().toLowerCase()
							: "";
					const shelfB =
						b.product && b.product.shelfNumber
							? b.product.shelfNumber.toString().toLowerCase()
							: "";
					if (shelfA < shelfB) return -1;
					if (shelfA > shelfB) return 1;
					return 0;
				});
			}
		});

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
			message: "Fehler beim Abrufen der Bestellungen",
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
				"name barcode shelfNumber price discount tax bottlerefund picture",
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
			message: "Fehler beim Abrufen der abgeschlossenen Bestellungen",
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
				message: "Ungültige Bestellungs-ID",
			});
		}

		const order = await Order.findById(id)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate("assignedRider", "name email phone")
			.populate(
				"items.product",
				"name barcode shelfNumber price discount tax bottlerefund picture",
			);

		if (!order) {
			return res.status(404).json({
				success: false,
				message: "Bestellung nicht gefunden",
			});
		}

		// Sort items by shelfNumber
		if (order.items && order.items.length > 0) {
			order.items.sort((a, b) => {
				const shelfA =
					a.product && a.product.shelfNumber
						? a.product.shelfNumber.toString().toLowerCase()
						: "";
				const shelfB =
					b.product && b.product.shelfNumber
						? b.product.shelfNumber.toString().toLowerCase()
						: "";
				if (shelfA < shelfB) return -1;
				if (shelfA > shelfB) return 1;
				return 0;
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
				message: "Sie sind nicht berechtigt, diese Bestellung anzusehen",
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
			message: "Fehler beim Abrufen der Bestellung",
			error: error.message,
		});
	}
};

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res) => {
	try {
		console.log("createOrder req.body:", JSON.stringify(req.body, null, 2));
		console.log("createOrder req.user:", req.user);
		console.log("Starting createOrder...");
		// Check global settings
		const settings = await Setting.getSettings();
		console.log("Settings fetched:", settings);
		if (settings.isMaintenanceMode || settings.areOrdersDisabled) {
			console.log(
				"Order creation disabled due to maintenance or disabled settings.",
			);
			return res.status(400).json({
				success: false,
				message:
					settings.maintenanceMessage ||
					"Order creation is currently disabled.",
			});
		}

		const {
			customer,
			items,
			address,
			paymentMethod = "card",
			shelfNumber = 0,
			notes,
			deliveryTime,
			promoCode,
		} = req.body;
		console.log(
			"Request body parsed. Customer:",
			customer?.id,
			"Items count:",
			items?.length,
		);

		// Set default delivery time to now if not provided
		const orderDeliveryTime = deliveryTime
			? new Date(deliveryTime)
			: new Date();

		// Validate required fields
		const dbCustomer = await User.findById(customer.id);
		console.log("Customer found:", dbCustomer ? dbCustomer._id : "Not found");
		if (
			!dbCustomer ||
			!dbCustomer.name ||
			!dbCustomer.id ||
			!dbCustomer.email ||
			!dbCustomer.phoneNumber
		) {
			console.log("Customer validation failed. Missing required fields.");
			return res.status(400).json({
				success: false,
				message: "Kundenname, ID, E-Mail und Telefon sind erforderlich",
			});
		}

		// Handle new address if provided
		const orderAddress = address || customer.address || dbCustomer.address;
		console.log("Order address determined:", orderAddress);

		if (!items || !Array.isArray(items) || items.length === 0) {
			console.log("No items provided in order.");
			return res.status(400).json({
				success: false,
				message: "Bestellung muss mindestens einen Artikel enthalten",
			});
		}

		// Validate and process items
		const processedItems = [];
		let subtotal = 0;
		console.log("Processing items...");

		for (const item of items) {
			console.log("Processing item:", item.product);
			if (!item.product || !item.quantity) {
				console.log("Invalid item structure:", item);
				return res.status(400).json({
					success: false,
					message: "Jeder Artikel muss Produkt und Menge haben",
				});
			}

			// Verify product exists
			const product = await Product.findById(item.product);

			if (!product) {
				console.log("Product not found:", item.product);
				return res.status(400).json({
					success: false,
					message: `Produkt mit ID ${item.product} nicht gefunden`,
				});
			}

			// Check stock availability
			if (product.stock < item.quantity) {
				console.log(
					"Insufficient stock for product:",
					product.name,
					"Stock:",
					product.stock,
					"Requested:",
					item.quantity,
				);
				return res.status(400).json({
					success: false,
					message: `Unzureichender Lagerbestand für ${product.name}. Verfügbar: ${product.stock}, Angefordert: ${item.quantity}`,
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
			console.log("Item processed successfully. New subtotal:", subtotal);
		}
		console.log("All items processed. Final subtotal:", subtotal);

		// Create order
		// Calculate delivery charge based on customer's zone
		let delivery = 0;
		console.log("Calculating delivery fee. ZipCode:", orderAddress?.zipCode);
		if (orderAddress && orderAddress.zipCode) {
			try {
				const zone = await Zone.findOne({
					zipCode: orderAddress.zipCode,
					isActive: true,
				});
				if (zone && zone.deliveryFee) {
					delivery = zone.deliveryFee;
					console.log("Zone found. Delivery fee:", delivery);
				} else {
					console.log("Zone not found or no delivery fee.");
				}
			} catch (error) {
				console.warn("Error fetching delivery fee from zone:", error.message);
				// Continue with delivery = 0 if zone lookup fails
			}
		}

		// Calculate processing fee: 2.9% + 0.30
		const processingFee = (subtotal + delivery) * 0.029 + 0.3;
		// Round to 2 decimal places
		//const fees = Math.round(processingFee * 100) / 100;
		const fees = 0;

		// Validate and calculate promo code discount
		let discount = 0;
		let promoCodeDoc = null;
		if (promoCode) {
			console.log("Validating promo code:", promoCode);
			promoCodeDoc = await PromoCode.findById(promoCode);
			console.log(
				"Promo code lookup result:",
				promoCodeDoc ? promoCodeDoc.code : "Not found",
			);
			if (
				!promoCodeDoc ||
				!promoCodeDoc.isActive ||
				!promoCodeDoc.isFromOwnCompany
			) {
				console.log("Invalid promo code:", promoCode);
				return res.status(400).json({
					success: false,
					message: "Ungültiger oder inaktiver Promo-Code",
				});
			}

			// Calculate discount
			const orderTotalBeforeDiscount = subtotal + delivery + fees;
			if (promoCodeDoc.discountType === "percentage") {
				discount =
					(orderTotalBeforeDiscount * promoCodeDoc.discountValue) / 100;
			} else if (promoCodeDoc.discountType === "cash") {
				discount = promoCodeDoc.discountValue;
				// Ensure discount doesn't exceed order total
				if (discount > orderTotalBeforeDiscount) {
					discount = orderTotalBeforeDiscount;
				}
			}
			console.log(
				"Promo code applied. Code:",
				promoCode,
				"Discount:",
				discount,
				"Type:",
				promoCodeDoc.discountType,
				"Value:",
				promoCodeDoc.discountValue,
			);
		}

		const total = subtotal + delivery + fees - discount;
		console.log(
			"Total calculated:",
			total,
			"Subtotal:",
			subtotal,
			"Delivery:",
			delivery,
			"Fees:",
			fees,
			"Discount:",
			discount,
		);

		if (total < settings.minimumOrderValue) {
			console.log("Order total below minimum:", settings.minimumOrderValue);
			return res.status(400).json({
				success: false,
				message: `Mindestbestellwert beträgt ${settings.minimumOrderValue} €`,
			});
		}

		// Determine initial status and payment status based on payment method
		const isCashPayment = paymentMethod === "cash";
		const initialStatus = isCashPayment ? "confirmed" : "pending";
		const initialPaymentStatus = isCashPayment ? "ondelivery" : "pending";
		console.log(
			"Initial status:",
			initialStatus,
			"Initial payment status:",
			initialPaymentStatus,
		);

		const order = new Order({
			customer: {
				...dbCustomer.toObject(),
				address: orderAddress,
			},
			items: processedItems,
			subtotal: subtotal,

			delivery: delivery,
			fees: fees,
			discount: discount,
			total: total,
			paymentMethod,
			shelfNumber,
			notes,
			deliveryTime: orderDeliveryTime,
			status: initialStatus,
			paymentStatus: initialPaymentStatus,
			createdBy: req.user.id,
			promoCode: promoCodeDoc ? promoCodeDoc._id : null,
		});

		console.log("Saving order...");
		await order.save();
		console.log("Order saved:", order._id);

		// Update product stock
		console.log("Updating product stock...");
		for (const item of processedItems) {
			await Product.findByIdAndUpdate(item.product, {
				$inc: { stock: -item.quantity },
			});
		}
		console.log("Stock updated.");

		// Populate the created order

		const populatedOrder = await Order.findById(order._id)
			.populate("customer", "name address")
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate(
				"promoCode",
				"code companyName description discountType discountValue",
			)
			.populate(
				"items.product",
				"name barcode shelfNumber price discount tax bottlerefund",
			);
		console.log("Order populated.");

		// Set default payment URL - only for online/card payments (skip for cash)
		let paymentUrl;
		console.log("Checking payment method for Stripe:", paymentMethod);
		if (
			!isCashPayment &&
			(paymentMethod === "online" || paymentMethod === "card")
		) {
			console.log("Initiating Stripe session creation...");
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

				console.log("Stripe line items:", JSON.stringify(lineItems, null, 2));

				// Create Stripe session options
				const sessionOptions = {
					payment_method_types: ["card", "paypal"],
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
				};

				// Apply promo code discount if present
				if (populatedOrder.discount > 0 && promoCodeDoc) {
					let couponParams = {
						duration: "once",
						name: "Promo Code Discount",
					};

					if (promoCodeDoc.discountType === "percentage") {
						couponParams.percent_off = promoCodeDoc.discountValue;
					} else {
						// Cash discount
						couponParams.amount_off = Math.round(populatedOrder.discount * 100);
						couponParams.currency = "eur";
					}

					const coupon = await stripe.coupons.create(couponParams);
					sessionOptions.discounts = [{ coupon: coupon.id }];
					console.log("Created Stripe coupon for discount:", coupon.id, "Type:", promoCodeDoc.discountType);
				}

				const session = await stripe.checkout.sessions.create(sessionOptions);

				paymentUrl = session.url;
				console.log("Stripe session created. Payment URL:", paymentUrl);

				// Update order with session ID and payment URL
				order.paymentLinkId = session.id;
				order.paymentUrl = paymentUrl;
				await order.save();
				console.log("Order updated with payment info.");
			} catch (error) {
				console.error("Stripe session creation failed:", error);
			}
		}

		console.log("Sending response to client...");
		res.status(201).json({
			success: true,
			message: "Bestellung erfolgreich erstellt",
			data: populatedOrder,
			paymentUrl: paymentUrl,
		});

		// Send confirmation email to customer
		console.log("Preparing confirmation email...");
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
						populatedOrder.createdAt,
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
										2,
									)}</td>
									<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">€${
										item.totalPrice.toFixed(2) * item.quantity
									}</td>
								</tr>
							`,
								)
								.join("")}
						</tbody>
					</table>
					
					<h3>Order Summary</h3>
					<p><strong>Subtotal:</strong> €${populatedOrder.subtotal.toFixed(2)}</p>
					<p><strong>Delivery Fee:</strong> €${populatedOrder.delivery.toFixed(2)}</p>
					<p><strong>Processing Fee:</strong> €${(populatedOrder.fees || 0).toFixed(
						2,
					)}</p>
					<p><strong>Total:</strong> €${populatedOrder.total.toFixed(2)}</p>
					
					${
						populatedOrder.notes
							? `<p><strong>Notes:</strong> ${populatedOrder.notes}</p>`
							: ""
					}
					
					<p>If the order contains alcohol, the rider will need to check your identity at delivery</p>
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
						populatedOrder.createdAt,
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
										2,
									)}</td>
									<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">€${
										item.totalPrice.toFixed(2) * item.quantity
									}</td>
								</tr>
							`,
								)
								.join("")}
						</tbody>
					</table>
					
					<h3>Bestellübersicht</h3>
					<p><strong>Zwischensumme:</strong> €${populatedOrder.subtotal.toFixed(2)}</p>
					<p><strong>Liefergebühr:</strong> €${populatedOrder.delivery.toFixed(2)}</p>
					<p><strong>Bearbeitungsgebühr:</strong> €${(populatedOrder.fees || 0).toFixed(
						2,
					)}</p>
					<p><strong>Gesamt:</strong> €${populatedOrder.total.toFixed(2)}</p>
					
					${
						populatedOrder.notes
							? `<p><strong>Notizen:</strong> ${populatedOrder.notes}</p>`
							: ""
					}
					
					<p>Falls die Bestellung Alkohol enthält, muss der Fahrer Ihre Identität bei der Lieferung überprüfen.</p>
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
			console.log("Confirmation email sent.");
		} catch (emailError) {
			console.error("Error sending order confirmation email:", emailError);
			// Don't fail the order creation if email fails
		}

		// Send FCM notification to all staff users
		console.log("Sending FCM notification to staff...");
		try {
			const staffUsers = await User.find({
				role: "staff",
				fcmToken: { $ne: null },
				isActive: true,
			});
			console.log("Staff users found:", staffUsers.length);

			if (staffUsers.length > 0) {
				const staffUserIds = staffUsers.map((user) => user._id.toString());
				await NotificationService.sendToUsers(
					staffUserIds,
					"New Order Created",
					`Order #${populatedOrder._id} has been placed by ${populatedOrder.customer.name}`,
				);
				console.log(
					`✅ FCM notification sent to ${staffUsers.length} staff users for order ${populatedOrder._id}`,
				);
			} else {
				console.log(`⚠️ No active staff users with FCM tokens found`);
			}
		} catch (fcmError) {
			console.error("Error sending FCM notification to staff:", fcmError);
			// Don't fail the order creation if FCM fails
		}
	} catch (error) {
		console.error("Error creating order:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Erstellen der Bestellung",
			error: error.message,
		});
	}
	console.log("createOrder finished.");
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
				message: "Ungültige Bestellungs-ID",
			});
		}

		const order = await Order.findById(id);
		if (!order) {
			return res.status(404).json({
				success: false,
				message: "Bestellung nicht gefunden",
			});
		}

		// Check if order can be modified
		if (order.status === "cancelled") {
			return res.status(400).json({
				success: false,
				message: "Stornierte Bestellungen können nicht geändert werden",
			});
		}

		// Check if order can be modified
		if (order.status === "delivered" && req.user.role !== "admin") {
			return res.status(400).json({
				success: false,
				message: "Gelieferte Bestellungen können nicht geändert werden",
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
				"name barcode shelfNumber price discount tax bottlerefund picture",
			);

		// Send delivery confirmation email
		if (status === "delivered") {
			try {
				const emailSubject = `Order Delivered - Order #${updatedOrder._id}`;

				let promoCodeHtml = "";
				if (updatedOrder.total > 100) {
					promoCodeHtml = `
						<div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-left: 4px solid #28a745; border-radius: 4px;">
							<h3 style="color: #28a745; margin-top: 0;">Congratulations! 🎉</h3>
							<p>Since your order was over €100, you have won a special promo code for your next purchase!</p>
							<p>We will send you the code in a separate email shortly.</p>
							
							<hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
							
							<h3 style="color: #28a745; margin-top: 0;">Herzlichen Glückwunsch! 🎉</h3>
							<p>Da Ihre Bestellung über 100 € lag, haben Sie einen speziellen Gutscheincode für Ihren nächsten Einkauf gewonnen!</p>
							<p>Wir senden Ihnen den Code in Kürze in einer separaten E-Mail zu.</p>
						</div>
					`;
				}

				const emailHtml = `
					<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
						<h2 style="color: #333; text-align: center;">Order Delivered</h2>
						<p>Dear ${updatedOrder.customer.name},</p>
						<p>Good news! Your order has been delivered successfully.</p>
						
						${promoCodeHtml}

						<h3>Order Details</h3>
						<p><strong>Order ID:</strong> ${updatedOrder._id}</p>
						<p><strong>Delivery Date:</strong> ${new Date().toLocaleDateString()}</p>
						
						<p>We hope you enjoy your purchase!</p>
						
						<p>If you have any feedback or issues, please contact us at info@frischlyshop.com.</p>
						
						<p>Thank you for choosing Frischly!</p>
						
						<p>Best regards,<br>The Frischly Team</p>
						
						<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
						
						<h2 style="color: #333; text-align: center;">Bestellung Geliefert</h2>
						<p>Liebe/r ${updatedOrder.customer.name},</p>
						<p>Gute Nachrichten! Ihre Bestellung wurde erfolgreich zugestellt.</p>
						
						<h3>Bestelldetails</h3>
						<p><strong>Bestell-ID:</strong> ${updatedOrder._id}</p>
						<p><strong>Lieferdatum:</strong> ${new Date().toLocaleDateString("de-DE")}</p>
						
						<p>Wir hoffen, Sie haben Freude an Ihrem Einkauf!</p>
						
						<p>Bei Fragen oder Problemen kontaktieren Sie uns bitte unter info@frischlyshop.com.</p>
						
						<p>Vielen Dank, dass Sie sich für Frischly entschieden haben!</p>
						
						<p>Mit freundlichen Grüßen,<br>Das Frischly Team</p>
						
						<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
						<p style="font-size: 12px; color: #666; text-align: center;">
							Dies ist eine automatische E-Mail. Bitte antworten Sie nicht auf diese Nachricht.
						</p>
					</div>
				`;

				await sendEmail({
					to: updatedOrder.customer.email,
					subject: emailSubject,
					html: emailHtml,
				});
			} catch (emailError) {
				console.error("Error sending delivery confirmation email:", emailError);
			}
		}

		res.json({
			success: true,
			message: "Bestellung erfolgreich aktualisiert",
			data: updatedOrder,
		});
	} catch (error) {
		console.error("Error updating order:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Aktualisieren der Bestellung",
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
				message: "Ungültige Bestellungs-ID",
			});
		}

		const order = await Order.findByIdAndUpdate(
			id,
			{ isActive: false, updatedBy: req.user.id },
			{ new: true },
		);

		if (!order) {
			return res.status(404).json({
				success: false,
				message: "Bestellung nicht gefunden",
			});
		}

		res.json({
			success: true,
			message: "Bestellung erfolgreich gelöscht",
			data: order,
		});
	} catch (error) {
		console.error("Error deleting order:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Löschen der Bestellung",
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
			message: "Fehler beim Abrufen der Bestellstatistiken",
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
			`Step 1: Request made by user ID: ${req.user?.id || "Unknown"}`,
		);

		// Step 2: Validate order ID
		console.log("Step 2: Validating order ID format...");
		if (!mongoose.Types.ObjectId.isValid(id)) {
			console.log("❌ Step 2: Invalid order ID format");
			return res.status(400).json({
				success: false,
				message: "Ungültige Bestellungs-ID",
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
				message: "Bestellung nicht gefunden",
			});
		}
		console.log(
			`✅ Step 3: Order found - Status: ${order.status}, Payment: ${order.paymentStatus}, Total: €${order.total}`,
		);

		// Step 4: Check if order is already cancelled
		console.log("Step 4: Checking if order is already cancelled...");
		if (order.status === "cancelled") {
			console.log("❌ Step 4: Order is already cancelled");
			return res.status(400).json({
				success: false,
				message: "Bestellung ist bereits storniert",
			});
		}
		console.log("✅ Step 4: Order is not already cancelled");

		// Step 5: Check if order can be cancelled
		console.log("Step 5: Checking if order can be cancelled...");
		if (order.status === "delivered") {
			console.log(
				`❌ Step 5: Cannot cancel order with status '${order.status}'`,
			);
			return res.status(400).json({
				success: false,
				message: "Gelieferte Bestellung kann nicht storniert werden",
			});
		}
		console.log("✅ Step 5: Order can be cancelled");

		// Handle payment cancellation based on payment method
		if (order.paymentMethod === "cash") {
			// Cash on delivery orders - no Stripe handling needed
			console.log("Step 5.5: Handling cash on delivery order cancellation...");
			order.status = "cancelled";
			order.paymentStatus = "cancelled";
			order.notes = `${
				order.notes || ""
			}\nCash on delivery order cancelled.`.trim();
			console.log("✅ Step 5.5: Cash order cancellation handled");
		} else if (
			order.paymentLinkId &&
			(order.paymentMethod === "online" || order.paymentMethod === "card")
		) {
			// Handle Stripe Payment (Refund or Expire Link)
			try {
				if (order.paymentStatus === "paid") {
					console.log("Processing refund for paid order...");
					// Retrieve session to get payment_intent
					const session = await stripe.checkout.sessions.retrieve(
						order.paymentLinkId,
					);
					if (session.payment_intent) {
						// Refund subtotal + delivery (excluding processing fees)
						// If order is OnTheWay, do not refund delivery fee
						let refundValue = order.subtotal;
						if (order.status !== "OnTheWay") {
							refundValue += order.delivery || 0;
						}

						const refundAmount = Math.round(refundValue * 100);

						await stripe.refunds.create({
							payment_intent: session.payment_intent,
							amount: refundAmount,
							reason: "requested_by_customer",
						});
						console.log(
							`✅ Refund processed successfully: €${refundValue.toFixed(2)}`,
						);
						order.paymentStatus = "refunded";
						order.status = "cancelled";
						// Send refund email
						try {
							const emailSubject = `Refund Processed - Order #${order._id}`;
							const refundAmountEur = refundValue.toFixed(2);
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
		} else if (
			order.paymentMethod === "online" ||
			order.paymentMethod === "card"
		) {
			// Online/card order without payment link - just cancel
			console.log(
				"Step 5.5: Online/card order without payment link, cancelling...",
			);
			order.status = "cancelled";
			order.paymentStatus = "cancelled";
			console.log("✅ Step 5.5: Order cancellation status updated");
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
				`   - Restored ${item.quantity} units of product ${item.product}`,
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
				"name barcode  price discount tax bottlerefund picture",
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
				"name barcode shelfNumber price discount tax bottlerefund picture",
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
				"name barcode shelfNumber price discount tax bottlerefund picture",
			);

		// Send delivery confirmation email
		if (status === "delivered" && previousStatus !== "delivered") {
			try {
				const emailSubject = `Order Delivered - Order #${updatedOrder._id}`;

				let promoCodeHtml = "";
				if (updatedOrder.total > 100) {
					promoCodeHtml = `
						<div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-left: 4px solid #28a745; border-radius: 4px;">
							<h3 style="color: #28a745; margin-top: 0;">Congratulations! 🎉</h3>
							<p>Since your order was over €100, you have won a special promo code for your next purchase!</p>
							<p>We will send you the code in a separate email shortly.</p>
							
							<hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
							
							<h3 style="color: #28a745; margin-top: 0;">Herzlichen Glückwunsch! 🎉</h3>
							<p>Da Ihre Bestellung über 100 € lag, haben Sie einen speziellen Gutscheincode für Ihren nächsten Einkauf gewonnen!</p>
							<p>Wir senden Ihnen den Code in Kürze in einer separaten E-Mail zu.</p>
						</div>
					`;
				}

				const emailHtml = `
					<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
						<h2 style="color: #333; text-align: center;">Order Delivered</h2>
						<p>Dear ${updatedOrder.customer.name},</p>
						<p>Good news! Your order has been delivered successfully.</p>
						
						${promoCodeHtml}

						<h3>Order Details</h3>
						<p><strong>Order ID:</strong> ${updatedOrder._id}</p>
						<p><strong>Delivery Date:</strong> ${new Date().toLocaleDateString()}</p>
						
						<p>We hope you enjoy your purchase!</p>
						
						<p>If you have any feedback or issues, please contact us at info@frischlyshop.com.</p>
						
						<p>Thank you for choosing Frischly!</p>
						
						<p>Best regards,<br>The Frischly Team</p>
						
						<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
						
						<h2 style="color: #333; text-align: center;">Bestellung Geliefert</h2>
						<p>Liebe/r ${updatedOrder.customer.name},</p>
						<p>Gute Nachrichten! Ihre Bestellung wurde erfolgreich zugestellt.</p>
						
						<h3>Bestelldetails</h3>
						<p><strong>Bestell-ID:</strong> ${updatedOrder._id}</p>
						<p><strong>Lieferdatum:</strong> ${new Date().toLocaleDateString("de-DE")}</p>
						
						<p>Wir hoffen, Sie haben Freude an Ihrem Einkauf!</p>
						
						<p>Bei Fragen oder Problemen kontaktieren Sie uns bitte unter info@frischlyshop.com.</p>
						
						<p>Vielen Dank, dass Sie sich für Frischly entschieden haben!</p>
						
						<p>Mit freundlichen Grüßen,<br>Das Frischly Team</p>
						
						<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
						<p style="font-size: 12px; color: #666; text-align: center;">
							Dies ist eine automatische E-Mail. Bitte antworten Sie nicht auf diese Nachricht.
						</p>
					</div>
				`;

				await sendEmail({
					to: updatedOrder.customer.email,
					subject: emailSubject,
					html: emailHtml,
				});
			} catch (emailError) {
				console.error("Error sending delivery confirmation email:", emailError);
			}
		}

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
// @desc    Get product sales statistics with time filtering and pagination
// @route   GET /api/orders/sales-stats
// @access  Private (Admin, Manager)
exports.getProductSalesStats = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 20,
			dateFrom,
			dateTo,
			timeRange, // 'week', 'month', 'year', 'custom'
			sortBy = "totalQuantitySold",
			sortOrder = "desc",
		} = req.query;

		const pageNum = parseInt(page);
		const limitNum = parseInt(limit);
		const skip = (pageNum - 1) * limitNum;

		// Build date filter based on timeRange or custom dates
		let dateFilter = {};
		const now = new Date();

		if (timeRange === "week") {
			const weekAgo = new Date(now);
			weekAgo.setDate(weekAgo.getDate() - 7);
			dateFilter = { $gte: weekAgo, $lte: now };
		} else if (timeRange === "month") {
			const monthAgo = new Date(now);
			monthAgo.setMonth(monthAgo.getMonth() - 1);
			dateFilter = { $gte: monthAgo, $lte: now };
		} else if (timeRange === "year") {
			const yearAgo = new Date(now);
			yearAgo.setFullYear(yearAgo.getFullYear() - 1);
			dateFilter = { $gte: yearAgo, $lte: now };
		} else if (dateFrom || dateTo) {
			if (dateFrom) {
				const fromDate = new Date(dateFrom);
				if (!isNaN(fromDate.getTime())) {
					dateFilter.$gte = fromDate;
				}
			}
			if (dateTo) {
				const toDate = new Date(dateTo);
				if (!isNaN(toDate.getTime())) {
					toDate.setHours(23, 59, 59, 999);
					dateFilter.$lte = toDate;
				}
			}
		}

		// Build match stage for aggregation
		const matchStage = {
			isActive: true,
			status: "delivered", // Include only delivered orders
		};

		if (Object.keys(dateFilter).length > 0) {
			matchStage.createdAt = dateFilter;
		}

		// Aggregation pipeline to get product sales statistics
		const pipeline = [
			{ $match: matchStage },
			{ $unwind: "$items" },
			{
				$lookup: {
					from: "products",
					localField: "items.product",
					foreignField: "_id",
					as: "productDetails",
				},
			},
			{
				$unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true },
			},
			{
				$group: {
					_id: "$items.product",
					productName: { $first: "$productDetails.name" },
					productBarcode: { $first: "$productDetails.barcode" },
					productCategory: { $first: "$productDetails.category" },
					productPrice: { $first: "$productDetails.price" },
					productPicture: { $first: "$productDetails.picture" },
					productIsActive: { $first: "$productDetails.isActive" },
					totalQuantitySold: { $sum: "$items.quantity" },
					totalRevenue: { $sum: "$items.totalPrice" },
					orderCount: { $sum: 1 },
					averageQuantityPerOrder: { $avg: "$items.quantity" },
					firstSaleDate: { $min: "$createdAt" },
					lastSaleDate: { $max: "$createdAt" },
				},
			},
			{
				$project: {
					_id: 1,
					productName: { $ifNull: ["$productName", "Unknown Product"] },
					productBarcode: { $ifNull: ["$productBarcode", "N/A"] },
					productCategory: 1,
					productPrice: 1,
					productPicture: 1,
					productIsActive: 1,
					totalQuantitySold: 1,
					totalRevenue: { $round: ["$totalRevenue", 2] },
					orderCount: 1,
					averageQuantityPerOrder: { $round: ["$averageQuantityPerOrder", 2] },
					averageRevenuePerOrder: {
						$round: [{ $divide: ["$totalRevenue", "$orderCount"] }, 2],
					},
					firstSaleDate: 1,
					lastSaleDate: 1,
				},
			},
		];

		// Sort stage
		const sortStage = {};
		sortStage[sortBy] = sortOrder === "desc" ? -1 : 1;
		pipeline.push({ $sort: sortStage });

		// Get total count for pagination
		const countPipeline = [...pipeline];
		countPipeline.push({ $count: "total" });
		const countResult = await Order.aggregate(countPipeline);
		const totalProducts = countResult[0]?.total || 0;
		const totalPages = Math.ceil(totalProducts / limitNum);

		// Add pagination
		pipeline.push({ $skip: skip });
		pipeline.push({ $limit: limitNum });

		const productSales = await Order.aggregate(pipeline);

		// Get summary statistics
		const summaryPipeline = [
			{ $match: matchStage },
			{ $unwind: "$items" },
			{
				$group: {
					_id: null,
					totalRevenue: { $sum: "$items.totalPrice" },
					totalQuantitySold: { $sum: "$items.quantity" },
					totalOrders: { $addToSet: "$_id" },
					uniqueProducts: { $addToSet: "$items.product" },
				},
			},
			{
				$project: {
					_id: 0,
					totalRevenue: { $round: ["$totalRevenue", 2] },
					totalQuantitySold: 1,
					totalOrders: { $size: "$totalOrders" },
					uniqueProducts: { $size: "$uniqueProducts" },
				},
			},
		];

		const summaryResult = await Order.aggregate(summaryPipeline);
		const summary = summaryResult[0] || {
			totalRevenue: 0,
			totalQuantitySold: 0,
			totalOrders: 0,
			uniqueProducts: 0,
		};

		res.json({
			success: true,
			data: productSales,
			summary,
			pagination: {
				currentPage: pageNum,
				totalPages,
				totalProducts,
				hasNextPage: pageNum < totalPages,
				hasPrevPage: pageNum > 1,
				limit: limitNum,
			},
			filters: {
				timeRange: timeRange || "custom",
				dateFrom: dateFilter.$gte || null,
				dateTo: dateFilter.$lte || null,
			},
		});
	} catch (error) {
		console.error("Error fetching product sales statistics:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching product sales statistics",
			error: error.message,
		});
	}
};

// @desc    Get products with no sales in the selected time period
// @route   GET /api/orders/unsold-products
// @access  Private (Admin, Manager)
exports.getUnsoldProducts = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 25,
			dateFrom,
			dateTo,
			timeRange, // 'week', 'month', 'year', 'custom'
		} = req.query;

		const pageNum = parseInt(page);
		const limitNum = parseInt(limit);
		const skip = (pageNum - 1) * limitNum;

		// Build date filter based on timeRange or custom dates
		let dateFilter = {};
		const now = new Date();

		if (timeRange === "week") {
			const weekAgo = new Date(now);
			weekAgo.setDate(weekAgo.getDate() - 7);
			dateFilter = { $gte: weekAgo, $lte: now };
		} else if (timeRange === "month") {
			const monthAgo = new Date(now);
			monthAgo.setMonth(monthAgo.getMonth() - 1);
			dateFilter = { $gte: monthAgo, $lte: now };
		} else if (timeRange === "year") {
			const yearAgo = new Date(now);
			yearAgo.setFullYear(yearAgo.getFullYear() - 1);
			dateFilter = { $gte: yearAgo, $lte: now };
		} else if (dateFrom || dateTo) {
			if (dateFrom) {
				const fromDate = new Date(dateFrom);
				if (!isNaN(fromDate.getTime())) {
					dateFilter.$gte = fromDate;
				}
			}
			if (dateTo) {
				const toDate = new Date(dateTo);
				if (!isNaN(toDate.getTime())) {
					toDate.setHours(23, 59, 59, 999);
					dateFilter.$lte = toDate;
				}
			}
		}

		// Build match stage for orders in the time period
		const matchStage = {
			isActive: true,
			status: "delivered",
		};

		if (Object.keys(dateFilter).length > 0) {
			matchStage.createdAt = dateFilter;
		}

		// Get all product IDs that have sales in the time period
		const soldProductsPipeline = [
			{ $match: matchStage },
			{ $unwind: "$items" },
			{
				$group: {
					_id: "$items.product",
				},
			},
		];

		const soldProductsResult = await Order.aggregate(soldProductsPipeline);
		const soldProductIds = soldProductsResult.map((item) => item._id);

		// Get all active products that are NOT in the sold products list
		const unsoldFilter = {
			isActive: true,
		};

		if (soldProductIds.length > 0) {
			unsoldFilter._id = { $nin: soldProductIds };
		}

		// Get total count
		const totalProducts = await Product.countDocuments(unsoldFilter);
		const totalPages = Math.ceil(totalProducts / limitNum);

		// Get unsold products with pagination
		const unsoldProducts = await Product.find(unsoldFilter)
			.populate("subcategory", "name")
			.select("name barcode stock price isActive createdAt subcategory")
			.sort({ stock: -1, name: 1 })
			.skip(skip)
			.limit(limitNum)
			.lean();

		// Get category names for the products
		const Subcategory = require("../models/Subcategory");
		const Category = require("../models/Category");

		const productsWithCategory = await Promise.all(
			unsoldProducts.map(async (product) => {
				let categoryName = "N/A";
				if (product.subcategory) {
					const subcategory = await Subcategory.findById(
						product.subcategory._id || product.subcategory,
					).populate("parentCategory", "name");
					if (subcategory && subcategory.parentCategory) {
						categoryName = subcategory.parentCategory.name;
					}
				}
				return {
					...product,
					categoryName,
				};
			}),
		);

		res.json({
			success: true,
			data: productsWithCategory,
			pagination: {
				currentPage: pageNum,
				totalPages,
				totalProducts,
				hasNextPage: pageNum < totalPages,
				hasPrevPage: pageNum > 1,
				limit: limitNum,
			},
			filters: {
				timeRange: timeRange || "custom",
				dateFrom: dateFilter.$gte || null,
				dateTo: dateFilter.$lte || null,
			},
		});
	} catch (error) {
		console.error("Error fetching unsold products:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching unsold products",
			error: error.message,
		});
	}
};

// @access  Public
exports.verifyStripePayment = async (req, res) => {
	try {
		const { sessionId, orderId } = req.body;
		console.log(
			"Verifying Stripe payment. Session ID:",
			sessionId,
			"Order ID:",
			orderId,
		);

		if (!sessionId || !orderId) {
			console.log("Missing sessionId or orderId in request");
			return res.status(400).json({
				success: false,
				message: "Session ID and Order ID are required",
			});
		}

		console.log("Retrieving Stripe session...");
		const session = await stripe.checkout.sessions.retrieve(sessionId);

		if (!session) {
			console.log("Stripe session not found for ID:", sessionId);
			return res.status(404).json({
				success: false,
				message: "Session not found",
			});
		}

		console.log("Stripe session payment status:", session.payment_status);
		if (session.payment_status === "paid") {
			console.log("Payment is paid. Finding order...");
			const order = await Order.findById(orderId);
			if (!order) {
				console.log("Order not found for ID:", orderId);
				return res.status(404).json({
					success: false,
					message: "Order not found",
				});
			}

			if (order.paymentStatus !== "paid") {
				console.log(
					"Updating order payment status to paid and status to confirmed",
				);
				order.paymentStatus = "paid";
				order.status = "confirmed"; // Update order status upon payment
				order.paymentMethod = "online"; // Ensure it's marked as online
				await order.save();
				console.log("Order updated successfully");
			} else {
				console.log("Order already marked as paid");
			}

			console.log("Payment verification successful");
			return res.json({
				success: true,
				message: "Payment verified successfully",
			});
		} else {
			console.log("Payment not completed. Status:", session.payment_status);
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

// @desc    Get order counts per customer
// @route   GET /api/orders/customer-order-counts
// @access  Private (Admin, Manager)
exports.getCustomerOrderCounts = async (req, res) => {
	try {
		const orderCounts = await Order.aggregate([
			{
				$match: { isActive: true },
			},
			{
				$group: {
					_id: "$customer.email",
					orderCount: { $sum: 1 },
				},
			},
			{
				$project: {
					email: "$_id",
					orderCount: 1,
					_id: 0,
				},
			},
		]);

		res.json({
			success: true,
			data: orderCounts,
		});
	} catch (error) {
		console.error("Error getting customer order counts:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving customer order counts",
			error: error.message,
		});
	}
};
