const Shelf = require("../models/Shelf");
const Product = require("../models/Product");
const Order = require("../models/Order");
const mongoose = require("mongoose");

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

		res.json({
			success: true,
			data: shelves,
			pagination: {
				currentPage: pageNumber,
				totalPages,
				totalShelves: total,
				hasNextPage,
				hasPrevPage,
				limit: limitNumber,
			},
		});
	} catch (error) {
		console.error("Error getting shelves:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Abrufen der Regale",
			error: error.message,
		});
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
			return res.status(400).json({
				success: false,
				message: "Ungültige Regal-ID",
			});
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
			return res.status(404).json({
				success: false,
				message: "Regal nicht gefunden",
			});
		}

		res.json({
			success: true,
			data: shelf,
		});
	} catch (error) {
		console.error("Error getting shelf:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Abrufen des Regals",
			error: error.message,
		});
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
			return res.status(404).json({
				success: false,
				message: "Regal mit dieser Regalnummer nicht gefunden",
			});
		}

		res.json({
			success: true,
			data: shelf,
		});
	} catch (error) {
		console.error("Error getting shelf by number:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Abrufen des Regals nach Nummer",
			error: error.message,
		});
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

		res.status(201).json({
			success: true,
			message: "Regal erfolgreich erstellt",
			data: shelf,
		});
	} catch (error) {
		console.error("Error creating shelf:", error);

		// Handle duplicate shelf number error
		if (error.code === 11000 && error.keyPattern?.shelfNumber) {
			return res.status(400).json({
				success: false,
				message: "Ein Regal mit dieser Regalnummer existiert bereits",
			});
		}

		res.status(400).json({
			success: false,
			message: "Fehler beim Erstellen des Regals",
			error: error.message,
		});
	}
};

// @desc    Update shelf
// @route   PUT /api/shelves/:id
// @access  Private (Admin/Manager)
exports.updateShelf = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Ungültige Regal-ID",
			});
		}

		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return res.status(404).json({
				success: false,
				message: "Regal nicht gefunden",
			});
		}

		const updateData = { ...req.body };

		const updatedShelf = await Shelf.findByIdAndUpdate(id, updateData, {
			new: true,
			runValidators: true,
		}).populate("createdBy", "name email");

		res.json({
			success: true,
			message: "Regal erfolgreich aktualisiert",
			data: updatedShelf,
		});
	} catch (error) {
		console.error("Error updating shelf:", error);

		// Handle duplicate shelf number error
		if (error.code === 11000 && error.keyPattern?.shelfNumber) {
			return res.status(400).json({
				success: false,
				message: "Ein Regal mit dieser Regalnummer existiert bereits",
			});
		}

		res.status(400).json({
			success: false,
			message: "Fehler beim Aktualisieren des Regals",
			error: error.message,
		});
	}
};

// @desc    Delete shelf (soft delete)
// @route   DELETE /api/shelves/:id
// @access  Private (Admin)
exports.deleteShelf = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Ungültige Regal-ID",
			});
		}

		const shelf = await Shelf.findById(id);

		if (!shelf) {
			return res.status(404).json({
				success: false,
				message: "Regal nicht gefunden",
			});
		}

		// Check if shelf has products or orders
		if (shelf.products.length > 0 || shelf.orders.length > 0) {
			return res.status(400).json({
				success: false,
				message: `Regal kann nicht gelöscht werden, da es ${shelf.products.length} Produkte und ${shelf.orders.length} Bestellungen enthält. Bitte entfernen Sie diese zuerst.`,
			});
		}

		const updatedShelf = await Shelf.findByIdAndUpdate(
			id,
			{ isActive: false },
			{ new: true }
		);

		res.json({
			success: true,
			message: "Regal erfolgreich gelöscht",
			data: updatedShelf,
		});
	} catch (error) {
		console.error("Error deleting shelf:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Löschen des Regals",
			error: error.message,
		});
	}
};

// @desc    Permanently delete shelf
// @route   DELETE /api/shelves/:id/permanent
// @access  Private (Admin)
exports.permanentDeleteShelf = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Ungültige Regal-ID",
			});
		}

		const shelf = await Shelf.findById(id);

		if (!shelf) {
			return res.status(404).json({
				success: false,
				message: "Regal nicht gefunden",
			});
		}

		// Check if shelf has products or orders
		if (shelf.products.length > 0 || shelf.orders.length > 0) {
			return res.status(400).json({
				success: false,
				message: `Regal kann nicht dauerhaft gelöscht werden, da es ${shelf.products.length} Produkte und ${shelf.orders.length} Bestellungen enthält`,
			});
		}

		// Permanently delete the shelf
		await Shelf.findByIdAndDelete(id);

		res.json({
			success: true,
			message: "Regal dauerhaft gelöscht",
		});
	} catch (error) {
		console.error("Error permanently deleting shelf:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim dauerhaften Löschen des Regals",
			error: error.message,
		});
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
			return res.status(400).json({
				success: false,
				message: "Ungültige Regal- oder Produkt-ID",
			});
		}

		// Check if product exists
		const product = await Product.findById(productId);
		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Produkt nicht gefunden",
			});
		}

		// Get shelf and check if it has space
		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return res.status(404).json({
				success: false,
				message: "Regal nicht gefunden",
			});
		}

		if (!shelf.isActive) {
			return res.status(400).json({
				success: false,
				message:
					"Produkte können nicht zu einem inaktiven Regal hinzugefügt werden",
			});
		}

		// Check if shelf has space
		if (!shelf.hasSpace()) {
			return res.status(400).json({
				success: false,
				message: "Regal ist bei voller Kapazität",
			});
		}

		// Check if product is already on shelf
		if (shelf.products.includes(productId)) {
			return res.status(400).json({
				success: false,
				message: "Produkt ist bereits auf diesem Regal",
			});
		}

		// Add product to shelf
		await shelf.addProduct(productId);

		// Populate and return updated shelf
		await shelf.populate([
			{ path: "createdBy", select: "name email" },
			{ path: "products", select: "name sku price" },
		]);

		res.json({
			success: true,
			message: "Produkt erfolgreich zum Regal hinzugefügt",
			data: shelf,
		});
	} catch (error) {
		console.error("Error adding product to shelf:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Hinzufügen des Produkts zum Regal",
			error: error.message,
		});
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
			return res.status(400).json({
				success: false,
				message: "Ungültige Regal- oder Produkt-ID",
			});
		}

		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return res.status(404).json({
				success: false,
				message: "Regal nicht gefunden",
			});
		}

		// Check if product is on shelf
		if (!shelf.products.includes(productId)) {
			return res.status(400).json({
				success: false,
				message: "Produkt ist nicht auf diesem Regal",
			});
		}

		// Remove product from shelf
		await shelf.removeProduct(productId);

		// Populate and return updated shelf
		await shelf.populate([
			{ path: "createdBy", select: "name email" },
			{ path: "products", select: "name sku price" },
		]);

		res.json({
			success: true,
			message: "Produkt erfolgreich vom Regal entfernt",
			data: shelf,
		});
	} catch (error) {
		console.error("Error removing product from shelf:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Entfernen des Produkts vom Regal",
			error: error.message,
		});
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
			return res.status(400).json({
				success: false,
				message: "Ungültige Regal- oder Bestellungs-ID",
			});
		}

		// Check if order exists
		const order = await Order.findById(orderId);
		if (!order) {
			return res.status(404).json({
				success: false,
				message: "Bestellung nicht gefunden",
			});
		}

		// Get shelf and check if it has space
		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return res.status(404).json({
				success: false,
				message: "Regal nicht gefunden",
			});
		}

		if (!shelf.isActive) {
			return res.status(400).json({
				success: false,
				message:
					"Bestellungen können nicht zu einem inaktiven Regal hinzugefügt werden",
			});
		}

		// Check if shelf has space
		if (!shelf.hasSpace()) {
			return res.status(400).json({
				success: false,
				message: "Regal ist bei voller Kapazität",
			});
		}

		// Check if order is already on shelf
		if (shelf.orders.includes(orderId)) {
			return res.status(400).json({
				success: false,
				message: "Bestellung ist bereits auf diesem Regal",
			});
		}

		// Add order to shelf
		await shelf.addOrder(orderId);

		// Populate and return updated shelf
		await shelf.populate([
			{ path: "createdBy", select: "name email" },
			{ path: "orders", select: "orderNumber status totalAmount" },
		]);

		res.json({
			success: true,
			message: "Bestellung erfolgreich zum Regal hinzugefügt",
			data: shelf,
		});
	} catch (error) {
		console.error("Error adding order to shelf:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Hinzufügen der Bestellung zum Regal",
			error: error.message,
		});
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
			return res.status(400).json({
				success: false,
				message: "Ungültige Regal- oder Bestellungs-ID",
			});
		}

		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return res.status(404).json({
				success: false,
				message: "Regal nicht gefunden",
			});
		}

		// Check if order is on shelf
		if (!shelf.orders.includes(orderId)) {
			return res.status(400).json({
				success: false,
				message: "Bestellung ist nicht auf diesem Regal",
			});
		}

		// Remove order from shelf
		await shelf.removeOrder(orderId);

		// Populate and return updated shelf
		await shelf.populate([
			{ path: "createdBy", select: "name email" },
			{ path: "orders", select: "orderNumber status totalAmount" },
		]);

		res.json({
			success: true,
			message: "Bestellung erfolgreich vom Regal entfernt",
			data: shelf,
		});
	} catch (error) {
		console.error("Error removing order from shelf:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Entfernen der Bestellung vom Regal",
			error: error.message,
		});
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

		res.json({
			success: true,
			data: result,
		});
	} catch (error) {
		console.error("Error getting shelf statistics:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Abrufen der Regalstatistiken",
			error: error.message,
		});
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

		res.json({
			success: true,
			data: shelves,
			total: shelves.length,
		});
	} catch (error) {
		console.error("Error getting available shelves:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Abrufen der verfügbaren Regale",
			error: error.message,
		});
	}
};

// @desc    Clear shelf (remove all products and orders)
// @route   POST /api/shelves/:id/clear
// @access  Private (Admin/Manager)
exports.clearShelf = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Ungültige Regal-ID",
			});
		}

		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return res.status(404).json({
				success: false,
				message: "Regal nicht gefunden",
			});
		}

		// Clear products and orders
		shelf.products = [];
		shelf.orders = [];
		shelf.currentLoad = 0;
		await shelf.save();

		// Populate and return updated shelf
		await shelf.populate("createdBy", "name email");

		res.json({
			success: true,
			message: "Regal erfolgreich geleert",
			data: shelf,
		});
	} catch (error) {
		console.error("Error clearing shelf:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Leeren des Regals",
			error: error.message,
		});
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
			return res.status(400).json({
				success: false,
				message: "Ungültige Regal-ID",
			});
		}

		if (!Array.isArray(productIds) || productIds.length === 0) {
			return res.status(400).json({
				success: false,
				message: "productIds muss ein nicht-leeres Array sein",
			});
		}

		// Validate all product IDs
		const invalidIds = productIds.filter(
			(pid) => !mongoose.Types.ObjectId.isValid(pid)
		);
		if (invalidIds.length > 0) {
			return res.status(400).json({
				success: false,
				message: "Ungültige Produkt-IDs gefunden",
				invalidIds,
			});
		}

		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return res.status(404).json({
				success: false,
				message: "Regal nicht gefunden",
			});
		}

		if (!shelf.isActive) {
			return res.status(400).json({
				success: false,
				message:
					"Produkte können nicht zu einem inaktiven Regal hinzugefügt werden",
			});
		}

		// Check if shelf has enough space
		const newProductsCount = productIds.filter(
			(pid) => !shelf.products.includes(pid)
		).length;
		if (!shelf.hasSpace(newProductsCount)) {
			return res.status(400).json({
				success: false,
				message: `Regal hat nicht genug Kapazität. Verfügbar: ${shelf.availableCapacity}, Erforderlich: ${newProductsCount}`,
			});
		}

		// Verify all products exist
		const products = await Product.find({ _id: { $in: productIds } });
		if (products.length !== productIds.length) {
			return res.status(404).json({
				success: false,
				message: "Einige Produkte wurden nicht gefunden",
			});
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

		res.json({
			success: true,
			message: `${added.length} Produkte zum Regal hinzugefügt, ${skipped.length} waren bereits vorhanden`,
			data: {
				shelf,
				added: added.length,
				skipped: skipped.length,
			},
		});
	} catch (error) {
		console.error("Error bulk adding products to shelf:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Massenhinzufügen von Produkten zum Regal",
			error: error.message,
		});
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
			return res.status(400).json({
				success: false,
				message: "Ungültige Regal-ID",
			});
		}

		if (!Array.isArray(orderIds) || orderIds.length === 0) {
			return res.status(400).json({
				success: false,
				message: "orderIds muss ein nicht-leeres Array sein",
			});
		}

		// Validate all order IDs
		const invalidIds = orderIds.filter(
			(oid) => !mongoose.Types.ObjectId.isValid(oid)
		);
		if (invalidIds.length > 0) {
			return res.status(400).json({
				success: false,
				message: "Ungültige Bestellungs-IDs gefunden",
				invalidIds,
			});
		}

		const shelf = await Shelf.findById(id);
		if (!shelf) {
			return res.status(404).json({
				success: false,
				message: "Regal nicht gefunden",
			});
		}

		if (!shelf.isActive) {
			return res.status(400).json({
				success: false,
				message:
					"Bestellungen können nicht zu einem inaktiven Regal hinzugefügt werden",
			});
		}

		// Check if shelf has enough space
		const newOrdersCount = orderIds.filter(
			(oid) => !shelf.orders.includes(oid)
		).length;
		if (!shelf.hasSpace(newOrdersCount)) {
			return res.status(400).json({
				success: false,
				message: `Regal hat nicht genug Kapazität. Verfügbar: ${shelf.availableCapacity}, Erforderlich: ${newOrdersCount}`,
			});
		}

		// Verify all orders exist
		const orders = await Order.find({ _id: { $in: orderIds } });
		if (orders.length !== orderIds.length) {
			return res.status(404).json({
				success: false,
				message: "Einige Bestellungen wurden nicht gefunden",
			});
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

		res.json({
			success: true,
			message: `${added.length} Bestellungen zum Regal hinzugefügt, ${skipped.length} waren bereits vorhanden`,
			data: {
				shelf,
				added: added.length,
				skipped: skipped.length,
			},
		});
	} catch (error) {
		console.error("Error bulk adding orders to shelf:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Massenhinzufügen von Bestellungen zum Regal",
			error: error.message,
		});
	}
};

module.exports = exports;
