const Shelf = require("../models/Shelf");
const Product = require("../models/Product");
const Order = require("../models/Order");
const mongoose = require("mongoose");
const { sendResponse, sendError, sendSuccess } = require("../utils/apiResponse");

// @desc    Get all shelves
// @route   GET /api/shelves
// @access  Public
exports.getShelves = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 50,
			search,
			isActive = "true",
			sortBy = "shelfNumber",
			sortOrder = "asc",
			withDetails = false,
			availableOnly = false,
		} = req.query;

		// Build filter object
		const filter = {};
		if (isActive !== "all") {
			filter.isActive = isActive === "true";
		}
		if (search) {
			filter.$or = [
				{ shelfNumber: new RegExp(search, "i") },
				{ description: new RegExp(search, "i") },
				{ location: new RegExp(search, "i") },
			];
		}

		// Filter for available shelves only
		if (availableOnly === "true") {
			filter.isActive = true;
			filter.$expr = { $lt: ["$currentLoad", "$capacity"] };
		}

		// Calculate pagination
		const pageNumber = parseInt(page);
		const limitNumber = parseInt(limit);
		const skip = (pageNumber - 1) * limitNumber;

		// Build sort object
		const sort = {};
		sort[sortBy] = sortOrder === "desc" ? -1 : 1;

		// Execute query
		let query = Shelf.find(filter).sort(sort).skip(skip).limit(limitNumber);

		// Populate products and orders if requested
		if (withDetails === "true") {
			query = query
				.populate({
					path: "products",
					select: "name sku price stock",
				})
				.populate({
					path: "orders",
					select: "orderNumber status totalAmount",
				});
		}

		query = query.populate("createdBy", "name email");

		const [shelves, total] = await Promise.all([
			query.lean(),
			Shelf.countDocuments(filter),
		]);

		// Calculate pagination info
		const totalPages = Math.ceil(total / limitNumber);
		const hasNextPage = pageNumber < totalPages;
		const hasPrevPage = pageNumber > 1;

		sendResponse(res, 200, true, "Success", shelves, { pagination: {
				currentPage: pageNumber,
				totalPages,
				totalShelves: total,
				hasNextPage,
				hasPrevPage,
				limit: limitNumber,
			} });
	} catch (error) {
		console.error("Error getting shelves:", error);
		sendError(res, 500, "Error fetching shelves", error.message);
	}
};

// @desc    Get single shelf
// @route   GET /api/shelves/:id
// @access  Public
exports.getShelf = async (req, res) => {
	try {
		const { id } = req.params;
		const { withDetails = false } = req.query;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid shelf ID");
		}

		let query = Shelf.findById(id).populate("createdBy", "name email");

		// Populate products and orders if requested
		if (withDetails === "true") {
			query = query
				.populate({
					path: "products",
					select: "name sku price stock image",
				})
				.populate({
					path: "orders",
					select: "orderNumber status totalAmount createdAt customer",
					populate: {
						path: "customer",
						select: "name email phone",
					},
				});
		}

		const shelf = await query;

		if (!shelf) {
			return sendError(res, 404, "Shelf not found");
		}

		sendResponse(res, 200, true, "Success", shelf);
	} catch (error) {
		console.error("Error getting shelf:", error);
		sendError(res, 500, "Error fetching shelf", error.message);
	}
};

// @desc    Get shelf by shelf number
// @route   GET /api/shelves/number/:shelfNumber
// @access  Public
exports.getShelfByNumber = async (req, res) => {
	try {
		const { shelfNumber } = req.params;
		const { withDetails = false } = req.query;

		let query = Shelf.findOne({
			shelfNumber: shelfNumber.toUpperCase(),
		}).populate("createdBy", "name email");

		// Populate products and orders if requested
		if (withDetails === "true") {
			query = query
				.populate({
					path: "products",
					select: "name sku price stock image",
				})
				.populate({
					path: "orders",
					select: "orderNumber status totalAmount createdAt",
				});
		}

		const shelf = await query;

		if (!shelf) {
			return sendError(res, 404, "Shelf with this shelf number not found");
		}

		sendResponse(res, 200, true, "Success", shelf);
	} catch (error) {
		console.error("Error getting shelf by number:", error);
		sendError(res, 500, "Error fetching shelf by number", error.message);
	}
};

// @desc    Create new shelf
// @route   POST /api/shelves
// @access  Private (Admin/Manager)
exports.createShelf = async (req, res) => {
	try {
		const shelfData = { ...req.body };

		// Add creator if user is authenticated
		if (req.user) {
			shelfData.createdBy = req.user.id;
		}

		const shelf = await Shelf.create(shelfData);

		// Populate the created shelf
		await shelf.populate("createdBy", "name email");

		sendResponse(res, 201, true, "Shelf created successfully", shelf);
	} catch (error) {
		console.error("Error creating shelf:", error);

		// Handle duplicate shelf number error
		if (error.code === 11000 && error.keyPattern?.shelfNumber) {
			return sendError(res, 400, "A shelf with this shelf number already exists");
		}

		sendError(res, 400, "Error creating shelf", error.message);
	}
};

// @desc    Update shelf
// @route   PUT /api/shelves/:id
// @access  Private (Admin/Manager)
exports.updateShelf = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid shelf ID");
		}

		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return sendError(res, 404, "Shelf not found");
		}

		const updateData = { ...req.body };

		const updatedShelf = await Shelf.findByIdAndUpdate(id, updateData, {
			new: true,
			runValidators: true,
		}).populate("createdBy", "name email");

		sendResponse(res, 200, true, "Shelf updated successfully", updatedShelf);
	} catch (error) {
		console.error("Error updating shelf:", error);

		// Handle duplicate shelf number error
		if (error.code === 11000 && error.keyPattern?.shelfNumber) {
			return sendError(res, 400, "A shelf with this shelf number already exists");
		}

		sendError(res, 400, "Error updating shelf", error.message);
	}
};

// @desc    Delete shelf (soft delete)
// @route   DELETE /api/shelves/:id
// @access  Private (Admin)
exports.deleteShelf = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid shelf ID");
		}

		const shelf = await Shelf.findById(id);

		if (!shelf) {
			return sendError(res, 404, "Shelf not found");
		}

		// Check if shelf has products or orders
		if (shelf.products.length > 0 || shelf.orders.length > 0) {
			return sendError(res, 400, `Shelf cannot be deleted because it contains ${shelf.products.length} products and ${shelf.orders.length} orders. Please remove them first.`);
		}

		const updatedShelf = await Shelf.findByIdAndUpdate(
			id,
			{ isActive: false },
			{ new: true }
		);

		sendResponse(res, 200, true, "Shelf deleted successfully", updatedShelf);
	} catch (error) {
		console.error("Error deleting shelf:", error);
		sendError(res, 500, "Error deleting shelf", error.message);
	}
};

// @desc    Permanently delete shelf
// @route   DELETE /api/shelves/:id/permanent
// @access  Private (Admin)
exports.permanentDeleteShelf = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid shelf ID");
		}

		const shelf = await Shelf.findById(id);

		if (!shelf) {
			return sendError(res, 404, "Shelf not found");
		}

		// Check if shelf has products or orders
		if (shelf.products.length > 0 || shelf.orders.length > 0) {
			return sendError(res, 400, `Shelf cannot be permanently deleted because it contains ${shelf.products.length} products and ${shelf.orders.length} orders`);
		}

		// Permanently delete the shelf
		await Shelf.findByIdAndDelete(id);

		sendResponse(res, 200, true, "Shelf permanently deleted", null);
	} catch (error) {
		console.error("Error permanently deleting shelf:", error);
		sendError(res, 500, "Error permanently deleting shelf", error.message);
	}
};

// @desc    Add product to shelf
// @route   POST /api/shelves/:id/products/:productId
// @access  Private (Admin/Manager)
exports.addProductToShelf = async (req, res) => {
	try {
		const { id, productId } = req.params;

		if (
			!mongoose.Types.ObjectId.isValid(id) ||
			!mongoose.Types.ObjectId.isValid(productId)
		) {
			return sendError(res, 400, "Invalid shelf or product ID");
		}

		// Check if product exists
		const product = await Product.findById(productId);
		if (!product) {
			return sendError(res, 404, "Product not found");
		}

		// Get shelf and check if it has space
		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return sendError(res, 404, "Shelf not found");
		}

		if (!shelf.isActive) {
			return sendError(res, 400, "Products cannot be added to an inactive shelf");
		}

		// Check if shelf has space
		if (!shelf.hasSpace()) {
			return sendError(res, 400, "Shelf is at full capacity");
		}

		// Check if product is already on shelf
		if (shelf.products.includes(productId)) {
			return sendError(res, 400, "Product is already on this shelf");
		}

		// Add product to shelf
		await shelf.addProduct(productId);

		// Populate and return updated shelf
		await shelf.populate([
			{ path: "createdBy", select: "name email" },
			{ path: "products", select: "name sku price" },
		]);

		sendResponse(res, 200, true, "Product added to shelf successfully", shelf);
	} catch (error) {
		console.error("Error adding product to shelf:", error);
		sendError(res, 500, "Error adding product to shelf", error.message);
	}
};

// @desc    Remove product from shelf
// @route   DELETE /api/shelves/:id/products/:productId
// @access  Private (Admin/Manager)
exports.removeProductFromShelf = async (req, res) => {
	try {
		const { id, productId } = req.params;

		if (
			!mongoose.Types.ObjectId.isValid(id) ||
			!mongoose.Types.ObjectId.isValid(productId)
		) {
			return sendError(res, 400, "Invalid shelf or product ID");
		}

		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return sendError(res, 404, "Shelf not found");
		}

		// Check if product is on shelf
		if (!shelf.products.includes(productId)) {
			return sendError(res, 400, "Product is not on this shelf");
		}

		// Remove product from shelf
		await shelf.removeProduct(productId);

		// Populate and return updated shelf
		await shelf.populate([
			{ path: "createdBy", select: "name email" },
			{ path: "products", select: "name sku price" },
		]);

		sendResponse(res, 200, true, "Product removed from shelf successfully", shelf);
	} catch (error) {
		console.error("Error removing product from shelf:", error);
		sendError(res, 500, "Error removing product from shelf", error.message);
	}
};

// @desc    Add order to shelf
// @route   POST /api/shelves/:id/orders/:orderId
// @access  Private (Admin/Manager)
exports.addOrderToShelf = async (req, res) => {
	try {
		const { id, orderId } = req.params;

		if (
			!mongoose.Types.ObjectId.isValid(id) ||
			!mongoose.Types.ObjectId.isValid(orderId)
		) {
			return sendError(res, 400, "Invalid shelf or order ID");
		}

		// Check if order exists
		const order = await Order.findById(orderId);
		if (!order) {
			return sendError(res, 404, "Order not found");
		}

		// Get shelf and check if it has space
		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return sendError(res, 404, "Shelf not found");
		}

		if (!shelf.isActive) {
			return sendError(res, 400, "Orders cannot be added to an inactive shelf");
		}

		// Check if shelf has space
		if (!shelf.hasSpace()) {
			return sendError(res, 400, "Shelf is at full capacity");
		}

		// Check if order is already on shelf
		if (shelf.orders.includes(orderId)) {
			return sendError(res, 400, "Order is already on this shelf");
		}

		// Add order to shelf
		await shelf.addOrder(orderId);

		// Populate and return updated shelf
		await shelf.populate([
			{ path: "createdBy", select: "name email" },
			{ path: "orders", select: "orderNumber status totalAmount" },
		]);

		sendResponse(res, 200, true, "Order added to shelf successfully", shelf);
	} catch (error) {
		console.error("Error adding order to shelf:", error);
		sendError(res, 500, "Error adding order to shelf", error.message);
	}
};

// @desc    Remove order from shelf
// @route   DELETE /api/shelves/:id/orders/:orderId
// @access  Private (Admin/Manager)
exports.removeOrderFromShelf = async (req, res) => {
	try {
		const { id, orderId } = req.params;

		if (
			!mongoose.Types.ObjectId.isValid(id) ||
			!mongoose.Types.ObjectId.isValid(orderId)
		) {
			return sendError(res, 400, "Invalid shelf or order ID");
		}

		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return sendError(res, 404, "Shelf not found");
		}

		// Check if order is on shelf
		if (!shelf.orders.includes(orderId)) {
			return sendError(res, 400, "Order is not on this shelf");
		}

		// Remove order from shelf
		await shelf.removeOrder(orderId);

		// Populate and return updated shelf
		await shelf.populate([
			{ path: "createdBy", select: "name email" },
			{ path: "orders", select: "orderNumber status totalAmount" },
		]);

		sendResponse(res, 200, true, "Order removed from shelf successfully", shelf);
	} catch (error) {
		console.error("Error removing order from shelf:", error);
		sendError(res, 500, "Error removing order from shelf", error.message);
	}
};

// @desc    Get shelf statistics
// @route   GET /api/shelves/stats
// @access  Public
exports.getShelfStats = async (req, res) => {
	try {
		const stats = await Shelf.aggregate([
			{
				$facet: {
					totalShelves: [{ $count: "count" }],
					activeShelves: [{ $match: { isActive: true } }, { $count: "count" }],
					inactiveShelves: [
						{ $match: { isActive: false } },
						{ $count: "count" },
					],
					totalCapacity: [
						{ $group: { _id: null, total: { $sum: "$capacity" } } },
					],
					totalLoad: [
						{ $group: { _id: null, total: { $sum: "$currentLoad" } } },
					],
					averageUtilization: [
						{
							$match: {
								capacity: { $gt: 0 },
							},
						},
						{
							$group: {
								_id: null,
								avgUtilization: {
									$avg: {
										$multiply: [
											{ $divide: ["$currentLoad", "$capacity"] },
											100,
										],
									},
								},
							},
						},
					],
					fullShelves: [
						{
							$match: {
								$expr: { $gte: ["$currentLoad", "$capacity"] },
								capacity: { $gt: 0 },
							},
						},
						{ $count: "count" },
					],
					emptyShelves: [{ $match: { currentLoad: 0 } }, { $count: "count" }],
				},
			},
		]);

		const result = {
			totalShelves: stats[0].totalShelves[0]?.count || 0,
			activeShelves: stats[0].activeShelves[0]?.count || 0,
			inactiveShelves: stats[0].inactiveShelves[0]?.count || 0,
			totalCapacity: stats[0].totalCapacity[0]?.total || 0,
			totalLoad: stats[0].totalLoad[0]?.total || 0,
			averageUtilization:
				Math.round(stats[0].averageUtilization[0]?.avgUtilization || 0) + "%",
			fullShelves: stats[0].fullShelves[0]?.count || 0,
			emptyShelves: stats[0].emptyShelves[0]?.count || 0,
		};

		sendResponse(res, 200, true, "Success", result);
	} catch (error) {
		console.error("Error getting shelf statistics:", error);
		sendError(res, 500, "Error fetching shelf statistics", error.message);
	}
};

// @desc    Get available shelves
// @route   GET /api/shelves/available
// @access  Public
exports.getAvailableShelves = async (req, res) => {
	try {
		const shelves = await Shelf.findAvailable()
			.populate("createdBy", "name email")
			.lean();

		sendResponse(res, 200, true, "Success", shelves, { total: shelves.length });
	} catch (error) {
		console.error("Error getting available shelves:", error);
		sendError(res, 500, "Error fetching available shelves", error.message);
	}
};

// @desc    Clear shelf (remove all products and orders)
// @route   POST /api/shelves/:id/clear
// @access  Private (Admin/Manager)
exports.clearShelf = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid shelf ID");
		}

		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return sendError(res, 404, "Shelf not found");
		}

		// Clear products and orders
		shelf.products = [];
		shelf.orders = [];
		shelf.currentLoad = 0;
		await shelf.save();

		// Populate and return updated shelf
		await shelf.populate("createdBy", "name email");

		sendResponse(res, 200, true, "Shelf cleared successfully", shelf);
	} catch (error) {
		console.error("Error clearing shelf:", error);
		sendError(res, 500, "Error clearing shelf", error.message);
	}
};

// @desc    Bulk add products to shelf
// @route   POST /api/shelves/:id/products/bulk
// @access  Private (Admin/Manager)
exports.bulkAddProductsToShelf = async (req, res) => {
	try {
		const { id } = req.params;
		const { productIds } = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid shelf ID");
		}

		if (!Array.isArray(productIds) || productIds.length === 0) {
			return sendError(res, 400, "productIds muss ein nicht-leeres Array sein");
		}

		// Validate all product IDs
		const invalidIds = productIds.filter(
			(pid) => !mongoose.Types.ObjectId.isValid(pid)
		);
		if (invalidIds.length > 0) {
			return sendResponse(res, 400, false, "Invalid product IDs found", null, { invalidIds: invalidIds });
		}

		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return sendError(res, 404, "Shelf not found");
		}

		if (!shelf.isActive) {
			return sendError(res, 400, "Products cannot be added to an inactive shelf");
		}

		// Check if shelf has enough space
		const newProductsCount = productIds.filter(
			(pid) => !shelf.products.includes(pid)
		).length;
		if (!shelf.hasSpace(newProductsCount)) {
			return sendError(res, 400, `Shelf does not have enough capacity. Available: ${shelf.availableCapacity}, Required: ${newProductsCount}`);
		}

		// Verify all products exist
		const products = await Product.find({ _id: { $in: productIds } });
		if (products.length !== productIds.length) {
			return sendError(res, 404, "Some products were not found");
		}

		// Add products to shelf
		const added = [];
		const skipped = [];
		for (const productId of productIds) {
			if (!shelf.products.includes(productId)) {
				shelf.products.push(productId);
				added.push(productId);
			} else {
				skipped.push(productId);
			}
		}
		shelf.currentLoad = shelf.products.length;
		await shelf.save();

		// Populate and return updated shelf
		await shelf.populate([
			{ path: "createdBy", select: "name email" },
			{ path: "products", select: "name sku price" },
		]);

		sendResponse(res, 200, true, `${added.length} products added to shelf, ${skipped.length} were already present`, {
				shelf,
				added: added.length,
				skipped: skipped.length,
			});
	} catch (error) {
		console.error("Error bulk adding products to shelf:", error);
		sendError(res, 500, "Error bulk-adding products to shelf", error.message);
	}
};

// @desc    Bulk add orders to shelf
// @route   POST /api/shelves/:id/orders/bulk
// @access  Private (Admin/Manager)
exports.bulkAddOrdersToShelf = async (req, res) => {
	try {
		const { id } = req.params;
		const { orderIds } = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid shelf ID");
		}

		if (!Array.isArray(orderIds) || orderIds.length === 0) {
			return sendError(res, 400, "orderIds muss ein nicht-leeres Array sein");
		}

		// Validate all order IDs
		const invalidIds = orderIds.filter(
			(oid) => !mongoose.Types.ObjectId.isValid(oid)
		);
		if (invalidIds.length > 0) {
			return sendResponse(res, 400, false, "Invalid order IDs found", null, { invalidIds: invalidIds });
		}

		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return sendError(res, 404, "Shelf not found");
		}

		if (!shelf.isActive) {
			return sendError(res, 400, "Orders cannot be added to an inactive shelf");
		}

		// Check if shelf has enough space
		const newOrdersCount = orderIds.filter(
			(oid) => !shelf.orders.includes(oid)
		).length;
		if (!shelf.hasSpace(newOrdersCount)) {
			return sendError(res, 400, `Shelf does not have enough capacity. Available: ${shelf.availableCapacity}, Required: ${newOrdersCount}`);
		}

		// Verify all orders exist
		const orders = await Order.find({ _id: { $in: orderIds } });
		if (orders.length !== orderIds.length) {
			return sendError(res, 404, "Some orders were not found");
		}

		// Add orders to shelf
		const added = [];
		const skipped = [];
		for (const orderId of orderIds) {
			if (!shelf.orders.includes(orderId)) {
				shelf.orders.push(orderId);
				added.push(orderId);
			} else {
				skipped.push(orderId);
			}
		}
		shelf.currentLoad = shelf.products.length + shelf.orders.length;
		await shelf.save();

		// Populate and return updated shelf
		await shelf.populate([
			{ path: "createdBy", select: "name email" },
			{ path: "orders", select: "orderNumber status totalAmount" },
		]);

		sendResponse(res, 200, true, `${added.length} orders added to shelf, ${skipped.length} were already present`, {
				shelf,
				added: added.length,
				skipped: skipped.length,
			});
	} catch (error) {
		console.error("Error bulk adding orders to shelf:", error);
		sendError(res, 500, "Error bulk-adding orders to shelf", error.message);
	}
};

module.exports = exports;
