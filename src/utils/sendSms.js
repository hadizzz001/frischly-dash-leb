// Sends the phone-verification message via SMS / WhatsApp using Twilio.
//
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//   TWILIO_SMS_FROM              (numeric "from" number, e.g. +14472245095)
//   TWILIO_SMS_SENDER_ID         (optional alphanumeric sender, e.g. "FreshlyLB" —
//                                 takes priority over TWILIO_SMS_FROM when set.
//                                 Many countries, incl. Lebanon, accept this
//                                 without needing carrier long-code registration,
//                                 and it avoids the spam-filtering that generic
//                                 US long codes often hit for local numbers.)
//   TWILIO_WHATSAPP_FROM
//   PREFERRED_VERIFICATION_CHANNEL = "sms" (default) or "whatsapp"
//
// If Twilio isn't configured, sending is skipped gracefully (the message is
// logged to the console) so registration never breaks in development.

let twilioClient = null;
let triedInit = false;

const getClient = () => {
	if (triedInit) return twilioClient;
	triedInit = true;

	const sid = process.env.TWILIO_ACCOUNT_SID;
	const token = process.env.TWILIO_AUTH_TOKEN;
	if (!sid || !token) return null;

	try {
		const twilio = require("twilio");
		twilioClient = twilio(sid, token);
	} catch (err) {
		console.warn("Twilio SDK not available:", err.message);
		twilioClient = null;
	}

	return twilioClient;
};

/**
 * Low-level Twilio send: fires a single SMS or WhatsApp message.
 * Resolves to { skipped: true } (never throws) when Twilio isn't configured.
 */
const sendSms = async ({ to, body, whatsapp = false }) => {
	if (!to) throw new Error("Recipient phone number is required");

	const client = getClient();
	// For plain SMS, prefer the alphanumeric sender ID (e.g. "FreshlyLB") if
	// configured — it's accepted by many countries without registration and
	// tends to avoid the aggressive spam filtering that generic US long-code
	// numbers hit on some carriers/countries. WhatsApp always uses the
	// numeric TWILIO_WHATSAPP_FROM since alphanumeric senders don't apply there.
	const from = whatsapp
		? process.env.TWILIO_WHATSAPP_FROM
		: process.env.TWILIO_SMS_SENDER_ID || process.env.TWILIO_SMS_FROM;

	if (!client || !from) {
		return { skipped: true };
	}

	const toAddress = whatsapp ? `whatsapp:${to}` : to;
	return client.messages.create({ from, to: toAddress, body });
};

/**
 * Sends the account verification link to a phone number via Twilio (SMS or
 * WhatsApp, per PREFERRED_VERIFICATION_CHANNEL). Tries the preferred channel
 * first, then falls back to the other Twilio channel.
 *
 * Never throws — best effort. If Twilio isn't configured, the link is
 * logged to the console so registration still succeeds in development.
 */
const sendVerificationLink = async ({ phoneNumber, link, name }) => {
	const body = `Hi ${
		name || "there"
	}, welcome to Freshly lb! Please verify your phone number by tapping this link: ${link}\n\nIf you did not create this account, you can ignore this message.`;

	const preferWhatsapp =
		String(process.env.PREFERRED_VERIFICATION_CHANNEL || "sms").toLowerCase() ===
		"whatsapp";
	const attempts = preferWhatsapp ? [true, false] : [false, true];

	for (const useWhatsapp of attempts) {
		try {
			// eslint-disable-next-line no-await-in-loop
			const result = await sendSms({ to: phoneNumber, body, whatsapp: useWhatsapp });
			if (!result?.skipped) return result;
		} catch (err) {
			console.warn(
				`Failed to send verification ${useWhatsapp ? "WhatsApp" : "SMS"} message:`,
				err.message,
			);
		}
	}

	console.warn(
		`⚠️ No SMS provider available — verification link for ${phoneNumber} was not sent:\n${link}`,
	);
	return { skipped: true };
};

module.exports = sendSms;
module.exports.sendSms = sendSms;
module.exports.sendVerificationLink = sendVerificationLink;
