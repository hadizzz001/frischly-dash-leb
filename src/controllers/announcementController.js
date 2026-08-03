const Announcement = require("../models/Announcement");
const { sendSuccess, sendError, sendResponse, sendServerError } = require("../utils/apiResponse");

// @desc    Get all announcements
// @route   GET /api/announcements
// @access  Private/Admin
exports.getAnnouncements = async (req, res) => {
	try {
		const announcements = await Announcement.find().sort({ createdAt: -1 });

		const ras = { announcements, count: announcements.length };
		sendResponse(res, 200, true, "Announcements fetched", ras);
	} catch (err) {
		sendServerError(res, err, "Server Error");
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

		const ras = { announcement };
		sendResponse(res, 200, true, "Success", ras);
	} catch (err) {
		sendServerError(res, err, "Server Error");
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

		const ras = { announcements, count: announcements.length };
		sendResponse(res, 200, true, "Announcements fetched", ras);
	} catch (err) {
		sendServerError(res, err, "Server Error");
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

		const ras = { announcement };
		sendResponse(res, 201, true, "Announcement created successfully", ras);
	} catch (err) {
		sendServerError(res, err, "Server Error");
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

		const ras2 = { announcement };
		sendResponse(res, 200, true, "Announcement updated successfully", ras2);
	} catch (err) {
		sendServerError(res, err, "Server Error");
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

		const ras3 = {};
		sendResponse(res, 200, true, "Announcement deleted successfully", ras3);
	} catch (err) {
		sendServerError(res, err, "Server Error");
	}
};
