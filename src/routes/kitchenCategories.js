const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
	getPublicKitchenCategories,
	getKitchenCategories,
	getKitchenCategory,
	createKitchenCategory,
	updateKitchenCategory,
	deleteKitchenCategory,
	uploadImage,
	uploadMiddleware,
	reorderKitchenCategories,
} = require("../controllers/kitchenCategoryController");

// Public storefront / mobile app route (no auth). Active categories only.
router.get("/public", getPublicKitchenCategories);

// All routes below are admin-only (or market admins, via the same dashboards).
router.use(protect);
router.use(authorize("admin", "market"));

router.post("/upload-image", uploadMiddleware, uploadImage);
router.put("/reorder", reorderKitchenCategories);
router.get("/", getKitchenCategories);
router.get("/:id", getKitchenCategory);
router.post("/", createKitchenCategory);
router.put("/:id", updateKitchenCategory);
router.delete("/:id", deleteKitchenCategory);

module.exports = router;
