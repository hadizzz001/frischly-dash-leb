const User = require("../models/User");

// Push tokens are kept per DEVICE, not per account. The customer app is often
// signed in on an iPhone and an Android phone at once (plus Expo Go while
// testing), and a Zebra is shared between shifts. With a single `fcmToken`
// each device that opened the app overwrote the previous one, so only the
// last device to register got anything — typically Expo Go, which
// re-registers on every reload. `fcmToken` still mirrors the most recent
// device for older code paths; pushes go to every entry of `pushTokens`.
//
// The oldest token falls off once the list is full, so a phone that was wiped
// without signing out can't pile up forever.
const MAX_PUSH_TOKENS = 10;

/** Mongo filter for users that have at least one device to push to. */
const HAS_PUSH_TOKEN = {
	$or: [{ fcmToken: { $nin: [null, ""] } }, { "pushTokens.0": { $exists: true } }],
};

/** `filter`, narrowed to users that have at least one device to push to. */
const withPushToken = (filter = {}) => ({ $and: [filter, HAS_PUSH_TOKEN] });

/** Every push token of a user document (plain or mongoose), no duplicates. */
function pushTokensOf(user) {
	if (!user) return [];
	const tokens = [...(user.pushTokens || []), user.fcmToken];
	return [...new Set(tokens.filter((t) => typeof t === "string" && t.trim() !== ""))];
}

/**
 * Take `token` off every account (except `except`): Expo said the device will
 * never receive again, or a different account just signed in on it.
 */
async function dropPushToken(token, { except } = {}) {
	if (!token) return;
	const others = except ? { _id: { $ne: except } } : {};
	await User.updateMany({ ...others, pushTokens: token }, { $pull: { pushTokens: token } });
	await User.updateMany({ ...others, fcmToken: token }, { $set: { fcmToken: null } });
}

/**
 * Remember a device for `userId`; it becomes the most recent one. A device
 * belongs to whoever signed in on it last, so it is taken off any other
 * account — otherwise the previous user's order updates would keep landing on
 * a phone they no longer use.
 */
async function addPushToken(userId, token) {
	await dropPushToken(token, { except: userId });
	const user = await User.findById(userId).select("fcmToken pushTokens").lean();
	if (!user) return null;
	// pushTokensOf keeps a device that registered before the list existed (it
	// only lived in fcmToken) — that phone is still out there.
	const pushTokens = [...pushTokensOf(user).filter((t) => t !== token), token].slice(-MAX_PUSH_TOKENS);
	await User.updateOne({ _id: userId }, { $set: { pushTokens, fcmToken: token } });
	return { ...user, pushTokens, fcmToken: token };
}

/** Forget one device of `userId` (signed out on that device). */
async function removePushToken(userId, token) {
	const user = await User.findById(userId).select("fcmToken pushTokens").lean();
	if (!user) return null;
	const pushTokens = pushTokensOf(user).filter((t) => t !== token);
	const fcmToken = pushTokens.length ? pushTokens[pushTokens.length - 1] : null;
	await User.updateOne({ _id: userId }, { $set: { pushTokens, fcmToken } });
	return { ...user, pushTokens, fcmToken };
}

/** Forget every device of `userId`. */
function clearPushTokens(userId) {
	return User.updateOne({ _id: userId }, { $set: { fcmToken: null, pushTokens: [] } });
}

module.exports = {
	MAX_PUSH_TOKENS,
	HAS_PUSH_TOKEN,
	withPushToken,
	pushTokensOf,
	addPushToken,
	removePushToken,
	clearPushTokens,
	dropPushToken,
};
