const express = require("express");
const {
	getCategories,
	getCategory,
	getCategoryByName,
	createCategory,
	updateCategory,
	deleteCategory,
	permanentDeleteCategory,
	getCategoryStats,
	reorderCategories,
	uploadImage,
	uploadMiddleware,
	getCategoryProductCount,
	getAllCategoriesProductCount,
} = require("../controllers/categoryController");

// Import middleware
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.get("/", getCategories);
router.get("/stats", getCategoryStats);
router.get("/all/product-count", getAllCategoriesProductCount);
router.get("/name/:name", getCategoryByName);
router.get("/:id", getCategory);
router.get("/:id/product-count", getCategoryProductCount);

// Protected routes (require authentication)
router.post(
	"/",
	protect,
	authorize("admin", "manager"),
	uploadMiddleware,
	createCategory
);
router.post(
	"/upload-image",
	protect,
	authorize("admin", "manager"),
	uploadMiddleware,
	uploadImage
);
router.put(
	"/:id",
	protect,
	authorize("admin", "manager"),
	uploadMiddleware,
	updateCategory
);
router.patch(
	"/reorder",
	protect,
	authorize("admin", "manager"),
	reorderCategories
);
router.delete("/:id", protect, authorize("admin"), deleteCategory);
router.delete(
	"/:id/permanent",
	protect,
	authorize("admin"),
	permanentDeleteCategory
);

module.exports = router;
