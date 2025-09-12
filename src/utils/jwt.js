const jwt = require("jsonwebtoken");

// Generate JWT token
const generateToken = (payload) => {
	return jwt.sign(payload, process.env.JWT_SECRET, {
		expiresIn: process.env.JWT_EXPIRE || "30d",
	});
};

// Verify JWT token
const verifyToken = (token) => {
	return jwt.verify(token, process.env.JWT_SECRET);
};

// Generate refresh token
const generateRefreshToken = (payload) => {
	return jwt.sign(
		payload,
		process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
		{
			expiresIn: process.env.JWT_REFRESH_EXPIRE || "7d",
		}
	);
};

// Verify refresh token
const verifyRefreshToken = (token) => {
	return jwt.verify(
		token,
		process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
	);
};

module.exports = {
	generateToken,
	verifyToken,
	generateRefreshToken,
	verifyRefreshToken,
};
