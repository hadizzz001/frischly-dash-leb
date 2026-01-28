const express = require("express");
const {
	getAnnouncements,
	getActiveAnnouncements,
	getAnnouncement,
	createAnnouncement,
	updateAnnouncement,
	deleteAnnouncement,
} = require("../controllers/announcementController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.route("/public/active").get(getActiveAnnouncements);

// Protect all routes below
router.use(protect);
router.use(authorize("admin"));

router.route("/").get(getAnnouncements).post(createAnnouncement);

router
	.route("/:id")
	.get(getAnnouncement)
	.put(updateAnnouncement)
	.delete(deleteAnnouncement);

module.exports = router;
