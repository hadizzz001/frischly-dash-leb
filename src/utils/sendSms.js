// Sends the phone-verification message via SMS / WhatsApp.
//
// Two providers are supported, tried in order until one actually sends:
//
//   1. Twilio (paid) — used when TWILIO_* env vars are set.
//        TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//        TWILIO_SMS_FROM, TWILIO_WHATSAPP_FROM
//        PREFERRED_VERIFICATION_CHANNEL = "sms" (default) or "whatsapp"
//
//   2. TextBelt (FREE) — a genuinely free way to receive a verification SMS.
//        Set TEXTBELT_KEY to your key, or leave it unset to use the public
//        free key ("textbelt"), which allows 1 free SMS per day. This gives
//        users a no-cost option to get verified by SMS. See https://textbelt.com
//        Enable/disable via SMS_FREE_FALLBACK ("true" by default).
//
//   Force the free provider first with SMS_PROVIDER=textbelt.
//
// If nothing is configured, sending is skipped gracefully (the message is
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
	const from = whatsapp
		? process.env.TWILIO_WHATSAPP_FROM
		: process.env.TWILIO_SMS_FROM;

	if (!client || !from) {
		return { skipped: true };
	}

	const toAddress = whatsapp ? `whatsapp:${to}` : to;
	return client.messages.create({ from, to: toAddress, body });
};

/**
 * FREE SMS via TextBelt. Uses the public "textbelt" key by default (1 free
 * SMS/day) so shoppers always have a no-cost way to get verified by SMS.
 * Returns { skipped: true } if disabled, or throws on a hard failure.
 */
const sendFreeSms = async ({ to, body }) => {
	const enabled =
		String(process.env.SMS_FREE_FALLBACK || "true").toLowerCase() !== "false";
	if (!enabled) return { skipped: true };

	const key = process.env.TEXTBELT_KEY || "textbelt"; // free public key

	const res = await fetch("https://textbelt.com/text", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ phone: to, message: body, key }),
	});
	const data = await res.json().catch(() => ({}));

	if (!data.success) {
		throw new Error(
			`TextBelt send failed: ${data.error || "unknown error"}${
				data.quotaRemaining != null ? ` (quota ${data.quotaRemaining})` : ""
			}`,
		);
	}

	console.log(
		`✅ Free SMS sent via TextBelt to ${to} (quota remaining: ${data.quotaRemaining})`,
	);
	return { success: true, provider: "textbelt", textId: data.textId };
};

/**
 * Sends the account verification link to a phone number.
 *
 * Order of attempts:
 *   1. Twilio (preferred channel first: SMS or WhatsApp per env), then the
 *      other Twilio channel.
 *   2. FREE TextBelt SMS fallback.
 *
 * Never throws — best effort. If every provider is unavailable, the link is
 * logged to the console so registration still succeeds in development.
 */
const sendVerificationLink = async ({ phoneNumber, link, name }) => {
	const body = `Hi ${
		name || "there"
	}, welcome to Freshly lb! Please verify your phone number by tapping this link: ${link}\n\nIf you did not create this account, you can ignore this message.`;

	const freeFirst =
		String(process.env.SMS_PROVIDER || "").toLowerCase() === "textbelt";

	const tryTwilio = async () => {
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
		return { skipped: true };
	};

	const tryFree = async () => {
		try {
			const result = await sendFreeSms({ to: phoneNumber, body });
			if (!result?.skipped) return result;
		} catch (err) {
			console.warn("Free SMS (TextBelt) failed:", err.message);
		}
		return { skipped: true };
	};

	const order = freeFirst ? [tryFree, tryTwilio] : [tryTwilio, tryFree];
	for (const attempt of order) {
		// eslint-disable-next-line no-await-in-loop
		const result = await attempt();
		if (!result?.skipped) return result;
	}

	console.warn(
		`⚠️ No SMS provider available — verification link for ${phoneNumber} was not sent:\n${link}`,
	);
	return { skipped: true };
};

module.exports = sendSms;
module.exports.sendSms = sendSms;
module.exports.sendFreeSms = sendFreeSms;
module.exports.sendVerificationLink = sendVerificationLink;
