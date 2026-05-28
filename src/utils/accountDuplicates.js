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

const findDuplicateAccount = async ({ name, username, email }, exclude = {}) => {
	const normalizedName = name ? String(name).trim() : "";
	const normalizedUsername = username ? String(username).toLowerCase().trim() : "";
	const normalizedEmail = email ? String(email).toLowerCase().trim() : "";

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
	return `A ${duplicate.owner} account with this ${duplicate.field} already exists`;
};

module.exports = {
	findDuplicateAccount,
	duplicateAccountMessage,
};
