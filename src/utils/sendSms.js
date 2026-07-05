// Sends the phone-verification link via SMS and/or WhatsApp using Twilio.
//
// Configure via environment variables:
//   TWILIO_ACCOUNT_SID          - Twilio account SID
//   TWILIO_AUTH_TOKEN           - Twilio auth token
//   TWILIO_SMS_FROM             - Twilio SMS-capable "from" number, e.g. +1415...
//   TWILIO_WHATSAPP_FROM        - Twilio WhatsApp "from" number, e.g. "whatsapp:+14155238886"
//   PREFERRED_VERIFICATION_CHANNEL - "sms" (default) or "whatsapp"
//
// If Twilio isn't configured yet, sending is skipped gracefully (the link is
// simply logged to the console) so registration never breaks in development
// — once the env vars above are set, real messages start going out with no
// further code changes needed.
let twilioClient = null;
let triedInit = false;

const getClient = () => {
	if (triedInit) return twilioClient;
	triedInit = true;

	const sid = process.env.TWILIO_ACCOUNT_SID;
	const token = process.env.TWILIO_AUTH_TOKEN;
	if (!sid || !token) return null;

	try {
		// Lazily required so the app doesn't crash if the package isn't
		// installed yet in an environment that doesn't need SMS/WhatsApp.
		const twilio = require("twilio");
		twilioClient = twilio(sid, token);
	} catch (err) {
		console.warn("Twilio SDK not available:", err.message);
		twilioClient = null;
	}

	return twilioClient;
};

/**
 * Low-level send: fires a single SMS or WhatsApp message via Twilio.
 * Resolves to { skipped: true } (never throws) when Twilio isn't configured,
 * so callers can treat "not configured" the same as "best effort, ignore".
 */
const sendSms = async ({ to, body, whatsapp = false }) => {
	if (!to) throw new Error("Recipient phone number is required");

	const client = getClient();
	const from = whatsapp
		? process.env.TWILIO_WHATSAPP_FROM
		: process.env.TWILIO_SMS_FROM;

	if (!client || !from) {
		console.warn(
			`⚠️ ${
				whatsapp ? "WhatsApp" : "SMS"
			} is not configured (missing Twilio env vars) — message to ${to} was not sent:\n${body}`
		);
		return { skipped: true };
	}

	const toAddress = whatsapp ? `whatsapp:${to}` : to;
	return client.messages.create({ from, to: toAddress, body });
};

/**
 * Sends the account verification link to a phone number, preferring
 * WhatsApp or SMS based on PREFERRED_VERIFICATION_CHANNEL (defaults to SMS),
 * and falling back to the other channel if the preferred one isn't
 * configured or fails to send.
 */
const sendVerificationLink = async ({ phoneNumber, link, name }) => {
	const body = `Hi ${
		name || "there"
	}, welcome to Freshly lb! Please verify your phone number by tapping this link: ${link}\n\nIf you did not create this account, you can ignore this message.`;

	const preferWhatsapp =
		String(process.env.PREFERRED_VERIFICATION_CHANNEL || "sms").toLowerCase() ===
		"whatsapp";

	const attempts = preferWhatsapp
		? [true, false]
		: [false, true];

	let lastResult = null;
	for (const useWhatsapp of attempts) {
		try {
			// eslint-disable-next-line no-await-in-loop
			const result = await sendSms({ to: phoneNumber, body, whatsapp: useWhatsapp });
			lastResult = result;
			if (!result?.skipped) return result; // actually sent — stop here
		} catch (err) {
			console.warn(
				`Failed to send verification ${useWhatsapp ? "WhatsApp" : "SMS"} message:`,
				err.message
			);
		}
	}

	// Neither channel is configured / both failed — logged above already.
	return lastResult;
};

module.exports = sendSms;
module.exports.sendSms = sendSms;
module.exports.sendVerificationLink = sendVerificationLink;
