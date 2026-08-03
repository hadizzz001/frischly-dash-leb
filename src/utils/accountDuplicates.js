const User = require("../models/User");
const Market = require("../models/Market");

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const exactTextQuery = (value) => ({
	$regex: `^${escapeRegExp(String(value).trim())}$`,
	$options: "i",
});

const addExclusion = (query, exclude) => {
	if (exclude && exclude.id) {
		query._id = { $ne: exclude.id };
	}
	return query;
};

const findDuplicateAccount = async ({ name, username, email, phoneNumber }, exclude = {}) => {
	const normalizedName = name ? String(name).trim() : "";
	const normalizedUsername = username ? String(username).toLowerCase().trim() : "";
	const normalizedEmail = email ? String(email).toLowerCase().trim() : "";
	const normalizedPhone = phoneNumber ? String(phoneNumber).trim() : "";

	if (normalizedName) {
		const user = await User.findOne(
			addExclusion({ name: exactTextQuery(normalizedName) }, exclude.type === "user" ? exclude : null),
		).select("name");
		if (user) return { field: "name", owner: "user", value: normalizedName };

		const market = await Market.findOne(
			addExclusion({ name: exactTextQuery(normalizedName) }, exclude.type === "market" ? exclude : null),
		).select("name");
		if (market) return { field: "name", owner: "market", value: normalizedName };
	}

	if (normalizedEmail) {
		const user = await User.findOne(
			addExclusion({ email: normalizedEmail }, exclude.type === "user" ? exclude : null),
		).select("email");
		if (user) return { field: "email", owner: "user", value: normalizedEmail };

		const market = await Market.findOne(
			addExclusion({ email: normalizedEmail }, exclude.type === "market" ? exclude : null),
		).select("email");
		if (market) return { field: "email", owner: "market", value: normalizedEmail };
	}

	// ✅ Phone number is now the primary login identifier for customers, so
	// check it for duplicates too (gives a friendly message instead of a raw
	// Mongo duplicate-key error from the unique index).
	if (normalizedPhone) {
		const user = await User.findOne(
			addExclusion({ phoneNumber: normalizedPhone }, exclude.type === "user" ? exclude : null),
		).select("phoneNumber");
		if (user) return { field: "phone number", owner: "user", value: normalizedPhone };
	}

	if (normalizedUsername) {
		const market = await Market.findOne(
			addExclusion({ username: normalizedUsername }, exclude.type === "market" ? exclude : null),
		).select("username");
		if (market) return { field: "username", owner: "market", value: normalizedUsername };
	}

	return null;
};

const duplicateAccountMessage = (duplicate) => {
	if (!duplicate) return "Account already exists";
	const value = duplicate.value ? ` (${duplicate.value})` : "";
	return `A ${duplicate.owner} account with this ${duplicate.field}${value} already exists. Please use a different ${duplicate.field}.`;
};

// Map the internal duplicate descriptor onto the same {field,message,received}
// shape used by sendValidationError, so the UI can highlight the exact input
// that clashed instead of showing a generic sentence.
const FIELD_TO_FORM_FIELD = {
	"phone number": "phoneNumber",
	email: "email",
	name: "name",
	username: "username",
};

const duplicateAccountError = (duplicate) => {
	if (!duplicate) return { field: "unknown", message: "Account already exists" };
	return {
		field: FIELD_TO_FORM_FIELD[duplicate.field] || duplicate.field,
		message: duplicateAccountMessage(duplicate),
		received: duplicate.value ?? null,
		location: "body",
	};
};

/**
 * Translate a raw MongoServerError E11000 into a readable response.
 *
 * This is a safety net: the pre-checks above should catch duplicates first,
 * but a unique index can still fire on a race, on a field nobody pre-checked,
 * or on legacy data. Without this the user saw a stack trace.
 *
 * @returns {{status:number,message:string,errors:Array}|null} null if not a duplicate-key error
 */
const describeDuplicateKeyError = (error) => {
	if (!error || error.code !== 11000) return null;

	const keys = Object.keys(error.keyValue || error.keyPattern || {});
	if (!keys.length) {
		return {
			status: 409,
			message: "That record already exists. Please change the duplicated value.",
			errors: [],
		};
	}

	const errors = keys.map((key) => {
		const value = error.keyValue ? error.keyValue[key] : undefined;
		const label = key === "phoneNumber" ? "phone number" : key;
		return {
			field: key,
			message: `This ${label} is already used by another account. Please enter a different ${label}.`,
			received: value === undefined ? null : value,
			location: "body",
		};
	});

	return {
		status: 409,
		message: errors.map((e) => e.message).join(" "),
		errors,
	};
};

module.exports = {
	findDuplicateAccount,
	duplicateAccountMessage,
	duplicateAccountError,
	describeDuplicateKeyError,
};
