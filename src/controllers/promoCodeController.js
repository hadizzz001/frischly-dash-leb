const PromoCode = require("../models/PromoCode");
const { t } = require("../utils/translations");

// @desc    Get all promo codes (public - without code)
// @route   GET /api/promocodes/public
// @access  Public
exports.getPublicPromoCodes = async (req, res) => {
	try {
		const promoCodes = await PromoCode.find({ isActive: true })
			.select("-code")
			.sort({ createdAt: -1 });

		res.status(200).json({
			success: true,
			count: promoCodes.length,
			data: promoCodes,
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: "Server Error",
			error: err.message,
		});
	}
};

// @desc    Validate and apply promo code
// @route   POST /api/promocodes/validate
// @access  Public
exports.validatePromoCode = async (req, res) => {
	try {
		const { code, orderTotal } = req.body;

		if (!code) {
			return res.status(400).json({
				success: false,
				message: t('promoCodeRequired', req),
			});
		}

		const promoCode = await PromoCode.findOne({
			code: code.toUpperCase(),
			isActive: true,
			isFromOwnCompany: true,
		});

		if (!promoCode) {
			return res.status(404).json({
				success: false,
				message: t('invalidPromoCode', req),
			});
		}

		let discountAmount = 0;

		if (promoCode.discountType === "percentage") {
			discountAmount = (orderTotal * promoCode.discountValue) / 100;
		} else if (promoCode.discountType === "cash") {
			discountAmount = promoCode.discountValue;
			// Ensure discount doesn't exceed order total
			if (discountAmount > orderTotal) {
				discountAmount = orderTotal;
			}
		}

		const finalTotal = orderTotal - discountAmount;

		res.status(200).json({
			success: true,
			data: {
				promoCode: {
					id: promoCode._id,
					code: promoCode.code,
					companyName: promoCode.companyName,
					description: promoCode.description,
					discountType: promoCode.discountType,
					discountValue: promoCode.discountValue,
				},
				discountAmount: parseFloat(discountAmount.toFixed(2)),
				originalTotal: orderTotal,
				finalTotal: parseFloat(finalTotal.toFixed(2)),
			},
			message: t('promoCodeApplied', req),
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: t('serverError', req),
			error: err.message,
		});
	}
};

// @desc    Get all promo codes
// @route   GET /api/promocodes
// @access  Private/Admin
exports.getPromoCodes = async (req, res) => {
	try {
		const promoCodes = await PromoCode.find().sort({ createdAt: -1 });

		res.status(200).json({
			success: true,
			count: promoCodes.length,
			data: promoCodes,
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: t('serverError', req),
			error: err.message,
		});
	}
};

// @desc    Get single promo code
// @route   GET /api/promocodes/:id
// @access  Private/Admin
exports.getPromoCode = async (req, res) => {
	try {
		const promoCode = await PromoCode.findById(req.params.id);

		if (!promoCode) {
			return res.status(404).json({
				success: false,
				message: t('promoCodeNotFound', req),
			});
		}

		res.status(200).json({
			success: true,
			data: promoCode,
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: t('serverError', req),
			error: err.message,
		});
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
			return res.status(400).json({
				success: false,
				message: t('promoCodeExists', req),
			});
		}

		// Validate discount value based on type
		if (
			discountType === "percentage" &&
			(discountValue < 0 || discountValue > 100)
		) {
			return res.status(400).json({
				success: false,
				message: t('percentageDiscountRange', req),
			});
		}

		if (discountType === "cash" && discountValue < 0) {
			return res.status(400).json({
				success: false,
				message: t('cashDiscountNegative', req),
			});
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

		res.status(201).json({
			success: true,
			data: promoCode,
			message: t('promoCodeCreated', req),
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: t('serverError', req),
			error: err.message,
		});
	}
};

// @desc    Update promo code
// @route   PUT /api/promocodes/:id
// @access  Private/Admin
exports.updatePromoCode = async (req, res) => {
	try {
		let promoCode = await PromoCode.findById(req.params.id);

		if (!promoCode) {
			return res.status(404).json({
				success: false,
				message: t('promoCodeNotFound', req),
			});
		}

		promoCode = await PromoCode.findByIdAndUpdate(req.params.id, req.body, {
			new: true,
			runValidators: true,
		});

		res.status(200).json({
			success: true,
			data: promoCode,
			message: t('promoCodeUpdated', req),
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: t('serverError', req),
			error: err.message,
		});
	}
};

// @desc    Delete promo code
// @route   DELETE /api/promocodes/:id
// @access  Private/Admin
exports.deletePromoCode = async (req, res) => {
	try {
		const promoCode = await PromoCode.findById(req.params.id);

		if (!promoCode) {
			return res.status(404).json({
				success: false,
				message: t('promoCodeNotFound', req),
			});
		}

		await promoCode.deleteOne();

		res.status(200).json({
			success: true,
			data: {},
			message: t('promoCodeDeleted', req),
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: t('serverError', req),
			error: err.message,
		});
	}
};
