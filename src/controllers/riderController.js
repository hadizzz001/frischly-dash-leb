const Rider = require("../models/Rider");
const User = require("../models/User");
const Order = require("../models/Order");
const mongoose = require("mongoose");

// @desc    Get all riders with stats
// @route   GET /api/riders
// @access  Private (Admin, Manager)
exports.getRiders = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 10,
			zone,
			status,
			vehicleType,
			search,
			sortBy = "createdAt",
			sortOrder = "desc",
		} = req.query;

		// Build filter object
		const filter = { isActive: true };
		if (zone) filter.zones = zone; // Check if zone is in zones array
		if (status) filter.status = status;
		if (vehicleType) filter.vehicleType = vehicleType;

		// Convert page and limit to numbers
		const pageNum = parseInt(page, 10);
		const limitNum = parseInt(limit, 10);
		const skip = (pageNum - 1) * limitNum;

		// Build sort object
		const sortObj = {};
		sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

		let ridersQuery;

		if (search) {
			// If search is provided, use aggregation pipeline with user search
			ridersQuery = Rider.aggregate([
				{ $match: filter },
				{
					$lookup: {
						from: "users",
						localField: "user",
						foreignField: "_id",
						as: "userInfo",
					},
				},
				{ $unwind: "$userInfo" },
				{
					$match: {
						$or: [
							{ "userInfo.name": { $regex: search, $options: "i" } },
							{ "userInfo.email": { $regex: search, $options: "i" } },
							{ zones: { $regex: search, $options: "i" } },
						],
					},
				},
				{
					$lookup: {
						from: "orders",
						let: { riderId: "$_id" },
						pipeline: [
							{
								$match: {
									$expr: { $eq: ["$assignedRider", "$$riderId"] },
									status: { $in: ["confirmed", "processing", "OnTheWay"] },
								},
							},
						],
						as: "activeOrders",
					},
				},
				{
					$addFields: {
						activeOrdersCount: { $size: "$activeOrders" },
						completionRate: {
							$cond: {
								if: { $eq: ["$ordersPickedCount", 0] },
								then: 0,
								else: {
									$multiply: [
										{
											$divide: ["$ordersDeliveredCount", "$ordersPickedCount"],
										},
										100,
									],
								},
							},
						},
					},
				},
				{
					$project: {
						zones: {
							$cond: {
								if: { $ifNull: ["$zones", false] },
								then: "$zones",
								else: { $cond: { if: "$zone", then: ["$zone"], else: [] } },
							},
						},
						zone: {
							$cond: {
								if: { $ifNull: ["$zones", false] },
								then: { $arrayElemAt: ["$zones", 0] },
								else: "$zone",
							},
						},
						status: 1,
						vehicleType: 1,
						vehicleNumber: 1,
						ordersPickedCount: 1,
						ordersDeliveredCount: 1,
						activeOrdersCount: 1,
						completionRate: 1,
						totalEarnings: 1,
						rating: 1,
						isVerified: 1,
						lastActiveAt: 1,
						createdAt: 1,
						"userInfo.name": 1,
						"userInfo.email": 1,
						"userInfo.phoneNumber": 1,
					},
				},
				{ $sort: sortObj },
				{ $skip: skip },
				{ $limit: limitNum },
			]);
		} else {
			// Use the static method for regular queries
			ridersQuery = Rider.getRidersWithStats(filter)
				.sort(sortObj)
				.skip(skip)
				.limit(limitNum);
		}

		const riders = await ridersQuery;

		// Get total count for pagination
		const totalRiders = await Rider.countDocuments(filter);
		const totalPages = Math.ceil(totalRiders / limitNum);

		res.json({
			success: true,
			data: {
				riders,
				pagination: {
					currentPage: pageNum,
					totalPages,
					totalRiders,
					hasNext: pageNum < totalPages,
					hasPrev: pageNum > 1,
				},
			},
			message: `Retrieved ${riders.length} riders successfully`,
		});
	} catch (error) {
		console.error("Error getting riders:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving riders",
			error: error.message,
		});
	}
};

// @desc    Get single rider by ID
// @route   GET /api/riders/:id
// @access  Private (Admin, Manager, Rider themselves)
exports.getRider = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid rider ID",
			});
		}

		const rider = await Rider.findById(id)
			.populate("user", "name email phoneNumber address isActive")
			.populate({
				path: "currentOrders",
				select: "orderNumber customer total status createdAt",
			});

		if (!rider) {
			return res.status(404).json({
				success: false,
				message: "Rider not found",
			});
		}

		// Check if user is authorized to view this rider
		if (
			req.user.role !== "admin" &&
			req.user.role !== "manager" &&
			rider.user._id.toString() !== req.user.id
		) {
			return res.status(403).json({
				success: false,
				message: "Not authorized to view this rider",
			});
		}

		res.json({
			success: true,
			data: rider,
			message: "Rider retrieved successfully",
		});
	} catch (error) {
		console.error("Error getting rider:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving rider",
			error: error.message,
		});
	}
};

// @desc    Create new rider profile
// @route   POST /api/riders
// @access  Private (Admin, Manager)
exports.createRider = async (req, res) => {
	try {
		const {
			userId,
			zones,
			vehicleType,
			vehicleNumber,
			workingHours,
			verificationDocuments,
		} = req.body;

		// Validate required fields
		if (
			!userId ||
			!zones ||
			!Array.isArray(zones) ||
			zones.length === 0 ||
			!vehicleType
		) {
			return res.status(400).json({
				success: false,
				message: "User ID, zones (array), and vehicle type are required",
			});
		}

		// Check if user exists and has rider role
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
			});
		}

		if (user.role !== "rider") {
			return res.status(400).json({
				success: false,
				message: "User must have rider role",
			});
		}

		// Check if rider profile already exists
		const existingRider = await Rider.findOne({ user: userId });
		if (existingRider) {
			return res.status(400).json({
				success: false,
				message: "Rider profile already exists for this user",
			});
		}

		// Create rider profile
		const rider = new Rider({
			user: userId,
			zones,
			vehicleType,
			vehicleNumber,
			workingHours,
			verificationDocuments,
		});

		await rider.save();

		// Populate user details for response
		await rider.populate("user", "name email phoneNumber");

		res.status(201).json({
			success: true,
			data: rider,
			message: "Rider profile created successfully",
		});
	} catch (error) {
		console.error("Error creating rider:", error);

		if (error.code === 11000) {
			return res.status(400).json({
				success: false,
				message: "Rider profile already exists for this user",
			});
		}

		res.status(500).json({
			success: false,
			message: "Error creating rider profile",
			error: error.message,
		});
	}
};

// @desc    Update rider profile
// @route   PUT /api/riders/:id
// @access  Private (Admin, Manager, Rider themselves)
exports.updateRider = async (req, res) => {
	try {
		const { id } = req.params;
		const updates = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid rider ID",
			});
		}

		const rider = await Rider.findById(id);
		if (!rider) {
			return res.status(404).json({
				success: false,
				message: "Rider not found",
			});
		}

		// Check authorization
		if (
			req.user.role !== "admin" &&
			req.user.role !== "manager" &&
			rider.user.toString() !== req.user.id
		) {
			return res.status(403).json({
				success: false,
				message: "Not authorized to update this rider",
			});
		}

		// Update allowed fields
		const allowedUpdates = [
			"zones",
			"status",
			"vehicleType",
			"vehicleNumber",
			"workingHours",
			"currentLocation",
			"verificationDocuments",
			"isVerified",
		];

		// If not admin/manager, limit what can be updated
		if (req.user.role !== "admin" && req.user.role !== "manager") {
			const restrictedFields = ["isVerified", "zones"];
			restrictedFields.forEach((field) => {
				if (updates[field] !== undefined) {
					delete updates[field];
				}
			});
		}

		Object.keys(updates).forEach((key) => {
			if (allowedUpdates.includes(key)) {
				rider[key] = updates[key];
			}
		});

		await rider.save();

		// Populate user details for response
		await rider.populate("user", "name email phoneNumber");

		res.json({
			success: true,
			data: rider,
			message: "Rider profile updated successfully",
		});
	} catch (error) {
		console.error("Error updating rider:", error);
		res.status(500).json({
			success: false,
			message: "Error updating rider profile",
			error: error.message,
		});
	}
};

// @desc    Update rider status
// @route   PATCH /api/riders/:id/status
// @access  Private (Admin, Manager, Rider themselves)
exports.updateRiderStatus = async (req, res) => {
	try {
		const { id } = req.params;
		const { status, location } = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid rider ID",
			});
		}

		if (!status) {
			return res.status(400).json({
				success: false,
				message: "Status is required",
			});
		}

		const rider = await Rider.findById(id);
		if (!rider) {
			return res.status(404).json({
				success: false,
				message: "Rider not found",
			});
		}

		// Check authorization
		if (
			req.user.role !== "admin" &&
			req.user.role !== "manager" &&
			rider.user.toString() !== req.user.id
		) {
			return res.status(403).json({
				success: false,
				message: "Not authorized to update this rider status",
			});
		}

		rider.status = status;

		// Update location if provided
		if (location && location.latitude && location.longitude) {
			rider.currentLocation = {
				latitude: location.latitude,
				longitude: location.longitude,
				lastUpdated: new Date(),
			};
		}

		await rider.save();

		res.json({
			success: true,
			data: {
				riderId: rider._id,
				status: rider.status,
				currentLocation: rider.currentLocation,
				lastActiveAt: rider.lastActiveAt,
			},
			message: "Rider status updated successfully",
		});
	} catch (error) {
		console.error("Error updating rider status:", error);
		res.status(500).json({
			success: false,
			message: "Error updating rider status",
			error: error.message,
		});
	}
};

// @desc    Update rider current location
// @route   PATCH /api/riders/:id/location
// @access  Private (Admin, Manager, Rider themselves)
exports.updateRiderLocation = async (req, res) => {
	try {
		const { id } = req.params;
		const { latitude, longitude } = req.body;

		// Validate rider ID
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid rider ID",
			});
		}

		// Validate required fields
		if (latitude === undefined || longitude === undefined) {
			return res.status(400).json({
				success: false,
				message: "Latitude and longitude are required",
			});
		}

		// Validate latitude range
		if (latitude < -90 || latitude > 90) {
			return res.status(400).json({
				success: false,
				message: "Latitude must be between -90 and 90",
			});
		}

		// Validate longitude range
		if (longitude < -180 || longitude > 180) {
			return res.status(400).json({
				success: false,
				message: "Longitude must be between -180 and 180",
			});
		}

		const rider = await Rider.findById(id);
		if (!rider) {
			return res.status(404).json({
				success: false,
				message: "Rider not found",
			});
		}

		// Check authorization
		if (
			req.user.role !== "admin" &&
			req.user.role !== "manager" &&
			rider.user.toString() !== req.user.id
		) {
			return res.status(403).json({
				success: false,
				message: "Not authorized to update this rider's location",
			});
		}

		// Update location
		rider.currentLocation = {
			latitude,
			longitude,
			lastUpdated: new Date(),
		};

		await rider.save();

		res.json({
			success: true,
			data: {
				riderId: rider._id,
				currentLocation: rider.currentLocation,
			},
			message: "Rider location updated successfully",
		});
	} catch (error) {
		console.error("Error updating rider location:", error);
		res.status(500).json({
			success: false,
			message: "Error updating rider location",
			error: error.message,
		});
	}
};

// @desc    Get available riders in zone
// @route   GET /api/riders/available/:zone
// @access  Private (Admin, Manager)
exports.getAvailableRiders = async (req, res) => {
	try {
		const { zone } = req.params;

		const availableRiders = await Rider.findAvailableInZone(zone);

		res.json({
			success: true,
			data: availableRiders,
			count: availableRiders.length,
			message: `Found ${availableRiders.length} available riders in ${zone}`,
		});
	} catch (error) {
		console.error("Error getting available riders:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving available riders",
			error: error.message,
		});
	}
};

// @desc    Get rider statistics
// @route   GET /api/riders/stats
// @access  Private (Admin, Manager)
exports.getRiderStats = async (req, res) => {
	try {
		const stats = await Rider.aggregate([
			{ $match: { isActive: true } },
			{
				$group: {
					_id: null,
					totalRiders: { $sum: 1 },
					availableRiders: {
						$sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] },
					},
					busyRiders: {
						$sum: { $cond: [{ $eq: ["$status", "busy"] }, 1, 0] },
					},
					offlineRiders: {
						$sum: { $cond: [{ $eq: ["$status", "offline"] }, 1, 0] },
					},
					verifiedRiders: { $sum: { $cond: ["$isVerified", 1, 0] } },
					totalOrdersPicked: { $sum: "$ordersPickedCount" },
					totalOrdersDelivered: { $sum: "$ordersDeliveredCount" },
					totalEarnings: { $sum: "$totalEarnings" },
					averageRating: { $avg: "$rating.average" },
				},
			},
		]);

		const zoneStats = await Rider.aggregate([
			{ $match: { isActive: true } },
			{
				$group: {
					_id: "$zone",
					riderCount: { $sum: 1 },
					availableCount: {
						$sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] },
					},
					busyCount: {
						$sum: { $cond: [{ $eq: ["$status", "busy"] }, 1, 0] },
					},
				},
			},
			{ $sort: { riderCount: -1 } },
		]);

		const vehicleStats = await Rider.aggregate([
			{ $match: { isActive: true } },
			{
				$group: {
					_id: "$vehicleType",
					count: { $sum: 1 },
				},
			},
			{ $sort: { count: -1 } },
		]);

		res.json({
			success: true,
			data: {
				overall: stats[0] || {
					totalRiders: 0,
					availableRiders: 0,
					busyRiders: 0,
					offlineRiders: 0,
					verifiedRiders: 0,
					totalOrdersPicked: 0,
					totalOrdersDelivered: 0,
					totalEarnings: 0,
					averageRating: 0,
				},
				byZone: zoneStats,
				byVehicleType: vehicleStats,
			},
			message: "Rider statistics retrieved successfully",
		});
	} catch (error) {
		console.error("Error getting rider stats:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving rider statistics",
			error: error.message,
		});
	}
};

// @desc    Delete rider profile (permanent delete)
// @route   DELETE /api/riders/:id
// @access  Private (Admin only)
exports.deleteRider = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid rider ID",
			});
		}

		const rider = await Rider.findById(id);
		if (!rider) {
			return res.status(404).json({
				success: false,
				message: "Rider not found",
			});
		}

		// Check for active orders
		const activeOrders = await Order.countDocuments({
			assignedRider: id,
			status: { $in: ["confirmed", "processing", "OnTheWay"] },
		});

		if (activeOrders > 0) {
			return res.status(400).json({
				success: false,
				message: `Cannot delete rider with ${activeOrders} active orders`,
			});
		}

		// Permanent delete
		await Rider.findByIdAndDelete(id);

		res.json({
			success: true,
			message: "Rider profile permanently deleted",
		});
	} catch (error) {
		console.error("Error deleting rider:", error);
		res.status(500).json({
			success: false,
			message: "Error deleting rider profile",
			error: error.message,
		});
	}
};
