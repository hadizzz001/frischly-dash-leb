const Zone = require("../models/Zone");
const mongoose = require("mongoose");
const { sendSuccess, sendError, sendResponse } = require("../utils/apiResponse");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Returns the tenant scope filter for the current requester.
// - Market token / market_* staff → { market: <theirMarketId> }
// - Admin / manager → no filter (they see *all* zones, including each market's)
// - Anonymous / other staff → only global zones (market === null)
function tenantZoneFilter(req) {
	if (req && req.market && req.market._id) {
		return { market: req.market._id };
	}
	if (req && req.user) {
		if (
			["market_staff", "market_manager", "market_driver"].includes(
				req.user.role
			)
		) {
			const mid = req.user.marketId || req.user.market;
			if (mid) return { market: mid };
		}
		// Main admin / manager see every zone (global + every market's)
		if (["admin", "manager"].includes(req.user.role)) {
			return {};
		}
	}
	// Public / staff / rider → only global zones
	return { market: null };
}

function tenantMarketId(req) {
	if (req && req.market && req.market._id) return req.market._id;
	if (req && req.user) {
		if (
			["market", "market_staff", "market_manager", "market_driver"].includes(
				req.user.role
			)
		) {
			return req.user.marketId || req.user.market || null;
		}
	}
	return null;
}

// Strict scope used for writes (create/update/delete). Each side only mutates
// their own zones: a market touches its own (market === marketId), an admin
// touches only the global ones (market === null).
function tenantZoneWriteFilter(req) {
	if (req && req.market && req.market._id) {
		return { market: req.market._id };
	}
	if (
		req &&
		req.user &&
		["market_staff", "market_manager", "market_driver"].includes(req.user.role)
	) {
		const mid = req.user.marketId || req.user.market;
		if (mid) return { market: mid };
	}
	return { market: null };
}

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
		} = req.query;

		const pageNum = parseInt(page);
		const limitNum = parseInt(limit);
		const skip = (pageNum - 1) * limitNum;

		// Build filter object (tenant-scoped)
		const filter = { ...tenantZoneFilter(req) };

		// Handle isActive filter
		if (isActive !== "all") {
			filter.isActive = isActive === "true";
		}

		// Search functionality
		if (search) {
			filter.$or = [
				{ zoneName: { $regex: search, $options: "i" } },
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
			.populate("market", "name username")
			.sort(sortObj)
			.skip(skip)
			.limit(limitNum);

		// Get total count for pagination
		const totalZones = await Zone.countDocuments(filter);
		const totalPages = Math.ceil(totalZones / limitNum);

		sendResponse(res, 200, true, "Success", zones, {
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
		sendError(res, 500, "Server error while fetching zones");
	}
};

// @desc    Get single zone
// @route   GET /api/zones/:id
// @access  Public
exports.getZone = async (req, res) => {
	try {
		const zone = await Zone.findById(req.params.id)
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate("market", "name username");

		if (!zone) {
			return sendError(res, 404, "Zone not found");
		}

		sendSuccess(res, zone);
	} catch (error) {
		console.error("Error fetching zone:", error);
		if (error.name === "CastError") {
			return sendError(res, 400, "Invalid zone ID format");
		}
		sendError(res, 500, "Server error while fetching zone");
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
		if (!zoneName || distance === undefined) {
			return sendError(res, 400, "Zone name and distance are required");
		}

		// Check if zone with same name already exists *within the same tenant*
		const tenantId = tenantMarketId(req);
		const existingZone = await Zone.findOne({
			market: tenantId,
			zoneName: { $regex: `^${escapeRegex(zoneName)}$`, $options: "i" },
		});

		if (existingZone) {
			return sendError(res, 400, "Zone with this name already exists");
		}

		const zoneData = {
			zoneName,
			distance: parseFloat(distance),
			distanceUnit: distanceUnit || "km",
			description,
			deliveryFee: deliveryFee ? parseFloat(deliveryFee) : 0,
			estimatedDeliveryTime: estimatedDeliveryTime || 30,
			priority: priority || 1,
			coordinates,
			boundaries,
			market: tenantId,
		};
		// Only attach createdBy when the requester is a real User (not a market token).
		if (req.user && !req.user.isMarket && req.user.id) {
			zoneData.createdBy = req.user.id;
		}

		const zone = await Zone.create(zoneData);

		// Populate the created zone
		await zone.populate("createdBy", "name email");

		sendSuccess(res, zone, "Zone created successfully", 201);
	} catch (error) {
		console.error("Error creating zone:", error);

		// Handle validation errors
		if (error.name === "ValidationError") {
			const messages = Object.values(error.errors).map((val) => val.message);
			return sendError(res, 400, "Validation error", messages);
		}

		// Handle duplicate key errors
		if (error.code === 11000) {
			const field = Object.keys(error.keyValue)[0];
			return sendError(res, 400, `Zone with this ${field} already exists`);
		}

		sendError(res, 500, "Server error while creating zone");
	}
};

// @desc    Update zone
// @route   PUT /api/zones/:id
// @access  Private (Admin/Manager)
exports.updateZone = async (req, res) => {
	try {
		const {
			zoneName,
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

		let zone = await Zone.findOne({
			_id: req.params.id,
			...tenantZoneWriteFilter(req),
		});

		if (!zone) {
			return sendError(res, 404, "Zone not found");
		}

		// Check for duplicate zone name within the same tenant (excluding current zone)
		if (zoneName && zoneName !== zone.zoneName) {
			const existingZone = await Zone.findOne({
				_id: { $ne: req.params.id },
				market: zone.market,
				zoneName: { $regex: `^${escapeRegex(zoneName)}$`, $options: "i" },
			});

			if (existingZone) {
				return sendError(res, 400, "Zone with this name already exists");
			}
		}

		// Update fields
		const updateData = {};
		if (req.user && !req.user.isMarket && req.user.id) {
			updateData.updatedBy = req.user.id;
		}

		if (zoneName !== undefined) updateData.zoneName = zoneName;
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

		sendSuccess(res, zone, "Zone updated successfully");
	} catch (error) {
		console.error("Error updating zone:", error);

		if (error.name === "ValidationError") {
			const messages = Object.values(error.errors).map((val) => val.message);
			return sendError(res, 400, "Validation error", messages);
		}

		if (error.name === "CastError") {
			return sendError(res, 400, "Invalid zone ID format");
		}

		sendError(res, 500, "Server error while updating zone");
	}
};

// @desc    Update zone status
// @route   PATCH /api/zones/:id/status
// @access  Private (Admin/Manager)
exports.updateZoneStatus = async (req, res) => {
	try {
		const { isActive } = req.body;

		if (isActive === undefined) {
			return sendError(res, 400, "Error", "isActive field is required");
		}

		const patch = { isActive };
		if (req.user && !req.user.isMarket && req.user.id) {
			patch.updatedBy = req.user.id;
		}
		const zone = await Zone.findOneAndUpdate(
			{ _id: req.params.id, ...tenantZoneWriteFilter(req) },
			patch,
			{ new: true, runValidators: true }
		);

		if (!zone) {
			return sendError(res, 404, "Error", "Zone not found");
		}

		sendResponse(res, 200, true, `Zone ${isActive ? "activated" : "deactivated"} successfully`, zone);
	} catch (error) {
		console.error("Error updating zone status:", error);

		if (error.name === "CastError") {
			return sendError(res, 400, "Error", "Invalid zone ID format");
		}

		sendError(res, 500, "Error", "Server error while updating zone status");
	}
};

// @desc    Delete zone (soft delete)
// @route   DELETE /api/zones/:id
// @access  Private (Admin)
exports.deleteZone = async (req, res) => {
	try {
		const patch = { isActive: false };
		if (req.user && !req.user.isMarket && req.user.id) {
			patch.updatedBy = req.user.id;
		}
		const zone = await Zone.findOneAndUpdate(
			{ _id: req.params.id, ...tenantZoneWriteFilter(req) },
			patch,
			{ new: true }
		);

		if (!zone) {
			return sendError(res, 404, "Error", "Zone not found");
		}

		sendResponse(res, 200, true, "Zone deactivated successfully", zone);
	} catch (error) {
		console.error("Error deleting zone:", error);

		if (error.name === "CastError") {
			return sendError(res, 400, "Error", "Invalid zone ID format");
		}

		sendError(res, 500, "Error", "Server error while deleting zone");
	}
};

// @desc    Permanently delete zone
// @route   DELETE /api/zones/:id/permanent
// @access  Private (Admin)
exports.permanentDeleteZone = async (req, res) => {
	try {
		const zone = await Zone.findOneAndDelete({
			_id: req.params.id,
			...tenantZoneWriteFilter(req),
		});

		if (!zone) {
			return sendError(res, 404, "Error", "Zone not found");
		}

		sendResponse(res, 200, true, "Zone permanently deleted successfully", null);
	} catch (error) {
		console.error("Error permanently deleting zone:", error);

		if (error.name === "CastError") {
			return sendError(res, 400, "Error", "Invalid zone ID format");
		}

		sendError(res, 500, "Error", "Server error while permanently deleting zone");
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

		sendResponse(res, 200, true, "Success", {
				...zoneStats,
				distanceUnitBreakdown: distanceUnitStats,
			});
	} catch (error) {
		console.error("Error fetching zone statistics:", error);
		sendError(res, 500, "Error", "Server error while fetching zone statistics");
	}
};

// @desc    Calculate delivery fee for zone/city
// @route   POST /api/zones/calculate-delivery
// @access  Public
exports.calculateDeliveryFee = async (req, res) => {
	try {
		const zoneName = req.body.zoneName || req.body.city;

		if (!zoneName) {
			return sendError(res, 400, "Error", "Zone name or city is required");
		}

		const zone = await Zone.findByName(zoneName);

		if (!zone) {
			return sendError(res, 404, "Error", "No delivery zone found for this city");
		}

		const deliveryFee = zone.deliveryFee ? zone.deliveryFee : 4;

		sendResponse(res, 200, true, "Success", {
				deliveryFee,
				estimatedDeliveryTime: zone.estimatedDeliveryTime,
			});
	} catch (error) {
		console.error("Error calculating delivery fee:", error);
		sendError(res, 500, "Error", "Server error while calculating delivery fee");
	}
};
