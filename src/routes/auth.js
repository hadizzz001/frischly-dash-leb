const express = require("express");
const { body } = require("express-validator");
const {
	register,
	confirmEmail,
	login,
	loginProfile,
	refreshToken,
	getMe,
	updateProfile,
	changePassword,
	getAllUsers,
	getUserById,
	createUser,
	updateUser,
	deleteUser,
	deleteAccount,
	requestPasswordReset,
	resetPassword,
	resetCustomerPassword,
	getCustomerCount,
} = require("../controllers/authController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Validation rules
const registerValidation = [
	body("name")
		.trim()
		.isLength({ min: 2, max: 100 })
		.withMessage("Name muss zwischen 2 und 100 Zeichen lang sein"),
	body("phoneNumber")
		.trim()
		.matches(/^[\+]?[1-9][\d]{0,15}$/)
		.withMessage("Bitte geben Sie eine gültige Telefonnummer an"),
	body("email")
		.isEmail()
		.normalizeEmail()
		.withMessage("Bitte geben Sie eine gültige E-Mail-Adresse an"),
	body("password")
		.isLength({ min: 6 })
		.withMessage("Passwort muss mindestens 6 Zeichen lang sein")
		.matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
		.withMessage(
			"Passwort muss mindestens einen Kleinbuchstaben, einen Großbuchstaben und eine Zahl enthalten"
		),
	body("address.street")
		.trim()
		.isLength({ min: 1, max: 200 })
		.withMessage(
			"Straßenadresse ist erforderlich und muss weniger als 200 Zeichen lang sein"
		),
	body("address.city")
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage(
			"Stadt ist erforderlich und muss weniger als 100 Zeichen lang sein"
		),
	body("address.state")
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage(
			"Bundesland/Provinz ist erforderlich und muss weniger als 100 Zeichen lang sein"
		),
	body("address.zipCode")
		.trim()
		.isLength({ min: 1, max: 20 })
		.withMessage(
			"Postleitzahl ist erforderlich und muss weniger als 20 Zeichen lang sein"
		),
	body("address.country")
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage(
			"Land ist erforderlich und muss weniger als 100 Zeichen lang sein"
		),
];

const loginValidation = [
	body("email")
		.isEmail()
		.normalizeEmail()
		.withMessage("Bitte geben Sie eine gültige E-Mail-Adresse an"),
	body("password").notEmpty().withMessage("Passwort ist erforderlich"),
];

const updateProfileValidation = [
	body("name")
		.optional()
		.trim()
		.isLength({ min: 2, max: 100 })
		.withMessage("Name muss zwischen 2 und 100 Zeichen lang sein"),
	body("phoneNumber")
		.optional()
		.trim()
		.matches(/^[\+]?[1-9][\d]{0,15}$/)
		.withMessage("Bitte geben Sie eine gültige Telefonnummer an"),
	body("email")
		.optional()
		.isEmail()
		.normalizeEmail()
		.withMessage("Bitte geben Sie eine gültige E-Mail-Adresse an"),
	body("address.street")
		.optional()
		.trim()
		.isLength({ min: 1, max: 200 })
		.withMessage("Straßenadresse muss weniger als 200 Zeichen lang sein"),
	body("address.city")
		.optional()
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage("Stadt muss weniger als 100 Zeichen lang sein"),
	body("address.state")
		.optional()
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage("Bundesland/Provinz muss weniger als 100 Zeichen lang sein"),
	body("address.zipCode")
		.optional()
		.trim()
		.isLength({ min: 1, max: 20 })
		.withMessage("Postleitzahl muss weniger als 20 Zeichen lang sein"),
	body("address.country")
		.optional()
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage("Land muss weniger als 100 Zeichen lang sein"),
	body("creditCard.cardNumber")
		.optional()
		.trim()
		.matches(/^\d{13,19}$/)
		.withMessage("Kartennummer muss zwischen 13 und 19 Ziffern lang sein"),
	body("creditCard.expiryMonth")
		.optional()
		.isIn([
			"01",
			"02",
			"03",
			"04",
			"05",
			"06",
			"07",
			"08",
			"09",
			"10",
			"11",
			"12",
		])
		.withMessage("Ablaufmonat muss ein gültiger Monat sein (01-12)"),
	body("creditCard.expiryYear")
		.optional()
		.isLength({ min: 4, max: 4 })
		.matches(/^\d{4}$/)
		.withMessage("Ablaufjahr muss ein 4-stelliges Jahr sein"),
	body("creditCard.cvv")
		.optional()
		.trim()
		.matches(/^\d{3,4}$/)
		.withMessage("CVV muss 3 oder 4 Ziffern lang sein"),
	body("creditCard.holderName")
		.optional()
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage("Karteninhabername muss weniger als 100 Zeichen lang sein"),
	body("creditCard.cardType")
		.optional()
		.isIn(["visa", "mastercard", "amex", "discover", "other"])
		.withMessage(
			"Kartentyp muss einer der folgenden sein: visa, mastercard, amex, discover, other"
		),
];

const changePasswordValidation = [
	body("currentPassword")
		.notEmpty()
		.withMessage("Aktuelles Passwort ist erforderlich"),
	body("newPassword")
		.isLength({ min: 6 })
		.withMessage("Neues Passwort muss mindestens 6 Zeichen lang sein")
		.matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
		.withMessage(
			"Neues Passwort muss mindestens einen Kleinbuchstaben, einen Großbuchstaben und eine Zahl enthalten"
		),
];

const refreshTokenValidation = [
	body("refreshToken").notEmpty().withMessage("Refresh-Token ist erforderlich"),
];

const deleteAccountValidation = [
	body("password")
		.isString()
		.notEmpty()
		.withMessage("Passwort ist für die Kontolöschung erforderlich"),
];

const requestPasswordResetValidation = [
	body("email")
		.isEmail()
		.normalizeEmail()
		.withMessage("Bitte geben Sie eine gültige E-Mail-Adresse an"),
];

const resetPasswordValidation = [
	body("token")
		.isString()
		.notEmpty()
		.withMessage("Reset-Token ist erforderlich"),
	body("newPassword")
		.isLength({ min: 6 })
		.withMessage("Neues Passwort muss mindestens 6 Zeichen lang sein")
		.matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
		.withMessage(
			"Neues Passwort muss mindestens einen Kleinbuchstaben, einen Großbuchstaben und eine Zahl enthalten"
		),
];

// Public routes
router.post("/register", registerValidation, register);
router.get("/confirm/:token", confirmEmail);
router.post("/login", loginValidation, login);
router.post("/login-profile", loginValidation, loginProfile);
router.post("/refresh", refreshTokenValidation, refreshToken);
router.post(
	"/forgot-password",
	requestPasswordResetValidation,
	requestPasswordReset
);
router.post("/reset-password", resetPasswordValidation, resetPassword);

// Protected routes
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfileValidation, updateProfile);
router.put(
	"/change-password",
	protect,
	changePasswordValidation,
	changePassword
);
router.delete(
	"/delete-account",
	protect,
	deleteAccountValidation,
	deleteAccount
);

// Admin-only routes for user management
// GET /users can be filtered with query parameter ?role=rider
router.get("/users", protect, getAllUsers);
router.get("/users/:id", protect, getUserById);
router.post("/users", protect, registerValidation, createUser);
router.put("/users/:id", protect, updateUser);
router.delete("/users/:id", protect, deleteUser);
router.post("/reset-password/:id", protect, resetCustomerPassword);

// Customer count endpoint (Admin/Manager only)
router.get(
	"/customers/count",
	protect,
	authorize("admin", "manager"),
	getCustomerCount
);

module.exports = router;
