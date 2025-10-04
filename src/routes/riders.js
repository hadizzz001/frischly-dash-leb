const express = require("express");
const {
	getRiders,
	getRider,
	createRider,
	updateRider,
	updateRiderStatus,
	updateRiderLocation,
	getAvailableRiders,
	getRiderStats,
	deleteRider,
} = require("../controllers/riderController");

// Import middleware
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Public routes (none for riders - all require authentication)

// Protected routes (require authentication)
router.get("/stats", protect, authorize("admin", "manager"), getRiderStats);

router.get(
	"/available/:zone",
	protect,
	authorize("admin", "manager"),
	getAvailableRiders
);

router.get("/", protect, authorize("admin", "manager"), getRiders);

router.get("/:id", protect, authorize("admin", "manager", "rider"), getRider);

router.post("/", protect, authorize("admin", "manager"), createRider);

router.put(
	"/:id",
	protect,
	authorize("admin", "manager", "rider"),
	updateRider
);

router.patch(
	"/:id/status",
	protect,
	authorize("admin", "manager", "rider"),
	updateRiderStatus
);

router.patch(
	"/location",
	protect,
	authorize("admin", "manager", "rider"),
	updateRiderLocation
);

router.delete("/:id", protect, authorize("admin"), deleteRider);

module.exports = router;
