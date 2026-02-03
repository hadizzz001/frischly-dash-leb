const express = require("express");
const {
	getPromoCodes,
	getPromoCode,
	getPublicPromoCodes,
	createPromoCode,
	updatePromoCode,
	deletePromoCode,
	validatePromoCode,
} = require("../controllers/promoCodeController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.route("/public").get(getPublicPromoCodes);

// Protect routes below (authenticated users only)
router.use(protect);

router.route("/validate").post(validatePromoCode);

// Admin only routes
router.use(authorize("admin"));

router.route("/").get(getPromoCodes).post(createPromoCode);

router
	.route("/:id")
	.get(getPromoCode)
	.put(updatePromoCode)
	.delete(deletePromoCode);

module.exports = router;
