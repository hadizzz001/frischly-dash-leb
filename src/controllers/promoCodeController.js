const PromoCode = require("../models/PromoCode");
const MarketPromoCode = require("../models/MarketPromoCode");
const User = require("../models/User");
const { t } = require("../utils/translations");
const { sendResponse, sendError, sendSuccess, sendServerError } = require("../utils/apiResponse");

// @desc    Get all promo codes (public - without code)
// @route   GET /api/promocodes/public
// @access  Public
exports.getPublicPromoCodes = async (req, res) => {
	try {
		const promoCodes = await PromoCode.find({ isActive: true })
			.select("-code")
			.sort({ createdAt: -1 });

		const ras = { promoCodes, count: promoCodes.length };
		sendResponse(res, 200, true, "Success", ras);
	} catch (err) {
		sendServerError(res, err, "Server Error");
	}
};

// @desc    Validate and apply promo code
// @route   POST /api/promocodes/validate
// @access  Private
exports.validatePromoCode = async (req, res) => {
	try {
		const { code, orderTotal, market } = req.body;

		if (!code) {
			return sendError(res, 400, "Promo code is required");
		}

		const upperCode = code.toUpperCase();
		const total = Number(orderTotal) || 0;

		// The cart can only contain items from a single source: one specific
		// market, or the main admin store. Promo codes are scoped the same way:
		//   - market provided        -> only that market's MarketPromoCode codes
		//   - no market (main store) -> only admin own-company PromoCode codes
		if (market) {
			const marketPromo = await MarketPromoCode.findOne({
				market,
				code: upperCode,
				isActive: true,
			});

			if (!marketPromo) {
				return sendError(res, 404, "Invalid or inactive promo code");
			}

			const now = new Date();
			if (marketPromo.startsAt && now < marketPromo.startsAt) {
				return sendError(res, 400, "This promo code is not active yet");
			}
			if (marketPromo.expiresAt && now > marketPromo.expiresAt) {
				return sendError(res, 400, "This promo code has expired");
			}

			if (
				marketPromo.usageLimit > 0 &&
				marketPromo.usageCount >= marketPromo.usageLimit
			) {
				return sendError(res, 400, "This promo code has reached its usage limit");
			}

			const minRequired =
				marketPromo.minOrderTotal ||
				(marketPromo.triggerCondition &&
					marketPromo.triggerCondition.minOrderTotal) ||
				0;
			if (minRequired && total < minRequired) {
				return sendError(res, 400, `Minimum order total for this promo code is ${minRequired}`);
			}

			let discountAmount = 0;
			if (marketPromo.discountType === "percentage") {
				discountAmount = (total * marketPromo.discountValue) / 100;
			} else if (marketPromo.discountType === "cash") {
				discountAmount = marketPromo.discountValue;
				if (discountAmount > total) discountAmount = total;
			}

			const finalTotal = total - discountAmount;

			const ras = {
				promoCode: {
					id: marketPromo._id,
					code: marketPromo.code,
					market: marketPromo.market,
					companyName: marketPromo.companyName,
					description: marketPromo.description,
					discountType: marketPromo.discountType,
					discountValue: marketPromo.discountValue,
				},
				isMarketPromo: true,
				discountAmount: parseFloat(discountAmount.toFixed(2)),
				originalTotal: total,
				finalTotal: parseFloat(finalTotal.toFixed(2)),
			};
			return sendResponse(res, 200, true, t("promoCodeApplied", req), ras);
		}

		// Main store cart -> admin own-company promo codes only.
		const promoCode = await PromoCode.findOne({
			code: upperCode,
			isActive: true,
			isFromOwnCompany: true,
		});

		if (!promoCode) {
			return sendError(res, 404, "Invalid or inactive promo code");
		}

		let discountAmount = 0;

		if (promoCode.discountType === "percentage") {
			discountAmount = (total * promoCode.discountValue) / 100;
		} else if (promoCode.discountType === "cash") {
			discountAmount = promoCode.discountValue;
			// Ensure discount doesn't exceed order total
			if (discountAmount > total) {
				discountAmount = total;
			}
		}

		const finalTotal = total - discountAmount;

		const ras2 = {
			promoCode: {
				id: promoCode._id,
				code: promoCode.code,
				market: null,
				companyName: promoCode.companyName,
				description: promoCode.description,
				discountType: promoCode.discountType,
				discountValue: promoCode.discountValue,
			},
			isMarketPromo: false,
			discountAmount: parseFloat(discountAmount.toFixed(2)),
			originalTotal: total,
			finalTotal: parseFloat(finalTotal.toFixed(2)),
		};
		sendResponse(res, 200, true, t("promoCodeApplied", req), ras2);
	} catch (err) {
		sendServerError(res, err, t("serverError", req));
	}
};

// @desc    Get all promo codes
// @route   GET /api/promocodes
// @access  Private/Admin
exports.getPromoCodes = async (req, res) => {
	try {
		const promoCodes = await PromoCode.find().sort({ createdAt: -1 });

		const ras = { promoCodes, count: promoCodes.length };
		sendResponse(res, 200, true, "Success", ras);
	} catch (err) {
		sendServerError(res, err, t("serverError", req));
	}
};

// @desc    Get single promo code
// @route   GET /api/promocodes/:id
// @access  Private/Admin
exports.getPromoCode = async (req, res) => {
	try {
		const promoCode = await PromoCode.findById(req.params.id);

		if (!promoCode) {
			return sendError(res, 404, t("promoCodeNotFound", req));
		}

		const ras = { promoCode };
		sendResponse(res, 200, true, "Success", ras);
	} catch (err) {
		sendServerError(res, err, t("serverError", req));
	}
};

// @desc    Create new promo code
// @route   POST /api/promocodes
// @access  Private/Admin
exports.createPromoCode = async (req, res) => {
	try {
		const {
			companyName,
			code,
			description,
			discountType,
			discountValue,
			isFromOwnCompany,
			triggerCondition,
			emailSubject,
			emailMessage,
			isActive,
		} = req.body;

		// Check if code already exists
		const existingCode = await PromoCode.findOne({ code });
		if (existingCode) {
			return sendError(res, 400, t("promoCodeExists", req));
		}

		// Validate discount value based on type
		if (
			discountType === "percentage" &&
			(discountValue < 0 || discountValue > 100)
		) {
			return sendError(res, 400, t("percentageDiscountRange", req));
		}

		if (discountType === "cash" && discountValue < 0) {
			return sendError(res, 400, t("cashDiscountNegative", req));
		}

		const promoCode = await PromoCode.create({
			companyName,
			code,
			description,
			discountType,
			discountValue,
			isFromOwnCompany,
			triggerCondition,
			emailSubject,
			emailMessage,
			isActive,
		});

		const ras = { promoCode };
		sendResponse(res, 201, true, t("promoCodeCreated", req), ras);
	} catch (err) {
		sendServerError(res, err, t("serverError", req));
	}
};

// @desc    Update promo code
// @route   PUT /api/promocodes/:id
// @access  Private/Admin
exports.updatePromoCode = async (req, res) => {
	try {
		let promoCode = await PromoCode.findById(req.params.id);

		if (!promoCode) {
			return sendError(res, 404, t("promoCodeNotFound", req));
		}

		promoCode = await PromoCode.findByIdAndUpdate(req.params.id, req.body, {
			new: true,
			runValidators: true,
		});

		const ras = { promoCode };
		sendResponse(res, 200, true, t("promoCodeUpdated", req), ras);
	} catch (err) {
		sendServerError(res, err, t("serverError", req));
	}
};

// @desc    Delete promo code
// @route   DELETE /api/promocodes/:id
// @access  Private/Admin
exports.deletePromoCode = async (req, res) => {
	try {
		const promoCode = await PromoCode.findById(req.params.id);

		if (!promoCode) {
			return sendError(res, 404, t("promoCodeNotFound", req));
		}

		await promoCode.deleteOne();

		const ras = {};
		sendResponse(res, 200, true, t("promoCodeDeleted", req), ras);
	} catch (err) {
		sendServerError(res, err, t("serverError", req));
	}
};
