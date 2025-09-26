const express = require("express");
const {
	getZones,
	getZone,
	getZoneByZipCode,

	createZone,
	updateZone,
	updateZoneStatus,
	deleteZone,
	permanentDeleteZone,
	getZoneStats,
	calculateDeliveryFee,
} = require("../controllers/zoneController");

// Import middleware
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.get("/", getZones);
//router.get("/active", getActiveZones);
router.get("/zipcode/:zipCode", getZoneByZipCode);
router.post("/calculate-delivery", calculateDeliveryFee);
router.get("/:id", getZone);

// Protected routes (require authentication)
router.get(
	"/admin/stats",
	protect,
	authorize("admin", "manager"),
	getZoneStats
);
router.post("/", protect, authorize("admin", "manager", "staff"), createZone);
router.put("/:id", protect, authorize("admin", "manager", "staff"), updateZone);
router.patch(
	"/:id/status",
	protect,
	authorize("admin", "manager", "staff"),
	updateZoneStatus
);
router.delete("/:id", protect, authorize("admin"), deleteZone);
router.delete(
	"/:id/permanent",
	protect,
	authorize("admin"),
	permanentDeleteZone
);

module.exports = router;
