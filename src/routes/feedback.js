const express = require("express");
const router = express.Router();
const {
	createFeedback,
	getAllFeedback,
	getFeedbackById,
	getFeedbackStats,
	getMyFeedbackOrderIds,
} = require("../controllers/feedbackController");
const { protect, authorize } = require("../middleware/auth");

// Customer-facing: submit feedback for an order they placed. Any authenticated
// account may call this — ownership of the order is verified in the
// controller, so no role restriction is needed here.
router.post("/", protect, createFeedback);

// Customer-facing: order ids the logged-in user has already rated, so the
// app can permanently hide the prompt for those orders.
router.get("/mine", protect, getMyFeedbackOrderIds);

// Admin-only: list + view feedback in the dashboard. Not exposed to markets.
router.get("/stats", protect, authorize("admin"), getFeedbackStats);
router.get("/", protect, authorize("admin"), getAllFeedback);
router.get("/:id", protect, authorize("admin"), getFeedbackById);

module.exports = router;
