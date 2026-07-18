const Announcement = require("../models/Announcement");
const { sendSuccess, sendError, sendResponse } = require("../utils/apiResponse");

// @desc    Get all announcements
// @route   GET /api/announcements
// @access  Private/Admin
exports.getAnnouncements = async (req, res) => {
	try {
		const announcements = await Announcement.find().sort({ createdAt: -1 });

		sendResponse(res, 200, true, "Announcements fetched", announcements, {
			count: announcements.length,
		});
	} catch (err) {
		sendError(res, 500, "Server Error", err.message);
	}
};

// @desc    Get single announcement
// @route   GET /api/announcements/:id
// @access  Private/Admin
exports.getAnnouncement = async (req, res) => {
	try {
		const announcement = await Announcement.findById(req.params.id);

		if (!announcement) {
			return sendError(res, 404, "Announcement not found");
		}

		sendSuccess(res, announcement);
	} catch (err) {
		sendError(res, 500, "Server Error", err.message);
	}
};

// @desc    Get active announcements for clients
// @route   GET /api/announcements/public/active
// @access  Public
exports.getActiveAnnouncements = async (req, res) => {
	try {
		const announcements = await Announcement.find({ isActive: true })
			.select("title description createdAt")
			.sort({ createdAt: -1 })
			.limit(20);

		sendResponse(res, 200, true, "Announcements fetched", announcements, {
			count: announcements.length,
		});
	} catch (err) {
		sendError(res, 500, "Server Error", err.message);
	}
};

// @desc    Create new announcement
// @route   POST /api/announcements
// @access  Private/Admin
exports.createAnnouncement = async (req, res) => {
	try {
		const { title, description, isActive } = req.body;

		const announcement = await Announcement.create({
			title,
			description,
			isActive,
		});

		sendSuccess(res, announcement, "Announcement created successfully", 201);
	} catch (err) {
		sendError(res, 500, "Server Error", err.message);
	}
};

// @desc    Update announcement
// @route   PUT /api/announcements/:id
// @access  Private/Admin
exports.updateAnnouncement = async (req, res) => {
	try {
		let announcement = await Announcement.findById(req.params.id);

		if (!announcement) {
			return sendError(res, 404, "Announcement not found");
		}

		announcement = await Announcement.findByIdAndUpdate(
			req.params.id,
			req.body,
			{
				new: true,
				runValidators: true,
			},
		);

		sendSuccess(res, announcement, "Announcement updated successfully");
	} catch (err) {
		sendError(res, 500, "Server Error", err.message);
	}
};

// @desc    Delete announcement
// @route   DELETE /api/announcements/:id
// @access  Private/Admin
exports.deleteAnnouncement = async (req, res) => {
	try {
		const announcement = await Announcement.findById(req.params.id);

		if (!announcement) {
			return sendError(res, 404, "Announcement not found");
		}

		await announcement.deleteOne();

		sendSuccess(res, {}, "Announcement deleted successfully");
	} catch (err) {
		sendError(res, 500, "Server Error", err.message);
	}
};
