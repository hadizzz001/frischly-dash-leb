const Zone = require("../models/Zone");
const mongoose = require("mongoose");

// @desc    Get all zones
// @route   GET /api/zones
// @access  Public
exports.getZones = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 20,
			isActive = "all",
			sortBy = "priority",
			sortOrder = "desc",
			search,
			zipCode,
		} = req.query;

		const pageNum = parseInt(page);
		const limitNum = parseInt(limit);
		const skip = (pageNum - 1) * limitNum;

		// Build filter object
		const filter = {};

		// Handle isActive filter
		if (isActive !== "all") {
			filter.isActive = isActive === "true";
		}

		// Handle zip code filter
		if (zipCode) {
			filter.zipCode = zipCode.toUpperCase();
		}

		// Search functionality
		if (search) {
			filter.$or = [
				{ zoneName: { $regex: search, $options: "i" } },
				{ zipCode: { $regex: search, $options: "i" } },
				{ description: { $regex: search, $options: "i" } },
			];
		}

		// Build sort object
		const sortObj = {};
		sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

		// Execute query with pagination
		const zones = await Zone.find(filter)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.sort(sortObj)
			.skip(skip)
			.limit(limitNum);

		// Get total count for pagination
		const totalZones = await Zone.countDocuments(filter);
		const totalPages = Math.ceil(totalZones / limitNum);

		res.status(200).json({
			success: true,
			data: zones,
			pagination: {
				current: pageNum,
				pages: totalPages,
				total: totalZones,
				hasNext: pageNum < totalPages,
				hasPrev: pageNum > 1,
			},
		});
	} catch (error) {
		console.error("Error fetching zones:", error);
		res.status(500).json({
			success: false,
			error: "Server error while fetching zones",
		});
	}
};

// @desc    Get single zone
// @route   GET /api/zones/:id
// @access  Public
exports.getZone = async (req, res) => {
	try {
		const zone = await Zone.findById(req.params.id)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email");

		if (!zone) {
			return res.status(404).json({
				success: false,
				error: "Zone not found",
			});
		}

		res.status(200).json({
			success: true,
			data: zone,
		});
	} catch (error) {
		console.error("Error fetching zone:", error);
		if (error.name === "CastError") {
			return res.status(400).json({
				success: false,
				error: "Invalid zone ID format",
			});
		}
		res.status(500).json({
			success: false,
			error: "Server error while fetching zone",
		});
	}
};

// @desc    Get zone by zip code
// @route   GET /api/zones/zipcode/:zipCode
// @access  Public
exports.getZoneByZipCode = async (req, res) => {
	try {
		const { zipCode } = req.params;
		const zone = await Zone.findByZipCode(zipCode);

		if (!zone) {
			return res.status(404).json({
				success: false,
				error: "No active zone found for this zip code",
			});
		}

		res.status(200).json({
			success: true,
			data: zone,
		});
	} catch (error) {
		console.error("Error fetching zone by zip code:", error);
		res.status(500).json({
			success: false,
			error: "Server error while fetching zone",
		});
	}
};

// // @desc    Get active zones
// // @route   GET /api/zones/active
// // @access  Public
// exports.getActiveZones = async (req, res) => {
// 	try {
// 		const zones = await Zone.findActiveZones();

// 		res.status(200).json({
// 			success: true,
// 			data: zones,
// 			count: zones.length,
// 		});
// 	} catch (error) {
// 		console.error("Error fetching active zones:", error);
// 		res.status(500).json({
// 			success: false,
// 			error: "Server error while fetching active zones",
// 		});
// 	}
// };

// @desc    Create new zone
// @route   POST /api/zones
// @access  Private (Admin/Manager)
exports.createZone = async (req, res) => {
	try {
		const {
			zoneName,
			zipCode,
			distance,
			distanceUnit,
			description,
			deliveryFee,
			estimatedDeliveryTime,
			priority,
			coordinates,
			boundaries,
		} = req.body;

		// Validate required fields
		if (!zoneName || !zipCode || distance === undefined) {
			return res.status(400).json({
				success: false,
				error: "Zone name, zip code, and distance are required",
			});
		}

		// Check if zone with same name or zip code already exists
		const existingZone = await Zone.findOne({
			$or: [{ zoneName }, { zipCode: zipCode.toUpperCase() }],
		});

		if (existingZone) {
			return res.status(400).json({
				success: false,
				error:
					existingZone.zoneName === zoneName
						? "Zone with this name already exists"
						: "Zone with this zip code already exists",
			});
		}

		const zoneData = {
			zoneName,
			zipCode: zipCode.toUpperCase(),
			distance: parseFloat(distance),
			distanceUnit: distanceUnit || "km",
			description,
			deliveryFee: deliveryFee ? parseFloat(deliveryFee) : 0,
			estimatedDeliveryTime: estimatedDeliveryTime || 30,
			priority: priority || 1,
			coordinates,
			boundaries,
			createdBy: req.user.id,
		};

		const zone = await Zone.create(zoneData);

		// Populate the created zone
		await zone.populate("createdBy", "name email");

		res.status(201).json({
			success: true,
			data: zone,
			message: "Zone created successfully",
		});
	} catch (error) {
		console.error("Error creating zone:", error);

		// Handle validation errors
		if (error.name === "ValidationError") {
			const messages = Object.values(error.errors).map((val) => val.message);
			return res.status(400).json({
				success: false,
				error: "Validation error",
				details: messages,
			});
		}

		// Handle duplicate key errors
		if (error.code === 11000) {
			const field = Object.keys(error.keyValue)[0];
			return res.status(400).json({
				success: false,
				error: `Zone with this ${field} already exists`,
			});
		}

		res.status(500).json({
			success: false,
			error: "Server error while creating zone",
		});
	}
};

// @desc    Update zone
// @route   PUT /api/zones/:id
// @access  Private (Admin/Manager)
exports.updateZone = async (req, res) => {
	try {
		const {
			zoneName,
			zipCode,
			distance,
			distanceUnit,
			description,
			deliveryFee,
			estimatedDeliveryTime,
			priority,
			coordinates,
			boundaries,
			isActive,
		} = req.body;

		let zone = await Zone.findById(req.params.id);

		if (!zone) {
			return res.status(404).json({
				success: false,
				error: "Zone not found",
			});
		}

		// Check for duplicate zone name or zip code (excluding current zone)
		if (zoneName || zipCode) {
			const duplicateCheck = {};
			if (zoneName && zoneName !== zone.zoneName) {
				duplicateCheck.zoneName = zoneName;
			}
			if (zipCode && zipCode.toUpperCase() !== zone.zipCode) {
				duplicateCheck.zipCode = zipCode.toUpperCase();
			}

			if (Object.keys(duplicateCheck).length > 0) {
				const existingZone = await Zone.findOne({
					$and: [
						{ _id: { $ne: req.params.id } },
						{
							$or: Object.entries(duplicateCheck).map(([key, value]) => ({
								[key]: value,
							})),
						},
					],
				});

				if (existingZone) {
					return res.status(400).json({
						success: false,
						error: "Zone with this name or zip code already exists",
					});
				}
			}
		}

		// Update fields
		const updateData = {
			updatedBy: req.user.id,
		};

		if (zoneName !== undefined) updateData.zoneName = zoneName;
		if (zipCode !== undefined) updateData.zipCode = zipCode.toUpperCase();
		if (distance !== undefined) updateData.distance = parseFloat(distance);
		if (distanceUnit !== undefined) updateData.distanceUnit = distanceUnit;
		if (description !== undefined) updateData.description = description;
		if (deliveryFee !== undefined)
			updateData.deliveryFee = parseFloat(deliveryFee);
		if (estimatedDeliveryTime !== undefined)
			updateData.estimatedDeliveryTime = estimatedDeliveryTime;
		if (priority !== undefined) updateData.priority = priority;
		if (coordinates !== undefined) updateData.coordinates = coordinates;
		if (boundaries !== undefined) updateData.boundaries = boundaries;
		if (isActive !== undefined) updateData.isActive = isActive;

		zone = await Zone.findByIdAndUpdate(req.params.id, updateData, {
			new: true,
			runValidators: true,
		}).populate("createdBy updatedBy", "name email");

		res.status(200).json({
			success: true,
			data: zone,
			message: "Zone updated successfully",
		});
	} catch (error) {
		console.error("Error updating zone:", error);

		if (error.name === "ValidationError") {
			const messages = Object.values(error.errors).map((val) => val.message);
			return res.status(400).json({
				success: false,
				error: "Validation error",
				details: messages,
			});
		}

		if (error.name === "CastError") {
			return res.status(400).json({
				success: false,
				error: "Invalid zone ID format",
			});
		}

		res.status(500).json({
			success: false,
			error: "Server error while updating zone",
		});
	}
};

// @desc    Update zone status
// @route   PATCH /api/zones/:id/status
// @access  Private (Admin/Manager)
exports.updateZoneStatus = async (req, res) => {
	try {
		const { isActive } = req.body;

		if (isActive === undefined) {
			return res.status(400).json({
				success: false,
				error: "isActive field is required",
			});
		}

		const zone = await Zone.findByIdAndUpdate(
			req.params.id,
			{
				isActive,
				updatedBy: req.user.id,
			},
			{ new: true, runValidators: true }
		);

		if (!zone) {
			return res.status(404).json({
				success: false,
				error: "Zone not found",
			});
		}

		res.status(200).json({
			success: true,
			data: zone,
			message: `Zone ${isActive ? "activated" : "deactivated"} successfully`,
		});
	} catch (error) {
		console.error("Error updating zone status:", error);

		if (error.name === "CastError") {
			return res.status(400).json({
				success: false,
				error: "Invalid zone ID format",
			});
		}

		res.status(500).json({
			success: false,
			error: "Server error while updating zone status",
		});
	}
};

// @desc    Delete zone (soft delete)
// @route   DELETE /api/zones/:id
// @access  Private (Admin)
exports.deleteZone = async (req, res) => {
	try {
		const zone = await Zone.findByIdAndUpdate(
			req.params.id,
			{
				isActive: false,
				updatedBy: req.user.id,
			},
			{ new: true }
		);

		if (!zone) {
			return res.status(404).json({
				success: false,
				error: "Zone not found",
			});
		}

		res.status(200).json({
			success: true,
			data: zone,
			message: "Zone deactivated successfully",
		});
	} catch (error) {
		console.error("Error deleting zone:", error);

		if (error.name === "CastError") {
			return res.status(400).json({
				success: false,
				error: "Invalid zone ID format",
			});
		}

		res.status(500).json({
			success: false,
			error: "Server error while deleting zone",
		});
	}
};

// @desc    Permanently delete zone
// @route   DELETE /api/zones/:id/permanent
// @access  Private (Admin)
exports.permanentDeleteZone = async (req, res) => {
	try {
		const zone = await Zone.findByIdAndDelete(req.params.id);

		if (!zone) {
			return res.status(404).json({
				success: false,
				error: "Zone not found",
			});
		}

		res.status(200).json({
			success: true,
			message: "Zone permanently deleted successfully",
		});
	} catch (error) {
		console.error("Error permanently deleting zone:", error);

		if (error.name === "CastError") {
			return res.status(400).json({
				success: false,
				error: "Invalid zone ID format",
			});
		}

		res.status(500).json({
			success: false,
			error: "Server error while permanently deleting zone",
		});
	}
};

// @desc    Get zone statistics
// @route   GET /api/zones/stats
// @access  Private (Admin/Manager)
exports.getZoneStats = async (req, res) => {
	try {
		const stats = await Zone.aggregate([
			{
				$group: {
					_id: null,
					totalZones: { $sum: 1 },
					activeZones: {
						$sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
					},
					inactiveZones: {
						$sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] },
					},
					totalDistance: { $sum: "$distance" },
					averageDistance: { $avg: "$distance" },
					averageDeliveryFee: { $avg: "$deliveryFee" },
					averageDeliveryTime: { $avg: "$estimatedDeliveryTime" },
				},
			},
		]);

		const zoneStats = stats[0] || {
			totalZones: 0,
			activeZones: 0,
			inactiveZones: 0,
			totalDistance: 0,
			averageDistance: 0,
			averageDeliveryFee: 0,
			averageDeliveryTime: 0,
		};

		// Get zones by distance unit
		const distanceUnitStats = await Zone.aggregate([
			{
				$group: {
					_id: "$distanceUnit",
					count: { $sum: 1 },
					totalDistance: { $sum: "$distance" },
				},
			},
		]);

		res.status(200).json({
			success: true,
			data: {
				...zoneStats,
				distanceUnitBreakdown: distanceUnitStats,
			},
		});
	} catch (error) {
		console.error("Error fetching zone statistics:", error);
		res.status(500).json({
			success: false,
			error: "Server error while fetching zone statistics",
		});
	}
};

// @desc    Calculate delivery fee for zip code
// @route   POST /api/zones/calculate-delivery
// @access  Public
exports.calculateDeliveryFee = async (req, res) => {
	try {
		const { zipCode } = req.body;

		if (!zipCode) {
			return res.status(400).json({
				success: false,
				error: "Zip code is required",
			});
		}

		const zone = await Zone.findByZipCode(zipCode);

		if (!zone) {
			return res.status(404).json({
				success: false,
				error: "No delivery zone found for this zip code",
			});
		}

		const deliveryFee = zone.deliveryFee ? zone.deliveryFee : 4;

		res.status(200).json({
			success: true,
			data: {
				deliveryFee,
				estimatedDeliveryTime: zone.estimatedDeliveryTime,
			},
		});
	} catch (error) {
		console.error("Error calculating delivery fee:", error);
		res.status(500).json({
			success: false,
			error: "Server error while calculating delivery fee",
		});
	}
};
