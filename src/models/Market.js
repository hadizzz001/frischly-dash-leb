const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const marketSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, "Please provide a market name"],
			trim: true,
			unique: true,
			maxlength: [150, "Market name cannot be more than 150 characters"],
		},
		username: {
			type: String,
			required: [true, "Please provide a username"],
			unique: true,
			lowercase: true,
			trim: true,
			minlength: [3, "Username must be at least 3 characters"],
			maxlength: [50, "Username cannot be more than 50 characters"],
			match: [
				/^[a-z0-9_.-]+$/,
				"Username can only contain lowercase letters, numbers, dots, underscores and hyphens",
			],
		},
		password: {
			type: String,
			required: [true, "Please provide a password"],
			minlength: [6, "Password must be at least 6 characters"],
			select: false,
		},
		email: {
			type: String,
			unique: true,
			sparse: true,
			lowercase: true,
			trim: true,
			match: [
				/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
				"Please provide a valid email",
			],
		},
		phoneNumber: {
			type: String,
			trim: true,
			match: [
				/^[+]?[0-9][0-9\s().-]{5,20}$/,
				"Please provide a valid phone number",
			],
		},
		location: {
			city: { type: String, trim: true },
		},
		logo: {
			type: String,
			trim: true,
		},
		logoPublicId: {
			type: String,
			trim: true,
		},
		// Aggregated stats (denormalized; updated via controller hooks)
		totalSales: {
			type: Number,
			default: 0,
			min: 0,
		},
		totalOrders: {
			type: Number,
			default: 0,
			min: 0,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		lastLogin: {
			type: Date,
		},
		loginAttempts: {
			type: Number,
			default: 0,
			select: false,
		},
		lockUntil: {
			type: Date,
			select: false,
		},
		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	},
);

// Indexes
marketSchema.index({ username: 1 }, { unique: true });
marketSchema.index({ name: 1 }, { unique: true });
marketSchema.index({ email: 1 }, { unique: true, sparse: true });
marketSchema.index({ isActive: 1 });

// Virtual: total items currently registered to this market
marketSchema.virtual("totalItems", {
	ref: "Product",
	localField: "_id",
	foreignField: "market",
	count: true,
	match: { isActive: true },
});

// Hash password before save
marketSchema.pre("save", async function (next) {
	if (!this.isModified("password")) return next();
	try {
		const salt = await bcrypt.genSalt(12);
		this.password = await bcrypt.hash(this.password, salt);
		next();
	} catch (err) {
		next(err);
	}
});

// Compare password
marketSchema.methods.comparePassword = async function (candidate) {
	return bcrypt.compare(candidate, this.password);
};

// Lock helpers (mirroring User model behaviour)
const MAX_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000;

marketSchema.virtual("isLocked").get(function () {
	return !!(this.lockUntil && this.lockUntil > Date.now());
});

marketSchema.methods.incLoginAttempts = async function () {
	if (this.lockUntil && this.lockUntil < Date.now()) {
		return this.updateOne({
			$set: { loginAttempts: 1 },
			$unset: { lockUntil: 1 },
		});
	}
	const updates = { $inc: { loginAttempts: 1 } };
	if (this.loginAttempts + 1 >= MAX_ATTEMPTS && !this.isLocked) {
		updates.$set = { lockUntil: Date.now() + LOCK_TIME };
	}
	return this.updateOne(updates);
};

marketSchema.methods.resetLoginAttempts = async function () {
	return this.updateOne({
		$set: { loginAttempts: 0 },
		$unset: { lockUntil: 1 },
	});
};

marketSchema.methods.toSafeObject = function () {
	const obj = this.toObject();
	delete obj.password;
	delete obj.loginAttempts;
	delete obj.lockUntil;
	return obj;
};

module.exports = mongoose.model("Market", marketSchema);
