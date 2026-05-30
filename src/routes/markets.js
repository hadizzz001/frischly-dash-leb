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
	getPublicMarkets,
	getMarketProducts,
} = require("../controllers/marketController");

const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Public route: market admin login
router.post("/login", marketLogin);

// Public route: list active markets for the mobile app
router.get("/public", getPublicMarkets);

// Public route: list active products for a specific market
router.get("/:id/products", getMarketProducts);

// Market admin self-profile
router.get("/me/profile", protect, authorize("market"), getMyMarket);

// Admin-only management routes
// NOTE: permanently deleting markets is intentionally disabled. Main admins
// can create, edit, view and archive (soft-delete / reactivate) markets.
// Markets sign in through `/market` and manage their own profile via that flow.
router.post("/", protect, authorize("admin"), uploadLogoMiddleware, createMarket);
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

// Admin can edit any market; market admins can edit their own profile.
router.put(
	"/:id",
	protect,
	authorize("admin", "market"),
	uploadLogoMiddleware,
	updateMarket,
);

// Admin can archive (soft-delete / deactivate) a market. Permanent delete
// is intentionally disabled — markets must never be permanently removed.
router.delete("/:id", protect, authorize("admin"), deleteMarket);
// router.delete("/:id/permanent", protect, authorize("admin"), permanentDeleteMarket);

module.exports = router;
