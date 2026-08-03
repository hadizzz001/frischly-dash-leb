const Order = require("../models/Order");
const Product = require("../models/Product");
const Rider = require("../models/Rider");
const PromoCode = require("../models/PromoCode");
const MarketPromoCode = require("../models/MarketPromoCode");
const mongoose = require("mongoose");
const Zone = require("../models/Zone");
const User = require("../models/User");
const Setting = require("../models/Setting");
const MarketSetting = require("../models/MarketSetting");
const sendEmail = require("../utils/sendEmail");
const {
	orderConfirmationEmail,
	orderDeliveredEmail,
	refundProcessedEmail,
} = require("../utils/emailTemplates");
const NotificationService = require("../services/notifications");
const { notifyCustomerOrderStatus } = require("../services/orderStatusNotification");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { sendResponse, sendError, sendSuccess, sendServerError } = require("../utils/apiResponse");
const { escapeRegex } = require("../utils/sanitize");

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

		// Riders / market drivers only ever see orders assigned to them. We resolve
		// their Rider document (assignedRider references Rider, not User) and scope
		// to it. If they have no Rider doc, return nothing.
		if (req.user.role === "rider" || req.user.role === "market_driver") {
			const myRider = await Rider.findOne({ user: req.user.id }).select("_id");
			filter.assignedRider = myRider ? myRider._id : null;
		}

		// Market admins only see orders from their market
		if (req.user.role === "market") {
			filter.market = req.user.marketId;
		} else if (
			req.query.market !== undefined &&
			req.query.market !== "" &&
			req.query.market !== "all"
		) {
			// Admin/manager/staff targeting a specific market via query param.
			// The Market Management → Orders tab (market-orders.html) uses
			// ?market=<id> to show a single market's orders.
			const m = req.query.market;
			if (m === "none" || m === "null") {
				filter.market = null;
			} else if (mongoose.Types.ObjectId.isValid(m)) {
				filter.market = m;
			}
		} else if (["admin", "manager", "staff"].includes(req.user.role)) {
			// Main Orders page: show ONLY main-store orders. Market orders are
			// not listed here — they are managed per-market on the Market
			// Management → Orders tab. Pass ?market=all to override.
			filter.market = null;
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
			.populate("market", "name username location logo")
			.populate(
				"items.product",
				"name barcode shelfNumber price discount tax bottlerefund picture market",
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

		const ras = {
			orders,
			pagination: {
				currentPage: pageNum,
				totalPages,
				totalOrders,
				hasNextPage: pageNum < totalPages,
				hasPrevPage: pageNum > 1,
			},
		};

		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Error fetching orders:", error);
		sendServerError(res, error, "Error fetching orders");
	}
};

// @desc    Get all orders excluding pending, confirmed, and processing
// @route   GET /api/orders/runningOrder
// @access  Private
// @desc    Get the live location of the rider assigned to an order
// @route   GET /api/orders/:id/rider-location
// @access  Private (order owner / admin / manager / staff / market / rider)
exports.getOrderRiderLocation = async (req, res) => {
	try {
		const order = await Order.findById(req.params.id)
			.select("customer assignedRider status market orderNumber")
			.populate({
				path: "assignedRider",
				select: "currentLocation status vehicleType vehicleNumber zones user",
				populate: { path: "user", select: "name phoneNumber address" },
			});

		if (!order) {
			return sendError(res, 404, "Order not found");
		}

		// Authorization: the customer who owns the order, privileged staff,
		// or the market that owns the order may view the rider location.
		const role = req.user.role;
		const isPrivileged = ["admin", "manager", "staff"].includes(role);
		const isOwner =
			!!order.customer &&
			!!order.customer.email &&
			!!req.user.email &&
			order.customer.email.toLowerCase() === req.user.email.toLowerCase();
		const isMarketOwner =
			role === "market" &&
			!!order.market &&
			String(order.market) === String(req.user.marketId);
		const isAssignedRider = role === "rider" || role === "market_driver";

		if (!isPrivileged && !isOwner && !isMarketOwner && !isAssignedRider) {
			return sendError(res, 403, "Not authorized to view this order");
		}

		if (!order.assignedRider) {
			const ras = { hasRider: false, hasLocation: false, orderStatus: order.status };
			return sendResponse(res, 200, true, "Success", ras);
		}

		const rider = order.assignedRider;
		const loc = rider.currentLocation || {};
		const hasLocation =
			typeof loc.latitude === "number" &&
			typeof loc.longitude === "number";

		const ras = {
			hasRider: true,
			hasLocation,
			latitude: hasLocation ? loc.latitude : null,
			longitude: hasLocation ? loc.longitude : null,
			lastUpdated: loc.lastUpdated || null,
			riderStatus: rider.status || null,
			orderStatus: order.status,
			rider: {
				name: (rider.user && rider.user.name) || null,
				phone: (rider.user && rider.user.phoneNumber) || null,
				vehicleType: rider.vehicleType || null,
				vehicleNumber: rider.vehicleNumber || null,
			},
			// Fallback location hints (used when there is no live GPS yet) so
			// the client can geocode an approximate position, exactly like the
			// admin riderslocation dashboard does.
			address: (rider.user && rider.user.address) || null,
			zones: Array.isArray(rider.zones) ? rider.zones : [],
		};

		return sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Error getting order rider location:", error);
		return sendServerError(res, error, "Error getting rider location");
	}
};

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
				const zoneNames = rider.zones.map(
					(zoneName) => new RegExp(`^${escapeRegex(zoneName)}$`, "i")
				);
				filter["customer.address.city"] = { $in: zoneNames };
			} else {
				// If rider has no zones assigned, return no orders
				filter["customer.address.city"] = null;
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

		const ras = {
			orders,
			pagination: {
				currentPage: pageNum,
				totalPages,
				totalOrders,
				hasNextPage: pageNum < totalPages,
				hasPrevPage: pageNum > 1,
			},
		};

		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Error fetching completed orders:", error);
		sendServerError(res, error, "Error fetching completed orders");
	}
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid order ID");
		}

		const order = await Order.findById(id)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate("assignedRider", "name email phone")
			.populate("market", "name username location logo")
			.populate(
				"items.product",
				"name barcode shelfNumber price discount tax bottlerefund picture market",
			);

		if (!order) {
			return sendError(res, 404, "Order not found");
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
			return sendError(res, 403, "You are not authorized to view this order");
		}

		// Market admins can only view their own market's orders
		if (
			req.user.role === "market" &&
			(!order.market ||
				String(order.market._id || order.market) !==
					String(req.user.marketId))
		) {
			return sendError(res, 403, "You are not authorized to view this order");
		}

		const ras = { order };

		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Error fetching order:", error);
		sendServerError(res, error, "Error fetching order");
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
			return sendError(res, 400, settings.maintenanceMessage ||
					"Order creation is currently disabled.");
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

		// Validate required fields — a customer needs a name and a valid
		// Lebanese phone number (7 or 8 local digits, country code / leading
		// zero optional) to place an order; delivery riders need a working
		// contact number, so email alone is no longer sufficient here.
		const dbCustomer = await User.findById(customer.id);
		console.log("Customer found:", dbCustomer ? dbCustomer._id : "Not found");
		const customerPhoneDigits = String(dbCustomer?.phoneNumber || "")
			.replace(/\D/g, "")
			.replace(/^00961/, "")
			.replace(/^961/, "")
			.replace(/^0+/, "");
		const hasValidPhone = /^\d{7,8}$/.test(customerPhoneDigits);
		if (!dbCustomer || !dbCustomer.name || !dbCustomer.id || !hasValidPhone) {
			console.log("Customer validation failed. Missing required fields.");
			return sendError(res, 400, "A valid phone number (7 or 8 digits) is required to place an order");
		}

		// Handle new address if provided
		const orderAddress = address || customer.address || dbCustomer.address;
		console.log("Order address determined:", orderAddress);

		if (!items || !Array.isArray(items) || items.length === 0) {
			console.log("No items provided in order.");
			return sendError(res, 400, "Order must contain at least one item");
		}

		// Validate and process items
		const processedItems = [];
		let subtotal = 0;
		console.log("Processing items...");

		for (const item of items) {
			console.log("Processing item:", item.product);
			if (!item.product || !item.quantity) {
				console.log("Invalid item structure:", item);
				return sendError(res, 400, "Jeder Artikel muss Produkt und Menge haben");
			}

			// Verify product exists
			const product = await Product.findById(item.product);

			if (!product) {
				console.log("Product not found:", item.product);
				return sendError(res, 400, `Product with ID ${item.product} not found`);
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
				return sendError(res, 400, `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`);
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
		console.log("Calculating delivery fee. City:", orderAddress?.city);
		if (orderAddress && orderAddress.city) {
			try {
				const zone = await Zone.findByName(orderAddress.city);
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

// Derive the order's market from its items. If all items belong to
		// the same market the order is associated with that market;
		// mixed/main-store orders have market = null. (Used to scope promos.)
		let orderMarket = null;
		{
			const marketIds = new Set(
				processedItems
					.map((it) =>
						it.product && it.product.market
							? String(it.product.market)
							: null,
					)
					.filter(Boolean),
			);
			if (marketIds.size === 1) {
				orderMarket = [...marketIds][0];
			}
		}

		// Validate and calculate promo code discount. A market order can only
		// use that market's promo codes; a main-store order can only use admin
		// (own-company) promo codes.
		let discount = 0;
		let promoCodeDoc = null;
		let marketPromoDoc = null;
		if (promoCode) {
			console.log(
				"Validating promo code:",
				promoCode,
				"orderMarket:",
				orderMarket,
			);
			const orderTotalBeforeDiscount = subtotal + delivery + fees;

			// Try an admin own-company promo first.
			promoCodeDoc = await PromoCode.findById(promoCode);

			if (promoCodeDoc) {
				if (!promoCodeDoc.isActive || !promoCodeDoc.isFromOwnCompany) {
					return sendError(res, 400, "Invalid or inactive promo code");
				}
				// Admin promo codes only apply to main-store orders.
				if (orderMarket) {
					return sendError(res, 400, "This promo code is not valid for this market");
				}
				if (promoCodeDoc.discountType === "percentage") {
					discount =
						(orderTotalBeforeDiscount * promoCodeDoc.discountValue) / 100;
				} else if (promoCodeDoc.discountType === "cash") {
					discount = promoCodeDoc.discountValue;
					if (discount > orderTotalBeforeDiscount) {
						discount = orderTotalBeforeDiscount;
					}
				}
			} else {
				// Otherwise try a market promo code.
				marketPromoDoc = await MarketPromoCode.findById(promoCode);

				if (!marketPromoDoc || !marketPromoDoc.isActive) {
					return sendError(res, 400, "Invalid or inactive promo code");
				}
				// Must belong to the same market the order is placed from.
				if (
					!orderMarket ||
					String(marketPromoDoc.market) !== String(orderMarket)
				) {
					return sendError(res, 400, "This promo code is not valid for this market");
				}
				const now = new Date();
				if (marketPromoDoc.startsAt && now < marketPromoDoc.startsAt) {
					return sendError(res, 400, "This promo code is not active yet");
				}
				if (marketPromoDoc.expiresAt && now > marketPromoDoc.expiresAt) {
					return sendError(res, 400, "This promo code has expired");
				}
				if (
					marketPromoDoc.usageLimit > 0 &&
					marketPromoDoc.usageCount >= marketPromoDoc.usageLimit
				) {
					return sendError(res, 400, "This promo code has reached its usage limit");
				}
				const minRequired =
					marketPromoDoc.minOrderTotal ||
					(marketPromoDoc.triggerCondition &&
						marketPromoDoc.triggerCondition.minOrderTotal) ||
					0;
				if (minRequired && orderTotalBeforeDiscount < minRequired) {
					return sendError(res, 400, `Minimum order total for this promo code is ${minRequired}`);
				}
				if (marketPromoDoc.discountType === "percentage") {
					discount =
						(orderTotalBeforeDiscount * marketPromoDoc.discountValue) / 100;
				} else if (marketPromoDoc.discountType === "cash") {
					discount = marketPromoDoc.discountValue;
					if (discount > orderTotalBeforeDiscount) {
						discount = orderTotalBeforeDiscount;
					}
				}
			}
			console.log("Promo code discount applied:", discount);
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

		// Market orders enforce that market's OWN minimum order value
		// (MarketSetting.minOrderAmount, set on the market dashboard's
		// Settings page) instead of the global admin minimumOrderValue —
		// previously this always checked the global value even for market
		// orders, so a market's own minimum was silently ignored.
		let minimumOrderValue = settings.minimumOrderValue;
		if (orderMarket) {
			const marketSettings = await MarketSetting.findOne({ market: orderMarket }).lean();
			if (marketSettings && marketSettings.minOrderAmount > 0) {
				minimumOrderValue = marketSettings.minOrderAmount;
			}
		}
		if (total < minimumOrderValue) {
			console.log("Order total below minimum:", minimumOrderValue);
			return sendError(res, 400, `Minimum order value is $${minimumOrderValue}`);
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
			marketPromoCode: marketPromoDoc ? marketPromoDoc._id : null,
			market: orderMarket,
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

		// Increment market promo code usage count if one was applied.
		if (marketPromoDoc) {
			await MarketPromoCode.findByIdAndUpdate(marketPromoDoc._id, {
				$inc: { usageCount: 1 },
			});
		}

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
						currency: "usd",
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
							currency: "usd",
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
							currency: "usd",
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
						process.env.SERVER_URL || "https://freshlylb.onrender.com"
					}/payment/stripe-success.html?session_id={CHECKOUT_SESSION_ID}&order=${
						populatedOrder._id
					}`,
					cancel_url: `${
						process.env.SERVER_URL || "https://freshlylb.onrender.com"
					}/payment/cancel.html?order=${populatedOrder._id}`,
					client_reference_id: populatedOrder._id.toString(),
				};

				// Only pass customer_email to Stripe when the customer actually has
				// one on file — email is optional at registration, and Stripe
				// rejects invalid/empty email values if sent explicitly.
				if (populatedOrder.customer?.email) {
					sessionOptions.customer_email = populatedOrder.customer.email;
				}

				// Apply promo code discount if present (admin or market promo)
				const appliedPromoDoc = promoCodeDoc || marketPromoDoc;
				if (populatedOrder.discount > 0 && appliedPromoDoc) {
					let couponParams = {
						duration: "once",
						name: "Promo Code Discount",
					};

					if (appliedPromoDoc.discountType === "percentage") {
						couponParams.percent_off = appliedPromoDoc.discountValue;
					} else {
						// Cash discount
						couponParams.amount_off = Math.round(populatedOrder.discount * 100);
						couponParams.currency = "usd";
					}

					const coupon = await stripe.coupons.create(couponParams);
					sessionOptions.discounts = [{ coupon: coupon.id }];
					console.log("Created Stripe coupon for discount:", coupon.id, "Type:", appliedPromoDoc.discountType);
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
		const ras = { populatedOrder, paymentUrl: paymentUrl };
		sendResponse(res, 201, true, "Order created successfully", ras);

		// Send confirmation email to customer
		console.log("Preparing confirmation email...");
		try {
			const { subject: emailSubject, html: emailHtml } = orderConfirmationEmail({
				order: populatedOrder,
				paymentUrl,
			});

			if (populatedOrder.customer?.email) {
				await sendEmail({
					to: populatedOrder.customer.email,
					subject: emailSubject,
					html: emailHtml,
				});
				console.log("Confirmation email sent.");
			} else {
				console.log("Skipping confirmation email — customer has no email on file.");
			}
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
		sendServerError(res, error, "Error creating order");
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
			return sendError(res, 400, "Invalid order ID");
		}

		const order = await Order.findById(id);
		if (!order) {
			return sendError(res, 404, "Order not found");
		}

		// Market admins can only modify their own market's orders
		if (
			req.user.role === "market" &&
			(!order.market ||
				String(order.market) !== String(req.user.marketId))
		) {
			return sendError(res, 403, "You are not authorized to modify this order");
		}

		// Riders / market drivers may claim an unassigned order (pick up) or modify
		// one already assigned to them (e.g. mark delivered), but never an order
		// assigned to a different rider.
		if (req.user.role === "rider" || req.user.role === "market_driver") {
			const myRider = await Rider.findOne({ user: req.user.id }).select("_id");
			const mine = myRider ? String(myRider._id) : null;
			const assignedTo = order.assignedRider
				? String(order.assignedRider)
				: null;
			if (!mine || (assignedTo && assignedTo !== mine)) {
				return sendError(res, 403, "You can only update orders assigned to you");
			}
		}

		// Check if order can be modified
		if (order.status === "cancelled") {
			return sendError(res, 400, "Cancelled orders cannot be modified");
		}

		// Check if order can be modified
		if (order.status === "delivered" && req.user.role !== "admin") {
			return sendError(res, 400, "Delivered orders cannot be modified");
		}

		// Hard enforcement: reject assigning a driver whose configured
		// delivery zone(s) don't cover the customer's location (exact map pin
		// preferred, falls back to delivery city). This blocks the actual
		// assignment even if called directly (not just filtering the dropdown).
		if (
			assignedRider !== undefined &&
			assignedRider &&
			assignedRider !== "unassigned"
		) {
			if (!mongoose.Types.ObjectId.isValid(assignedRider)) {
				return sendError(res, 400, "Invalid rider ID");
			}
			const riderDoc = await Rider.findById(assignedRider).select(
				"zones currentLocation market"
			);
			if (!riderDoc) {
				return sendError(res, 404, "Rider not found");
			}
			const { riderCoversOrder } = require("../utils/zoneGeo");
			const { covers, reason } = await riderCoversOrder(
				riderDoc,
				order,
				Zone,
				riderDoc.market || undefined
			);
			if (!covers) {
				return sendError(res, 400, reason || "This driver's zone does not cover the customer's delivery location");
			}
		}

		// Update fields
		if (customer) order.customer = { ...order.customer, ...customer };
		const __previousStatus = order.status;
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
				const { subject: emailSubject, html: emailHtml } = orderDeliveredEmail({
					order: updatedOrder,
				});

				await sendEmail({
					to: updatedOrder.customer.email,
					subject: emailSubject,
					html: emailHtml,
				});
			} catch (emailError) {
				console.error("Error sending delivery confirmation email:", emailError);
			}
		}

		// Notify the customer (push, works even when the app is closed) when
		// the order status actually changed.
		if (status && status !== __previousStatus) {
			notifyCustomerOrderStatus(updatedOrder, status).catch((e) =>
				console.error("Order status notification failed:", e),
			);
		}

		const ras = { updatedOrder };

		sendResponse(res, 200, true, "Order updated successfully", ras);
	} catch (error) {
		console.error("Error updating order:", error);
		sendServerError(res, error, "Error updating order");
	}
};

// @desc    Delete order (soft delete)
// @route   DELETE /api/orders/:id
// @access  Private (Admin)
exports.deleteOrder = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid order ID");
		}

		const order = await Order.findByIdAndUpdate(
			id,
			{ isActive: false, updatedBy: req.user.id },
			{ new: true },
		);

		if (!order) {
			return sendError(res, 404, "Order not found");
		}

		const ras = { order };

		sendResponse(res, 200, true, "Order deleted successfully", ras);
	} catch (error) {
		console.error("Error deleting order:", error);
		sendServerError(res, error, "Error deleting order");
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

		const ras = {
			...stats,
			todayOrders,
			monthlyOrders,
			monthlyRevenue: monthlyRevenue[0]?.total || 0,
		};

		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Error fetching order stats:", error);
		sendServerError(res, error, "Error fetching order statistics");
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
			return sendError(res, 400, "Invalid order ID");
		}
		console.log("✅ Step 2: Order ID format is valid");

		// Step 3: Find the order
		console.log("Step 3: Looking up order in database...");
		const order = await Order.findById(id);
		if (!order) {
			console.log("❌ Step 3: Order not found in database");
			return sendError(res, 404, "Order not found");
		}
		console.log(
			`✅ Step 3: Order found - Status: ${order.status}, Payment: ${order.paymentStatus}, Total: $${order.total}`,
		);

		// Step 4: Check if order is already cancelled
		console.log("Step 4: Checking if order is already cancelled...");
		if (order.status === "cancelled") {
			console.log("❌ Step 4: Order is already cancelled");
			return sendError(res, 400, "Order is already cancelled");
		}
		console.log("✅ Step 4: Order is not already cancelled");

		// Step 5: Check if order can be cancelled
		console.log("Step 5: Checking if order can be cancelled...");
		if (order.status === "delivered") {
			console.log(
				`❌ Step 5: Cannot cancel order with status '${order.status}'`,
			);
			return sendError(res, 400, "Delivered order cannot be cancelled");
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
							`✅ Refund processed successfully: $${refundValue.toFixed(2)}`,
						);
						order.paymentStatus = "refunded";
						order.status = "cancelled";
						// Send refund email
						try {
							const refundAmountUsd = refundValue.toFixed(2);
							const { subject: emailSubject, html: emailHtml } = refundProcessedEmail({
								order,
								refundAmountUsd,
							});

							if (order.customer?.email) {
								await sendEmail({
									to: order.customer.email,
									subject: emailSubject,
									html: emailHtml,
								});
								console.log(`✅ Refund email sent to ${order.customer.email}`);
							}
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

		// Let the customer know their order was cancelled (push works even
		// when the app is closed/killed).
		notifyCustomerOrderStatus(updatedOrder, "cancelled").catch((e) =>
			console.error("Order status notification failed:", e),
		);

		const ras = { updatedOrder };

		sendResponse(res, 200, true, "Order cancelled successfully", ras);
	} catch (error) {
		console.log("=== ORDER CANCELLATION FAILED ===");
		console.error("Error cancelling order:", error);
		sendServerError(res, error, "Error cancelling order");
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
			return sendError(res, 400, "Invalid order ID");
		}

		if (shelfNumber === undefined || shelfNumber === null) {
			return sendError(res, 400, "Shelf number is required");
		}

		// Convert to number if it's a valid number string
		const shelfNum =
			typeof shelfNumber === "string" ? parseFloat(shelfNumber) : shelfNumber;

		if (isNaN(shelfNum) || shelfNum < 0) {
			return sendError(res, 400, "Shelf number must be a valid non-negative number");
		}

		const order = await Order.findById(id);

		if (!order) {
			return sendError(res, 404, "Order not found");
		}

		// Check if order can be modified
		if (order.status === "cancelled" || order.status === "delivered") {
			return sendError(res, 400, "Cannot modify shelf number for cancelled or delivered orders");
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

		const ras = { updatedOrder };

		sendResponse(res, 200, true, "Order shelf number updated successfully", ras);
	} catch (error) {
		console.error("Error updating order shelf number:", error);
		sendServerError(res, error, "Error updating order shelf number");
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
			return sendError(res, 400, "Invalid order ID");
		}

		if (!status) {
			return sendError(res, 400, "Status is required");
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
			return sendError(res, 400, `Status must be one of: ${validStatuses.join(", ")}`);
		}

		const order = await Order.findById(id);

		if (!order) {
			return sendError(res, 404, "Order not found");
		}

		// Market admin scoping: can only update orders for their own market
		if (
			req.user.role === "market" &&
			(!order.market ||
				String(order.market) !== String(req.user.marketId))
		) {
			return sendError(res, 403, "Not authorized to update this order");
		}

		// Role-based status update permissions
		const userRole = req.user.role;

		// Define which roles can update to which statuses
		const statusPermissions = {
			admin: validStatuses, // Admin can update to any status
			manager: validStatuses, // Manager can update to any status
			staff: validStatuses, // Staff can update to any status
			rider: ["ready for pickup", "OnTheWay", "delivered"], // Riders can only update delivery-related statuses
			market_driver: ["ready for pickup", "OnTheWay", "delivered"], // Market drivers behave like riders for delivery-related statuses
			market: [
				"confirmed",
				"processing",
				"ready for pickup",
				"cancelled",
			], // Market admins manage their own pipeline up to ready-for-pickup
		};

		const allowedStatuses = statusPermissions[userRole] || [];

		if (!allowedStatuses.includes(status)) {
			return sendError(res, 403, `${userRole} role is not permitted to update status to '${status}'`);
		}

		// Additional business logic for riders
		if (userRole === "rider" || userRole === "market_driver") {
			// Check if the rider is assigned to this order
			const rider = await Rider.findOne({ user: req.user.id });

			if (!rider) {
				return sendError(res, 403, "Rider profile not found");
			}

			// Check if the order is assigned to this rider or if rider can access orders in their zones
			if (order.assignedRider && !order.assignedRider.equals(rider._id)) {
				// If order has an assigned rider and it's not this rider, check zone permissions
				if (rider.zones && rider.zones.length > 0) {
					const orderZone = order.customer?.address?.city;
					if (orderZone) {
						const zones = rider.zones.filter(
							(zoneName) => zoneName.toLowerCase() === orderZone.toLowerCase()
						);

						if (zones.length === 0) {
							return sendError(res, 403, "You are not authorized to update this order");
						}
					}
				} else {
					return sendError(res, 403, "You are not authorized to update this order");
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
			return sendError(res, 400, "Cannot update status of delivered or cancelled orders");
		}

		// Business logic validations
		if (status === "cancelled" && order.status === "delivered") {
			return sendError(res, 400, "Cannot cancel a delivered order");
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
				const { subject: emailSubject, html: emailHtml } = orderDeliveredEmail({
					order: updatedOrder,
				});

				await sendEmail({
					to: updatedOrder.customer.email,
					subject: emailSubject,
					html: emailHtml,
				});
			} catch (emailError) {
				console.error("Error sending delivery confirmation email:", emailError);
			}
		}

		// Push the status change to the customer's device (delivered even
		// when the app is fully closed/killed).
		if (status !== previousStatus) {
			notifyCustomerOrderStatus(updatedOrder, status).catch((e) =>
				console.error("Order status notification failed:", e),
			);
		}

		const ras = { updatedOrder };

		sendResponse(res, 200, true, `Order status updated from '${previousStatus}' to '${status}' successfully`, ras);
	} catch (error) {
		console.error("Error updating order status:", error);
		sendServerError(res, error, "Error updating order status");
	}
};

// @desc    Get total count of all orders
// @route   GET /api/orders/count
// @access  Private (Admin, Manager, Staff)
exports.getOrdersCount = async (req, res) => {
	try {
		const totalOrders = await Order.countDocuments({ isActive: true });

		const ras = { count: totalOrders };

		sendResponse(res, 200, true, `Total active orders: ${totalOrders}`, ras);
	} catch (error) {
		console.error("Error getting orders count:", error);
		sendServerError(res, error, "Error retrieving orders count");
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
					totalRevenue: {
						$sum: { $multiply: ["$items.totalPrice", "$items.quantity"] },
					},
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
					totalRevenue: {
						$sum: { $multiply: ["$items.totalPrice", "$items.quantity"] },
					},
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

		const ras = {
			productSales,
			summary: summary,
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
		};

		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Error fetching product sales statistics:", error);
		sendServerError(res, error, "Error fetching product sales statistics");
	}
};

// @desc    Per-market sales totals + 2% platform commission for the main admin.
//          The main admin earns 2% of every market's product sales (delivered
//          orders). Returns a per-market breakdown plus grand totals, scoped to
//          the same time period the Sales Statistics page is filtered by.
// @route   GET /api/orders/market-commission
// @access  Private (Admin, Manager)
exports.getMarketCommissionStats = async (req, res) => {
	try {
		const { dateFrom, dateTo, timeRange } = req.query;
		const COMMISSION_RATE = 0.02; // 2% to the main admin

		// Build the same date filter used by getProductSalesStats.
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
				if (!isNaN(fromDate.getTime())) dateFilter.$gte = fromDate;
			}
			if (dateTo) {
				const toDate = new Date(dateTo);
				if (!isNaN(toDate.getTime())) {
					toDate.setHours(23, 59, 59, 999);
					dateFilter.$lte = toDate;
				}
			}
		}

		// Only delivered orders that belong to a market (market != null).
		const matchStage = {
			isActive: true,
			status: "delivered",
			market: { $ne: null },
		};
		if (Object.keys(dateFilter).length > 0) {
			matchStage.createdAt = dateFilter;
		}

		const pipeline = [
			{ $match: matchStage },
			{ $unwind: "$items" },
			{
				$group: {
					_id: "$market",
					totalSales: {
						$sum: { $multiply: ["$items.totalPrice", "$items.quantity"] },
					},
					orderIds: { $addToSet: "$_id" },
				},
			},
			{
				$lookup: {
					from: "markets",
					localField: "_id",
					foreignField: "_id",
					as: "marketInfo",
				},
			},
			{ $unwind: { path: "$marketInfo", preserveNullAndEmptyArrays: true } },
			{
				$project: {
					_id: 0,
					marketId: "$_id",
					marketName: { $ifNull: ["$marketInfo.name", "Unknown Market"] },
					orderCount: { $size: "$orderIds" },
					totalSales: { $round: ["$totalSales", 2] },
					commission: {
						$round: [{ $multiply: ["$totalSales", COMMISSION_RATE] }, 2],
					},
				},
			},
			{ $sort: { totalSales: -1 } },
		];

		const data = await Order.aggregate(pipeline);

		const totalSales = data.reduce((sum, m) => sum + (m.totalSales || 0), 0);
		const totalCommission = data.reduce(
			(sum, m) => sum + (m.commission || 0),
			0,
		);
		const totalOrders = data.reduce((sum, m) => sum + (m.orderCount || 0), 0);

		// Our own (main-store) sales: delivered orders that do NOT belong to a
		// market (market is null/absent). These are the admin's own items.
		const ownMatch = {
			isActive: true,
			status: "delivered",
			$or: [{ market: null }, { market: { $exists: false } }],
		};
		if (Object.keys(dateFilter).length > 0) {
			ownMatch.createdAt = dateFilter;
		}
		const ownAgg = await Order.aggregate([
			{ $match: ownMatch },
			{ $unwind: "$items" },
			{
				$group: {
					_id: null,
					totalSales: {
						$sum: { $multiply: ["$items.totalPrice", "$items.quantity"] },
					},
					totalQuantitySold: { $sum: "$items.quantity" },
					orderIds: { $addToSet: "$_id" },
				},
			},
			{
				$project: {
					_id: 0,
					totalSales: { $round: ["$totalSales", 2] },
					totalQuantitySold: 1,
					totalOrders: { $size: "$orderIds" },
				},
			},
		]);
		const ownSales = ownAgg[0] || {
			totalSales: 0,
			totalQuantitySold: 0,
			totalOrders: 0,
		};

		// Main admin total earnings = own main-store sales + 2% market commission.
		const grandTotalEarnings =
			Math.round((ownSales.totalSales + totalCommission) * 100) / 100;

		const ras = {
			data,
			totals: {
				marketCount: data.length,
				totalOrders,
				totalSales: Math.round(totalSales * 100) / 100,
				totalCommission: Math.round(totalCommission * 100) / 100,
				commissionRate: COMMISSION_RATE,
			},
			ownSales: ownSales,
			grandTotalEarnings: grandTotalEarnings,
			filters: {
				timeRange: timeRange || "custom",
				dateFrom: dateFilter.$gte || null,
				dateTo: dateFilter.$lte || null,
			},
		};

		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Error fetching market commission statistics:", error);
		sendServerError(res, error, "Error fetching market commission statistics");
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

		const ras = {
			productsWithCategory,
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
		};

		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Error fetching unsold products:", error);
		sendServerError(res, error, "Error fetching unsold products");
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
			return sendError(res, 400, "Session ID and Order ID are required");
		}

		console.log("Retrieving Stripe session...");
		const session = await stripe.checkout.sessions.retrieve(sessionId);

		if (!session) {
			console.log("Stripe session not found for ID:", sessionId);
			return sendError(res, 404, "Session not found");
		}

		console.log("Stripe session payment status:", session.payment_status);
		if (session.payment_status === "paid") {
			console.log("Payment is paid. Finding order...");
			const order = await Order.findById(orderId);
			if (!order) {
				console.log("Order not found for ID:", orderId);
				return sendError(res, 404, "Order not found");
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
			const ras = {};
			return sendResponse(res, 200, true, "Payment verified successfully", ras);
		} else {
			console.log("Payment not completed. Status:", session.payment_status);
			return sendError(res, 400, "Payment not completed");
		}
	} catch (error) {
		console.error("Error verifying payment:", error);
		sendServerError(res, error, "Error verifying payment");
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

		const ras = { orderCounts };

		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Error getting customer order counts:", error);
		sendServerError(res, error, "Error retrieving customer order counts");
	}
};
