const express = require("express");
const { downloadBackup } = require("../controllers/backupController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// All roles except drivers (rider, market_driver) can download a backup.
router.get(
	"/",
	protect,
	authorize(
		"admin",
		"manager",
		"staff",
		"customer",
		"market",
		"market_manager",
		"market_staff"
	),
	downloadBackup
);

module.exports = router;
