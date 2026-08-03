// Shared tenant/market scoping helper for admin-facing collections that are
// optionally owned by a Market (e.g. Kitchen, KitchenCategory).
//
// Previously this exact function was duplicated identically in both
// kitchenController.js and kitchenCategoryController.js.

const mongoose = require("mongoose");

/**
 * Build a Mongo filter that scopes a query by market ownership:
 * - Market-role requesters only ever see their own market's documents.
 * - Admin/manager requesters may optionally filter via ?market=<id|none|all>.
 *   - "all" (or omitted) → no market filter (see everything).
 *   - "none" / "null" → only documents with market === null (main-store items).
 *   - a valid ObjectId → only that market's documents.
 * @param {import('express').Request} req
 * @param {object} [extra] Additional filter fields to merge in
 * @returns {object} Mongo filter object
 */
const marketScopeFilter = (req, extra = {}) => {
	if (req.user && req.user.role === "market") {
		return { market: req.user.marketId, ...extra };
	}
	if (req.query && req.query.market !== undefined && req.query.market !== "all") {
		if (req.query.market === "none" || req.query.market === "null") {
			return { market: null, ...extra };
		}
		if (mongoose.Types.ObjectId.isValid(req.query.market)) {
			return { market: req.query.market, ...extra };
		}
	}
	return { ...extra };
};

module.exports = { marketScopeFilter };
