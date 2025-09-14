const express = require("express");
const { body } = require("express-validator");
const {
	register,
	login,
	loginProfile,
	getMe,
	updateProfile,
	changePassword,
	getAllUsers,
	getUserById,
	createUser,
	updateUser,
	deleteUser,
	getCustomerCount,
} = require("../controllers/authController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Validation rules
const registerValidation = [
	body("name")
		.trim()
		.isLength({ min: 2, max: 100 })
		.withMessage("Name must be between 2 and 100 characters"),
	body("phoneNumber")
		.trim()
		.matches(/^[\+]?[1-9][\d]{0,15}$/)
		.withMessage("Please provide a valid phone number"),
	body("email")
		.isEmail()
		.normalizeEmail()
		.withMessage("Please provide a valid email"),
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
		.withMessage("City is required and must be less than 100 characters"),
	body("address.state")
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage(
			"State/Province is required and must be less than 100 characters"
		),
	body("address.zipCode")
		.trim()
		.isLength({ min: 1, max: 20 })
		.withMessage(
			"Zip/Postal code is required and must be less than 20 characters"
		),
	body("address.country")
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage("Country is required and must be less than 100 characters"),
];

const loginValidation = [
	body("email")
		.isEmail()
		.normalizeEmail()
		.withMessage("Please provide a valid email"),
	body("password").notEmpty().withMessage("Password is required"),
];

const updateProfileValidation = [
	body("name")
		.optional()
		.trim()
		.isLength({ min: 2, max: 100 })
		.withMessage("Name must be between 2 and 100 characters"),
	body("phoneNumber")
		.optional()
		.trim()
		.matches(/^[\+]?[1-9][\d]{0,15}$/)
		.withMessage("Please provide a valid phone number"),
	body("email")
		.optional()
		.isEmail()
		.normalizeEmail()
		.withMessage("Please provide a valid email"),
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
	body("address.state")
		.optional()
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage("State/Province must be less than 100 characters"),
	body("address.zipCode")
		.optional()
		.trim()
		.isLength({ min: 1, max: 20 })
		.withMessage("Zip/Postal code must be less than 20 characters"),
	body("address.country")
		.optional()
		.trim()
		.isLength({ min: 1, max: 100 })
		.withMessage("Country must be less than 100 characters"),
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

// Public routes
router.post("/register", registerValidation, register);
router.post("/login", loginValidation, login);
router.post("/login-profile", loginValidation, loginProfile);

// Protected routes
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfileValidation, updateProfile);
router.put(
	"/change-password",
	protect,
	changePasswordValidation,
	changePassword
);

// Admin-only routes for user management
// GET /users can be filtered with query parameter ?role=rider
router.get("/users", protect, getAllUsers);
router.get("/users/:id", protect, getUserById);
router.post("/users", protect, registerValidation, createUser);
router.put("/users/:id", protect, updateUser);
router.delete("/users/:id", protect, deleteUser);

// Customer count endpoint (Admin/Manager only)
router.get(
	"/customers/count",
	protect,
	authorize("admin", "manager"),
	getCustomerCount
);

module.exports = router;
