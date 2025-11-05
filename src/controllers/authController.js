const crypto = require("crypto");
const { validationResult } = require("express-validator");
const User = require("../models/User");
const {
	generateToken,
	generateRefreshToken,
	verifyRefreshToken,
} = require("../utils/jwt");
const sendEmail = require("../utils/sendEmail");
const { sanitizeEmail } = require("../utils/sanitize");

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

		const emailToken = crypto.randomBytes(32).toString("hex");
		const emailTokenExpires = Date.now() + 24 * 60 * 60 * 1000;

		user = await User.create({
			name,
			phoneNumber,
			email,
			password,
			address,
			emailToken,
			emailTokenExpires,
			emailConfirmed: false, // change this to be default false on production
		});

		const baseUrl =
			process.env.SERVER_PUBLIC_URL ||
			process.env.API_BASE_URL ||
			(process.env.FRONTEND_URL
				? process.env.FRONTEND_URL.split(",")[0]
				: undefined) ||
			`http://localhost:${process.env.PORT || 3001}`;
		const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
		const confirmUrl = `${normalizedBaseUrl}/api/auth/confirm/${emailToken}`;

		const emailSubject = "Confirm your Frischly email";
		const emailText = `Hi ${
			name || "there"
		},\n\nPlease confirm your email by visiting the link below:\n${confirmUrl}\n\nIf you did not create an account, you can ignore this email.`;
		const emailHtml = `<!doctype html><html><body><p>Hi ${
			name || "there"
		},</p><p>Please confirm your email by clicking the button below.</p><p><a href="${confirmUrl}">Confirm Email</a></p><p>If you did not create an account, you can ignore this email.</p></body></html>`;
		// Send confirmation email	 uncomment on production
		try {
			await sendEmail({
				to: email,
				subject: emailSubject,
				text: emailText,
				html: emailHtml,
			});
		} catch (emailError) {
			console.error("Email confirmation send error:", emailError);
			await User.findByIdAndDelete(user._id);
			return res.status(500).json({
				success: false,
				message: "Unable to send confirmation email. Please try again.",
			});
		}

		res.status(201).json({
			success: true,
			message:
				"Signup successful. Please check your email to confirm your account.",
			data: {
				userId: user._id,
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

const confirmEmail = async (req, res) => {
	try {
		const { token } = req.params;

		if (!token) {
			return res.status(400).send("Invalid confirmation link");
		}

		const user = await User.findOne({
			emailToken: token,
			emailTokenExpires: { $gt: Date.now() },
		});

		if (!user) {
			return res.status(400).send("Invalid or expired confirmation link");
		}

		user.emailConfirmed = true;
		user.emailConfirmedAt = new Date();
		user.emailToken = undefined;
		user.emailTokenExpires = undefined;

		await user.save();

		if (process.env.EMAIL_CONFIRM_REDIRECT_SUCCESS) {
			const normalizedRedirect =
				process.env.EMAIL_CONFIRM_REDIRECT_SUCCESS.replace(/\/$/, "");
			return res.redirect(`${normalizedRedirect}?status=confirmed`);
		}

		return res.send("Email confirmed. You can now log in.");
	} catch (error) {
		console.error("Email confirmation error:", error);
		return res.status(500).send("Server error");
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

		// Sanitize email input to prevent NoSQL injection
		const sanitizedEmail = sanitizeEmail(email);
		if (!sanitizedEmail) {
			return res.status(400).json({
				success: false,
				message: "Invalid email format",
			});
		}

		// Check for user and include password, loginAttempts, and lockUntil
		const user = await User.findOne({ email: sanitizedEmail }).select(
			"+password +loginAttempts +lockUntil"
		);
		if (!user) {
			return res.status(401).json({
				success: false,
				message: "Invalid credentials",
			});
		}

		// Check if account is locked
		if (user.isLocked) {
			const minutesRemaining = user.getLockTimeRemaining();
			console.warn(
				`🔒 Login attempt on locked account: ${sanitizedEmail}. Locked for ${minutesRemaining} more minutes.`
			);
			return res.status(423).json({
				success: false,
				message: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minute(s).`,
				lockTimeRemaining: minutesRemaining,
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
			// Increment login attempts
			await user.incLoginAttempts();

			// Calculate remaining attempts
			const attemptsLeft = 5 - (user.loginAttempts + 1);

			console.warn(
				`⚠️  Failed login attempt for ${sanitizedEmail}. Attempts: ${
					user.loginAttempts + 1
				}/5`
			);

			if (attemptsLeft <= 0) {
				return res.status(401).json({
					success: false,
					message:
						"Invalid credentials. Your account has been temporarily locked for 15 minutes due to multiple failed login attempts.",
				});
			} else if (attemptsLeft <= 2) {
				return res.status(401).json({
					success: false,
					message: `Invalid credentials. ${attemptsLeft} attempt(s) remaining before account lockout.`,
					attemptsRemaining: attemptsLeft,
				});
			} else {
				return res.status(401).json({
					success: false,
					message: "Invalid credentials",
				});
			}
		}

		if (user.emailConfirmed === false) {
			return res.status(403).json({
				success: false,
				message: "Please confirm your email before logging in.",
				needsConfirmation: true,
			});
		}

		// Check if user has required role for  access
		const allowedRoles = ["manager", "admin", "customer", "rider", "staff"];
		if (!allowedRoles.includes(user.role)) {
			return res.status(403).json({
				success: false,
				message:
					"Access denied.  Access is restricted to managers, administrators, customers, and riders only.",
			});
		}

		// Reset login attempts on successful login
		if (user.loginAttempts > 0 || user.lockUntil) {
			await user.resetLoginAttempts();
			console.log(
				`✅ Login attempts reset for ${sanitizedEmail} after successful login`
			);
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
				user: user.toMaskedObject(),
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
		const { name, phoneNumber, email, address, creditCard } = req.body;

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
		if (creditCard) fieldsToUpdate.creditCard = creditCard;

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

		// Sanitize email input to prevent NoSQL injection
		const sanitizedEmail = sanitizeEmail(email);
		if (!sanitizedEmail) {
			return res.status(400).json({
				success: false,
				message: "Invalid email format",
			});
		}

		// Check for user and include password, loginAttempts, and lockUntil
		const user = await User.findOne({ email: sanitizedEmail }).select(
			"+password +loginAttempts +lockUntil"
		);
		if (!user) {
			return res.status(401).json({
				success: false,
				message: "Invalid credentials",
			});
		}

		// Check if account is locked
		if (user.isLocked) {
			const minutesRemaining = user.getLockTimeRemaining();
			console.warn(
				`🔒 Login attempt on locked account: ${sanitizedEmail}. Locked for ${minutesRemaining} more minutes.`
			);
			return res.status(423).json({
				success: false,
				message: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minute(s).`,
				lockTimeRemaining: minutesRemaining,
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
			// Increment login attempts
			await user.incLoginAttempts();

			// Calculate remaining attempts
			const attemptsLeft = 5 - (user.loginAttempts + 1);

			console.warn(
				`⚠️  Failed login attempt for ${sanitizedEmail}. Attempts: ${
					user.loginAttempts + 1
				}/5`
			);

			if (attemptsLeft <= 0) {
				return res.status(401).json({
					success: false,
					message:
						"Invalid credentials. Your account has been temporarily locked for 15 minutes due to multiple failed login attempts.",
				});
			} else if (attemptsLeft <= 2) {
				return res.status(401).json({
					success: false,
					message: `Invalid credentials. ${attemptsLeft} attempt(s) remaining before account lockout.`,
					attemptsRemaining: attemptsLeft,
				});
			} else {
				return res.status(401).json({
					success: false,
					message: "Invalid credentials",
				});
			}
		}

		if (user.emailConfirmed === false) {
			return res.status(403).json({
				success: false,
				message: "Please confirm your email before logging in.",
				needsConfirmation: true,
			});
		}

		// Reset login attempts on successful login
		if (user.loginAttempts > 0 || user.lockUntil) {
			await user.resetLoginAttempts();
			console.log(
				`✅ Login attempts reset for ${sanitizedEmail} after successful login`
			);
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
				user: user.toMaskedObject(),
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

// @desc    Refresh access token using refresh token
// @route   POST /api/auth/refresh
// @access  Public
const refreshToken = async (req, res) => {
	try {
		const { refreshToken } = req.body;

		// Check if refresh token is provided
		if (!refreshToken) {
			return res.status(400).json({
				success: false,
				message: "Refresh token is required",
			});
		}

		try {
			// Verify refresh token
			const decoded = verifyRefreshToken(refreshToken);

			// Get user from token
			const user = await User.findById(decoded.id);
			if (!user) {
				return res.status(401).json({
					success: false,
					message: "Invalid refresh token",
				});
			}

			// Check if user is active
			if (!user.isActive) {
				return res.status(401).json({
					success: false,
					message: "User account is deactivated",
				});
			}

			if (user.emailConfirmed === false) {
				return res.status(403).json({
					success: false,
					message: "Please confirm your email before continuing.",
					needsConfirmation: true,
				});
			}

			// Generate new access token
			const newAccessToken = generateToken({ id: user._id });

			// Optionally generate new refresh token for better security (token rotation)
			const newRefreshToken = generateRefreshToken({ id: user._id });

			res.json({
				success: true,
				message: "Token refreshed successfully",
				data: {
					token: newAccessToken,
					refreshToken: newRefreshToken,
					user: user.toSafeObject(),
				},
			});
		} catch (error) {
			return res.status(401).json({
				success: false,
				message: "Invalid refresh token",
			});
		}
	} catch (error) {
		console.error("Refresh token error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during token refresh",
		});
	}
};

// @desc    Get all users (Admin only)
// @route   GET /api/auth/users
// @desc     Get all users or filter by role (supports inclusion/exclusion)
// @access  Private (Admin, Manager, Staff)
const getAllUsers = async (req, res) => {
	try {
		// Check if user has appropriate permissions
		const allowedRoles = ["admin", "manager", "staff"];
		if (!allowedRoles.includes(req.user.role)) {
			return res.status(403).json({
				success: false,
				message: "Access denied. Admin, manager, or staff privileges required.",
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
			emailConfirmed: true,
			emailConfirmedAt: new Date(),
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

// @desc    Get customer count
// @route   GET /api/auth/customers/count
// @access  Private (Admin/Manager only)
const getCustomerCount = async (req, res) => {
	try {
		// Count only customers (users with role "customer")
		const customerCount = await User.countDocuments({
			role: "customer",
			isActive: true,
		});

		res.json({
			success: true,
			data: {
				customerCount: customerCount,
				message: `Total active customers: ${customerCount}`,
			},
		});
	} catch (error) {
		console.error("Get customer count error:", error);
		res.status(500).json({
			success: false,
			message: "Server error while fetching customer count",
		});
	}
};

// @desc    Delete own account
// @route   DELETE /api/auth/delete-account
// @access  Private
const deleteAccount = async (req, res) => {
	try {
		const { password } = req.body;

		// Get user with password
		const user = await User.findById(req.user._id).select("+password");
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
			});
		}

		// Check password
		const isMatch = await user.comparePassword(password);
		if (!isMatch) {
			return res.status(401).json({
				success: false,
				message: "Invalid password",
			});
		}

		// Delete the user
		await User.findByIdAndDelete(req.user._id);

		res.json({
			success: true,
			message: "Account deleted successfully",
		});
	} catch (error) {
		console.error("Delete account error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during account deletion",
		});
	}
};

module.exports = {
	register,
	confirmEmail,
	login,
	loginProfile,
	refreshToken,
	getMe,
	updateProfile,
	changePassword,
	getAllUsers,
	getUserById,
	createUser,
	updateUser,
	deleteUser,
	deleteAccount,
	getCustomerCount,
};
