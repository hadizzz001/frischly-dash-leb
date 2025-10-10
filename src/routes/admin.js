const express = require("express");
const { bulkUpdateProductStatus } = require("../controllers/productController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// All admin routes require authentication and admin authorization
router.use(protect);
router.use(authorize("admin"));

// Bulk product operations
router.put("/products/bulk-status", bulkUpdateProductStatus);

module.exports = router;
