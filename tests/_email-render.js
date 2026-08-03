/* Render every email template to catch runtime errors and verify the
   generated HTML is well-formed enough (balanced tags, no stray `${`). */
const T = require("../src/utils/emailTemplates");

// Fixture matching the real Order schema (models/Order.js).
const order = {
	_id: "abc123",
	orderNumber: "ORD-1",
	customer: { name: "Test", email: "t@t.com" },
	items: [
		{ product: { name: "Apple" }, quantity: 3, totalPrice: 10.5 }, // populated
		{ product: null, quantity: 1, totalPrice: 4 }, // deleted product
	],
	subtotal: 14.5,
	delivery: 2,
	fees: 1,
	total: 17.5,
	status: "pending",
	paymentMethod: "card",
	createdAt: new Date(),
};

// A deliberately sparse order: nothing but an id. Templates must not throw,
// because an email failure should never break order processing.
const bareOrder = { _id: "bare1" };

const cases = [
	["registrationConfirmationEmail", { name: "Test", confirmUrl: "https://x/confirm" }],
	["passwordResetEmail", { name: "Test", resetUrl: "https://x/reset" }],
	["orderConfirmationEmail", { order, paymentUrl: "https://x/pay" }],
	["orderDeliveredEmail", { order }],
	["refundProcessedEmail", { order, refundAmountUsd: 10 }],
	// Resilience: sparse orders must still render without throwing.
	["orderConfirmationEmail", { order: bareOrder }],
	["orderDeliveredEmail", { order: bareOrder }],
	["refundProcessedEmail", { order: bareOrder }],
];

let bad = 0;
for (const [fn, arg] of cases) {
	try {
		const out = T[fn](arg);
		const issues = [];
		if (!out || typeof out.subject !== "string" || !out.subject) issues.push("missing subject");
		if (!out || typeof out.html !== "string" || !out.html) issues.push("missing html");
		if (out?.html?.includes("${")) issues.push("unrendered ${} in html");
		if (out?.html?.includes("undefined")) issues.push("contains 'undefined'");
		const open = (out.html.match(/<div/g) || []).length;
		const close = (out.html.match(/<\/div>/g) || []).length;
		if (open !== close) issues.push(`div imbalance ${open}/${close}`);
		if (issues.length) bad++;
		console.log(
			(issues.length ? "FAIL " : "OK   ") +
				fn.padEnd(30) +
				(issues.length ? issues.join("; ") : `subject="${out.subject}" htmlLen=${out.html.length}`)
		);
	} catch (e) {
		bad++;
		console.log("ERROR " + fn.padEnd(29) + e.message);
	}
}
console.log(bad === 0 ? "\nAll email templates render cleanly." : `\n${bad} template issue(s).`);
