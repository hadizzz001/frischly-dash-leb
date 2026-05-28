const express = require("express");
const {
	createMarket,
	getMarkets,
	getMarket,
	updateMarket,
	deleteMarket,
	permanentDeleteMarket,
	marketLogin,
	getMyMarket,
	getMarketStats,
	uploadLogoMiddleware,
} = require("../controllers/marketController");

const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Public route: market admin login
router.post("/login", marketLogin);

// Market admin self-profile
router.get("/me/profile", protect, authorize("market"), getMyMarket);

// Admin-only management routes
// NOTE: market create / update / delete are intentionally disabled — markets
// are read-only from the main admin dashboard. Markets sign in through
// `/market` and manage their own profile via that flow.
// router.post("/", protect, authorize("admin"), uploadLogoMiddleware, createMarket);
router.get("/", protect, authorize("admin"), getMarkets);

// Stats: admin or the market itself
router.get(
	"/:id/stats",
	protect,
	authorize("admin", "market"),
	getMarketStats,
);

router.get(
	"/:id",
	protect,
	authorize("admin", "market"),
	getMarket,
);

// Only the market itself can update its profile.
router.put(
	"/:id",
	protect,
	authorize("market"),
	uploadLogoMiddleware,
	updateMarket,
);

// Deletes disabled for admin too.
// router.delete("/:id/permanent", protect, authorize("admin"), permanentDeleteMarket);
// router.delete("/:id", protect, authorize("admin"), deleteMarket);

module.exports = router;
