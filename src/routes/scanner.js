const express = require("express");
const {
  scanProductBarcode,
  scanOrderBarcode,
  pickItem,
  skipItem,
  getPickProgress,
  completeOrder,
  getScannerOrders,
} = require("../controllers/scannerController");

// Import middleware
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// All scanner routes are protected and require staff, market, rider, or market_driver role
router.use(protect);
router.use(
	authorize(
		"admin",
		"manager",
		"staff",
		"market",
		"rider",
		"market_driver",
		"market_staff",
		"market_manager"
	)
);

// Product scanning endpoint
// Scan a product barcode and get product details
router.post("/scan-product", scanProductBarcode);

// Order scanning endpoint
// Scan an order number/barcode and get order details with pick progress
router.post("/scan-order", scanOrderBarcode);

// Pick item endpoint
// Mark an item as picked during order fulfillment
router.post("/pick-item", pickItem);

// Skip item endpoint
// Mark an item as skipped (out of stock, damaged, etc.)
router.post("/skip-item", skipItem);

// Get pick progress for an order
// Returns current pick progress and item details
router.get("/pick-progress/:orderId", getPickProgress);

// Complete order fulfillment
// Mark order as completed and update status based on pick results
router.post("/complete-order", completeOrder);

// Get orders for scanner (warehouse mode)
// Returns list of orders ready for picking/fulfillment
router.get("/orders", getScannerOrders);

module.exports = router;
