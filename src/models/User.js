const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, "Please provide a name"],
			trim: true,
			maxlength: [100, "Name cannot be more than 100 characters"],
		},
		phoneNumber: {
			type: String,
			// Phone is optional — email is the primary verification channel.
			required: false,
			trim: true,
			match: [/^[\+]?[1-9][\d]{0,15}$/, "Please provide a valid phone number"],
		},
		dateOfBirth: {
			type: Date,
		},
		// ✅ Email (verified via confirmation link) is the primary identifier for
		// registration/login. Required for local accounts; Google sign-in accounts
		// get their email directly from Google.
		email: {
			type: String,
			required: [
				function () {
					return this.authProvider !== "google" && !this.googleId;
				},
				"Please provide an email address",
			],
			lowercase: true,
			match: [
				/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
				"Please provide a valid email",
			],
		},
		password: {
			type: String,
			// Password is required for local accounts only. Google sign-in
			// users authenticate via their Google account, so no password.
			required: [
				function () {
					return this.authProvider !== "google" && !this.googleId;
				},
				"Please provide a password",
			],
			minlength: [6, "Password must be at least 6 characters"],
			select: false, // Don't include password in queries by default
		},
		// ✅ Google sign-in support. `googleId` is the Google account subject
		// (`sub`) returned by Google's token verification. `authProvider`
		// distinguishes local (phone/email + password) vs google accounts.
		googleId: {
			type: String,
			index: true,
			sparse: true,
		},
		authProvider: {
			type: String,
			enum: ["local", "google"],
			default: "local",
		},
		emailConfirmed: {
			type: Boolean,
			default: false,
		},
		emailConfirmedAt: {
			type: Date,
		},
		emailToken: {
			type: String,
		},
		emailTokenExpires: {
			type: Date,
		},
		// ✅ Phone verification (primary verification channel — link sent via
		// SMS or WhatsApp on registration, see authController.register).
		phoneVerified: {
			type: Boolean,
			default: false,
		},
		phoneVerifiedAt: {
			type: Date,
		},
		phoneVerificationToken: {
			type: String,
		},
		phoneVerificationExpires: {
			type: Date,
		},
		passwordResetToken: {
			type: String,
		},
		passwordResetExpires: {
			type: Date,
		},
		address: {
			street: {
				type: String,
				trim: true,
				maxlength: [200, "Street address cannot be more than 200 characters"],
			},
			city: {
				type: String,
				// City is required for local accounts only. Google sign-in users
				// have no address at creation and can add it later in their profile.
				required: [
					function () {
						return this.authProvider !== "google" && !this.googleId;
					},
					"Please provide a city",
				],
				trim: true,
				maxlength: [100, "City cannot be more than 100 characters"],
			},
			state: {
				type: String,
				trim: true,
				maxlength: [100, "State cannot be more than 100 characters"],
			},
			country: {
				type: String,
				trim: true,
				default: "LB",
				maxlength: [100, "Country cannot be more than 100 characters"],
			},
			// ✅ Exact map pin (auto-detected via GPS on registration, editable by
			// the shopper afterwards). Used to precisely match the customer's
			// location against a driver's delivery-region pin + radius when
			// assigning a rider to an order — far more accurate than matching by
			// city name alone.
			location: {
				latitude: {
					type: Number,
					min: [-90, "Latitude must be between -90 and 90"],
					max: [90, "Latitude must be between -90 and 90"],
				},
				longitude: {
					type: Number,
					min: [-180, "Longitude must be between -180 and 180"],
					max: [180, "Longitude must be between -180 and 180"],
				},
			},
		},
		// Service / coverage cities (multi-select of Lebanese cities). Optional,
		// used by admin and market accounts to declare the areas they operate in.
		cities: {
			type: [String],
			default: [],
		},
		creditCard: {
			cardNumber: {
				type: String,
				trim: true,
				maxlength: [19, "Card number cannot be more than 19 characters"],
			},
			expiryMonth: {
				type: String,
				trim: true,
				maxlength: [2, "Expiry month cannot be more than 2 characters"],
			},
			expiryYear: {
				type: String,
				trim: true,
				maxlength: [4, "Expiry year cannot be more than 4 characters"],
			},

			holderName: {
				type: String,
				trim: true,
				maxlength: [100, "Cardholder name cannot be more than 100 characters"],
			},
			cardType: {
				type: String,
				enum: ["visa", "mastercard", "amex", "discover", "other"],
				default: "other",
			},
		},
		role: {
			type: String,
			enum: [
				"customer",
				"rider",
				"staff",
				"user",
				"manager",
				"admin",
				"market_staff",
				"market_manager",
				"market_driver",
			],
			default: "customer",
		},
		// Tenant link for users that belong to a specific market (e.g. market_staff).
		// Null for global users (admin, customer, etc.).
		market: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Market",
			default: null,
			index: true,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		lastLogin: {
			type: Date,
		},
		// Account lockout fields
		loginAttempts: {
			type: Number,
			default: 0,
		},
		lockUntil: {
			type: Date,
		},
		fcmToken: {
			type: String,
			default: null,
		},
		usedPromoCodes: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "PromoCode",
				default: [],
			},
		],
	},
	{
		timestamps: true,
	},
);

// Hash password before saving
userSchema.pre("save", async function (next) {
	// Only hash the password if it has been modified (or is new)
	if (!this.isModified("password")) return next();

	try {
		// Hash password with cost of 12
		const salt = await bcrypt.genSalt(12);
		this.password = await bcrypt.hash(this.password, salt);
		next();
	} catch (error) {
		next(error);
	}
});

// Instance method to check password
userSchema.methods.comparePassword = async function (candidatePassword) {
	if (!this.password) return false;
	return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual property to check if account is locked
userSchema.virtual("isLocked").get(function () {
	// Check if lockUntil is in the future
	return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Constants for account lockout
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds

// Instance method to increment login attempts
userSchema.methods.incLoginAttempts = async function () {
	// If we have a previous lock that has expired, restart at 1
	if (this.lockUntil && this.lockUntil < Date.now()) {
		return await this.updateOne({
			$set: { loginAttempts: 1 },
			$unset: { lockUntil: 1 },
		});
	}

	// Otherwise increment attempts
	const updates = { $inc: { loginAttempts: 1 } };

	// Lock the account if we've reached max attempts and it's not locked already
	const attemptsLeft = MAX_LOGIN_ATTEMPTS - this.loginAttempts;
	if (attemptsLeft <= 1 && !this.isLocked) {
		updates.$set = { lockUntil: Date.now() + LOCK_TIME };
	}

	return await this.updateOne(updates);
};

// Instance method to reset login attempts
userSchema.methods.resetLoginAttempts = async function () {
	return await this.updateOne({
		$set: { loginAttempts: 0 },
		$unset: { lockUntil: 1 },
	});
};

// Static method to get time remaining for locked account (in minutes)
userSchema.methods.getLockTimeRemaining = function () {
	if (!this.isLocked) return 0;
	const remainingMs = this.lockUntil - Date.now();
	return Math.ceil(remainingMs / (60 * 1000)); // Convert to minutes
};

// Instance method to get user without password
userSchema.methods.toSafeObject = function () {
	const userObject = this.toObject();
	delete userObject.password;
	delete userObject.creditCard; // Don't expose credit card info
	delete userObject.emailToken;
	delete userObject.emailTokenExpires;
	delete userObject.phoneVerificationToken;
	delete userObject.phoneVerificationExpires;
	delete userObject.loginAttempts; // Don't expose security info
	delete userObject.lockUntil; // Don't expose security info
	return userObject;
};

// Instance method to get user with masked credit card info
userSchema.methods.toMaskedObject = function () {
	const userObject = this.toObject();
	delete userObject.password;

	// Mask credit card information if it exists
	if (userObject.creditCard && userObject.creditCard.cardNumber) {
		const cardNumber = userObject.creditCard.cardNumber;
		const lastFour = cardNumber.slice(-4);
		const maskedNumber = "**** **** **** " + lastFour;
		userObject.creditCard = {
			...userObject.creditCard,
			cardNumber: maskedNumber,
		};
	}

	delete userObject.emailToken;
	delete userObject.emailTokenExpires;
	delete userObject.phoneVerificationToken;
	delete userObject.phoneVerificationExpires;
	delete userObject.loginAttempts; // Don't expose security info
	delete userObject.lockUntil; // Don't expose security info

	return userObject;
};

// ✅ Email is optional, but when present must be unique. `sparse` means
// documents with no email field at all don't collide with each other.
userSchema.index({ email: 1 }, { unique: true, sparse: true });

// ✅ Phone number is the primary identifier for registration/login — keep it
// unique so lookups are unambiguous (sparse just in case any legacy/system
// documents were created without one).
userSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("User", userSchema);
