const express = require("express");
const {
	getOrders,
	getOrder,
	createOrder,
	updateOrder,
	deleteOrder,
	getOrderStats,
	cancelOrder,
} = require("../controllers/orderController");

// Import middleware
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Protected routes (require authentication)
router.get("/stats", protect, authorize("admin", "manager"), getOrderStats);
router.get(
	"/",
	protect,
	authorize("admin", "manager", "staff", "customer"),
	getOrders
);
router.get(
	"/:id",
	protect,
	authorize("admin", "manager", "staff", "customer"),
	getOrder
);
router.post(
	"/",
	protect,
	authorize("admin", "manager", "staff", "customer"),
	createOrder
);
router.put("/:id", protect, authorize("admin", "manager"), updateOrder);
router.patch(
	"/:id/cancel",
	protect,
	authorize("admin", "manager"),
	cancelOrder
);
router.delete("/:id", protect, authorize("admin"), deleteOrder);

module.exports = router;
