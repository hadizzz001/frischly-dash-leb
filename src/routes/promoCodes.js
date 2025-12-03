const express = require("express");
const {
	getPromoCodes,
	getPromoCode,
	createPromoCode,
	updatePromoCode,
	deletePromoCode,
} = require("../controllers/promoCodeController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Protect all routes
router.use(protect);
router.use(authorize("admin"));

router.route("/").get(getPromoCodes).post(createPromoCode);

router
	.route("/:id")
	.get(getPromoCode)
	.put(updatePromoCode)
	.delete(deletePromoCode);

module.exports = router;
