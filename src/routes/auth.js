const express = require("express");
const { body } = require("express-validator");
const {
	googleSignIn,
	register,
	confirmEmail,
	confirmPhone,
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
		.matches(/^\+961\d{7,8}$/)
		.withMessage("Phone number must be a Lebanese number (+961) with 7 or 8 digits"),
	body("email")
		.optional({ checkFalsy: true })
		.isEmail()
		.normalizeEmail()
		.withMessage("Please provide a valid email address"),
	body("password")
		.isLength({ min: 6 })
		.withMessage("Password must be at least 6 characters long")
		.matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
		.withMessage(
			"Password must contain at least one lowercase letter, one uppercase letter, and one number"
		),
	body("address.street")
		.trim()
		.isLength({ min: 1, max: 200 })
		.withMessage(
			"Street address is required and must be less than 200 characters"
		),
	body("address.city")
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage(
			"City is required and must be less than 100 characters"
		),
];

const loginValidation = [
	body("email")
		.isEmail()
		.normalizeEmail()
		.withMessage("Please provide a valid email address"),
	body("password").notEmpty().withMessage("Password is required"),
];

const loginProfileValidation = [
	body("phone").optional({ checkFalsy: true }).trim(),
	body("email").optional({ checkFalsy: true }).trim(),
	body("password").notEmpty().withMessage("Password is required"),
	body().custom((_, { req }) => {
		if (!req.body.phone && !req.body.email) {
			throw new Error("Please provide a phone number or email address");
		}
		return true;
	}),
];

const updateProfileValidation = [
	body("name")
		.optional()
		.trim()
		.isLength({ min: 2, max: 100 })
		.withMessage("Name must be between 2 and 100 characters long"),
	body("phoneNumber")
		.optional()
		.trim()
		.matches(/^[\+]?[1-9][\d]{0,15}$/)
		.withMessage("Please provide a valid phone number"),
	body("email")
		.optional()
		.isEmail()
		.normalizeEmail()
		.withMessage("Please provide a valid email address"),
	body("address.street")
		.optional()
		.trim()
		.isLength({ min: 1, max: 200 })
		.withMessage("Street address must be less than 200 characters"),
	body("address.city")
		.optional()
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage("City must be less than 100 characters"),
	body("creditCard.cardNumber")
		.optional()
		.trim()
		.matches(/^\d{13,19}$/)
		.withMessage("Card number must be between 13 and 19 digits"),
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
		.withMessage("Expiry month must be a valid month (01-12)"),
	body("creditCard.expiryYear")
		.optional()
		.isLength({ min: 4, max: 4 })
		.matches(/^\d{4}$/)
		.withMessage("Expiry year must be a 4-digit year"),
	body("creditCard.cvv")
		.optional()
		.trim()
		.matches(/^\d{3,4}$/)
		.withMessage("CVV must be 3 or 4 digits"),
	body("creditCard.holderName")
		.optional()
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage("Cardholder name must be less than 100 characters"),
	body("creditCard.cardType")
		.optional()
		.isIn(["visa", "mastercard", "amex", "discover", "other"])
		.withMessage(
			"Card type must be one of: visa, mastercard, amex, discover, other"
		),
];

const changePasswordValidation = [
	body("currentPassword")
		.notEmpty()
		.withMessage("Current password is required"),
	body("newPassword")
		.isLength({ min: 6 })
		.withMessage("New password must be at least 6 characters long")
		.matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
		.withMessage(
			"New password must contain at least one lowercase letter, one uppercase letter, and one number"
		),
];

const refreshTokenValidation = [
	body("refreshToken").notEmpty().withMessage("Refresh token is required"),
];

const deleteAccountValidation = [
	body("password")
		.isString()
		.notEmpty()
		.withMessage("Password is required for account deletion"),
];

const requestPasswordResetValidation = [
	body("email")
		.isEmail()
		.normalizeEmail()
		.withMessage("Please provide a valid email address"),
];

const resetPasswordValidation = [
	body("token")
		.isString()
		.notEmpty()
		.withMessage("Reset token is required"),
	body("newPassword")
		.isLength({ min: 6 })
		.withMessage("New password must be at least 6 characters long")
		.matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
		.withMessage(
			"New password must contain at least one lowercase letter, one uppercase letter, and one number"
		),
];

// Public routes
router.post("/register", registerValidation, register);
router.get("/confirm/:token", confirmEmail);
router.get("/confirm-phone/:token", confirmPhone);
router.post("/login", loginValidation, login);
router.post("/google", googleSignIn);
router.post("/login-profile", loginProfileValidation, loginProfile);
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
