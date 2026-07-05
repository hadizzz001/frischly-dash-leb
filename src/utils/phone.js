// Normalizes a Lebanese phone number into a consistent E.164-ish format
// (e.g. "+96170123456") so registration and login always compare/store the
// exact same string, regardless of how the user typed it (with/without
// country code, leading 0, spaces, dashes, etc).
const normalizeLebanonPhone = (input) => {
	if (!input) return "";

	let digits = String(input).trim();

	// "00961..." -> "+961..."
	digits = digits.replace(/^00/, "+");

	// Strip everything except digits and a single leading "+".
	const hasPlus = digits.startsWith("+");
	digits = digits.replace(/[^\d]/g, "");

	if (hasPlus) {
		return `+${digits}`;
	}

	// "961XXXXXXXX" (country code typed without a leading +).
	if (digits.startsWith("961")) {
		return `+${digits}`;
	}

	// Local format, e.g. "03123456" or "70123456" -> drop leading 0, add +961.
	digits = digits.replace(/^0+/, "");
	return `+961${digits}`;
};

// True if the given string looks like a phone number (rather than an email
// address or a market username) — digits, spaces, dashes, and an optional
// leading "+", at least 6 characters long.
const isPhoneLike = (value) => {
	if (!value) return false;
	const str = String(value).trim();
	if (str.includes("@")) return false;
	return /^\+?[\d\s-]{6,}$/.test(str);
};

module.exports = { normalizeLebanonPhone, isPhoneLike };
