const { Expo } = require("expo-server-sdk");
const admin = require("firebase-admin");
const User = require("../models/User");
const Rider = require("../models/Rider");
const Market = require("../models/Market");
const sendExpoNotification = require("./expoNotification");

// Display name of the main (non-market) store — orders with no `market`.
const MAIN_STORE_NAME = "FreshlyLB";

// Short, warm copy for each order status milestone — the kind of line a shopper
// is happy to see pop up on the lock screen. Every entry is a function of the
// personal bits we can fill in: the shopper's first name, the store the order
// came from and, once assigned, the driver's first name. Any of them may be
// empty, so each template has to read well without it.
//
// No order number on purpose: "ORD-20260921-0006" reads like a serial number
// and eats half the banner. Tapping the notification opens the order anyway.
// Keep the keys aligned with the Order model's status values.
const STATUS_MESSAGES = {
	pending: ({ name, store }) => ({
		title: "Order received 🎉",
		body: `${name ? `Thanks, ${name}!` : "Thanks!"} ${store} has your order and is getting started on it.`,
	}),
	confirmed: ({ store }) => ({
		title: "You're all set ✅",
		body: `${store} confirmed your order. We'll ping you the moment it's on the move.`,
	}),
	processing: ({ store }) => ({
		title: "Packing your order 🛒",
		body: `${store} is getting your order together right now — won't be long!`,
	}),
	// Reads right whether a driver is found seconds later or not at all yet.
	"ready for pickup": ({ store }) => ({
		title: "Packed and ready 📦",
		body: `Your order from ${store} is all packed up! We're finding you a driver now and we'll tell you the moment it's on the way.`,
	}),
	OnTheWay: ({ driver, store }) =>
		driver
			? {
					title: `${driver} is on the way 🛵`,
					body: `${driver} has your order from ${store} and is heading your way. Tap to follow along!`,
				}
			: {
					title: "Your order is on the way 🛵",
					body: `A driver has your order from ${store} and is heading your way. Tap to follow along!`,
				},
	delivered: ({ name, store }) => ({
		title: "Delivered! 🛍️",
		body: `Your order from ${store} just arrived. Enjoy${name ? `, ${name}` : ""} — and tell us how it went!`,
	}),
	cancelled: ({ store }) => ({
		title: "Order cancelled 😔",
		body: `Your order from ${store} was cancelled. If that doesn't look right, reach out and we'll sort it out.`,
	}),
};

// Statuses an order sits in before it's packed. Jumping from one of these
// straight to "OnTheWay" means the "packed" moment happened silently in the
// same request (automatic driver assignment, or a manual dispatch).
const BEFORE_PACKED = new Set(["pending", "confirmed", "processing"]);

// Gap between the "packed" push and the "on the way" push when both come out
// of one request, so they land as two beats of the story, not a double buzz.
const PACKED_TO_ON_THE_WAY_GAP_MS = 5000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const firstName = (full) => String(full || "").trim().split(/\s+/)[0] || "";

// Accept either a raw ObjectId or a populated document.
const idOf = (ref) => (ref && ref._id) || ref || null;

// Orders keep only a snapshot of the customer (name, email, phone, address —
// the schema drops the User's _id), so the shopper's User id comes from
// createdBy: the app always places orders as the customer. Fall back to the
// snapshot's email for orders created on the customer's behalf.
async function findCustomer(order) {
	const userId =
		order?.customer?._id || order?.customer?.id || idOf(order?.createdBy);
	if (userId) {
		const user = await User.findById(userId).select("name fcmToken");
		if (user) return user;
	}
	const email = order?.customer?.email;
	if (!email) return null;
	return User.findOne({ email: String(email).toLowerCase() }).select("name fcmToken");
}

// Name lookups are decoration: if either fails the push still goes out with
// the generic wording.
async function storeName(order) {
	const marketId = idOf(order?.market);
	if (!marketId) return MAIN_STORE_NAME;
	try {
		const market = await Market.findById(marketId).select("name").lean();
		return (market && market.name) || MAIN_STORE_NAME;
	} catch {
		return MAIN_STORE_NAME;
	}
}

async function driverName(order) {
	const riderId = idOf(order?.assignedRider);
	if (!riderId) return "";
	try {
		const rider = await Rider.findById(riderId)
			.select("user")
			.populate("user", "name")
			.lean();
		return firstName(rider?.user?.name);
	} catch {
		return "";
	}
}

/**
 * Send a push notification to the order's customer whenever its status changes.
 * Works even when the app is closed/killed because it's delivered through
 * Expo's push service (or Firebase Cloud Messaging as a fallback) rather than a
 * local, in-app notification.
 *
 * Safe to await or fire-and-forget: it never throws, so it can't break the
 * request that triggered the status change.
 *
 * @param {object} order - The order document (must include customer/createdBy + _id).
 * @param {string} status - The new status value.
 */
async function notifyCustomerOrderStatus(order, status) {
	try {
		const template = STATUS_MESSAGES[status];
		if (!template) {
			// Unknown/uninteresting status — nothing to notify about.
			return { success: false, reason: "no_template" };
		}

		const user = await findCustomer(order);
		if (!user) return { success: false, reason: "no_customer" };
		if (!user.fcmToken) return { success: false, reason: "no_token" };

		const [store, driver] = await Promise.all([
			storeName(order),
			status === "OnTheWay" ? driverName(order) : "",
		]);
		const { title, body } = template({
			name: firstName(order?.customer?.name || user.name),
			store,
			driver,
		});
		const data = {
			orderId: String(order._id),
			order_id: String(order._id),
			status,
			route: `/track/${order._id}`,
		};

		// The mobile app registers an Expo push token (ExponentPushToken[...]).
		// Use Expo's push service for those; fall back to raw FCM for any
		// genuine FCM device tokens.
		if (Expo.isExpoPushToken(user.fcmToken)) {
			const sentToken = user.fcmToken;
			return await sendExpoNotification(sentToken, title, body, data, {
				// A token Expo no longer knows (app reinstalled, device wiped)
				// will never work again: drop it so the app re-registers on
				// its next launch instead of every push failing quietly.
				onDeliveryError: (code) => {
					if (code !== "DeviceNotRegistered") return;
					User.updateOne(
						{ _id: user._id, fcmToken: sentToken },
						{ $set: { fcmToken: null } },
					).catch((e) =>
						console.error("❌ Could not clear stale push token:", e.message),
					);
				},
			});
		}

		try {
			const response = await admin.messaging().send({
				token: user.fcmToken,
				notification: { title, body },
				data: Object.fromEntries(
					Object.entries(data).map(([k, v]) => [k, String(v)]),
				),
			});
			return { success: true, messageId: response };
		} catch (fcmErr) {
			console.error(
				"❌ Error sending order-status FCM notification:",
				fcmErr.message,
			);
			return { success: false, error: fcmErr.message };
		}
	} catch (error) {
		console.error("❌ notifyCustomerOrderStatus failed:", error.message);
		return { success: false, error: error.message };
	}
}

/**
 * Notify the customer about every milestone an order passed in one request.
 * Call it after the save with the status the order had before; it's a no-op
 * when nothing changed, so callers need no guard of their own.
 *
 * The one multi-milestone case: automatic driver assignment carries an order
 * from "ready for pickup" straight on to "OnTheWay" inside the same save. The
 * shopper still gets both moments — "packed" now, "on the way" a few seconds
 * later — and their in-app inbox reads like a proper order timeline.
 *
 * Never throws (same contract as notifyCustomerOrderStatus).
 */
async function notifyCustomerOrderTransition(order, previousStatus) {
	const status = order?.status;
	if (!status || status === previousStatus) {
		return { success: false, reason: "no_change" };
	}
	if (status === "OnTheWay" && BEFORE_PACKED.has(previousStatus)) {
		await notifyCustomerOrderStatus(order, "ready for pickup");
		await delay(PACKED_TO_ON_THE_WAY_GAP_MS);
	}
	return notifyCustomerOrderStatus(order, status);
}

module.exports = {
	notifyCustomerOrderStatus,
	notifyCustomerOrderTransition,
	STATUS_MESSAGES,
	MAIN_STORE_NAME,
};
