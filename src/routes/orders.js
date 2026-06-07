const express = require("express");
const {
	getOrders,
	getOrder,
	createOrder,
	updateOrder,
	updateOrderShelfNumber,
	updateOrderStatus,
	deleteOrder,
	getOrderStats,
	getProductSalesStats,
	getUnsoldProducts,
	cancelOrder,
	getOrdersCount,
	getOrdersForRiders,
	verifyStripePayment,
	getCustomerOrderCounts,
} = require("../controllers/orderController");

// Import middleware
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.post("/verify-payment", verifyStripePayment);

// Protected routes (require authentication)
router.get("/stats", protect, authorize("admin", "manager"), getOrderStats);
router.get(
	"/sales-stats",
	protect,
	authorize("admin", "manager"),
	getProductSalesStats
);
router.get(
	"/unsold-products",
	protect,
	authorize("admin", "manager"),
	getUnsoldProducts
);
router.get(
	"/count",
	protect,
	authorize("admin", "manager", "staff"),
	getOrdersCount
);
router.get(
	"/customer-order-counts",
	protect,
	authorize("admin", "manager"),
	getCustomerOrderCounts
);
router.get(
	"/",
	protect,
	authorize("admin", "manager", "staff", "customer", "rider", "market"),
	getOrders
);
router.get(
	"/runningOrder",
	protect,
	authorize("admin", "manager", "staff", "customer", "rider"),
	getOrdersForRiders
);
router.get(
	"/:id",
	protect,
	authorize("admin", "manager", "staff", "customer", "rider", "market"),
	getOrder
);
router.post(
	"/",
	protect,
	authorize("admin", "manager", "staff", "customer"),
	createOrder
);
router.put(
	"/:id",
	protect,
	authorize("admin", "manager", "staff", "rider", "market"),
	updateOrder
);
router.patch(
	"/:id/shelf",
	protect,
	authorize("admin", "manager", "staff"),
	updateOrderShelfNumber
);
router.patch(
	"/:id/status",
	protect,
	authorize("admin", "manager", "staff", "rider", "market"),
	updateOrderStatus
);
router.patch(
	"/:id/cancel",
	protect,
	authorize("admin", "manager", "staff", "customer"),
	cancelOrder
);
router.delete("/:id", protect, authorize("admin"), deleteOrder);

module.exports = router;
