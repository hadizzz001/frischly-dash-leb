const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
	getPublicKitchens,
	getPublicKitchen,
	getKitchens,
	getKitchen,
	createKitchen,
	updateKitchen,
	deleteKitchen,
	getSelectableProducts,
	uploadImage,
	uploadMiddleware,
	reorderKitchens,
} = require("../controllers/kitchenController");

// Public storefront / mobile app routes (no auth). Active kitchens only.
router.get("/public", getPublicKitchens);
router.get("/public/:id", getPublicKitchen);

// All routes below are admin-only (or market admins, via the same admin
// dashboards). They never touch product stock.
router.use(protect);
router.use(authorize("admin", "market"));

router.get("/selectable-products", getSelectableProducts);
router.post("/upload-image", uploadMiddleware, uploadImage);
router.put("/reorder", reorderKitchens);
router.get("/", getKitchens);
router.get("/:id", getKitchen);
router.post("/", createKitchen);
router.put("/:id", updateKitchen);
router.delete("/:id", deleteKitchen);

module.exports = router;
