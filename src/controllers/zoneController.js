const Zone = require("../models/Zone");
const mongoose = require("mongoose");

// @desc    Get all zones
// @route   GET /api/zones
// @access  Public
exports.getZones = async (req, res) => {
	try {
		const { active } = req.query;

		// Build query object
		const query = {};

		// Filter by active status if provided
		if (active === "true") {
			query.isActive = true;
		} else if (active === "false") {
			query.isActive = false;
		}

		const zones = await Zone.find(query).sort({ name: 1 });

		res.json({
			success: true,
			count: zones.length,
			data: zones,
		});
	} catch (error) {
		console.error("Error getting zones:", error);
		res.status(500).json({
			success: false,
			message: "Server error while fetching zones",
			error: error.message,
		});
	}
};

// @desc    Get single zone by ID
// @route   GET /api/zones/:id
// @access  Public
exports.getZoneById = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid zone ID format",
			});
		}

		const zone = await Zone.findById(id);

		if (!zone) {
			return res.status(404).json({
				success: false,
				message: "Zone not found",
			});
		}

		res.json({
			success: true,
			data: zone,
		});
	} catch (error) {
		console.error("Error getting zone:", error);
		res.status(500).json({
			success: false,
			message: "Server error while fetching zone",
			error: error.message,
		});
	}
};

// @desc    Create new zone
// @route   POST /api/zones
// @access  Private (Admin, Manager)
exports.createZone = async (req, res) => {
	try {
		// Check role permissions
		if (req.user.role !== "admin" && req.user.role !== "manager") {
			return res.status(403).json({
				success: false,
				message: "Access denied. Admin or manager privileges required.",
			});
		}

		const {
			name,
			maxDistance,
			zipCodes,
			description,
			deliveryFee,
			minDeliveryTime,
			maxDeliveryTime,
		} = req.body;

		// Check if zone with same name already exists
		const existingZone = await Zone.findOne({ name });
		if (existingZone) {
			return res.status(400).json({
				success: false,
				message: "Zone with this name already exists",
			});
		}

		const zone = new Zone({
			name,
			maxDistance,
			zipCodes: zipCodes || [],
			description,
			deliveryFee,
			minDeliveryTime,
			maxDeliveryTime,
		});

		await zone.save();

		res.status(201).json({
			success: true,
			data: zone,
			message: "Zone created successfully",
		});
	} catch (error) {
		console.error("Error creating zone:", error);

		if (error.name === "ValidationError") {
			return res.status(400).json({
				success: false,
				message: "Validation error",
				errors: Object.values(error.errors).map((err) => err.message),
			});
		}

		res.status(500).json({
			success: false,
			message: "Server error while creating zone",
			error: error.message,
		});
	}
};

// @desc    Update zone
// @route   PUT /api/zones/:id
// @access  Private (Admin, Manager)
exports.updateZone = async (req, res) => {
	try {
		// Check role permissions
		if (req.user.role !== "admin" && req.user.role !== "manager") {
			return res.status(403).json({
				success: false,
				message: "Access denied. Admin or manager privileges required.",
			});
		}

		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid zone ID format",
			});
		}

		const updates = req.body;

		// Check if updating name and if new name already exists on a different zone
		if (updates.name) {
			const existingZone = await Zone.findOne({
				name: updates.name,
				_id: { $ne: id },
			});

			if (existingZone) {
				return res.status(400).json({
					success: false,
					message: "Zone with this name already exists",
				});
			}
		}

		const zone = await Zone.findByIdAndUpdate(id, updates, {
			new: true,
			runValidators: true,
		});

		if (!zone) {
			return res.status(404).json({
				success: false,
				message: "Zone not found",
			});
		}

		res.json({
			success: true,
			data: zone,
			message: "Zone updated successfully",
		});
	} catch (error) {
		console.error("Error updating zone:", error);

		if (error.name === "ValidationError") {
			return res.status(400).json({
				success: false,
				message: "Validation error",
				errors: Object.values(error.errors).map((err) => err.message),
			});
		}

		res.status(500).json({
			success: false,
			message: "Server error while updating zone",
			error: error.message,
		});
	}
};

// @desc    Delete zone
// @route   DELETE /api/zones/:id
// @access  Private (Admin only)
exports.deleteZone = async (req, res) => {
	try {
		// Check role permissions
		if (req.user.role !== "admin") {
			return res.status(403).json({
				success: false,
				message: "Access denied. Admin privileges required.",
			});
		}

		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid zone ID format",
			});
		}

		// Check if zone is being used by riders
		const Rider = require("../models/Rider");
		const ridersInZone = await Rider.countDocuments({
			zone: id,
			isActive: true,
		});

		if (ridersInZone > 0) {
			return res.status(400).json({
				success: false,
				message: `Cannot delete zone with ${ridersInZone} active riders assigned to it`,
			});
		}

		const zone = await Zone.findByIdAndDelete(id);

		if (!zone) {
			return res.status(404).json({
				success: false,
				message: "Zone not found",
			});
		}

		res.json({
			success: true,
			message: "Zone deleted successfully",
		});
	} catch (error) {
		console.error("Error deleting zone:", error);
		res.status(500).json({
			success: false,
			message: "Server error while deleting zone",
			error: error.message,
		});
	}
};

// @desc    Find zone by zip code
// @route   GET /api/zones/zip/:zipCode
// @access  Public
exports.getZoneByZipCode = async (req, res) => {
	try {
		const { zipCode } = req.params;

		if (!zipCode || zipCode.trim() === "") {
			return res.status(400).json({
				success: false,
				message: "Zip code is required",
			});
		}

		const zone = await Zone.findOne({
			zipCodes: zipCode,
			isActive: true,
		});

		if (!zone) {
			return res.status(404).json({
				success: false,
				message: `No active delivery zone found for zip code ${zipCode}`,
			});
		}

		res.json({
			success: true,
			data: zone,
		});
	} catch (error) {
		console.error("Error finding zone by zip code:", error);
		res.status(500).json({
			success: false,
			message: "Server error while finding zone",
			error: error.message,
		});
	}
};
