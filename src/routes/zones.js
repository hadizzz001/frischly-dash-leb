const express = require("express");
const {
	getZones,
	getZone,

	createZone,
	updateZone,
	updateZoneStatus,
	deleteZone,
	permanentDeleteZone,
	getZoneStats,
	calculateDeliveryFee,
} = require("../controllers/zoneController");

// Import middleware
const { protect, authorize, optionalProtect } = require("../middleware/auth");

const router = express.Router();

// Public-ish routes: respond based on caller. Anonymous requests see only
// global zones; market tokens see only their market's zones; admin/manager
// see every zone.
router.get("/", optionalProtect, getZones);
//router.get("/active", getActiveZones);
router.post("/calculate-delivery", calculateDeliveryFee);
router.get("/:id", optionalProtect, getZone);

// Protected routes (require authentication)
router.get(
	"/admin/stats",
	protect,
	authorize("admin", "manager"),
	getZoneStats
);
router.post(
	"/",
	protect,
	authorize("admin", "manager", "staff", "market", "market_manager", "market_staff"),
	createZone
);
router.put(
	"/:id",
	protect,
	authorize("admin", "manager", "staff", "market", "market_manager", "market_staff"),
	updateZone
);
router.patch(
	"/:id/status",
	protect,
	authorize("admin", "manager", "staff", "market", "market_manager", "market_staff"),
	updateZoneStatus
);
router.delete(
	"/:id",
	protect,
	authorize("admin", "market", "market_manager"),
	deleteZone
);
router.delete(
	"/:id/permanent",
	protect,
	authorize("admin", "market", "market_manager"),
	permanentDeleteZone
);

module.exports = router;
