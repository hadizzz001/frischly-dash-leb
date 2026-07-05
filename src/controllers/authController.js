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
const { sendVerificationLink } = require("../utils/sendSms");
const { normalizeLebanonPhone, isPhoneLike } = require("../utils/phone");
const { sanitizeEmail } = require("../utils/sanitize");
const {
	findDuplicateAccount,
	duplicateAccountMessage,
} = require("../utils/accountDuplicates");

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
				message: `Validation failed: ${errors
					.array()
					.map((e) => e.msg)
					.join(", ")}`,
				errors: errors.array(),
			});
		}

		const { name, phoneNumber, email, password, address } = req.body;

		const normalizedPhone = normalizeLebanonPhone(phoneNumber);
		const normalizedEmail = email ? String(email).toLowerCase().trim() : "";

		const duplicate = await findDuplicateAccount({
			name,
			email: normalizedEmail,
			phoneNumber: normalizedPhone,
		});
		if (duplicate) {
			return res.status(400).json({
				success: false,
				message: duplicateAccountMessage(duplicate),
			});
		}

		// ✅ Phone verification is now the primary (required) channel — a
		// verification link is sent via SMS/WhatsApp to the phone number.
		const phoneVerificationToken = crypto.randomBytes(32).toString("hex");
		const phoneVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;

		const userDoc = {
			name,
			phoneNumber: normalizedPhone,
			password,
			address,
			phoneVerificationToken,
			phoneVerificationExpires,
			phoneVerified: false,
		};

		// ✅ Email is optional — only store it (and only send a confirmation
		// email) if the shopper actually provided one.
		let emailToken = null;
		if (normalizedEmail) {
			emailToken = crypto.randomBytes(32).toString("hex");
			userDoc.email = normalizedEmail;
			userDoc.emailToken = emailToken;
			userDoc.emailTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
			userDoc.emailConfirmed = false;
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

		// ✅ Send the phone verification link via SMS/WhatsApp. Best-effort: if
		// the messaging provider (Twilio) isn't configured yet, this just logs
		// the link to the console instead of blocking registration — see
		// src/utils/sendSms.js. Configure TWILIO_* env vars to go live.
		const phoneConfirmUrl = `${normalizedBaseUrl}/api/auth/confirm-phone/${phoneVerificationToken}`;
		try {
			await sendVerificationLink({
				phoneNumber: normalizedPhone,
				link: phoneConfirmUrl,
				name,
			});
		} catch (smsError) {
			console.error("Phone verification send error:", smsError);
		}

		// Best-effort confirmation email (only if an email was provided).
		// Failure here no longer blocks registration — phone is now the primary,
		// required verification channel.
		if (normalizedEmail && emailToken) {
			const confirmUrl = `${normalizedBaseUrl}/api/auth/confirm/${emailToken}`;
			const emailSubject = "Confirm your Freshly lb email";
			const emailText = `Hi ${
				name || "there"
			},\n\nPlease confirm your email by visiting the link below:\n${confirmUrl}\n\nIf you did not create an account, you can ignore this email.`;
			const emailHtml = `<!doctype html><html><body><p>Hi ${
				name || "there"
			},</p><p>Please confirm your email by clicking the button below.</p><p><a href="${confirmUrl}">Confirm Email</a></p><p>If you did not create an account, you can ignore this email.</p></body></html>`;

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
		}

		res.status(201).json({
			success: true,
			message:
				"Registration successful. Please check your phone for a verification link sent via SMS or WhatsApp to confirm your account.",
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

// @desc    Confirm a user's phone number via the SMS/WhatsApp verification link
// @route   GET /api/auth/confirm-phone/:token
// @access  Public
const confirmPhone = async (req, res) => {
	try {
		const { token } = req.params;

		if (!token) {
			return res.status(400).send("Invalid confirmation link");
		}

		const user = await User.findOne({
			phoneVerificationToken: token,
			phoneVerificationExpires: { $gt: Date.now() },
		});

		if (!user) {
			return res
				.status(400)
				.send("Invalid or expired confirmation link");
		}

		user.phoneVerified = true;
		user.phoneVerifiedAt = new Date();
		user.phoneVerificationToken = undefined;
		user.phoneVerificationExpires = undefined;

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
    <title>Phone Verified - Freshly lb</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #333;
        }
        .container {
            background: white; border-radius: 20px; padding: 3rem; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            text-align: center; max-width: 500px; width: 90%; position: relative; overflow: hidden;
        }
        .container::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 5px;
            background: linear-gradient(90deg, #667eea, #764ba2);
        }
        .success-icon {
            width: 80px; height: 80px; background: linear-gradient(135deg, #4CAF50, #45a049); border-radius: 50%;
            display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem;
            box-shadow: 0 8px 20px rgba(76, 175, 80, 0.3); animation: bounce 0.6s ease-out;
        }
        .success-icon::after { content: '✓'; font-size: 40px; color: white; font-weight: bold; }
        @keyframes bounce {
            0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-10px); }
            60% { transform: translateY(-5px); }
        }
        h1 { color: #333; margin-bottom: 1rem; font-size: 2.2rem; font-weight: 700; }
        .subtitle { color: #666; margin-bottom: 2rem; font-size: 1.1rem; line-height: 1.6; }
        .login-btn {
            background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 15px 40px;
            border-radius: 50px; font-size: 1.1rem; font-weight: 600; cursor: pointer; text-decoration: none;
            display: inline-block; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
        .footer { margin-top: 2rem; padding-top: 2rem; border-top: 1px solid #eee; color: #999; font-size: 0.9rem; }
        @media (max-width: 600px) {
            .container { padding: 2rem; margin: 1rem; }
            h1 { font-size: 1.8rem; }
            .login-btn { padding: 12px 30px; font-size: 1rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon"></div>
        <h1>Phone Verified!</h1>
        <p class="subtitle">Your phone number has been successfully verified. You can now log in to your Freshly lb account using your phone number and password.</p>
        <button onclick="window.close()" class="login-btn">Close</button>
        <div class="footer">
            <p>Willkommen bei Freshly lb!</p>
        </div>
    </div>
</body>
</html>`);
	} catch (error) {
		console.error("Phone confirmation error:", error);
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
				message: `Validation failed: ${errors
					.array()
					.map((e) => e.msg)
					.join(", ")}`,
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
				message: `The account is temporarily locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minute(s).`,
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
				message:
					"Please confirm your email (it may be in the spam folder) before logging in.",
				needsConfirmation: true,
			});
		}

		// Check if user has required role for  access
		const allowedRoles = ["manager", "admin", "customer", "rider", "staff", "market_driver"];
		if (!allowedRoles.includes(user.role)) {
			return res.status(403).json({
				success: false,
				message:
					"Access denied. Access is restricted to managers, administrators, customers, and riders only.",
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
		// Handle market account tokens (req.user is a synthesized object,
		// the real document lives in the Market collection on req.market)
		if (req.user && req.user.isMarket) {
			const market = req.market;
			if (!market) {
				return res.status(404).json({
					success: false,
					message: "Market not found",
				});
			}

			return res.json({
				success: true,
				data: {
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
				},
			});
		}

		const user = await User.findById(req.user._id);

		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
			});
		}

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
				message: `Validation failed: ${errors
					.array()
					.map((e) => e.msg)
					.join(", ")}`,
				errors: errors.array(),
			});
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
				return res.status(400).json({
					success: false,
					message: "Email is already in use",
				});
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
				message: `Validation failed: ${errors
					.array()
					.map((e) => e.msg)
					.join(", ")}`,
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
			message: "Server error while changing password",
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
				message: `Validation failed: ${errors
					.array()
					.map((e) => e.msg)
					.join(", ")}`,
				errors: errors.array(),
			});
		}

		const { email, phone, password } = req.body;
		const rawIdentifier = String(phone || email || "").trim();
		if (!rawIdentifier) {
			return res.status(400).json({
				success: false,
				message: "Phone number, email, or username is required",
			});
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
				return res.status(401).json({
					success: false,
					message: "Invalid credentials",
				});
			}

			const marketQuery = sanitizedEmail
				? { $or: [{ username: normalizedUsername }, { email: sanitizedEmail }] }
				: { username: normalizedUsername };
			const market = await Market.findOne(marketQuery).select(
				"+password +loginAttempts +lockUntil"
			);

			if (!market) {
				return res.status(401).json({
					success: false,
					message: "Invalid credentials",
				});
			}

			if (market.isLocked) {
				return res.status(423).json({
					success: false,
					message:
						"Account temporarily locked due to multiple failed login attempts. Try again later.",
				});
			}

			if (!market.isActive) {
				return res.status(401).json({
					success: false,
					message: "Market account is deactivated",
				});
			}

			const marketPasswordMatches = await market.comparePassword(password);
			if (!marketPasswordMatches) {
				await market.incLoginAttempts();
				return res.status(401).json({
					success: false,
					message: "Invalid credentials",
				});
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

			return res.json({
				success: true,
				message: "Login successful",
				data: {
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
					redirectUrl: "/market",
				},
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
				message: `The account is temporarily locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minute(s).`,
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

		if (!user.emailConfirmed && !user.phoneVerified) {
			return res.status(403).json({
				success: false,
				message:
					"Please verify your phone number (check the SMS/WhatsApp link) before logging in.",
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
						: user.role === "rider" || user.role === "market_driver"
						? "/rider"
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

			if (decoded && decoded.isMarket) {
				const market = await Market.findById(decoded.id);
				if (!market) {
					return res.status(401).json({
						success: false,
						message: "Invalid refresh token",
					});
				}

				if (!market.isActive) {
					return res.status(401).json({
						success: false,
						message: "Market account is deactivated",
					});
				}

				const newAccessToken = generateToken({
					id: market._id,
					isMarket: true,
				});
				const newRefreshToken = generateRefreshToken({
					id: market._id,
					isMarket: true,
				});

				return res.json({
					success: true,
					message: "Token refreshed successfully",
					data: {
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
					},
				});
			}

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
		const allowedRoles = ["admin", "manager", "staff", "market"];
		if (!allowedRoles.includes(req.user.role)) {
			return res.status(403).json({
				success: false,
				message:
					"Access denied. Administrator, manager, or staff permissions required.",
			});
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
			message: "Server error fetching users",
		});
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
			return res.status(403).json({
				success: false,
				message: "Access denied. Administrator permissions required.",
			});
		}

		// Managers cannot create admin users
		if (req.user.role === "manager" && req.body.role === "admin") {
			return res.status(403).json({
				success: false,
				message: "Managers are not allowed to create admin users.",
			});
		}

		// Market admins cannot create global admin / manager users
		if (
			req.user.role === "market" &&
			["admin", "manager"].includes(req.body.role)
		) {
			return res.status(403).json({
				success: false,
				message: "Markets are not allowed to create admin/manager users.",
			});
		}

		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({
				success: false,
				message: `Validation failed: ${errors
					.array()
					.map((e) => e.msg)
					.join(", ")}`,
				errors: errors.array(),
			});
		}

		const { name, phoneNumber, email, password, address, role } = req.body;

		const duplicate = await findDuplicateAccount({ name, email });
		if (duplicate) {
			return res.status(400).json({
				success: false,
				message: duplicateAccountMessage(duplicate),
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
			market: req.user.role === "market" ? req.user.marketId : undefined,
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
		// Allow admin, manager and market admins to update users
		if (
			req.user.role !== "admin" &&
			req.user.role !== "manager" &&
			req.user.role !== "market"
		) {
			return res.status(403).json({
				success: false,
				message: "Access denied. Administrator permissions required.",
			});
		}

		// Managers cannot promote anyone to admin
		if (req.user.role === "manager" && req.body.role === "admin") {
			return res.status(403).json({
				success: false,
				message: "Managers are not allowed to assign the admin role.",
			});
		}

		// Market admins cannot assign global admin / manager roles
		if (
			req.user.role === "market" &&
			["admin", "manager"].includes(req.body.role)
		) {
			return res.status(403).json({
				success: false,
				message: "Markets are not allowed to assign admin/manager roles.",
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

		// Managers cannot modify admin users
		if (req.user.role === "manager" && user.role === "admin") {
			return res.status(403).json({
				success: false,
				message: "Managers are not allowed to edit admin users.",
			});
		}

		if (req.user.role === "market") {
			// Market admins may only modify users belonging to their own market.
			if (
				!user.market ||
				String(user.market) !== String(req.user.marketId)
			) {
				return res.status(403).json({
					success: false,
					message: "Not authorized to edit this user.",
				});
			}
		} else if (user.market) {
			// Non-market roles cannot touch market-tied users.
			return res.status(403).json({
				success: false,
				message:
					"Market users are read-only here. Manage them from the market dashboard.",
			});
		}

		const duplicate = await findDuplicateAccount(
			{ name, email },
			{ type: "user", id: userId },
		);
		if (duplicate) {
			return res.status(400).json({
				success: false,
				message: duplicateAccountMessage(duplicate),
			});
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
		// Allow admin, manager and market admins to delete users
		if (
			req.user.role !== "admin" &&
			req.user.role !== "manager" &&
			req.user.role !== "market"
		) {
			return res.status(403).json({
				success: false,
				message: "Access denied. Administrator permissions required.",
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

		// Managers cannot delete admin users
		if (req.user.role === "manager" && user.role === "admin") {
			return res.status(403).json({
				success: false,
				message: "Managers are not allowed to delete admin users.",
			});
		}

		if (req.user.role === "market") {
			// Market admins may only delete users belonging to their own market.
			if (
				!user.market ||
				String(user.market) !== String(req.user.marketId)
			) {
				return res.status(403).json({
					success: false,
					message: "Not authorized to delete this user.",
				});
			}
		} else if (user.market) {
			// Non-market roles cannot touch market-tied users.
			return res.status(403).json({
				success: false,
				message:
					"Market users are read-only here. Manage them from the market dashboard.",
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
			message: "Server error while deleting user",
		});
	}
};

// @desc    Get user by ID
// @route   GET /api/auth/users/:id
// @access  Private (Admin only)
const getUserById = async (req, res) => {
	try {
		const allowedRoles = ["admin", "manager", "market"];
		if (!allowedRoles.includes(req.user.role)) {
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

		// Market admins can only fetch their own market's users
		if (
			req.user.role === "market" &&
			(!user.market || String(user.market) !== String(req.user.marketId))
		) {
			return res.status(403).json({
				success: false,
				message: "Not authorized to access this user",
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
				message: `Total number of active customers: ${customerCount}`,
			},
		});
	} catch (error) {
		console.error("Get customer count error:", error);
		res.status(500).json({
			success: false,
			message: "Server error fetching customer count",
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
			message: "Server error while deleting account",
		});
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
			return res.status(400).json({
				success: false,
				message: `Validation failed: ${errors
					.array()
					.map((e) => e.msg)
					.join(", ")}`,
				errors: errors.array(),
			});
		}

		const { email } = req.body;

		// Sanitize email input
		const sanitizedEmail = sanitizeEmail(email);
		if (!sanitizedEmail) {
			return res.status(400).json({
				success: false,
				message: "Invalid email format",
			});
		}

		// Check if user exists
		const user = await User.findOne({ email: sanitizedEmail });
		if (!user) {
			// Don't reveal if email exists or not for security
			return res.status(200).json({
				success: true,
				message:
					"If an account exists with this email, a password reset link has been sent.",
			});
		}

		// Check if user is active
		if (!user.isActive) {
			return res.status(200).json({
				success: true,
				message:
					"If an account exists with this email, a password reset link has been sent.",
			});
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

		const emailSubject =
			"Reset your Freshly lb password";
		const emailText = `Hi ${user.name},\n\nYou requested a password reset for your Freshly lb account. Click the link below to reset your password:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this password reset, please ignore this email.`;
		const emailHtml = `<!doctype html><html><body><p>Hi ${user.name},</p><p>You requested a password reset for your Freshly lb account. Click the button below to reset your password.</p><p><a href="${resetUrl}">Reset Password</a></p><p>This link will expire in 1 hour.</p><p>If you didn't request this password reset, please ignore this email.</p></body></html>`;

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
			return res.status(500).json({
				success: false,
				message:
					"Failed to send password reset email. Please try again.",
			});
		}

		res.status(200).json({
			success: true,
			message:
				"If an account exists with this email, a password reset link has been sent.",
		});
	} catch (error) {
		console.error("Request password reset error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during password reset request",
		});
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
			return res.status(400).json({
				success: false,
				message: `Validation failed: ${errors
					.array()
					.map((e) => e.msg)
					.join(", ")}`,
				errors: errors.array(),
			});
		}

		const { token, newPassword } = req.body;

		if (!token) {
			return res.status(400).json({
				success: false,
				message: "Reset token is required",
			});
		}

		// Find user with valid reset token
		const user = await User.findOne({
			passwordResetToken: token,
			passwordResetExpires: { $gt: Date.now() },
		});

		if (!user) {
			return res.status(400).json({
				success: false,
				message: "Invalid or expired reset token",
			});
		}

		// Check if user is active
		if (!user.isActive) {
			return res.status(400).json({
				success: false,
				message: "Account is deactivated",
			});
		}

		// Update password and clear reset token
		user.password = newPassword;
		user.passwordResetToken = undefined;
		user.passwordResetExpires = undefined;
		await user.save();

		res.json({
			success: true,
			message: "Password reset successfully",
		});
	} catch (error) {
		console.error("Reset password error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during password reset",
		});
	}
};

// @desc    Reset customer password (Admin only)
// @route   POST /api/auth/reset-password/:id
// @access  Private (Admin only)
const resetCustomerPassword = async (req, res) => {
	try {
		// Check if user is admin
		if (req.user.role !== "admin") {
			return res.status(403).json({
				success: false,
				message: "Access denied. Administrator permissions required.",
			});
		}

		const userId = req.params.id;

		// Check if user exists and is a customer
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
			});
		}

		if (user.role !== "customer") {
			return res.status(400).json({
				success: false,
				message: "Password reset is only allowed for customers",
			});
		}

		// Reset password to "123456789"
		user.password = "123456789";
		await user.save();

		res.json({
			success: true,
			message: "Customer password reset successfully",
		});
	} catch (error) {
		console.error("Reset customer password error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during password reset",
		});
	}
};

module.exports = {
	register,
	confirmEmail,
	confirmPhone,
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
