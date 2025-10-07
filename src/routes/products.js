const express = require("express");
const {
	getProducts,
	getProduct,
	getProductByBarcode,
	//getProductsByShelfNumber,
	getProductsByCategory,
	getProductsBySubcategory,
	getProductsWithDiscount,
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
router.get("/subcategory", getProductsBySubcategory);
router.get("/discount", getProductsWithDiscount);
// router.get(
// 	"/shelves",
// 	protect,
// 	authorize("admin", "manager", "staff"),
// 	getShelfNumbers
// );
router.get(
	"/barcode/:barcode",
	protect,
	authorize("admin", "manager", "staff"),
	getProductByBarcode
);
//router.get("/shelf/:shelfNumber", getProductsByShelfNumber);
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
	authorize("admin", "manager", "staff"),
	uploadMiddleware,
	updateProduct
);
router.patch(
	"/:id/stock",
	protect,
	authorize("admin", "manager", "staff"),
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
