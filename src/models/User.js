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
			required: [true, "Please provide a phone number"],
			trim: true,
			match: [/^[\+]?[1-9][\d]{0,15}$/, "Please provide a valid phone number"],
		},
		age: {
			type: Number,
			//required: [true, "Please provide your age"],
			min: [0, "Age must be a positive number"],
		},
		email: {
			type: String,
			required: [true, "Please provide an email"],
			unique: true,
			lowercase: true,
			match: [
				/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
				"Please provide a valid email",
			],
		},
		password: {
			type: String,
			required: [true, "Please provide a password"],
			minlength: [6, "Password must be at least 6 characters"],
			select: false, // Don't include password in queries by default
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
		passwordResetToken: {
			type: String,
		},
		passwordResetExpires: {
			type: Date,
		},
		address: {
			street: {
				type: String,
				required: [true, "Please provide a street address"],
				trim: true,
				maxlength: [200, "Street address cannot be more than 200 characters"],
			},
			city: {
				type: String,
				required: [true, "Please provide a city"],
				trim: true,
				maxlength: [100, "City cannot be more than 100 characters"],
			},
			state: {
				type: String,
				required: [true, "Please provide a state/province"],
				trim: true,
				maxlength: [100, "State cannot be more than 100 characters"],
			},
			zipCode: {
				type: String,
				required: [true, "Please provide a zip/postal code"],
				trim: true,
				maxlength: [20, "Zip code cannot be more than 20 characters"],
			},
			country: {
				type: String,
				required: [true, "Please provide a country"],
				trim: true,
				maxlength: [100, "Country cannot be more than 100 characters"],
			},
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
			enum: ["customer", "rider", "staff", "user", "manager", "admin"],
			default: "customer",
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
	},
	{
		timestamps: true,
	}
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
	delete userObject.loginAttempts; // Don't expose security info
	delete userObject.lockUntil; // Don't expose security info

	return userObject;
};

module.exports = mongoose.model("User", userSchema);
