const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
	getShelves,
	getShelf,
	getShelfByNumber,
	createShelf,
	updateShelf,
	deleteShelf,
	permanentDeleteShelf,
	addProductToShelf,
	removeProductFromShelf,
	addOrderToShelf,
	removeOrderFromShelf,
	getShelfStats,
	getAvailableShelves,
	clearShelf,
	bulkAddProductsToShelf,
	bulkAddOrdersToShelf,
} = require("../controllers/shelfController");

// Public routes
router.get("/", getShelves);
router.get("/stats", getShelfStats);
router.get("/available", getAvailableShelves);
router.get("/number/:shelfNumber", getShelfByNumber);
router.get("/:id", getShelf);

// Protected routes (Admin/Manager)
router.use(protect);
router.use(authorize("admin", "manager", "staff"));

router.post("/", createShelf);
router.put("/:id", updateShelf);
router.delete("/:id", deleteShelf);

// Admin only routes
router.delete("/:id/permanent", authorize("admin"), permanentDeleteShelf);

// Shelf product management
router.post("/:id/products/:productId", addProductToShelf);
router.delete("/:id/products/:productId", removeProductFromShelf);
router.post("/:id/products/bulk", bulkAddProductsToShelf);

// Shelf order management
router.post("/:id/orders/:orderId", addOrderToShelf);
router.delete("/:id/orders/:orderId", removeOrderFromShelf);
router.post("/:id/orders/bulk", bulkAddOrdersToShelf);

// Shelf clear
router.post("/:id/clear", clearShelf);

module.exports = router;
