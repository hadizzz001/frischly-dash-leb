const express = require("express");
const {
	getProducts,
	getProduct,
	getProductByBarcode,
	getProductsByShelfNumber,
	getProductsByCategory,
	createProduct,
	updateProduct,
	updateProductStock,
	deleteProduct,
	permanentDeleteProduct,
	getShelfNumbers,
	uploadImage,
	uploadMiddleware,
	getProductsCount,
	updateProductShelfNumber,
} = require("../controllers/productController");

// Import middleware (assuming auth middleware exists)
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.get("/", getProducts);
router.get("/count", getProductsCount);
router.get("/category", getProductsByCategory);
router.get("/shelves", getShelfNumbers);
router.get("/barcode/:barcode", getProductByBarcode);
router.get("/shelf/:shelfNumber", getProductsByShelfNumber);
router.get("/:id", getProduct);

// Protected routes (require authentication)
router.post(
	"/",
	protect,
	authorize("admin", "manager"),
	uploadMiddleware,
	createProduct
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
	updateProduct
);
router.patch(
	"/:id/stock",
	protect,
	authorize("admin", "manager"),
	updateProductStock
);
router.patch(
	"/:id/shelf",
	protect,
	authorize("admin", "manager", "staff"),
	updateProductShelfNumber
);
router.delete("/:id", protect, authorize("admin"), deleteProduct);
router.delete(
	"/:id/permanent",
	protect,
	authorize("admin"),
	permanentDeleteProduct
);

module.exports = router;
