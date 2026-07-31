const express = require("express");
const {
	getRiders,
	getRider,
	getMyRiderProfile,
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

// Read-only rider list. Also allow "staff" (warehouse/main-store scanner app
// users) to fetch it — they need this to populate the "Assign Driver" dropdown
// when marking a ready-for-pickup order OnTheWay (see scanner app order
// detail screen), mirroring what the admin dashboard already does with an
// admin token.
router.get("/", protect, authorize("admin", "manager", "staff"), getRiders);

router.get(
	"/me",
	protect,
	authorize("rider", "market_driver", "admin", "manager"),
	getMyRiderProfile,
);

router.get("/:id", protect, authorize("admin", "manager", "rider", "market_driver"), getRider);

router.post("/", protect, authorize("admin", "manager"), createRider);

router.put(
	"/:id",
	protect,
	authorize("admin", "manager", "rider", "market_driver"),
	updateRider
);

router.patch(
	"/:id/status",
	protect,
	authorize("admin", "manager", "rider", "market_driver"),
	updateRiderStatus
);

router.patch(
	"/location",
	protect,
	authorize("admin", "manager", "rider", "market_driver"),
	updateRiderLocation
);

router.delete("/:id", protect, authorize("admin"), deleteRider);

module.exports = router;
