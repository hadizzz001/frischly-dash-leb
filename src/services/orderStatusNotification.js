const { Expo } = require("expo-server-sdk");
const admin = require("firebase-admin");
const User = require("../models/User");
const sendExpoNotification = require("./expoNotification");

const expo = new Expo();

// Neat, customer-facing copy for each order status milestone. Titles include a
// small emoji so the notification reads nicely on the lock screen. Keep the map
// aligned with the Order model's status values.
const STATUS_MESSAGES = {
	pending: {
		title: "Order placed 🎉",
		body: "We've received your order and it's being processed.",
	},
	confirmed: {
		title: "Order confirmed ✅",
		body: "Your order has been confirmed and is being prepared.",
	},
	processing: {
		title: "Preparing your order 👨‍🍳",
		body: "Your order is being prepared right now.",
	},
	"ready for pickup": {
		title: "Your order is ready 📦",
		body: "Your order is ready and will be on its way soon.",
	},
	OnTheWay: {
		title: "Your order is on the way 🚗",
		body: "Your driver is heading to you. Tap to track your order.",
	},
	delivered: {
		title: "Order delivered 🛍️",
		body: "Enjoy! Your order has been delivered.",
	},
	cancelled: {
		title: "Order cancelled ❌",
		body: "Your order has been cancelled.",
	},
};

// Resolve the customer's User id from an order. Orders embed the customer as a
// snapshot of the User document (see createOrder), so customer._id points at the
// user who placed the order. Fall back to createdBy for older/edge cases.
function getCustomerUserId(order) {
	return order?.customer?._id || order?.customer?.id || order?.createdBy || null;
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
 * @param {object} order - The order document (must include customer + orderNumber/_id).
 * @param {string} status - The new status value.
 */
async function notifyCustomerOrderStatus(order, status) {
	try {
		const template = STATUS_MESSAGES[status];
		if (!template) {
			// Unknown/uninteresting status — nothing to notify about.
			return { success: false, reason: "no_template" };
		}

		const userId = getCustomerUserId(order);
		if (!userId) return { success: false, reason: "no_customer" };

		const user = await User.findById(userId).select("fcmToken");
		if (!user || !user.fcmToken) {
			return { success: false, reason: "no_token" };
		}

		const orderRef = order.orderNumber
			? `#${order.orderNumber}`
			: `#${order._id}`;
		const title = template.title;
		const body = `Order ${orderRef} — ${template.body}`;
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
			return await sendExpoNotification(user.fcmToken, title, body, data);
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

module.exports = { notifyCustomerOrderStatus, STATUS_MESSAGES };
