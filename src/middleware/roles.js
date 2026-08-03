// Role-based access control (RBAC) middleware.
//
// This file builds on top of the existing `authorize(...roles)` middleware in
// ./auth.js (already used across ~90 routes) and adds a few convenient,
// named guards for the most common role checks in this project, so route
// files can read more clearly (e.g. `isAdmin` instead of `authorize("admin")`).
//
// IMPORTANT: These middlewares only check `req.user.role`. They must always
// be used AFTER the `protect` middleware (from ./auth.js), which is what
// actually verifies the token and populates `req.user`.
//
// Usage:
//   const { protect } = require("../middleware/auth");
//   const { isAdmin, isAdminOrManager, isMarket, hasRole } = require("../middleware/roles");
//
//   router.get("/", protect, isAdmin, someController);
//   router.get("/", protect, isAdminOrManager, someController);
//   router.get("/", protect, hasRole("admin", "market"), someController);

const { authorize } = require("./auth");

// Known roles used throughout this project (see User/Market models):
//   "admin"          - full platform admin
//   "manager"        - elevated admin-like staff role
//   "market"         - a Market's own login token (see Market model)
//   "market_staff"   - staff user assigned to a market
//   "market_manager" - manager-level staff user assigned to a market
//   "market_driver"  - driver/rider staff user assigned to a market
//   "customer"       - regular shopper account
//   "rider"          - platform-wide delivery rider

/**
 * Generic role guard: allow only the listed roles through.
 * Thin, explicitly-named wrapper around `authorize(...roles)`.
 * @param {...string} roles
 */
const hasRole = (...roles) => authorize(...roles);

/** Allow only the main platform admin. */
const isAdmin = authorize("admin");

/** Allow the main platform admin or a manager. */
const isAdminOrManager = authorize("admin", "manager");

/** Allow only a Market's own login token. */
const isMarket = authorize("market");

/** Allow the main admin OR a Market's own login token. */
const isAdminOrMarket = authorize("admin", "market");

/** Allow any market-side staff/owner role (market token or market_* staff). */
const isMarketOrStaff = authorize(
	"market",
	"market_staff",
	"market_manager",
	"market_driver",
);

/** Allow only a platform-wide delivery rider. */
const isRider = authorize("rider");

/** Allow only a regular customer account. */
const isCustomer = authorize("customer");

module.exports = {
	hasRole,
	isAdmin,
	isAdminOrManager,
	isMarket,
	isAdminOrMarket,
	isMarketOrStaff,
	isRider,
	isCustomer,
};
