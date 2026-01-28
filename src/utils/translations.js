const translations = {
	en: {
		promoCodeRequired: "Promo code is required",
		invalidPromoCode: "Invalid or inactive promo code",
		promoCodeApplied: "Promo code applied successfully",
		serverError: "Server Error",
		promoCodeNotFound: "Promo code not found",
		promoCodeExists: "Promo code already exists",
		percentageDiscountRange: "Percentage discount must be between 0 and 100",
		cashDiscountNegative: "Cash discount cannot be negative",
		promoCodeCreated: "Promo code created successfully",
		promoCodeUpdated: "Promo code updated successfully",
		promoCodeDeleted: "Promo code deleted successfully",
	},
	de: {
		promoCodeRequired: "Promo-Code ist erforderlich",
		invalidPromoCode: "Ungültiger oder inaktiver Promo-Code",
		promoCodeApplied: "Promo-Code erfolgreich angewendet",
		serverError: "Serverfehler",
		promoCodeNotFound: "Promo-Code nicht gefunden",
		promoCodeExists: "Promo-Code existiert bereits",
		percentageDiscountRange:
			"Prozentualer Rabatt muss zwischen 0 und 100 liegen",
		cashDiscountNegative: "Bar-Rabatt kann nicht negativ sein",
		promoCodeCreated: "Promo-Code erfolgreich erstellt",
		promoCodeUpdated: "Promo-Code erfolgreich aktualisiert",
		promoCodeDeleted: "Promo-Code erfolgreich gelöscht",
	},
};

const getLanguage = (req) => {
	// Get language from Accept-Language header or default to 'en'
	const acceptLanguage = req.headers["accept-language"];
	if (acceptLanguage && acceptLanguage.startsWith("de")) {
		return "de";
	}
	return "en";
};

const t = (key, req) => {
	const lang = getLanguage(req);
	return translations[lang][key] || translations["en"][key] || key;
};

module.exports = { t };
