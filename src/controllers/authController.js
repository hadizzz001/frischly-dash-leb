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
				message: "Validierung fehlgeschlagen",
				errors: errors.array(),
			});
		}

		const { name, phoneNumber, email, password, address } = req.body;

		// Check if user already exists
		let user = await User.findOne({ email });
		if (user) {
			return res.status(400).json({
				success: false,
				message: "Ein Benutzer mit dieser E-Mail existiert bereits",
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

		const emailSubject =
			"Confirm your Frischly email / Bestätigen Sie Ihre Frischly-E-Mail";
		const emailText = `Hi ${
			name || "there"
		},\n\nPlease confirm your email by visiting the link below:\n${confirmUrl}\n\nIf you did not create an account, you can ignore this email.\n\n---\n\nHallo ${
			name || "dort"
		},\n\nBitte bestätigen Sie Ihre E-Mail-Adresse, indem Sie den folgenden Link besuchen:\n${confirmUrl}\n\nWenn Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren.`;
		const emailHtml = `<!doctype html><html><body><p>Hi ${
			name || "there"
		},</p><p>Please confirm your email by clicking the button below.</p><p><a href="${confirmUrl}">Confirm Email</a></p><p>If you did not create an account, you can ignore this email.</p><hr><p>Hallo ${
			name || "dort"
		},</p><p>Bitte bestätigen Sie Ihre E-Mail-Adresse, indem Sie auf die Schaltfläche unten klicken.</p><p><a href="${confirmUrl}">E-Mail bestätigen</a></p><p>Wenn Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren.</p></body></html>`;
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
				message:
					"Bestätigungs-E-Mail konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
			});
		}

		res.status(201).json({
			success: true,
			message:
				"Registrierung erfolgreich. Bitte überprüfen Sie Ihre E-Mail (möglicherweise im Spam-Ordner) zur Bestätigung Ihres Kontos.",
			data: {
				userId: user._id,
			},
		});
	} catch (error) {
		console.error("Register error:", error);
		res.status(500).json({
			success: false,
			message: "Serverfehler bei der Registrierung",
		});
	}
};

const confirmEmail = async (req, res) => {
	try {
		const { token } = req.params;

		if (!token) {
			return res.status(400).send("Ungültiger Bestätigungslink");
		}

		const user = await User.findOne({
			emailToken: token,
			emailTokenExpires: { $gt: Date.now() },
		});

		if (!user) {
			return res
				.status(400)
				.send("Ungültiger oder abgelaufener Bestätigungslink");
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
    <title>Email Confirmed / E-Mail Bestätigt - Frischly</title>
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
        <p class="subtitle">Your email has been successfully verified. You can now log in to your Frischly account and start shopping for fresh groceries.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        
        <h1>E-Mail Bestätigt!</h1>
        <p class="subtitle">Ihre E-Mail wurde erfolgreich verifiziert. Sie können sich jetzt in Ihr Frischly-Konto einloggen und mit dem Einkaufen frischer Lebensmittel beginnen.</p>
        <button onclick="window.close()" class="login-btn">Schließen</button>
        <div class="footer">
            <p>Willkommen bei Frischly!</p>
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
			return res.status(400).json({
				success: false,
				message: "Validierung fehlgeschlagen",
				errors: errors.array(),
			});
		}

		const { email, password } = req.body;

		// Sanitize email input to prevent NoSQL injection
		const sanitizedEmail = sanitizeEmail(email);
		if (!sanitizedEmail) {
			return res.status(400).json({
				success: false,
				message: "Ungültiges E-Mail-Format",
			});
		}

		// Check for user and include password, loginAttempts, and lockUntil
		const user = await User.findOne({ email: sanitizedEmail }).select(
			"+password +loginAttempts +lockUntil"
		);
		if (!user) {
			return res.status(401).json({
				success: false,
				message: "Ungültige Anmeldedaten",
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
				message: `Das Konto ist aufgrund mehrerer fehlgeschlagener Anmeldeversuche vorübergehend gesperrt. Bitte versuchen Sie es in ${minutesRemaining} Minute(n) erneut.`,
				lockTimeRemaining: minutesRemaining,
			});
		}

		// Check if user is active
		if (!user.isActive) {
			return res.status(401).json({
				success: false,
				message: "Konto ist deaktiviert",
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
						"Ungültige Anmeldedaten. Ihr Konto wurde aufgrund mehrerer fehlgeschlagener Anmeldeversuche vorübergehend für 15 Minuten gesperrt.",
				});
			} else if (attemptsLeft <= 2) {
				return res.status(401).json({
					success: false,
					message: `Ungültige Anmeldedaten. Noch ${attemptsLeft} Versuch(e) bis zur Kontosperrung.`,
					attemptsRemaining: attemptsLeft,
				});
			} else {
				return res.status(401).json({
					success: false,
					message: "Ungültige Anmeldedaten",
				});
			}
		}

		if (user.emailConfirmed === false) {
			return res.status(403).json({
				success: false,
				message:
					"Bitte bestätigen Sie Ihre E-Mail (möglicherweise im Spam-Ordner) vor dem Einloggen.",
				needsConfirmation: true,
			});
		}

		// Check if user has required role for  access
		const allowedRoles = ["manager", "admin", "customer", "rider", "staff"];
		if (!allowedRoles.includes(user.role)) {
			return res.status(403).json({
				success: false,
				message:
					"Zugriff verweigert. Zugriff ist nur für Manager, Administratoren, Kunden und Fahrer beschränkt.",
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
			message: "Anmeldung erfolgreich",
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
			message: "Serverfehler bei der Anmeldung",
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
			message: "Serverfehler",
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
				message: "Validierung fehlgeschlagen",
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
					message: "E-Mail ist bereits vergeben",
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
			message: "Profil erfolgreich aktualisiert",
			data: {
				user: user.toSafeObject(),
			},
		});
	} catch (error) {
		console.error("Update profile error:", error);
		res.status(500).json({
			success: false,
			message: "Serverfehler bei der Profilaktualisierung",
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
				message: "Validierung fehlgeschlagen",
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
				message: "Aktuelles Passwort ist falsch",
			});
		}

		// Update password
		user.password = newPassword;
		await user.save();

		res.json({
			success: true,
			message: "Passwort erfolgreich geändert",
		});
	} catch (error) {
		console.error("Change password error:", error);
		res.status(500).json({
			success: false,
			message: "Serverfehler bei der Passwortänderung",
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
				message: "Validierung fehlgeschlagen",
				errors: errors.array(),
			});
		}

		const { email, password } = req.body;

		// Sanitize email input to prevent NoSQL injection
		const sanitizedEmail = sanitizeEmail(email);
		if (!sanitizedEmail) {
			return res.status(400).json({
				success: false,
				message: "Ungültiges E-Mail-Format",
			});
		}

		// Check for user and include password, loginAttempts, and lockUntil
		const user = await User.findOne({ email: sanitizedEmail }).select(
			"+password +loginAttempts +lockUntil"
		);
		if (!user) {
			return res.status(401).json({
				success: false,
				message: "Ungültige Anmeldedaten",
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
				message: `Das Konto ist aufgrund mehrerer fehlgeschlagener Anmeldeversuche vorübergehend gesperrt. Bitte versuchen Sie es in ${minutesRemaining} Minute(n) erneut.`,
				lockTimeRemaining: minutesRemaining,
			});
		}

		// Check if user is active
		if (!user.isActive) {
			return res.status(401).json({
				success: false,
				message: "Konto ist deaktiviert",
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
						"Ungültige Anmeldedaten. Ihr Konto wurde aufgrund mehrerer fehlgeschlagener Anmeldeversuche vorübergehend für 15 Minuten gesperrt.",
				});
			} else if (attemptsLeft <= 2) {
				return res.status(401).json({
					success: false,
					message: `Ungültige Anmeldedaten. Noch ${attemptsLeft} Versuch(e) bis zur Kontosperrung.`,
					attemptsRemaining: attemptsLeft,
				});
			} else {
				return res.status(401).json({
					success: false,
					message: "Ungültige Anmeldedaten",
				});
			}
		}

		if (user.emailConfirmed === false) {
			return res.status(403).json({
				success: false,
				message:
					"Bitte bestätigen Sie Ihre E-Mail vor dem Einloggen (prüfen Sie auch den Spam-Ordner).",
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
			message: "Anmeldung erfolgreich",
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
			message: "Serverfehler bei der Anmeldung",
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
				message: "Refresh-Token ist erforderlich",
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
					message: "Ungültiger Refresh-Token",
				});
			}

			// Check if user is active
			if (!user.isActive) {
				return res.status(401).json({
					success: false,
					message: "Benutzerkonto ist deaktiviert",
				});
			}

			if (user.emailConfirmed === false) {
				return res.status(403).json({
					success: false,
					message: "Bitte bestätigen Sie Ihre E-Mail vor dem Fortfahren.",
					needsConfirmation: true,
				});
			}

			// Generate new access token
			const newAccessToken = generateToken({ id: user._id });

			// Optionally generate new refresh token for better security (token rotation)
			const newRefreshToken = generateRefreshToken({ id: user._id });

			res.json({
				success: true,
				message: "Token erfolgreich aktualisiert",
				data: {
					token: newAccessToken,
					refreshToken: newRefreshToken,
					user: user.toSafeObject(),
				},
			});
		} catch (error) {
			return res.status(401).json({
				success: false,
				message: "Ungültiger Refresh-Token",
			});
		}
	} catch (error) {
		console.error("Refresh token error:", error);
		res.status(500).json({
			success: false,
			message: "Serverfehler bei der Token-Aktualisierung",
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
				message:
					"Zugriff verweigert. Administrator-, Manager- oder Mitarbeiterberechtigung erforderlich.",
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
			message: "Serverfehler beim Abrufen der Benutzer",
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
				message: "Zugriff verweigert. Administratorberechtigung erforderlich.",
			});
		}

		// Check for validation errors
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({
				success: false,
				message: "Validierung fehlgeschlagen",
				errors: errors.array(),
			});
		}

		const { name, phoneNumber, email, password, address, role } = req.body;

		// Check if user already exists
		let existingUser = await User.findOne({ email });
		if (existingUser) {
			return res.status(400).json({
				success: false,
				message: "Ein Benutzer mit dieser E-Mail existiert bereits",
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
			message: "Benutzer erfolgreich erstellt",
			data: {
				user: user.toSafeObject(),
			},
		});
	} catch (error) {
		console.error("Create user error:", error);
		res.status(500).json({
			success: false,
			message: "Serverfehler bei der Benutzererstellung",
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
				message: "Zugriff verweigert. Administratorberechtigung erforderlich.",
			});
		}

		const userId = req.params.id;
		const { name, phoneNumber, email, address, role, isActive } = req.body;

		// Check if user exists
		let user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "Benutzer nicht gefunden",
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
					message: "E-Mail ist bereits vergeben",
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
			message: "Benutzer erfolgreich aktualisiert",
			data: {
				user: user.toSafeObject(),
			},
		});
	} catch (error) {
		console.error("Update user error:", error);
		res.status(500).json({
			success: false,
			message: "Serverfehler bei der Benutzeraktualisierung",
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
				message: "Zugriff verweigert. Administratorberechtigung erforderlich.",
			});
		}

		const userId = req.params.id;

		// Check if user exists
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "Benutzer nicht gefunden",
			});
		}

		// Prevent admin from deleting themselves
		if (userId === req.user._id.toString()) {
			return res.status(400).json({
				success: false,
				message: "Sie können Ihr eigenes Konto nicht löschen",
			});
		}

		await User.findByIdAndDelete(userId);

		res.json({
			success: true,
			message: "Benutzer erfolgreich gelöscht",
		});
	} catch (error) {
		console.error("Delete user error:", error);
		res.status(500).json({
			success: false,
			message: "Serverfehler beim Löschen des Benutzers",
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
				message: "Nicht autorisiert für den Zugriff auf diese Ressource",
			});
		}

		const user = await User.findById(req.params.id);

		if (!user) {
			return res.status(404).json({
				success: false,
				message: "Benutzer nicht gefunden",
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
			message: "Serverfehler",
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
				message: `Gesamtanzahl aktiver Kunden: ${customerCount}`,
			},
		});
	} catch (error) {
		console.error("Get customer count error:", error);
		res.status(500).json({
			success: false,
			message: "Serverfehler beim Abrufen der Kundenzahl",
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
				message: "Benutzer nicht gefunden",
			});
		}

		// Check password
		const isMatch = await user.comparePassword(password);
		if (!isMatch) {
			return res.status(401).json({
				success: false,
				message: "Ungültiges Passwort",
			});
		}

		// Delete the user
		await User.findByIdAndDelete(req.user._id);

		res.json({
			success: true,
			message: "Konto erfolgreich gelöscht",
		});
	} catch (error) {
		console.error("Delete account error:", error);
		res.status(500).json({
			success: false,
			message: "Serverfehler beim Löschen des Kontos",
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
				message: "Validierung fehlgeschlagen",
				errors: errors.array(),
			});
		}

		const { email } = req.body;

		// Sanitize email input
		const sanitizedEmail = sanitizeEmail(email);
		if (!sanitizedEmail) {
			return res.status(400).json({
				success: false,
				message: "Ungültiges E-Mail-Format",
			});
		}

		// Check if user exists
		const user = await User.findOne({ email: sanitizedEmail });
		if (!user) {
			// Don't reveal if email exists or not for security
			return res.status(200).json({
				success: true,
				message:
					"Falls ein Konto mit dieser E-Mail existiert, wurde ein Passwortzurücksetzungslink gesendet.",
			});
		}

		// Check if user is active
		if (!user.isActive) {
			return res.status(200).json({
				success: true,
				message:
					"Falls ein Konto mit dieser E-Mail existiert, wurde ein Passwortzurücksetzungslink gesendet.",
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
			"Reset your Frischly password / Setzen Sie Ihr Frischly-Passwort zurück";
		const emailText = `Hi ${user.name},\n\nYou requested a password reset for your Frischly account. Click the link below to reset your password:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this password reset, please ignore this email.\n\n---\n\nHallo ${user.name},\n\nSie haben eine Passwortzurücksetzung für Ihr Frischly-Konto angefordert. Klicken Sie auf den folgenden Link, um Ihr Passwort zurückzusetzen:\n\n${resetUrl}\n\nDieser Link läuft in 1 Stunde ab.\n\nWenn Sie diese Passwortzurücksetzung nicht angefordert haben, ignorieren Sie bitte diese E-Mail.`;
		const emailHtml = `<!doctype html><html><body><p>Hi ${user.name},</p><p>You requested a password reset for your Frischly account. Click the button below to reset your password.</p><p><a href="${resetUrl}">Reset Password</a></p><p>This link will expire in 1 hour.</p><p>If you didn't request this password reset, please ignore this email.</p><hr><p>Hallo ${user.name},</p><p>Sie haben eine Passwortzurücksetzung für Ihr Frischly-Konto angefordert. Klicken Sie auf die Schaltfläche unten, um Ihr Passwort zurückzusetzen.</p><p><a href="${resetUrl}">Passwort zurücksetzen</a></p><p>Dieser Link läuft in 1 Stunde ab.</p><p>Wenn Sie diese Passwortzurücksetzung nicht angefordert haben, ignorieren Sie bitte diese E-Mail.</p></body></html>`;

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
					"Passwortzurücksetzungs-E-Mail konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
			});
		}

		res.status(200).json({
			success: true,
			message:
				"Falls ein Konto mit dieser E-Mail existiert, wurde ein Passwortzurücksetzungslink gesendet.",
		});
	} catch (error) {
		console.error("Request password reset error:", error);
		res.status(500).json({
			success: false,
			message: "Serverfehler bei der Passwortzurücksetzungsanfrage",
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
				message: "Validierung fehlgeschlagen",
				errors: errors.array(),
			});
		}

		const { token, newPassword } = req.body;

		if (!token) {
			return res.status(400).json({
				success: false,
				message: "Reset-Token ist erforderlich",
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
				message: "Ungültiger oder abgelaufener Reset-Token",
			});
		}

		// Check if user is active
		if (!user.isActive) {
			return res.status(400).json({
				success: false,
				message: "Konto ist deaktiviert",
			});
		}

		// Update password and clear reset token
		user.password = newPassword;
		user.passwordResetToken = undefined;
		user.passwordResetExpires = undefined;
		await user.save();

		res.json({
			success: true,
			message: "Passwort erfolgreich zurückgesetzt",
		});
	} catch (error) {
		console.error("Reset password error:", error);
		res.status(500).json({
			success: false,
			message: "Serverfehler bei der Passwortzurücksetzung",
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
				message: "Zugriff verweigert. Administratorberechtigung erforderlich.",
			});
		}

		const userId = req.params.id;

		// Check if user exists and is a customer
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "Benutzer nicht gefunden",
			});
		}

		if (user.role !== "customer") {
			return res.status(400).json({
				success: false,
				message: "Passwortzurücksetzung ist nur für Kunden erlaubt",
			});
		}

		// Reset password to "123456789"
		user.password = "123456789";
		await user.save();

		res.json({
			success: true,
			message: "Kundenpasswort erfolgreich zurückgesetzt",
		});
	} catch (error) {
		console.error("Reset customer password error:", error);
		res.status(500).json({
			success: false,
			message: "Serverfehler bei der Passwortzurücksetzung",
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
	requestPasswordReset,
	resetPassword,
	resetCustomerPassword,
	getCustomerCount,
};
