const mongoose = require("mongoose");
const Feedback = require("../models/Feedback");
const Order = require("../models/Order");
const { sendSuccess, sendError, sendResponse } = require("../utils/apiResponse");

// Populate config shared by the list + single-record endpoints so the admin
// dashboard always gets the same shape (order info, submitting customer, and
// the rider snapshot captured when the feedback was submitted).
const FEEDBACK_POPULATE = [
	{
		path: "order",
		select: "orderNumber total status createdAt customer assignedRider",
		populate: {
			path: "assignedRider",
			select: "vehicleType vehicleNumber user",
			populate: { path: "user", select: "name phoneNumber" },
		},
	},
	{ path: "customer", select: "name email phoneNumber" },
	{
		path: "assignedRider",
		select: "vehicleType vehicleNumber user",
		populate: { path: "user", select: "name phoneNumber" },
	},
];

// @desc    Submit feedback (order + driver rating/description) for an order
// @route   POST /api/feedback
// @access  Private (any authenticated customer)
exports.createFeedback = async (req, res) => {
	try {
		const {
			order: orderId,
			orderRating,
			orderDescription,
			driverRating,
			driverDescription,
		} = req.body;

		if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
			return sendError(res, 400, "A valid order id is required");
		}

		const clampedOrderRating = Math.max(
			0,
			Math.min(5, Number(orderRating) || 0)
		);
		const clampedDriverRating = Math.max(
			0,
			Math.min(5, Number(driverRating) || 0)
		);

		if (clampedOrderRating <= 0 && clampedDriverRating <= 0) {
			return sendError(res, 400, "Please provide at least one rating before submitting");
		}

		const order = await Order.findById(orderId);
		if (!order) {
			return sendError(res, 404, "Order not found");
		}

		// Only the customer who placed the order can leave feedback for it.
		if (String(order.createdBy) !== String(req.user._id || req.user.id)) {
			return sendError(res, 403, "You can only leave feedback for your own orders");
		}

		const existing = await Feedback.findOne({ order: orderId });
		if (existing) {
			return sendError(res, 400, "Feedback has already been submitted for this order");
		}

		const feedback = await Feedback.create({
			order: orderId,
			customer: req.user._id || req.user.id,
			assignedRider: order.assignedRider || null,
			orderRating: clampedOrderRating,
			orderDescription: String(orderDescription || "").trim(),
			driverRating: clampedDriverRating,
			driverDescription: String(driverDescription || "").trim(),
		});

		sendSuccess(res, feedback, "Thank you for your feedback!", 201);
	} catch (error) {
		// Duplicate key (race condition on the unique `order` index).
		if (error.code === 11000) {
			return sendError(res, 400, "Feedback has already been submitted for this order");
		}
		console.error("createFeedback error:", error);
		sendError(res, 400, error.message || "Failed to submit feedback");
	}
};

// @desc    Get all feedback (paginated), newest first
// @route   GET /api/feedback
// @access  Private (Admin only)
exports.getAllFeedback = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 10,
			minOrderRating,
			minDriverRating,
			search,
		} = req.query;

		const query = {};
		if (minOrderRating) query.orderRating = { $gte: Number(minOrderRating) };
		if (minDriverRating)
			query.driverRating = { $gte: Number(minDriverRating) };

		let feedbackQuery = Feedback.find(query).sort({ createdAt: -1 });

		// Free-text search on the linked order's order number (case-insensitive).
		// Done post-populate-friendly by looking the order up first when a search
		// term is provided, since orderNumber lives on the Order collection.
		if (search && String(search).trim()) {
			const matchingOrders = await Order.find({
				orderNumber: { $regex: String(search).trim(), $options: "i" },
			}).select("_id");
			query.order = { $in: matchingOrders.map((o) => o._id) };
			feedbackQuery = Feedback.find(query).sort({ createdAt: -1 });
		}

		const total = await Feedback.countDocuments(query);
		const parsedLimit = parseInt(limit);
		const parsedPage = parseInt(page);
		const skip = (parsedPage - 1) * parsedLimit;

		const feedback = await feedbackQuery
			.skip(skip)
			.limit(parsedLimit)
			.populate(FEEDBACK_POPULATE);

		sendResponse(res, 200, true, "Feedback fetched", feedback, {
			count: feedback.length,
			total,
			pagination: {
				page: parsedPage,
				limit: parsedLimit,
				totalPages: Math.ceil(total / parsedLimit) || 1,
				hasNextPage: parsedPage * parsedLimit < total,
			},
		});
	} catch (error) {
		console.error("getAllFeedback error:", error);
		sendError(res, 400, error.message || "Failed to load feedback");
	}
};

// @desc    Get a single feedback record with full details
// @route   GET /api/feedback/:id
// @access  Private (Admin only)
exports.getFeedbackById = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid feedback id");
		}

		const feedback = await Feedback.findById(id).populate(FEEDBACK_POPULATE);

		if (!feedback) {
			return sendError(res, 404, "Feedback not found");
		}

		sendSuccess(res, feedback);
	} catch (error) {
		console.error("getFeedbackById error:", error);
		sendError(res, 400, error.message || "Failed to load feedback");
	}
};

// @desc    Get the order ids the logged-in customer has ALREADY submitted
//          feedback for. Used by the app so a delivered order never shows
//          the "rate your order" prompt again once feedback exists for it —
//          regardless of what's cached on-device (reinstalls, new devices,
//          cleared storage, etc.).
// @route   GET /api/feedback/mine
// @access  Private (any authenticated customer)
exports.getMyFeedbackOrderIds = async (req, res) => {
	try {
		const customerId = req.user._id || req.user.id;
		const feedback = await Feedback.find({ customer: customerId }).select(
			"order"
		);
		const orderIds = feedback.map((f) => String(f.order));
		sendSuccess(res, orderIds);
	} catch (error) {
		console.error("getMyFeedbackOrderIds error:", error);
		sendError(res, 400, error.message || "Failed to load your feedback");
	}
};

// @desc    Get feedback summary stats (totals + average ratings)
// @route   GET /api/feedback/stats
// @access  Private (Admin only)
exports.getFeedbackStats = async (req, res) => {
	try {
		const stats = await Feedback.getStats();
		sendSuccess(res, stats);
	} catch (error) {
		console.error("getFeedbackStats error:", error);
		sendError(res, 400, error.message || "Failed to load feedback stats");
	}
};
