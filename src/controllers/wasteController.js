const mongoose = require("mongoose");
const Waste = require("../models/Waste");
const Product = require("../models/Product");

// @desc    Get product by barcode
// @route   GET /api/waste/product/:barcode
// @access  Private (Admin, Staff)
exports.getProductByBarcode = async (req, res) => {
	try {
		const { barcode } = req.params;

		if (!barcode) {
			return res.status(400).json({
				success: false,
				error: "Please provide a barcode",
			});
		}

		// Only main-store products (market: null) are wasteable from the admin
		// dashboard; market-owned items are handled on the market admin waste page.
		// A `null` match also covers legacy products created before the field
		// existed (Mongo treats missing fields as null in equality queries).
		const product = await Product.findOne({
			barcode,
			isActive: true,
			market: null,
		});

		if (!product) {
			return res.status(404).json({
				success: false,
				error: "Product not found with this barcode",
			});
		}

		res.status(200).json({
			success: true,
			data: product,
		});
	} catch (error) {
		res.status(400).json({
			success: false,
			error: error.message,
		});
	}
};

// @desc    Create a waste record
// @route   POST /api/waste
// @access  Private (Admin, Staff)
exports.createWaste = async (req, res) => {
	try {
		const { barcode, productName, quantity, reason, notes, productId } =
			req.body;

		let productData = {};
		// Ignore an empty/invalid productId so Mongoose doesn't throw a CastError
		// (which previously made "add waste" fail when no lookup had been done).
		let actualProductId =
			productId && mongoose.Types.ObjectId.isValid(productId)
				? productId
				: null;

		// If barcode is provided but no productId, try to find product.
		// Scope to main-store products (market: null) so the admin can't record
		// waste against a market-owned item that happens to share a barcode.
		if (barcode && !actualProductId) {
			const product = await Product.findOne({
				barcode,
				isActive: true,
				market: null,
			});
			if (product) {
				actualProductId = product._id;
				productData.productName = product.name;
			}
		}

		// Create waste record
		const waste = await Waste.create({
			barcode,
			productName: productData.productName || productName,
			quantity,
			reason,
			notes,
			productId: actualProductId,
			recordedBy: req.user.id,
		});

		// If a product was resolved, subtract the wasted quantity from its stock.
		// Only main-store products reach this point (the lookups above exclude
		// market-owned items), so admin waste never alters a market's inventory.
		if (actualProductId) {
			const product = await Product.findById(actualProductId);
			if (product) {
				await product.updateStock(quantity, "subtract");
				console.log(
					`Updated stock for product ${product.name} (${product.barcode}): -${quantity}`
				);
			}
		}

		res.status(201).json({
			success: true,
			data: waste,
		});
	} catch (error) {
		res.status(400).json({
			success: false,
			error: error.message,
		});
	}
};

// @desc    Get all waste records
// @route   GET /api/waste
// @access  Private (Admin, Staff)
exports.getAllWaste = async (req, res) => {
	try {
		const { sortBy, sortOrder, limit = 10, page = 1, reason } = req.query;

		// Build query
		const query = { isActive: true };

		// Filter by reason if provided
		if (reason) {
			query.reason = reason;
		}

		// Build sort options
		const sort = {};
		if (sortBy) {
			sort[sortBy] = sortOrder === "asc" ? 1 : -1;
		} else {
			sort.createdAt = -1; // Default sort by date, newest first
		}

		// Pagination
		const skip = (parseInt(page) - 1) * parseInt(limit);

		// Execute query
		const waste = await Waste.find(query)
			.sort(sort)
			.limit(parseInt(limit))
			.skip(skip)
			.populate("recordedBy", "name email")
			.populate("productId", "name picture price");

		// Get total count
		const total = await Waste.countDocuments(query);

		res.status(200).json({
			success: true,
			count: waste.length,
			total,
			pagination: {
				page: parseInt(page),
				limit: parseInt(limit),
				totalPages: Math.ceil(total / parseInt(limit)),
			},
			data: waste,
		});
	} catch (error) {
		res.status(400).json({
			success: false,
			error: error.message,
		});
	}
};

// @desc    Get waste record by ID
// @route   GET /api/waste/:id
// @access  Private (Admin, Staff)
exports.getWasteById = async (req, res) => {
	try {
		const waste = await Waste.findById(req.params.id)
			.populate("recordedBy", "name email")
			.populate("productId", "name barcode");

		if (!waste) {
			return res.status(404).json({
				success: false,
				error: "Waste record not found",
			});
		}

		res.status(200).json({
			success: true,
			data: waste,
		});
	} catch (error) {
		res.status(400).json({
			success: false,
			error: error.message,
		});
	}
};

// @desc    Update waste record
// @route   PUT /api/waste/:id
// @access  Private (Admin)
exports.updateWaste = async (req, res) => {
	try {
		const { productName, quantity, reason, notes } = req.body;

		const existing = await Waste.findById(req.params.id);
		if (!existing) {
			return res.status(404).json({
				success: false,
				error: "Waste record not found",
			});
		}

		// Only allow updating certain fields
		const updateData = {};
		if (productName) updateData.productName = productName;
		if (quantity) updateData.quantity = quantity;
		if (reason) updateData.reason = reason;
		if (notes !== undefined) updateData.notes = notes;

		const waste = await Waste.findByIdAndUpdate(req.params.id, updateData, {
			new: true,
			runValidators: true,
		});

		// If the wasted quantity changed, adjust the product's stock by the
		// difference (restock the old amount, consume the new amount) so editing a
		// record keeps inventory accurate.
		if (
			quantity !== undefined &&
			existing.productId &&
			Number(quantity) !== Number(existing.quantity)
		) {
			const product = await Product.findById(existing.productId);
			if (product) {
				const delta = Number(existing.quantity) - Number(quantity);
				await product.updateStock(
					Math.abs(delta),
					delta >= 0 ? "add" : "subtract"
				);
			}
		}

		res.status(200).json({
			success: true,
			data: waste,
		});
	} catch (error) {
		res.status(400).json({
			success: false,
			error: error.message,
		});
	}
};

// @desc    Delete waste record (soft delete)
// @route   DELETE /api/waste/:id
// @access  Private (Admin)
exports.deleteWaste = async (req, res) => {
	try {
		const waste = await Waste.findById(req.params.id);

		if (!waste) {
			return res.status(404).json({
				success: false,
				error: "Waste record not found",
			});
		}

		// Restock the product (add the wasted quantity back). Guard on isActive so
		// deleting an already-deleted record can't inflate stock twice.
		if (waste.isActive && waste.productId) {
			const product = await Product.findById(waste.productId);
			if (product) {
				await product.updateStock(waste.quantity, "add");
			}
		}

		waste.isActive = false;
		await waste.save();

		res.status(200).json({
			success: true,
			data: {},
		});
	} catch (error) {
		res.status(400).json({
			success: false,
			error: error.message,
		});
	}
};

// @desc    Get waste statistics
// @route   GET /api/waste/stats
// @access  Private (Admin, Staff)
exports.getWasteStats = async (req, res) => {
	try {
		const { startDate, endDate } = req.query;

		// Build query
		const query = { isActive: true };

		// Add date range if provided
		if (startDate && endDate) {
			query.createdAt = {
				$gte: new Date(startDate),
				$lte: new Date(endDate),
			};
		}

		// Get waste summary by reason
		const reasonSummary = await Waste.aggregate([
			{ $match: query },
			{
				$group: {
					_id: "$reason",
					totalQuantity: { $sum: "$quantity" },
					count: { $sum: 1 },
				},
			},
			{ $sort: { totalQuantity: -1 } },
		]);

		// Get waste trends by date
		const dateTrend = await Waste.aggregate([
			{ $match: query },
			{
				$group: {
					_id: {
						$dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
					},
					totalQuantity: { $sum: "$quantity" },
					count: { $sum: 1 },
				},
			},
			{ $sort: { _id: 1 } },
		]);

		// Get total waste quantity
		const totalWaste = await Waste.aggregate([
			{ $match: query },
			{
				$group: {
					_id: null,
					totalQuantity: { $sum: "$quantity" },
					count: { $sum: 1 },
				},
			},
		]);

		res.status(200).json({
			success: true,
			data: {
				byReason: reasonSummary,
				byDate: dateTrend,
				total:
					totalWaste.length > 0
						? totalWaste[0]
						: { totalQuantity: 0, count: 0 },
			},
		});
	} catch (error) {
		res.status(400).json({
			success: false,
			error: error.message,
		});
	}
};
