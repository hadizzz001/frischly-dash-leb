const express = require("express");
const { protect } = require("../middleware/auth");
const { marketOnly } = require("../middleware/marketAuth");
const c = require("../controllers/marketAdminController");
const categoryCtrl = require("../controllers/categoryController");
const productCtrl = require("../controllers/productController");

const router = express.Router();

// All routes require an authenticated market owner OR a market_staff user
router.use(protect, marketOnly);

// Convenience
router.get("/me", c.me);

// Dashboard
router.get("/dashboard", c.getDashboard);
router.get("/statistics", c.getStatistics);

// Staff (User docs with role 'market_staff')
router.get("/staff", c.listStaff);
router.get("/staff/:id", c.getStaff);
router.post("/staff", c.createStaff);
router.put("/staff/:id", c.updateStaff);
router.patch("/staff/:id/password", c.resetStaffPassword);
router.delete("/staff/:id", c.deleteStaff);
router.get("/rider-users", c.listRiderUsers);

// Categories
router.get("/categories", c.categories.list);
router.post(
	"/categories/upload-image",
	categoryCtrl.uploadMiddleware,
	categoryCtrl.uploadImage,
);
router.get("/categories/all/product-count", c.getAllCategoryProductCounts);
router.get("/categories/:id/product-count", c.getCategoryProductCount);
router.get("/categories/:id", c.categories.get);
router.post("/categories", c.categories.create);
router.put("/categories/:id", c.categories.update);
router.delete("/categories/:id", c.categories.remove);

// Subcategories
router.get("/subcategories", c.subcategories.list);
router.get("/subcategories/:id", c.subcategories.get);
router.post("/subcategories", c.subcategories.create);
router.put("/subcategories/:id", c.subcategories.update);
router.delete("/subcategories/:id", c.subcategories.remove);

// Products (shared collection, market-scoped)
router.get("/products", c.listProducts);
router.post(
	"/products/upload-image",
	productCtrl.uploadMiddleware,
	productCtrl.uploadImage,
);
router.post("/products", c.createProduct);
router.put("/products/:id", c.updateProduct);
router.patch("/products/:id/stock", c.updateProductStock);
router.patch("/products/:id/shelf", c.updateProductShelfNumber);
router.delete("/products/:id/permanent", c.permanentDeleteProduct);
router.delete("/products/:id", c.deleteProduct);

// Shelves
router.get("/shelves", c.shelves.list);
router.get("/shelves/:id", c.shelves.get);
router.post("/shelves", c.shelves.create);
router.put("/shelves/:id", c.shelves.update);
router.delete("/shelves/:id", c.shelves.remove);

// Orders (shared collection, market-scoped)
router.get("/orders/sales-stats", c.getProductSalesStats);
router.get("/orders/unsold-products", c.getUnsoldProducts);
router.get("/orders/customer-order-counts", c.getCustomerOrderCounts);
router.get("/orders", c.listOrders);
router.patch("/orders/:id/status", c.updateOrderStatus);
router.patch("/orders/:id/cancel", c.cancelOrder);

// Riders
router.get("/riders", c.riders.list);
router.get("/riders/:id", c.riders.get);
router.post("/riders", c.riders.create);
router.put("/riders/:id", c.riders.update);
router.patch("/riders/:id/status", c.updateRiderStatus);
router.delete("/riders/:id", c.riders.remove);

// Waste
router.get("/waste/summary", c.getWasteSummary);
router.get("/waste", c.waste.list);
router.get("/waste/:id", c.waste.get);
router.post("/waste", c.waste.create);
router.put("/waste/:id", c.waste.update);
router.delete("/waste/:id", c.waste.remove);

// Promo codes
router.get("/promocodes", c.promoCodes.list);
router.get("/promocodes/:id", c.promoCodes.get);
router.post("/promocodes", c.promoCodes.create);
router.put("/promocodes/:id", c.promoCodes.update);
router.delete("/promocodes/:id", c.promoCodes.remove);

// Announcements
router.get("/announcements", c.announcements.list);
router.get("/announcements/:id", c.announcements.get);
router.post("/announcements", c.announcements.create);
router.put("/announcements/:id", c.announcements.update);
router.delete("/announcements/:id", c.announcements.remove);

// Settings
router.get("/settings", c.getSettings);
router.put("/settings", c.updateSettings);

// Profile (the Market document itself; never allow create/list of markets)
router.get("/profile", c.getProfile);
router.put("/profile", c.updateProfile);
router.patch("/profile/password", c.changeProfilePassword);

module.exports = router;
