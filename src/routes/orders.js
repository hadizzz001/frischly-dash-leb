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
	cancelOrder,
	getOrdersCount,
	getOrdersForRiders,
} = require("../controllers/orderController");

// Import middleware
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Protected routes (require authentication)
router.get("/stats", protect, authorize("admin", "manager"), getOrderStats);
router.get(
	"/count",
	protect,
	authorize("admin", "manager", "staff"),
	getOrdersCount
);
router.get(
	"/",
	protect,
	authorize("admin", "manager", "staff", "customer", "rider"),
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
	authorize("admin", "manager", "staff", "customer", "rider"),
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
	authorize("admin", "manager", "staff", "rider"),
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
	authorize("admin", "manager", "staff", "rider"),
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
