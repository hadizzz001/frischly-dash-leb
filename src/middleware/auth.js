const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");

// Middleware to protect routes
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
				message: "Not authorized to access this route",
			});
		}

		try {
			// Verify token
			const decoded = verifyToken(token);

			// Get user from token
			const user = await User.findById(decoded.id).select("-password");

			if (!user) {
				return res.status(401).json({
					success: false,
					message: "Not authorized to access this route",
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

module.exports = { protect, authorize };
