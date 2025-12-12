const express = require("express");
const router = express.Router();
const {
	updateFcmToken,
	removeFcmToken,
	sendToUser,
	sendToUsers,
	sendToAllUsers,
	sendToRole,
	getStats,
	createCampaign,
	getCampaigns,
	getCampaign,
	updateCampaign,
	deleteCampaign,
	sendCampaign,
} = require("../controllers/notificationController");
const { protect, authorize } = require("../middleware/auth");

// All routes require authentication
router.use(protect);

// User routes (any authenticated user)
router.post("/token", updateFcmToken);
router.delete("/token", removeFcmToken);

// Admin only routes
router.post("/send/user", authorize("admin", "manager", "staff"), sendToUser);
router.post("/send/users", authorize("admin", "manager", "staff"), sendToUsers);
router.post(
	"/send/all",
	authorize("admin", "manager", "staff"),
	sendToAllUsers
);
router.post("/send/role", authorize("admin", "manager", "staff"), sendToRole);

// Statistics (admin and staff)
router.get("/stats", authorize("admin", "manager", "staff"), getStats);

// Campaign routes (admin and staff)
router.post(
	"/campaigns",
	authorize("admin", "manager", "staff"),
	createCampaign
);
router.get("/campaigns", authorize("admin", "manager", "staff"), getCampaigns);
router.get(
	"/campaigns/:id",
	authorize("admin", "manager", "staff"),
	getCampaign
);
router.put(
	"/campaigns/:id",
	authorize("admin", "manager", "staff"),
	updateCampaign
);
router.delete(
	"/campaigns/:id",
	authorize("admin", "manager", "staff"),
	deleteCampaign
);
router.post(
	"/campaigns/:id/send",
	authorize("admin", "manager", "staff"),
	sendCampaign
);

module.exports = router;
