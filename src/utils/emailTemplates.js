/**
 * emailTemplates.js
 *
 * Centralized, professional HTML/text templates for every transactional
 * email sent by the platform. Each exported function returns a plain
 * `{ subject, text, html }` object that can be passed straight into
 * `sendEmail()` (src/utils/sendEmail.js) without any further changes.
 *
 * Design goals:
 *  - One consistent visual "shell" (header, footer, button style) shared by
 *    every email so the brand looks professional and uniform.
 *  - Each email type lives in its own small builder function, making it easy
 *    to find, update, or add new email types later.
 *  - No business logic / sending logic here — this file only builds content.
 */

const BRAND_NAME = "Freshly lb";
const BRAND_COLOR = "#28a745";
const HEADING_COLOR = "#333";
const SUPPORT_EMAIL = "info@freshlylb.com";

/** Coerce a possibly-missing/invalid value to a finite number. */
function num(value, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

/** Format a monetary amount defensively (never throws on undefined). */
function money(value) {
	return num(value, 0).toFixed(2);
}

/** Safely read the customer display name from an order document. */
function customerName(order) {
	return (
		order?.customer?.name ||
		order?.user?.name ||
		order?.customer?.email ||
		"Customer"
	);
}

/**
 * Wraps inner HTML content in the shared professional email shell:
 * a bordered card with a brand header, the provided content, and a
 * standard footer with the automated-email disclaimer.
 */
function wrapEmailBody(innerHtml) {
	return `
		<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
			<div style="background-color: ${BRAND_COLOR}; padding: 20px; text-align: center;">
				<h1 style="margin: 0; color: #ffffff; font-size: 22px; letter-spacing: 0.5px;">${BRAND_NAME}</h1>
			</div>
			<div style="padding: 24px;">
				${innerHtml}
			</div>
			<div style="padding: 16px 24px; background-color: #f9f9f9;">
				<hr style="border: none; border-top: 1px solid #ddd; margin: 0 0 12px 0;">
				<p style="font-size: 12px; color: #666; text-align: center; margin: 0;">
					This is an automated email. Please do not reply to this message.<br>
					Need help? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: ${BRAND_COLOR};">${SUPPORT_EMAIL}</a>
				</p>
			</div>
		</div>
	`;
}

/** Renders a consistent call-to-action button/link. */
function renderButton(url, label) {
	return `
		<p style="text-align: center; margin: 24px 0;">
			<a href="${url}" style="background-color: ${BRAND_COLOR}; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">${label}</a>
		</p>
	`;
}

/** Renders the items table used by order-related emails.
 *
 * Notes on the data model (see models/Order.js `orderItemSchema`):
 *  - `item.product` is an ObjectId ref, so it is only an object when the
 *    caller populated it. It can also be null if the product was deleted.
 *  - `item.totalPrice` is the LINE total (unit price x quantity), not the
 *    unit price. The previous version printed totalPrice in the "Price"
 *    column and then multiplied it by quantity again for the "Total"
 *    column, which double-counted quantity on every multi-unit line.
 */
function renderItemsTable(items) {
	const rows = (Array.isArray(items) ? items : [])
		.map((item) => {
			const product = item && item.product;
			const name =
				(product && typeof product === "object" && product.name) || item?.name || "Item";
			const quantity = num(item?.quantity, 1) || 1;
			const lineTotal = num(item?.totalPrice, 0);
			const unitPrice = lineTotal / quantity;

			return `
				<tr>
					<td style="border: 1px solid #ddd; padding: 8px;">${name}</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${quantity}</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${unitPrice.toFixed(2)}</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${lineTotal.toFixed(2)}</td>
				</tr>
			`;
		})
		.join("");

	return `
		<table style="width: 100%; border-collapse: collapse; margin: 12px 0;">
			<thead>
				<tr style="background-color: #f2f2f2;">
					<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Product</th>
					<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Quantity</th>
					<th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Price</th>
					<th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total</th>
				</tr>
			</thead>
			<tbody>
				${rows}
			</tbody>
		</table>
	`;
}

/**
 * Registration / email confirmation
 */
function registrationConfirmationEmail({ name, confirmUrl }) {
	const greetName = name || "there";
	const subject = "Confirm your Freshly lb email";

	const text = `Hi ${greetName},\n\nPlease confirm your email by visiting the link below:\n${confirmUrl}\n\nIf you did not create an account, you can ignore this email.`;

	const html = wrapEmailBody(`
		<h2 style="color: ${HEADING_COLOR};">Confirm your email</h2>
		<p>Hi ${greetName},</p>
		<p>Thanks for signing up with ${BRAND_NAME}! Please confirm your email address to activate your account.</p>
		${renderButton(confirmUrl, "Confirm Email")}
		<p style="font-size: 13px; color: #666;">If the button above doesn't work, copy and paste this link into your browser:<br>
		<a href="${confirmUrl}" style="color: ${BRAND_COLOR}; word-break: break-all;">${confirmUrl}</a></p>
		<p>If you did not create an account, you can safely ignore this email.</p>
	`);

	return { subject, text, html };
}

/**
 * Password reset request
 */
function passwordResetEmail({ name, resetUrl }) {
	const subject = "Reset your Freshly lb password";

	const text = `Hi ${name},\n\nYou requested a password reset for your Freshly lb account. Click the link below to reset your password:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this password reset, please ignore this email.`;

	const html = wrapEmailBody(`
		<h2 style="color: ${HEADING_COLOR};">Reset your password</h2>
		<p>Hi ${name},</p>
		<p>You requested a password reset for your ${BRAND_NAME} account. Click the button below to choose a new password.</p>
		${renderButton(resetUrl, "Reset Password")}
		<p style="font-size: 13px; color: #666;">If the button above doesn't work, copy and paste this link into your browser:<br>
		<a href="${resetUrl}" style="color: ${BRAND_COLOR}; word-break: break-all;">${resetUrl}</a></p>
		<p><strong>This link will expire in 1 hour.</strong></p>
		<p>If you didn't request this password reset, please ignore this email — your password will remain unchanged.</p>
	`);

	return { subject, text, html };
}

/**
 * Order confirmation (sent right after an order is created)
 */
function orderConfirmationEmail({ order, paymentUrl }) {
	const subject = `Order Confirmation - Order #${order._id}`;

	const html = wrapEmailBody(`
		<h2 style="color: ${HEADING_COLOR};">Order Confirmation</h2>
		<p>Dear ${customerName(order)},</p>
		<p>Thank you for your order! We have received it and it is now being processed. Here are the details:</p>

		<h3 style="color: ${HEADING_COLOR};">Order Details</h3>
		<p><strong>Order ID:</strong> ${order.orderNumber || order._id}</p>
		<p><strong>Order Date:</strong> ${new Date(order.createdAt || Date.now()).toLocaleDateString()}</p>
		<p><strong>Status:</strong> ${order.status || "pending"}</p>
		<p><strong>Payment Method:</strong> ${order.paymentMethod || "-"}</p>
		${paymentUrl ? `<p><strong>Complete your order at:</strong> <a href="${paymentUrl}" style="color: ${BRAND_COLOR};">${paymentUrl}</a></p>` : ""}

		<h3 style="color: ${HEADING_COLOR};">Items Ordered</h3>
		${renderItemsTable(order.items)}

		<h3 style="color: ${HEADING_COLOR};">Order Summary</h3>
		<p><strong>Subtotal:</strong> $${money(order.subtotal)}</p>
		<p><strong>Delivery Fee:</strong> $${money(order.delivery)}</p>
		<p><strong>Processing Fee:</strong> $${money(order.fees)}</p>
		<p><strong>Total:</strong> $${money(order.total)}</p>

		${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ""}

		<p>If your order contains alcohol, the rider will need to verify your identity at delivery.</p>
		<p>If you have any questions about your order, please contact us at ${SUPPORT_EMAIL}.</p>
		<p>Thank you for choosing ${BRAND_NAME}!</p>
		<p>Best regards,<br>The ${BRAND_NAME} Team</p>
	`);

	// Note: original call site only ever passed `html` (no text fallback).
	return { subject, html };
}

/**
 * Order delivered confirmation
 */
function orderDeliveredEmail({ order }) {
	const subject = `Order Delivered - Order #${order._id}`;

	let promoCodeHtml = "";
	if (num(order?.total) > 100) {
		promoCodeHtml = `
			<div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-left: 4px solid ${BRAND_COLOR}; border-radius: 4px;">
				<h3 style="color: ${BRAND_COLOR}; margin-top: 0;">Congratulations! 🎉</h3>
				<p>Since your order was over $100, you've won a special promo code for your next purchase!</p>
				<p>We'll send you the code in a separate email shortly.</p>
			</div>
		`;
	}

	const html = wrapEmailBody(`
		<h2 style="color: ${HEADING_COLOR};">Order Delivered</h2>
		<p>Dear ${customerName(order)},</p>
		<p>Good news! Your order has been delivered successfully.</p>

		${promoCodeHtml}

		<h3 style="color: ${HEADING_COLOR};">Order Details</h3>
		<p><strong>Order ID:</strong> ${order.orderNumber || order._id}</p>
		<p><strong>Delivery Date:</strong> ${new Date().toLocaleDateString()}</p>

		<p>We hope you enjoy your purchase!</p>
		<p>If you have any feedback or issues, please contact us at ${SUPPORT_EMAIL}.</p>
		<p>Thank you for choosing ${BRAND_NAME}!</p>
		<p>Best regards,<br>The ${BRAND_NAME} Team</p>
	`);

	// Note: original call sites only ever passed `html` (no text fallback).
	return { subject, html };
}

/**
 * Refund processed (cancelled paid order)
 */
function refundProcessedEmail({ order, refundAmountUsd }) {
	const subject = `Refund Processed - Order #${order._id}`;

	const html = wrapEmailBody(`
		<h2 style="color: ${HEADING_COLOR};">Refund Processed</h2>
		<p>Dear ${customerName(order)},</p>
		<p>Your order #${order.orderNumber || order._id} has been cancelled and a refund has been initiated.</p>

		<h3 style="color: ${HEADING_COLOR};">Refund Details</h3>
		<p><strong>Refund Amount:</strong> $${money(refundAmountUsd)}</p>
		<p><strong>Original Order Total:</strong> $${money(order.total)}</p>
		<p><strong>Processing Fees (non-refundable):</strong> $${money(order.fees)}</p>

		<p>Please note that the refund amount does not include processing fees, as these are non-refundable.</p>
		<p>The refund should appear on your statement within 5-10 business days.</p>
		<p>For questions, please contact us at ${SUPPORT_EMAIL}.</p>
		<p>Best regards,<br>The ${BRAND_NAME} Team</p>
	`);

	// Note: original call site only ever passed `html` (no text fallback).
	return { subject, html };
}

module.exports = {
	registrationConfirmationEmail,
	passwordResetEmail,
	orderConfirmationEmail,
	orderDeliveredEmail,
	refundProcessedEmail,
};
