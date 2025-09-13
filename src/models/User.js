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
		role: {
			type: String,
			enum: ["customer", "rider", "staff", "user", "manager", "admin"],
			default: "user",
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		lastLogin: {
			type: Date,
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

// Instance method to get user without password
userSchema.methods.toSafeObject = function () {
	const userObject = this.toObject();
	delete userObject.password;
	return userObject;
};

module.exports = mongoose.model("User", userSchema);
