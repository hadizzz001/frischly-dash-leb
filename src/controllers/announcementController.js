const Announcement = require("../models/Announcement");

// @desc    Get all announcements
// @route   GET /api/announcements
// @access  Private/Admin
exports.getAnnouncements = async (req, res) => {
	try {
		const announcements = await Announcement.find().sort({ createdAt: -1 });

		res.status(200).json({
			success: true,
			count: announcements.length,
			data: announcements,
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: "Server Error",
			error: err.message,
		});
	}
};

// @desc    Get single announcement
// @route   GET /api/announcements/:id
// @access  Private/Admin
exports.getAnnouncement = async (req, res) => {
	try {
		const announcement = await Announcement.findById(req.params.id);

		if (!announcement) {
			return res.status(404).json({
				success: false,
				message: "Announcement not found",
			});
		}

		res.status(200).json({
			success: true,
			data: announcement,
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: "Server Error",
			error: err.message,
		});
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

		res.status(200).json({
			success: true,
			count: announcements.length,
			data: announcements,
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: "Server Error",
			error: err.message,
		});
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

		res.status(201).json({
			success: true,
			data: announcement,
			message: "Announcement created successfully",
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: "Server Error",
			error: err.message,
		});
	}
};

// @desc    Update announcement
// @route   PUT /api/announcements/:id
// @access  Private/Admin
exports.updateAnnouncement = async (req, res) => {
	try {
		let announcement = await Announcement.findById(req.params.id);

		if (!announcement) {
			return res.status(404).json({
				success: false,
				message: "Announcement not found",
			});
		}

		announcement = await Announcement.findByIdAndUpdate(
			req.params.id,
			req.body,
			{
				new: true,
				runValidators: true,
			},
		);

		res.status(200).json({
			success: true,
			data: announcement,
			message: "Announcement updated successfully",
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: "Server Error",
			error: err.message,
		});
	}
};

// @desc    Delete announcement
// @route   DELETE /api/announcements/:id
// @access  Private/Admin
exports.deleteAnnouncement = async (req, res) => {
	try {
		const announcement = await Announcement.findById(req.params.id);

		if (!announcement) {
			return res.status(404).json({
				success: false,
				message: "Announcement not found",
			});
		}

		await announcement.deleteOne();

		res.status(200).json({
			success: true,
			data: {},
			message: "Announcement deleted successfully",
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: "Server Error",
			error: err.message,
		});
	}
};
