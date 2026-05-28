// Market-admin auth helpers.
// Requires the existing `protect` middleware to have already validated a token.
// Accepts:
//   - Market tokens (req.market set, req.user.role === 'market')
//   - Staff users assigned to a market (req.user.role === 'market_staff' && req.user.market)
//
// Always exposes `req.marketId` (ObjectId) so controllers can scope queries.
const mongoose = require("mongoose");

function marketOnly(req, res, next) {
	try {
		// Market admin token (set by protect() in middleware/auth.js)
		if (req.market && req.market._id) {
			req.marketId = req.market._id;
			req.isMarketOwner = true;
			return next();
		}

		// Staff user belonging to a market
		if (
			req.user &&
			["market_staff", "market_manager", "market_driver"].includes(
				req.user.role
			) &&
			req.user.market
		) {
			req.marketId = req.user.market;
			req.isMarketOwner = false;
			return next();
		}

		return res.status(403).json({
			success: false,
			message: "Market admin access required",
		});
	} catch (err) {
		return res.status(500).json({ success: false, message: "Server error" });
	}
}

// Helper: ensure the given id is the same market as the requester
function sameMarket(req, marketField) {
	if (!marketField) return false;
	const a = String(marketField);
	const b = String(req.marketId);
	return a === b;
}

// Helper: build a base filter for a tenant-scoped collection
function tenantFilter(req, extra = {}) {
	return { market: new mongoose.Types.ObjectId(req.marketId), ...extra };
}

module.exports = { marketOnly, sameMarket, tenantFilter };
