const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const Market = require("../models/Market");

// Middleware to protect routes (supports both User and Market tokens)
const protect = async (req, res, next) => {
	try {
		let token;

		// Check for token in headers
		if (
			req.headers.authorization &&
			req.headers.authorization.startsWith("Bearer")
		) {
			token = req.headers.authorization.split(" ")[1];
		}

		// Make sure token exists
		if (!token) {
			return res.status(401).json({
				success: false,
				message: "401 ,Not authorized to access this route,token missing",
			});
		}

		try {
			// Verify token
			const decoded = verifyToken(token);

			// Market admin token
			if (decoded && decoded.isMarket) {
				const market = await Market.findById(decoded.id);
				if (!market) {
					return res.status(401).json({
						success: false,
						message: "Not authorized, market not found",
					});
				}
				if (!market.isActive) {
					return res.status(401).json({
						success: false,
						message: "Market account is deactivated",
					});
				}

				req.market = market;
				// Provide a unified `req.user` shape so existing authorize() works
				req.user = {
					id: market._id,
					_id: market._id,
					name: market.name,
					email: market.email || `${market.username}@market.local`,
					role: "market",
					marketId: market._id,
					isMarket: true,
				};
				return next();
			}

			// Get user from token
			const user = await User.findById(decoded.id).select("-password");

			if (!user) {
				return res.status(401).json({
					success: false,
					message: "401 ,Not authorized to access this route,user not found",
				});
			}

			// Check if user is active
			if (!user.isActive) {
				return res.status(401).json({
					success: false,
					message: "User account is deactivated",
				});
			}

			req.user = user;
			next();
		} catch (error) {
			return res.status(401).json({
				success: false,
				message: "Not authorized to access this route",
			});
		}
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Server error",
		});
	}
};

// Middleware to restrict to certain roles
const authorize = (...roles) => {
	return (req, res, next) => {
		if (!roles.includes(req.user.role)) {
			return res.status(403).json({
				success: false,
				message: `User role ${req.user.role} is not authorized to access this route`,
			});
		}
		next();
	};
};

// Like `protect` but never fails on missing/invalid token. If the request
// carries a valid token, `req.user` (and `req.market` for market tokens) is
// populated. Otherwise the request continues as an anonymous request.
// Useful for endpoints whose response depends on who's calling but which must
// still work for the public.
const optionalProtect = async (req, res, next) => {
	try {
		let token;
		if (
			req.headers.authorization &&
			req.headers.authorization.startsWith("Bearer")
		) {
			token = req.headers.authorization.split(" ")[1];
		}
		if (!token) return next();

		const decoded = verifyToken(token);
		if (!decoded) return next();

		if (decoded.isMarket) {
			const market = await Market.findById(decoded.id);
			if (market && market.isActive) {
				req.market = market;
				req.user = {
					id: market._id,
					_id: market._id,
					name: market.name,
					email: market.email || `${market.username}@market.local`,
					role: "market",
					marketId: market._id,
					isMarket: true,
				};
			}
			return next();
		}
		const user = await User.findById(decoded.id).select("-password");
		if (user && user.isActive) req.user = user;
		return next();
	} catch (e) {
		// Swallow any token error and continue anonymously
		return next();
	}
};

module.exports = { protect, authorize, optionalProtect };
