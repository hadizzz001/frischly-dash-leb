const { validationResult } = require("express-validator");
const User = require("../models/User");
const { generateToken, generateRefreshToken } = require("../utils/jwt");

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
	try {
		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({
				success: false,
				message: "Validation failed",
				errors: errors.array(),
			});
		}

		const { name, phoneNumber, email, password, address } = req.body;

		// Check if user already exists
		let user = await User.findOne({ email });
		if (user) {
			return res.status(400).json({
				success: false,
				message: "User already exists with this email",
			});
		}

		// Create user
		user = await User.create({
			name,
			phoneNumber,
			email,
			password,
			address,
		});

		// Generate tokens
		const token = generateToken({ id: user._id });
		const refreshToken = generateRefreshToken({ id: user._id });

		res.status(201).json({
			success: true,
			message: "User registered successfully",
			data: {
				user: user.toSafeObject(),
				token,
				refreshToken,
			},
		});
	} catch (error) {
		console.error("Register error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during registration",
		});
	}
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
	try {
		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({
				success: false,
				message: "Validation failed",
				errors: errors.array(),
			});
		}

		const { email, password } = req.body;

		// Check for user and include password
		const user = await User.findOne({ email }).select("+password");
		if (!user) {
			return res.status(401).json({
				success: false,
				message: "Invalid credentials",
			});
		}

		// Check if user is active
		if (!user.isActive) {
			return res.status(401).json({
				success: false,
				message: "Account is deactivated",
			});
		}

		// Check password
		const isMatch = await user.comparePassword(password);
		if (!isMatch) {
			return res.status(401).json({
				success: false,
				message: "Invalid credentials",
			});
		}

		// Check if user has required role for dashboard access
		const allowedRoles = ["manager", "admin", "customer"];
		if (!allowedRoles.includes(user.role)) {
			return res.status(403).json({
				success: false,
				message:
					"Access denied. Dashboard access is restricted to managers and administrators only.",
			});
		}

		// Update last login
		user.lastLogin = new Date();
		await user.save();

		// Generate tokens
		const token = generateToken({ id: user._id });
		const refreshToken = generateRefreshToken({ id: user._id });

		res.json({
			success: true,
			message: "Login successful",
			data: {
				user: user.toSafeObject(),
				token,
				refreshToken,
			},
		});
	} catch (error) {
		console.error("Login error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during login",
		});
	}
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
	try {
		const user = await User.findById(req.user._id);

		res.json({
			success: true,
			data: {
				user: user.toSafeObject(),
			},
		});
	} catch (error) {
		console.error("Get me error:", error);
		res.status(500).json({
			success: false,
			message: "Server error",
		});
	}
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
	try {
		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({
				success: false,
				message: "Validation failed",
				errors: errors.array(),
			});
		}

		const fieldsToUpdate = {};
		const { name, phoneNumber, email, address } = req.body;

		if (name) fieldsToUpdate.name = name;
		if (phoneNumber) fieldsToUpdate.phoneNumber = phoneNumber;
		if (email) {
			// Check if email is already taken by another user
			const existingUser = await User.findOne({
				email,
				_id: { $ne: req.user._id },
			});
			if (existingUser) {
				return res.status(400).json({
					success: false,
					message: "Email is already taken",
				});
			}
			fieldsToUpdate.email = email;
		}
		if (address) fieldsToUpdate.address = address;

		const user = await User.findByIdAndUpdate(req.user._id, fieldsToUpdate, {
			new: true,
			runValidators: true,
		});

		res.json({
			success: true,
			message: "Profile updated successfully",
			data: {
				user: user.toSafeObject(),
			},
		});
	} catch (error) {
		console.error("Update profile error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during profile update",
		});
	}
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
	try {
		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({
				success: false,
				message: "Validation failed",
				errors: errors.array(),
			});
		}

		const { currentPassword, newPassword } = req.body;

		// Get user with password
		const user = await User.findById(req.user._id).select("+password");

		// Check current password
		const isMatch = await user.comparePassword(currentPassword);
		if (!isMatch) {
			return res.status(400).json({
				success: false,
				message: "Current password is incorrect",
			});
		}

		// Update password
		user.password = newPassword;
		await user.save();

		res.json({
			success: true,
			message: "Password changed successfully",
		});
	} catch (error) {
		console.error("Change password error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during password change",
		});
	}
};

// @desc    Login user for profile access (users and riders)
// @route   POST /api/auth/login-profile
// @access  Public
const loginProfile = async (req, res) => {
	try {
		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({
				success: false,
				message: "Validation failed",
				errors: errors.array(),
			});
		}

		const { email, password } = req.body;

		// Check for user and include password
		const user = await User.findOne({ email }).select("+password");
		if (!user) {
			return res.status(401).json({
				success: false,
				message: "Invalid credentials",
			});
		}

		// Check if user is active
		if (!user.isActive) {
			return res.status(401).json({
				success: false,
				message: "Account is deactivated",
			});
		}

		// Check password
		const isMatch = await user.comparePassword(password);
		if (!isMatch) {
			return res.status(401).json({
				success: false,
				message: "Invalid credentials",
			});
		}

		// Update last login
		user.lastLogin = new Date();
		await user.save();

		// Generate tokens
		const token = generateToken({ id: user._id });
		const refreshToken = generateRefreshToken({ id: user._id });

		res.json({
			success: true,
			message: "Login successful",
			data: {
				user: user.toSafeObject(),
				token,
				refreshToken,
				redirectUrl:
					user.role === "manager" || user.role === "admin"
						? "dashboard.html"
						: "profile.html",
			},
		});
	} catch (error) {
		console.error("Login profile error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during login",
		});
	}
};

// @desc    Get all users (Admin only)
// @route   GET /api/auth/users
// @desc     Get all users or filter by role (supports inclusion/exclusion)
// @access  Private (Admin only)
const getAllUsers = async (req, res) => {
	try {
		// Check if user is admin
		if (req.user.role !== "admin") {
			return res.status(403).json({
				success: false,
				message: "Access denied. Admin privileges required.",
			});
		}

		// Build query object
		const queryObj = {};

		// Advanced role filtering
		if (req.query.role) {
			// Simple equality: ?role=admin
			queryObj.role = req.query.role;
		}

		// Handle role exclusion: ?excludeRole=customer
		if (req.query.excludeRole) {
			queryObj.role = { $ne: req.query.excludeRole };
		}

		// Handle role inclusion for multiple roles: ?includeRoles=admin,staff,manager
		if (req.query.includeRoles) {
			const roles = req.query.includeRoles.split(",");
			queryObj.role = { $in: roles };
		}

		const users = await User.find(queryObj)
			.select("-password")
			.sort({ createdAt: -1 });

		res.json({
			success: true,
			data: {
				users,
				count: users.length,
			},
		});
	} catch (error) {
		console.error("Get all users error:", error);
		res.status(500).json({
			success: false,
			message: "Server error while fetching users",
		});
	}
};

// @desc    Create new user (Admin only)
// @route   POST /api/auth/users
// @access  Private (Admin only)
const createUser = async (req, res) => {
	try {
		// Check if user is admin
		if (req.user.role !== "admin") {
			return res.status(403).json({
				success: false,
				message: "Access denied. Admin privileges required.",
			});
		}

		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({
				success: false,
				message: "Validation failed",
				errors: errors.array(),
			});
		}

		const { name, phoneNumber, email, password, address, role } = req.body;

		// Check if user already exists
		let existingUser = await User.findOne({ email });
		if (existingUser) {
			return res.status(400).json({
				success: false,
				message: "User already exists with this email",
			});
		}

		// Create user
		const user = await User.create({
			name,
			phoneNumber,
			email,
			password,
			address,
			role: role || "user",
		});

		res.status(201).json({
			success: true,
			message: "User created successfully",
			data: {
				user: user.toSafeObject(),
			},
		});
	} catch (error) {
		console.error("Create user error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during user creation",
		});
	}
};

// @desc    Update user (Admin only)
// @route   PUT /api/auth/users/:id
// @access  Private (Admin only)
const updateUser = async (req, res) => {
	try {
		// Check if user is admin
		if (req.user.role !== "admin") {
			return res.status(403).json({
				success: false,
				message: "Access denied. Admin privileges required.",
			});
		}

		const userId = req.params.id;
		const { name, phoneNumber, email, address, role, isActive } = req.body;

		// Check if user exists
		let user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
			});
		}

		// Check if email is already taken by another user
		if (email && email !== user.email) {
			const existingUser = await User.findOne({
				email,
				_id: { $ne: userId },
			});
			if (existingUser) {
				return res.status(400).json({
					success: false,
					message: "Email is already taken",
				});
			}
		}

		// Update fields
		const fieldsToUpdate = {};
		if (name) fieldsToUpdate.name = name;
		if (phoneNumber) fieldsToUpdate.phoneNumber = phoneNumber;
		if (email) fieldsToUpdate.email = email;
		if (address) fieldsToUpdate.address = address;
		if (role) fieldsToUpdate.role = role;
		if (typeof isActive !== "undefined") fieldsToUpdate.isActive = isActive;

		user = await User.findByIdAndUpdate(userId, fieldsToUpdate, {
			new: true,
			runValidators: true,
		});

		res.json({
			success: true,
			message: "User updated successfully",
			data: {
				user: user.toSafeObject(),
			},
		});
	} catch (error) {
		console.error("Update user error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during user update",
		});
	}
};

// @desc    Delete user (Admin only)
// @route   DELETE /api/auth/users/:id
// @access  Private (Admin only)
const deleteUser = async (req, res) => {
	try {
		// Check if user is admin
		if (req.user.role !== "admin") {
			return res.status(403).json({
				success: false,
				message: "Access denied. Admin privileges required.",
			});
		}

		const userId = req.params.id;

		// Check if user exists
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
			});
		}

		// Prevent admin from deleting themselves
		if (userId === req.user._id.toString()) {
			return res.status(400).json({
				success: false,
				message: "You cannot delete your own account",
			});
		}

		await User.findByIdAndDelete(userId);

		res.json({
			success: true,
			message: "User deleted successfully",
		});
	} catch (error) {
		console.error("Delete user error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during user deletion",
		});
	}
};

// @desc    Get user by ID
// @route   GET /api/auth/users/:id
// @access  Private (Admin only)
const getUserById = async (req, res) => {
	try {
		// Check if user is admin
		if (req.user.role !== "admin") {
			return res.status(403).json({
				success: false,
				message: "Not authorized to access this resource",
			});
		}

		const user = await User.findById(req.params.id);

		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
			});
		}

		res.status(200).json({
			success: true,
			data: user.toSafeObject(),
		});
	} catch (error) {
		console.error("Error in getUserById:", error);
		res.status(500).json({
			success: false,
			message: "Server error",
		});
	}
};

module.exports = {
	register,
	login,
	loginProfile,
	getMe,
	updateProfile,
	changePassword,
	getAllUsers,
	getUserById,
	createUser,
	updateUser,
	deleteUser,
};
