const PromoCode = require("../models/PromoCode");

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
			message: "Server Error",
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
				message: "Promo code not found",
			});
		}

		res.status(200).json({
			success: true,
			data: promoCode,
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: "Server Error",
			error: err.message,
		});
	}
};

// @desc    Create new promo code
// @route   POST /api/promocodes
// @access  Private/Admin
exports.createPromoCode = async (req, res) => {
	try {
		const { companyName, code, description, isActive } = req.body;

		// Check if code already exists
		const existingCode = await PromoCode.findOne({ code });
		if (existingCode) {
			return res.status(400).json({
				success: false,
				message: "Promo code already exists",
			});
		}

		const promoCode = await PromoCode.create({
			companyName,
			code,
			description,
			isActive,
		});

		res.status(201).json({
			success: true,
			data: promoCode,
			message: "Promo code created successfully",
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: "Server Error",
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
				message: "Promo code not found",
			});
		}

		promoCode = await PromoCode.findByIdAndUpdate(req.params.id, req.body, {
			new: true,
			runValidators: true,
		});

		res.status(200).json({
			success: true,
			data: promoCode,
			message: "Promo code updated successfully",
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: "Server Error",
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
				message: "Promo code not found",
			});
		}

		await promoCode.deleteOne();

		res.status(200).json({
			success: true,
			data: {},
			message: "Promo code deleted successfully",
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: "Server Error",
			error: err.message,
		});
	}
};
