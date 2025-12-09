const express = require("express");
const {
	getPromoCodes,
	getPromoCode,
	getPublicPromoCodes,
	createPromoCode,
	updatePromoCode,
	deletePromoCode,
} = require("../controllers/promoCodeController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.route("/public").get(getPublicPromoCodes);

// Protect all routes below
router.use(protect);
router.use(authorize("admin"));

router.route("/").get(getPromoCodes).post(createPromoCode);

router
	.route("/:id")
	.get(getPromoCode)
	.put(updatePromoCode)
	.delete(deletePromoCode);

module.exports = router;
