const express = require("express");
const router = express.Router();
const subcategoryController = require("../controllers/subcategoryController");
const { protect, authorize } = require("../middleware/auth");

// Public listing - anyone can view subcategories
router.get("/", subcategoryController.getAllSubcategories);
router.post(
	"/",
	protect,
	authorize("admin", "manager", "staff"),
	subcategoryController.createSubcategory
);
router.get("/:id", subcategoryController.getSubcategoryById);
router.put(
	"/:id",
	protect,
	authorize("admin", "manager", "staff"),
	subcategoryController.updateSubcategory
);
router.delete(
	"/:id",
	protect,
	authorize("admin", "manager", "staff"),
	subcategoryController.deleteSubcategory
);

module.exports = router;
