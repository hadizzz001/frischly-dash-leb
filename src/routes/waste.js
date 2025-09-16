const express = require("express");
const router = express.Router();
const wasteController = require("../controllers/wasteController");
const { protect, authorize } = require("../middleware/auth");

// Product lookup by barcode
router
	.route("/product/:barcode")
	.get(
		protect,
		authorize("admin", "staff"),
		wasteController.getProductByBarcode
	);

// Routes with authentication and authorization
router
	.route("/")
	.post(protect, authorize("admin", "staff"), wasteController.createWaste)
	.get(protect, authorize("admin", "staff"), wasteController.getAllWaste);

router
	.route("/stats")
	.get(protect, authorize("admin", "staff"), wasteController.getWasteStats);

router
	.route("/:id")
	.get(protect, authorize("admin", "staff"), wasteController.getWasteById)
	.put(protect, authorize("admin"), wasteController.updateWaste)
	.delete(protect, authorize("admin"), wasteController.deleteWaste);

module.exports = router;
