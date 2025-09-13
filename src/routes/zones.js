const express = require("express");
const { body } = require("express-validator");
const {
	getZones,
	getZoneById,
	createZone,
	updateZone,
	deleteZone,
	getZoneByZipCode,
} = require("../controllers/zoneController");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Validation rules
const zoneValidation = [
	body("name")
		.trim()
		.notEmpty()
		.withMessage("Zone name is required")
		.isLength({ max: 100 })
		.withMessage("Zone name cannot be more than 100 characters"),
	body("maxDistance")
		.optional()
		.isNumeric()
		.withMessage("Maximum distance must be a number")
		.isFloat({ min: 0 })
		.withMessage("Maximum distance cannot be negative"),
	body("zipCodes")
		.optional()
		.isArray()
		.withMessage("Zip codes must be an array"),
	body("zipCodes.*")
		.optional()
		.matches(/^[0-9]{5}(-[0-9]{4})?$/)
		.withMessage("Invalid zip code format"),
	body("description")
		.optional()
		.isLength({ max: 500 })
		.withMessage("Description cannot be more than 500 characters"),
	body("deliveryFee")
		.optional()
		.isNumeric()
		.withMessage("Delivery fee must be a number")
		.isFloat({ min: 0 })
		.withMessage("Delivery fee cannot be negative"),
	body("minDeliveryTime")
		.optional()
		.isInt({ min: 0 })
		.withMessage("Minimum delivery time must be a positive integer"),
	body("maxDeliveryTime")
		.optional()
		.isInt({ min: 0 })
		.withMessage("Maximum delivery time must be a positive integer")
		.custom((value, { req }) => {
			if (req.body.minDeliveryTime && value < req.body.minDeliveryTime) {
				throw new Error(
					"Maximum delivery time cannot be less than minimum delivery time"
				);
			}
			return true;
		}),
];

// Public routes
router.get("/", getZones);
router.get("/zip/:zipCode", getZoneByZipCode);
router.get("/:id", getZoneById);

// Protected routes
router.post("/", protect, zoneValidation, createZone);
router.put("/:id", protect, zoneValidation, updateZone);
router.delete("/:id", protect, deleteZone);

module.exports = router;
