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
};

const getLanguage = () => "en";

const t = (key) => translations.en[key] || key;

module.exports = { t };
