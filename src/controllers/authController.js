const crypto = require("crypto");
const { validationResult } = require("express-validator");
const User = require("../models/User");
const Market = require("../models/Market");
const {
	generateToken,
	generateRefreshToken,
	verifyRefreshToken,
} = require("../utils/jwt");
const sendEmail = require("../utils/sendEmail");
const {
	registrationConfirmationEmail,
	passwordResetEmail,
} = require("../utils/emailTemplates");
const { normalizeLebanonPhone, isPhoneLike } = require("../utils/phone");
const { sanitizeEmail } = require("../utils/sanitize");
const {
	verifyAppleIdentityToken,
	isApplePrivateRelayEmail,
} = require("../utils/appleAuth");
const { sendResponse, sendError, sendSuccess, sendValidationError, sendServerError } = require("../utils/apiResponse");
const {
	findDuplicateAccount,
	duplicateAccountMessage,
	duplicateAccountError,
	describeDuplicateKeyError,
} = require("../utils/accountDuplicates");

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
	try {
		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return sendValidationError(res, errors, 400, req);
		}

		const { name, phoneNumber, email, password, address } = req.body;

		const normalizedPhone = phoneNumber ? normalizeLebanonPhone(phoneNumber) : "";
		const normalizedEmail = email ? String(email).toLowerCase().trim() : "";

		const duplicate = await findDuplicateAccount({
			name,
			email: normalizedEmail,
			phoneNumber: normalizedPhone,
		});
		if (duplicate) {
			return sendError(res, 409, duplicateAccountMessage(duplicate), [
				duplicateAccountError(duplicate),
			]);
		}

		// ✅ Email verification is the primary (required) channel — a
		// confirmation link is sent via email.
		const emailToken = crypto.randomBytes(32).toString("hex");
		const emailTokenExpires = Date.now() + 24 * 60 * 60 * 1000;

		const userDoc = {
			name,
			email: normalizedEmail,
			password,
			address,
			emailToken,
			emailTokenExpires,
			emailConfirmed: false,
		};

		// ✅ Phone number is optional — only store it if the shopper provided one.
		if (normalizedPhone) {
			userDoc.phoneNumber = normalizedPhone;
		}

		const user = await User.create(userDoc);

		const baseUrl =
			process.env.SERVER_PUBLIC_URL ||
			process.env.API_BASE_URL ||
			(process.env.FRONTEND_URL
				? process.env.FRONTEND_URL.split(",")[0]
				: undefined) ||
			`http://localhost:${process.env.PORT || 3001}`;
		const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

		// ✅ Send the confirmation email. Best-effort: failure here doesn't block
		// registration itself, but the account stays unverified until the
		// shopper clicks the link.
		const confirmUrl = `${normalizedBaseUrl}/api/auth/confirm/${emailToken}`;
		const { subject: emailSubject, text: emailText, html: emailHtml } =
			registrationConfirmationEmail({ name, confirmUrl });

		try {
			await sendEmail({
				to: normalizedEmail,
				subject: emailSubject,
				text: emailText,
				html: emailHtml,
			});
		} catch (emailError) {
			console.error("Email confirmation send error:", emailError);
		}

		const ras = {
			userId: user._id,
		};

		sendResponse(res, 201, true, "Registration successful. Please check your email for a confirmation link.", ras);
	} catch (error) {
		console.error("Register error:", error);
		// A unique index (phoneNumber/email) can still fire on a race even though
		// we pre-check above. Report it as a readable field error, not a 500.
		const dup = describeDuplicateKeyError(error);
		if (dup) return sendError(res, dup.status, dup.message, dup.errors);
		sendServerError(res, error, "Server error during registration");
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
			return res
				.status(400)
				.send("Invalid or expired confirmation link");
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

		return res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Confirmed - Freshly lb</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
        }

        .container {
            background: white;
            border-radius: 20px;
            padding: 3rem;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 500px;
            width: 90%;
            position: relative;
            overflow: hidden;
        }

        .container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 5px;
            background: linear-gradient(90deg, #667eea, #764ba2);
        }

        .success-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #4CAF50, #45a049);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 2rem;
            box-shadow: 0 8px 20px rgba(76, 175, 80, 0.3);
            animation: bounce 0.6s ease-out;
        }

        .success-icon::after {
            content: '✓';
            font-size: 40px;
            color: white;
            font-weight: bold;
        }

        @keyframes bounce {
            0%, 20%, 50%, 80%, 100% {
                transform: translateY(0);
            }
            40% {
                transform: translateY(-10px);
            }
            60% {
                transform: translateY(-5px);
            }
        }

        h1 {
            color: #333;
            margin-bottom: 1rem;
            font-size: 2.2rem;
            font-weight: 700;
        }

        .subtitle {
            color: #666;
            margin-bottom: 2rem;
            font-size: 1.1rem;
            line-height: 1.6;
        }

        .login-btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 15px 40px;
            border-radius: 50px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        .login-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.5);
        }

        .footer {
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 1px solid #eee;
            color: #999;
            font-size: 0.9rem;
        }

        .footer a {
            color: #667eea;
            text-decoration: none;
        }

        .footer a:hover {
            text-decoration: underline;
        }

        @media (max-width: 600px) {
            .container {
                padding: 2rem;
                margin: 1rem;
            }

            h1 {
                font-size: 1.8rem;
            }

            .login-btn {
                padding: 12px 30px;
                font-size: 1rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon"></div>
        <h1>Email Confirmed!</h1>
        <p class="subtitle">Your email has been successfully verified. You can now log in to your Freshly lb account and start shopping for fresh groceries.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        
        <h1>Email Confirmed!</h1>
        <p class="subtitle">Your email has been successfully verified. You can now log in to your Freshly lb account and start shopping for fresh groceries.</p>
        <button onclick="window.close()" class="login-btn">Close</button>
        <div class="footer">
            <p>Willkommen bei Freshly lb!</p>
        </div>
    </div>
</body>
</html>`);
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
			return sendValidationError(res, errors, 400, req);
		}

		const { email, password } = req.body;

		// Sanitize email input to prevent NoSQL injection
		const sanitizedEmail = sanitizeEmail(email);
		if (!sanitizedEmail) {
			return sendError(res, 400, "Invalid email format");
		}

		// Check for user and include password, loginAttempts, and lockUntil
		const user = await User.findOne({ email: sanitizedEmail }).select(
			"+password +loginAttempts +lockUntil"
		);
		if (!user) {
			return sendError(res, 401, "Invalid credentials");
		}

		// Check if account is locked
		if (user.isLocked) {
			const minutesRemaining = user.getLockTimeRemaining();
			console.warn(
				`🔒 Login attempt on locked account: ${sanitizedEmail}. Locked for ${minutesRemaining} more minutes.`
			);
			const ras = { lockTimeRemaining: minutesRemaining };
			return sendResponse(res, 423, false, `The account is temporarily locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minute(s).`, ras);
		}

		// Check if user is active
		if (!user.isActive) {
			return sendError(res, 401, "Account is deactivated");
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
				return sendError(res, 401, "Invalid credentials. Your account has been temporarily locked for 15 minutes due to multiple failed login attempts.");
			} else if (attemptsLeft <= 2) {
				const ras = { attemptsRemaining: attemptsLeft };
				return sendResponse(res, 401, false, `Invalid credentials. ${attemptsLeft} attempt(s) remaining before account lockout.`, ras);
			} else {
				return sendError(res, 401, "Invalid credentials");
			}
		}

		// Email verification is the primary, required gate for mobile-app
		// shoppers only — block login until the shopper has confirmed the
		// email link. Admins, managers, staff, riders, and market drivers
		// (server dashboard logins) are exempt.
		if (user.role === "customer" && !user.emailConfirmed) {
			const ras = { needsConfirmation: true };
			return sendResponse(res, 403, false, "Please verify your email (check the confirmation link) before logging in.", ras);
		}

		// Check if user has required role for  access
		const allowedRoles = ["manager", "admin", "customer", "rider", "staff", "market_driver"];
		if (!allowedRoles.includes(user.role)) {
			return sendError(res, 403, "Access denied. Access is restricted to managers, administrators, customers, and riders only.");
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

		const ras = {
			user: user.toSafeObject(),
			token,
			refreshToken,
		};

		sendResponse(res, 200, true, "Login successful", ras);
	} catch (error) {
		console.error("Login error:", error);
		sendServerError(res, error, "Server error during login");
	}
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
	try {
		// Handle market account tokens (req.user is a synthesized object,
		// the real document lives in the Market collection on req.market)
		if (req.user && req.user.isMarket) {
			const market = req.market;
			if (!market) {
				return sendError(res, 404, "Market not found");
			}

			const ras = {
				user: {
					_id: market._id,
					id: market._id,
					name: market.name,
					username: market.username,
					email: market.email || `${market.username}@market.local`,
					phoneNumber: market.phoneNumber || "",
					role: "market",
					address: {
						city: market.location?.city || "",
					},
					cities: market.cities || [],
					logo: market.logo || "",
					isActive: market.isActive,
					lastLogin: market.lastLogin,
					createdAt: market.createdAt,
					isMarket: true,
					marketId: market._id,
				},
			};

			return sendResponse(res, 200, true, "Success", ras);
		}

		const user = await User.findById(req.user._id);

		if (!user) {
			return sendError(res, 404, "User not found");
		}

		const ras = {
			user: user.toMaskedObject(),
		};

		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Get me error:", error);
		sendServerError(res, error, "Server error");
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
			return sendValidationError(res, errors, 400, req);
		}

		const fieldsToUpdate = {};
		const { name, phoneNumber, email, address, creditCard, cities } = req.body;

		if (name) fieldsToUpdate.name = name;
		if (phoneNumber) fieldsToUpdate.phoneNumber = phoneNumber;
		if (email) {
			// Check if email is already taken by another user
			const existingUser = await User.findOne({
				email,
				_id: { $ne: req.user._id },
			});
			if (existingUser) {
				return sendError(res, 400, "Email is already in use");
			}
			fieldsToUpdate.email = email;
		}
		if (address) fieldsToUpdate.address = address;
		if (creditCard) fieldsToUpdate.creditCard = creditCard;
		if (cities !== undefined) {
			// Accept an array of city names; trim, drop blanks, de-duplicate, cap.
			fieldsToUpdate.cities = Array.isArray(cities)
				? [
						...new Set(
							cities
								.filter((c) => typeof c === "string")
								.map((c) => c.trim())
								.filter(Boolean)
						),
				  ].slice(0, 60)
				: [];
		}

		const user = await User.findByIdAndUpdate(req.user._id, fieldsToUpdate, {
			new: true,
			runValidators: true,
		});

		const ras = {
			user: user.toSafeObject(),
		};

		sendResponse(res, 200, true, "Profile updated successfully", ras);
	} catch (error) {
		console.error("Update profile error:", error);
		sendServerError(res, error, "Server error during profile update");
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
			return sendValidationError(res, errors, 400, req);
		}

		const { currentPassword, newPassword } = req.body;

		// Get user with password
		const user = await User.findById(req.user._id).select("+password");

		// Check current password
		const isMatch = await user.comparePassword(currentPassword);
		if (!isMatch) {
			return sendError(res, 400, "Current password is incorrect");
		}

		// Update password
		user.password = newPassword;
		await user.save();

		const ras = {};

		sendResponse(res, 200, true, "Password changed successfully", ras);
	} catch (error) {
		console.error("Change password error:", error);
		sendServerError(res, error, "Server error while changing password");
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
			return sendValidationError(res, errors, 400, req);
		}

		const { email, phone, password } = req.body;
		const rawIdentifier = String(phone || email || "").trim();
		if (!rawIdentifier) {
			return sendError(res, 400, "Phone number, email, or username is required");
		}

		const identifierIsEmail = rawIdentifier.includes("@");
		const identifierIsPhone = !identifierIsEmail && isPhoneLike(rawIdentifier);

		const sanitizedEmail = identifierIsEmail ? sanitizeEmail(rawIdentifier) : null;
		const normalizedPhoneIdentifier = identifierIsPhone
			? normalizeLebanonPhone(rawIdentifier)
			: null;
		const normalizedUsername = rawIdentifier.toLowerCase();

		// Check for user and include password, loginAttempts, and lockUntil
		let user = null;
		if (sanitizedEmail) {
			user = await User.findOne({ email: sanitizedEmail }).select(
				"+password +loginAttempts +lockUntil"
			);
		} else if (normalizedPhoneIdentifier) {
			user = await User.findOne({
				phoneNumber: normalizedPhoneIdentifier,
			}).select("+password +loginAttempts +lockUntil");
		}

		if (!user) {
			// Phone-based logins never fall back to the market/username flow —
			// markets always log in with a username, never a customer phone number.
			if (identifierIsPhone) {
				return sendError(res, 401, "Invalid credentials");
			}

			const marketQuery = sanitizedEmail
				? { $or: [{ username: normalizedUsername }, { email: sanitizedEmail }] }
				: { username: normalizedUsername };
			const market = await Market.findOne(marketQuery).select(
				"+password +loginAttempts +lockUntil"
			);

			if (!market) {
				return sendError(res, 401, "Invalid credentials");
			}

			if (market.isLocked) {
				return sendError(res, 423, "Account temporarily locked due to multiple failed login attempts. Try again later.");
			}

			if (!market.isActive) {
				return sendError(res, 401, "Market account is deactivated");
			}

			const marketPasswordMatches = await market.comparePassword(password);
			if (!marketPasswordMatches) {
				await market.incLoginAttempts();
				return sendError(res, 401, "Invalid credentials");
			}

			if (market.loginAttempts > 0 || market.lockUntil) {
				await market.resetLoginAttempts();
			}
			market.lastLogin = new Date();
			await market.save();

			const token = generateToken({ id: market._id, isMarket: true });
			const refreshToken = generateRefreshToken({
				id: market._id,
				isMarket: true,
			});

			const ras = {
				user: {
					id: market._id,
					_id: market._id,
					name: market.name,
					username: market.username,
					email: market.email || `${market.username}@market.local`,
					role: "market",
					marketId: market._id,
					isMarket: true,
				},
				market: market.toSafeObject(),
				token,
				refreshToken,
				// The old market-only login page at /market is retired; market
				// accounts now sign in on the shared /signin page and land here.
				redirectUrl: "/market-dashboard",
			};

			return sendResponse(res, 200, true, "Login successful", ras);
		}

		// Check if account is locked
		if (user.isLocked) {
			const minutesRemaining = user.getLockTimeRemaining();
			console.warn(
				`🔒 Login attempt on locked account: ${sanitizedEmail}. Locked for ${minutesRemaining} more minutes.`
			);
			const ras = { lockTimeRemaining: minutesRemaining };
			return sendResponse(res, 423, false, `The account is temporarily locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minute(s).`, ras);
		}

		// Check if user is active
		if (!user.isActive) {
			return sendError(res, 401, "Account is deactivated");
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
				return sendError(res, 401, "Invalid credentials. Your account has been temporarily locked for 15 minutes due to multiple failed login attempts.");
			} else if (attemptsLeft <= 2) {
				const ras = { attemptsRemaining: attemptsLeft };
				return sendResponse(res, 401, false, `Invalid credentials. ${attemptsLeft} attempt(s) remaining before account lockout.`, ras);
			} else {
				return sendError(res, 401, "Invalid credentials");
			}
		}

		// Email verification is the primary, required gate for mobile-app
		// shoppers only — block login until the shopper has confirmed the
		// email link. Admins, managers, staff, riders, and market drivers
		// (server dashboard logins) are exempt.
		if (user.role === "customer" && !user.emailConfirmed) {
			const ras = { needsConfirmation: true };
			return sendResponse(res, 403, false, "Please verify your email (check the confirmation link) before logging in.", ras);
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

		const ras = {
			user: user.toMaskedObject(),
			token,
			refreshToken,
			redirectUrl:
				user.role === "manager" || user.role === "admin"
					? "dashboard.html"
					: user.role === "rider" || user.role === "market_driver"
					? "/profile"
					: user.role === "market_staff" || user.role === "market_manager"
					? "/ordermanagement?ctx=market"
					: user.role === "staff"
					? "/ordermanagement"
					: "profile.html",
		};

		sendResponse(res, 200, true, "Login successful", ras);
	} catch (error) {
		console.error("Login profile error:", error);
		sendServerError(res, error, "Server error during login");
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
			return sendError(res, 400, "Refresh token is required");
		}

		try {
			// Verify refresh token
			const decoded = verifyRefreshToken(refreshToken);

			if (decoded && decoded.isMarket) {
				const market = await Market.findById(decoded.id);
				if (!market) {
					return sendError(res, 401, "Invalid refresh token");
				}

				if (!market.isActive) {
					return sendError(res, 401, "Market account is deactivated");
				}

				const newAccessToken = generateToken({
					id: market._id,
					isMarket: true,
				});
				const newRefreshToken = generateRefreshToken({
					id: market._id,
					isMarket: true,
				});

				const ras = {
					token: newAccessToken,
					refreshToken: newRefreshToken,
					user: {
						id: market._id,
						_id: market._id,
						name: market.name,
						username: market.username,
						email: market.email || `${market.username}@market.local`,
						phoneNumber: market.phoneNumber || "",
						role: "market",
						marketId: market._id,
						isMarket: true,
						address: {
							city: market.location?.city || "",
						},
						cities: market.cities || [],
						logo: market.logo || "",
						isActive: market.isActive,
						lastLogin: market.lastLogin,
						createdAt: market.createdAt,
					},
				};

				return sendResponse(res, 200, true, "Token refreshed successfully", ras);
			}

			// Get user from token
			const user = await User.findById(decoded.id);
			if (!user) {
				return sendError(res, 401, "Invalid refresh token");
			}

			// Check if user is active
			if (!user.isActive) {
				return sendError(res, 401, "User account is deactivated");
			}

			if (user.emailConfirmed === false) {
				const ras = { needsConfirmation: true };
				return sendResponse(res, 403, false, "Please confirm your email before continuing.", ras);
			}

			// Generate new access token
			const newAccessToken = generateToken({ id: user._id });

			// Optionally generate new refresh token for better security (token rotation)
			const newRefreshToken = generateRefreshToken({ id: user._id });

			const ras = {
				token: newAccessToken,
				refreshToken: newRefreshToken,
				user: user.toSafeObject(),
			};

			sendResponse(res, 200, true, "Token refreshed successfully", ras);
		} catch (error) {
			return sendError(res, 401, "Invalid refresh token");
		}
	} catch (error) {
		console.error("Refresh token error:", error);
		sendServerError(res, error, "Server error during token refresh");
	}
};

// @desc    Get all users (Admin only)
// @route   GET /api/auth/users
// @desc     Get all users or filter by role (supports inclusion/exclusion)
// @access  Private (Admin, Manager, Staff)
const getAllUsers = async (req, res) => {
	try {
		// Check if user has appropriate permissions
		const allowedRoles = ["admin", "manager", "staff", "market"];
		if (!allowedRoles.includes(req.user.role)) {
			return sendError(res, 403, "Access denied. Administrator, manager, or staff permissions required.");
		}

		// Build query object
		const queryObj = {};

		// Market admins can only see their own market's users
		if (req.user.role === "market") {
			queryObj.market = req.user.marketId;
		}

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

		const ras = {
			users,
			count: users.length,
		};

		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Get all users error:", error);
		sendServerError(res, error, "Server error fetching users");
	}
};

// @desc    Create new user (Admin only)
// @route   POST /api/auth/users
// @access  Private (Admin only)
const createUser = async (req, res) => {
	try {
		// Allow admin, manager and market admins to create users
		if (
			req.user.role !== "admin" &&
			req.user.role !== "manager" &&
			req.user.role !== "market"
		) {
			return sendError(res, 403, "Access denied. Administrator permissions required.");
		}

		// Managers cannot create admin users
		if (req.user.role === "manager" && req.body.role === "admin") {
			return sendError(res, 403, "Managers are not allowed to create admin users.");
		}

		// Market admins cannot create global admin / manager users
		if (
			req.user.role === "market" &&
			["admin", "manager"].includes(req.body.role)
		) {
			return sendError(res, 403, "Markets are not allowed to create admin/manager users.");
		}

		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return sendValidationError(res, errors, 400, req);
		}

		const { name, phoneNumber, email, password, address, role } = req.body;

		// phoneNumber has a unique index, so it MUST be part of the pre-check.
		// Leaving it out let a duplicate number reach Mongo and blow up with a
		// raw E11000 error instead of a readable message.
		const duplicate = await findDuplicateAccount({ name, email, phoneNumber });
		if (duplicate) {
			return sendError(res, 409, duplicateAccountMessage(duplicate), [
				duplicateAccountError(duplicate),
			]);
		}

		// Create user
		const user = await User.create({
			name,
			phoneNumber,
			email,
			password,
			address,
			role: role || "user",
			market: req.user.role === "market" ? req.user.marketId : undefined,
			emailConfirmed: true,
			emailConfirmedAt: new Date(),
		});

		const ras = {
			user: user.toSafeObject(),
		};

		sendResponse(res, 201, true, "User created successfully", ras);
	} catch (error) {
		console.error("Create user error:", error);
		const dup = describeDuplicateKeyError(error);
		if (dup) return sendError(res, dup.status, dup.message, dup.errors);
		sendServerError(res, error, "Server error during user creation");
	}
};

// @desc    Update user (Admin only)
// @route   PUT /api/auth/users/:id
// @access  Private (Admin only)
const updateUser = async (req, res) => {
	try {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return sendValidationError(res, errors, 400, req);
		}

		// Allow admin, manager and market admins to update users
		if (
			req.user.role !== "admin" &&
			req.user.role !== "manager" &&
			req.user.role !== "market"
		) {
			return sendError(res, 403, "Access denied. Administrator permissions required.");
		}

		// Managers cannot promote anyone to admin
		if (req.user.role === "manager" && req.body.role === "admin") {
			return sendError(res, 403, "Managers are not allowed to assign the admin role.");
		}

		// Market admins cannot assign global admin / manager roles
		if (
			req.user.role === "market" &&
			["admin", "manager"].includes(req.body.role)
		) {
			return sendError(res, 403, "Markets are not allowed to assign admin/manager roles.");
		}

		const userId = req.params.id;
		const { name, phoneNumber, email, address, role, isActive } = req.body;

		// Check if user exists
		let user = await User.findById(userId);
		if (!user) {
			return sendError(res, 404, "User not found");
		}

		// Managers cannot modify admin users
		if (req.user.role === "manager" && user.role === "admin") {
			return sendError(res, 403, "Managers are not allowed to edit admin users.");
		}

		if (req.user.role === "market") {
			// Market admins may only modify users belonging to their own market.
			if (
				!user.market ||
				String(user.market) !== String(req.user.marketId)
			) {
				return sendError(res, 403, "Not authorized to edit this user.");
			}
		} else if (user.market) {
			// Non-market roles cannot touch market-tied users.
			return sendError(res, 403, "Market users are read-only here. Manage them from the market dashboard.");
		}

		const duplicate = await findDuplicateAccount(
			{ name, email, phoneNumber },
			{ type: "user", id: userId },
		);
		if (duplicate) {
			return sendError(res, 409, duplicateAccountMessage(duplicate), [
				duplicateAccountError(duplicate),
			]);
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

		const ras = {
			user: user.toSafeObject(),
		};

		sendResponse(res, 200, true, "User updated successfully", ras);
	} catch (error) {
		console.error("Update user error:", error);
		const dup = describeDuplicateKeyError(error);
		if (dup) return sendError(res, dup.status, dup.message, dup.errors);
		sendServerError(res, error, "Server error during user update");
	}
};

// @desc    Delete user (Admin only)
// @route   DELETE /api/auth/users/:id
// @access  Private (Admin only)
const deleteUser = async (req, res) => {
	try {
		// Allow admin, manager and market admins to delete users
		if (
			req.user.role !== "admin" &&
			req.user.role !== "manager" &&
			req.user.role !== "market"
		) {
			return sendError(res, 403, "Access denied. Administrator permissions required.");
		}

		const userId = req.params.id;

		// Check if user exists
		const user = await User.findById(userId);
		if (!user) {
			return sendError(res, 404, "User not found");
		}

		// Managers cannot delete admin users
		if (req.user.role === "manager" && user.role === "admin") {
			return sendError(res, 403, "Managers are not allowed to delete admin users.");
		}

		if (req.user.role === "market") {
			// Market admins may only delete users belonging to their own market.
			if (
				!user.market ||
				String(user.market) !== String(req.user.marketId)
			) {
				return sendError(res, 403, "Not authorized to delete this user.");
			}
		} else if (user.market) {
			// Non-market roles cannot touch market-tied users.
			return sendError(res, 403, "Market users are read-only here. Manage them from the market dashboard.");
		}

		// Prevent admin from deleting themselves
		if (userId === req.user._id.toString()) {
			return sendError(res, 400, "You cannot delete your own account");
		}

		await User.findByIdAndDelete(userId);

		const ras = {};

		sendResponse(res, 200, true, "User deleted successfully", ras);
	} catch (error) {
		console.error("Delete user error:", error);
		sendServerError(res, error, "Server error while deleting user");
	}
};

// @desc    Get user by ID
// @route   GET /api/auth/users/:id
// @access  Private (Admin only)
const getUserById = async (req, res) => {
	try {
		const allowedRoles = ["admin", "manager", "market"];
		if (!allowedRoles.includes(req.user.role)) {
			return sendError(res, 403, "Not authorized to access this resource");
		}

		const user = await User.findById(req.params.id);

		if (!user) {
			return sendError(res, 404, "User not found");
		}

		// Market admins can only fetch their own market's users
		if (
			req.user.role === "market" &&
			(!user.market || String(user.market) !== String(req.user.marketId))
		) {
			return sendError(res, 403, "Not authorized to access this user");
		}

		const ras = { ...user.toSafeObject() };

		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Error in getUserById:", error);
		sendServerError(res, error, "Server error");
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
		const ras = {
			customerCount: customerCount,
			message: `Total number of active customers: ${customerCount}`,
		}

		sendResponse(res, 200, true, "Success", ras);  
	} catch (error) {
		console.error("Get customer count error:", error);
		sendServerError(res, error, "Server error fetching customer count");
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
			return sendError(res, 404, "User not found");
		}

		// Social accounts (Google / Sign in with Apple) have no password, so a
		// password prompt would make account deletion impossible for them — which
		// Apple's own review guidelines forbid. Their identity is already proven
		// by the bearer token used to reach this protected route.
		const isSocialAccount =
			!user.password ||
			user.authProvider === "google" ||
			user.authProvider === "apple" ||
			Boolean(user.googleId) ||
			Boolean(user.appleId);

		if (!isSocialAccount) {
			if (!password) {
				return sendError(res, 400, "Password is required for account deletion");
			}
			const isMatch = await user.comparePassword(password);
			if (!isMatch) {
				return sendError(res, 401, "Invalid password");
			}
		}

		// Delete the user
		await User.findByIdAndDelete(req.user._id);

		const ras = {};

		sendResponse(res, 200, true, "Account deleted successfully", ras);
	} catch (error) {
		console.error("Delete account error:", error);
		sendServerError(res, error, "Server error while deleting account");
	}
};

// @desc    Request password reset
// @route   POST /api/auth/forgot-password
// @access  Public
const requestPasswordReset = async (req, res) => {
	try {
		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return sendValidationError(res, errors, 400, req);
		}

		const { email } = req.body;

		// Sanitize email input
		const sanitizedEmail = sanitizeEmail(email);
		if (!sanitizedEmail) {
			return sendError(res, 400, "Invalid email format");
		}

		// Check if user exists
		const user = await User.findOne({ email: sanitizedEmail });
		if (!user) {
			// Don't reveal if email exists or not for security
			const ras = {};
			return sendResponse(res, 200, true, "If an account exists with this email, a password reset link has been sent.", ras);
		}

		// Check if user is active
		if (!user.isActive) {
			const ras = {};
			return sendResponse(res, 200, true, "If an account exists with this email, a password reset link has been sent.", ras);
		}

		// Generate reset token
		const resetToken = crypto.randomBytes(32).toString("hex");
		const resetTokenExpires = Date.now() + 60 * 60 * 1000; // 1 hour

		// Save reset token to user
		user.passwordResetToken = resetToken;
		user.passwordResetExpires = resetTokenExpires;
		await user.save();

		// Create reset URL
		const baseUrl =
			process.env.SERVER_PUBLIC_URL ||
			process.env.API_BASE_URL ||
			(process.env.FRONTEND_URL
				? process.env.FRONTEND_URL.split(",")[0]
				: undefined) ||
			`http://localhost:${process.env.PORT || 3001}`;
		const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
		const resetUrl = `${normalizedBaseUrl}/reset-password.html?token=${resetToken}`;

		const { subject: emailSubject, text: emailText, html: emailHtml } =
			passwordResetEmail({ name: user.name, resetUrl });

		try {
			await sendEmail({
				to: user.email,
				subject: emailSubject,
				text: emailText,
				html: emailHtml,
			});
		} catch (emailError) {
			console.error("Password reset email send error:", emailError);
			// Clear the reset token if email fails
			user.passwordResetToken = undefined;
			user.passwordResetExpires = undefined;
			await user.save();
			return sendServerError(res, emailError, "Failed to send password reset email. Please try again.");
		}

		const ras = {};

		sendResponse(res, 200, true, "If an account exists with this email, a password reset link has been sent.", ras);
	} catch (error) {
		console.error("Request password reset error:", error);
		sendServerError(res, error, "Server error during password reset request");
	}
};

// @desc    Reset password with token
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
	try {
		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return sendValidationError(res, errors, 400, req);
		}

		const { token, newPassword } = req.body;

		if (!token) {
			return sendError(res, 400, "Reset token is required");
		}

		// Find user with valid reset token
		const user = await User.findOne({
			passwordResetToken: token,
			passwordResetExpires: { $gt: Date.now() },
		});

		if (!user) {
			return sendError(res, 400, "Invalid or expired reset token");
		}

		// Check if user is active
		if (!user.isActive) {
			return sendError(res, 400, "Account is deactivated");
		}

		// Update password and clear reset token
		user.password = newPassword;
		user.passwordResetToken = undefined;
		user.passwordResetExpires = undefined;
		await user.save();

		const ras = {};

		sendResponse(res, 200, true, "Password reset successfully", ras);
	} catch (error) {
		console.error("Reset password error:", error);
		sendServerError(res, error, "Server error during password reset");
	}
};

// @desc    Reset customer password (Admin only)
// @route   POST /api/auth/reset-password/:id
// @access  Private (Admin only)
const resetCustomerPassword = async (req, res) => {
	try {
		// Check if user is admin
		if (req.user.role !== "admin") {
			return sendError(res, 403, "Access denied. Administrator permissions required.");
		}

		const userId = req.params.id;

		// Check if user exists and is a customer
		const user = await User.findById(userId);
		if (!user) {
			return sendError(res, 404, "User not found");
		}

		if (user.role !== "customer") {
			return sendError(res, 400, "Password reset is only allowed for customers");
		}

		// Reset password to "123456789"
		user.password = "123456789";
		await user.save();

		const ras = {};

		sendResponse(res, 200, true, "Customer password reset successfully", ras);
	} catch (error) {
		console.error("Reset customer password error:", error);
		sendServerError(res, error, "Server error during password reset");
	}
};

// ---------------------------------------------------------------------------
// Google sign-in address defaults
// ---------------------------------------------------------------------------
// Google accounts never go through the registration city picker, so they used
// to land in the database with an empty address — which the dashboards then
// rendered as "Not provided". We FORCE every missing address field to the
// Beirut default (city/state/street + the exact Beirut map pin) on every
// single Google sign-in / sign-up, so a Google user is never stored without an
// address.
const DEFAULT_GOOGLE_CITY = "Beirut";
const DEFAULT_GOOGLE_STATE = "Beirut";
const DEFAULT_GOOGLE_STREET = "Beirut";
// Exact Beirut city-center pin, used when the device refused to share its
// location (permission denied) so the customer still has a usable map pin.
const DEFAULT_GOOGLE_PIN = { latitude: 33.8938, longitude: 35.5018 };

// A value counts as "missing" when it is null/undefined/empty/0 or one of the
// placeholder strings that used to leak into the database.
const isMissingValue = (value) => {
	if (value === null || value === undefined) return true;
	if (typeof value === "number") return value === 0;
	const str = String(value).trim().toLowerCase();
	return (
		str === "" ||
		str === "0" ||
		str === "not provided" ||
		str === "n/a" ||
		str === "null" ||
		str === "undefined"
	);
};

/**
 * Builds a complete address object for a Google account: keeps whatever the
 * caller/user already has and forces the Beirut default into every field that
 * is still missing. `clientAddress` is the optional address the mobile app
 * sends along with the Google id token (GPS-detected when the shopper allowed
 * location access).
 */
const buildGoogleAddress = (existing = {}, clientAddress = {}) => {
	const pick = (...values) => values.find((v) => !isMissingValue(v));

	const latitude = pick(
		existing?.location?.latitude,
		clientAddress?.location?.latitude,
		DEFAULT_GOOGLE_PIN.latitude
	);
	const longitude = pick(
		existing?.location?.longitude,
		clientAddress?.location?.longitude,
		DEFAULT_GOOGLE_PIN.longitude
	);

	return {
		street: pick(existing?.street, clientAddress?.street, DEFAULT_GOOGLE_STREET),
		city: pick(existing?.city, clientAddress?.city, DEFAULT_GOOGLE_CITY),
		state: pick(existing?.state, clientAddress?.state, DEFAULT_GOOGLE_STATE),
		country: pick(existing?.country, clientAddress?.country, "LB"),
		location: { latitude, longitude },
	};
};

// @desc    Sign in / sign up with a Google account
// @route   POST /api/auth/google
// @access  Public
const googleSignIn = async (req, res) => {
	try {
		const { idToken, address: clientAddress } = req.body;
		if (!idToken) {
			return sendError(res, 400, "Missing Google idToken");
		}

		// Verify the Google ID token using Google's public tokeninfo endpoint.
		// This avoids adding the google-auth-library dependency and works with
		// the global fetch available in Node 18+.
		let payload;
		try {
			const resp = await fetch(
				`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
					idToken
				)}`
			);
			if (!resp.ok) {
				return sendError(res, 401, "Invalid Google token");
			}
			payload = await resp.json();
		} catch (e) {
			console.error("Google token verify error:", e);
			return sendError(res, 401, "Could not verify Google token");
		}

		// Optionally validate the audience against configured client id(s).
		const allowedAud = (process.env.GOOGLE_CLIENT_ID || "")
			.split(",")
			.map((a) => a.trim())
			.filter(Boolean);
		if (allowedAud.length && !allowedAud.includes(payload.aud)) {
			return sendError(res, 401, "Google token audience mismatch");
		}

		const googleId = payload.sub;
		const email = payload.email
			? String(payload.email).toLowerCase()
			: undefined;
		const name =
			payload.name || (email ? email.split("@")[0] : "Google User");
		const emailVerified =
			payload.email_verified === true || payload.email_verified === "true";

		if (!googleId) {
			return sendError(res, 401, "Invalid Google token payload");
		}

		// Find an existing user by googleId first, then by email (link accounts).
		let user = await User.findOne({ googleId });
		if (!user && email) {
			user = await User.findOne({ email });
		}

		const isNewUser = !user;

		if (user) {
			// Link Google to an existing (e.g. local) account if not linked yet.
			if (!user.googleId) {
				user.googleId = googleId;
			}
			if (emailVerified && !user.emailConfirmed) {
				user.emailConfirmed = true;
				user.emailConfirmedAt = new Date();
			}
			// Backfill/force the address so an older Google account that was
			// created without one stops showing "Not provided".
			user.address = buildGoogleAddress(
				user.address ? user.address.toObject?.() ?? user.address : {},
				clientAddress || {}
			);
			user.markModified("address");
			user.lastLogin = new Date();
			await user.save();
		} else {
			// Create a brand new Google-backed account.
			user = await User.create({
				name,
				email,
				googleId,
				authProvider: "google",
				address: buildGoogleAddress({}, clientAddress || {}),
				emailConfirmed: emailVerified,
				emailConfirmedAt: emailVerified ? new Date() : undefined,
				lastLogin: new Date(),
			});
		}

		const token = generateToken({ id: user._id });
		const refreshToken = generateRefreshToken({ id: user._id });

		const ras = {
			user: user.toSafeObject(),
			token,
			refreshToken,
			isNewUser,
		};

		sendResponse(res, 200, true, "Login successful", ras);
	} catch (error) {
		console.error("Google sign-in error:", error);
		sendServerError(res, error, "Server error during Google sign-in");
	}
};

// ---------------------------------------------------------------------------
// Sign in with Apple
// ---------------------------------------------------------------------------
// App Store Review guideline 4.8 requires an equivalent login option next to
// Google sign-in. Sign in with Apple qualifies: it only shares the name and
// email, lets the shopper hide their real email behind an
// @privaterelay.appleid.com alias, and does not track them for advertising.
//
// IMPORTANT Apple quirk: the full name and the email are ONLY delivered the
// very first time a given Apple ID authorizes the app. On every later sign-in
// the client sends just the identity token (which still contains `sub`, and
// usually the email). So the `sub` claim — stored as `appleId` — is the only
// reliable lookup key, and we must never overwrite a stored name/email with an
// empty value.
//
// @desc    Sign in / sign up with an Apple account
// @route   POST /api/auth/apple
// @access  Public
const appleSignIn = async (req, res) => {
	try {
		const {
			identityToken,
			idToken, // tolerated alias
			fullName,
			name: rawName,
			email: clientEmail,
			address: clientAddress,
		} = req.body || {};

		const token = identityToken || idToken;
		if (!token) {
			return sendError(res, 400, "Missing Apple identityToken");
		}

		let payload;
		try {
			payload = await verifyAppleIdentityToken(token);
		} catch (e) {
			console.error("Apple token verify error:", e.message);
			return sendError(res, 401, "Could not verify Apple token");
		}

		const appleId = payload.sub;
		// The token normally carries the email; on some first-authorization flows
		// only the native credential has it, so fall back to the client value.
		// (Never trusted for identity — `sub` alone decides who the user is.)
		const email =
			payload.email ||
			(typeof clientEmail === "string" && clientEmail.includes("@")
				? clientEmail.trim().toLowerCase()
				: undefined);
		const isPrivateRelay =
			payload.is_private_email || isApplePrivateRelayEmail(email);

		// Apple sends the name only on the first authorization. The mobile app
		// forwards it either as a plain string (`fullName` / `name`) or as the
		// raw `{ givenName, familyName }` object — accept both.
		const nameFromApple =
			(typeof rawName === "string" && rawName.trim()) ||
			(typeof fullName === "string" && fullName.trim()) ||
			[fullName?.givenName, fullName?.familyName]
				.filter((p) => typeof p === "string" && p.trim())
				.join(" ")
				.trim() ||
			"";

		// Look up by appleId first, then link by email (a shopper who registered
		// locally or with Google and now taps "Sign in with Apple" must land in
		// the same account — unless they hid their email, in which case Apple
		// gives us an alias that cannot be matched and a new account is correct).
		let user = await User.findOne({ appleId });
		if (!user && email && !isPrivateRelay) {
			user = await User.findOne({ email });
		}

		const isNewUser = !user;

		if (user) {
			if (!user.appleId) user.appleId = appleId;
			if (!user.name && nameFromApple) user.name = nameFromApple;
			// Apple has already verified the address it hands us.
			if (payload.email_verified && !user.emailConfirmed) {
				user.emailConfirmed = true;
				user.emailConfirmedAt = new Date();
			}
			if (isPrivateRelay) user.appleEmailIsPrivateRelay = true;
			// Same address backfill as Google so the dashboards never show
			// "Not provided" for a social account.
			user.address = buildGoogleAddress(
				user.address ? user.address.toObject?.() ?? user.address : {},
				clientAddress || {}
			);
			user.markModified("address");
			user.lastLogin = new Date();
			await user.save();
		} else {
			user = await User.create({
				name:
					nameFromApple ||
					(email && !isPrivateRelay ? email.split("@")[0] : "Apple User"),
				// Email may legitimately be absent (repeat authorization without a
				// stored account) — the schema allows that for social accounts.
				email: email || undefined,
				appleId,
				appleEmailIsPrivateRelay: isPrivateRelay,
				authProvider: "apple",
				address: buildGoogleAddress({}, clientAddress || {}),
				emailConfirmed: Boolean(email) && payload.email_verified,
				emailConfirmedAt:
					Boolean(email) && payload.email_verified ? new Date() : undefined,
				lastLogin: new Date(),
			});
		}

		const accessToken = generateToken({ id: user._id });
		const refresh = generateRefreshToken({ id: user._id });

		sendResponse(res, 200, true, "Login successful", {
			user: user.toSafeObject(),
			token: accessToken,
			refreshToken: refresh,
			isNewUser,
		});
	} catch (error) {
		console.error("Apple sign-in error:", error);
		sendServerError(res, error, "Server error during Apple sign-in");
	}
};

module.exports = {
	googleSignIn,
	appleSignIn,
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
	requestPasswordReset,
	resetPassword,
	resetCustomerPassword,
	getCustomerCount,
};
