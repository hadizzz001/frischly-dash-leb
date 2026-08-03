const Rider = require("../models/Rider");
const User = require("../models/User");
const Order = require("../models/Order");
const Zone = require("../models/Zone");
const mongoose = require("mongoose");
const { sendResponse, sendError, sendSuccess, sendServerError } = require("../utils/apiResponse");
const { namedZonesCoverPoint, riderDistanceToPoint } = require("../utils/zoneGeo");
const { getCityCoords } = require("../utils/lebaneseCities");

// @desc    Get all riders with stats
// @route   GET /api/riders
// @access  Private (Admin, Manager)
exports.getRiders = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 10,
			zone,
			city,
			lat,
			lng,
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
						currentLocation: 1,
						createdAt: 1,
						market: 1,
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

		// Populate market info (name) so admin can see which market each rider belongs to
		const Market = require("../models/Market");
		const marketIds = [
			...new Set(
				riders
					.map((r) => (r.market ? r.market.toString() : null))
					.filter(Boolean)
			),
		];
		let marketsById = {};
		if (marketIds.length) {
			const markets = await Market.find({ _id: { $in: marketIds } })
				.select("_id name slug")
				.lean();
			marketsById = markets.reduce((acc, m) => {
				acc[m._id.toString()] = m;
				return acc;
			}, {});
		}
		const enrichedRiders = riders.map((r) => {
			const obj = typeof r.toObject === "function" ? r.toObject() : { ...r };
			if (obj.market) {
				const m = marketsById[obj.market.toString()];
				obj.marketInfo = m
					? { _id: m._id, name: m.name, slug: m.slug }
					: { _id: obj.market, name: "Unknown Market" };
			} else {
				obj.marketInfo = null;
			}
			return obj;
		});

		// Diagnostic logging: compare market riders vs normal riders payloads
		try {
			const marketRiders = enrichedRiders.filter((r) => !!r.market);
			const normalRiders = enrichedRiders.filter((r) => !r.market);
			console.log(
				`[getRiders] Returning ${enrichedRiders.length} riders | market=${marketRiders.length} | normal=${normalRiders.length}`
			);
			if (normalRiders[0]) {
				console.log(
					"[getRiders] Sample NORMAL rider:",
					JSON.stringify(normalRiders[0], null, 2)
				);
			}
			if (marketRiders[0]) {
				console.log(
					"[getRiders] Sample MARKET rider:",
					JSON.stringify(marketRiders[0], null, 2)
				);
			}
		} catch (logErr) {
			console.warn("[getRiders] diagnostic log failed:", logErr.message);
		}

		// Optional geofence filter: only keep riders whose selected zones (each
		// backed by a map pin + radius configured on the Zones management page)
		// actually cover the customer's location. Used by the "Assign Driver"
		// dropdown so out-of-coverage drivers never show.
		//
		// Prefers the customer's EXACT map pin (lat/lng, captured on their
		// profile) when available — falls back to the delivery city's
		// approximate center only if no exact pin was provided.
		let filteredRiders = enrichedRiders;
		const exactLat = lat !== undefined ? parseFloat(lat) : NaN;
		const exactLng = lng !== undefined ? parseFloat(lng) : NaN;
		const hasExactPoint = Number.isFinite(exactLat) && Number.isFinite(exactLng);
		if (hasExactPoint || city) {
			const coords = hasExactPoint ? { lat: exactLat, lng: exactLng } : getCityCoords(city);
			if (coords) {
				const allZoneNames = [
					...new Set(
						enrichedRiders.flatMap((r) => (Array.isArray(r.zones) ? r.zones : []))
					),
				];
				const zoneDocs = allZoneNames.length
					? await Zone.find({ zoneName: { $in: allZoneNames }, isActive: true }).lean()
					: [];
				filteredRiders = enrichedRiders
					.filter((r) => namedZonesCoverPoint(r.zones, zoneDocs, coords.lat, coords.lng))
					.map((r) => ({
						...r,
						distanceKm: riderDistanceToPoint(r, zoneDocs, coords.lat, coords.lng),
					}))
					.sort((a, b) => a.distanceKm - b.distanceKm);
			}
		}

		// Get total count for pagination
		const totalRiders = await Rider.countDocuments(filter);
		const totalPages = Math.ceil(totalRiders / limitNum);

		const ras = {
			riders: filteredRiders,
			pagination: {
				currentPage: pageNum,
				totalPages,
				totalRiders,
				hasNext: pageNum < totalPages,
				hasPrev: pageNum > 1,
			},
		};

		sendResponse(res, 200, true, `Successfully retrieved ${filteredRiders.length} riders`, ras);
	} catch (error) {
		console.error("Error getting riders:", error);
		sendServerError(res, error, "Error fetching riders");
	}
};

// @desc    Get the Rider profile for the currently logged-in user
// @route   GET /api/riders/me
// @access  Private (Rider, Market Driver)
exports.getMyRiderProfile = async (req, res) => {
	try {
		const rider = await Rider.findOne({ user: req.user.id }).populate(
			"user",
			"name email phoneNumber address isActive role",
		);
		if (!rider) {
			return sendError(res, 404, "No rider profile found for this account");
		}
		const ras = { rider };
		sendResponse(res, 200, true, "Rider profile retrieved successfully", ras);
	} catch (error) {
		console.error("Error getting my rider profile:", error);
		sendServerError(res, error, "Error fetching rider profile");
	}
};

// @desc    Get single rider by ID
// @route   GET /api/riders/:id
// @access  Private (Admin, Manager, Rider themselves)
exports.getRider = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid rider ID");
		}

		const rider = await Rider.findById(id)
			.populate("user", "name email phoneNumber address isActive")
			.populate({
				path: "currentOrders",
				select: "orderNumber customer total status createdAt",
			});

		if (!rider) {
			return sendError(res, 404, "Rider not found");
		}

		// Check if user is authorized to view this rider
		if (
			req.user.role !== "admin" &&
			req.user.role !== "manager" &&
			rider.user._id.toString() !== req.user.id
		) {
			return sendError(res, 403, "Not authorized to view this rider");
		}

		const ras = { rider };
		sendResponse(res, 200, true, "Rider retrieved successfully", ras);
	} catch (error) {
		console.error("Error getting rider:", error);
		sendServerError(res, error, "Error fetching rider");
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
			return sendError(res, 400, "User ID, zones (array) and vehicle type are required");
		}

		// Check if user exists and has rider role
		const user = await User.findById(userId);
		if (!user) {
			return sendError(res, 404, "User not found");
		}

		if (user.role !== "rider") {
			return sendError(res, 400, "User must have rider role");
		}

		// Check if rider profile already exists
		const existingRider = await Rider.findOne({ user: userId });
		if (existingRider) {
			return sendError(res, 400, "Rider profile already exists for this user");
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

		const ras = { rider };
		sendResponse(res, 201, true, "Rider profile created successfully", ras);
	} catch (error) {
		console.error("Error creating rider:", error);

		if (error.code === 11000) {
			return sendError(res, 400, "Rider profile already exists for this user");
		}

		sendServerError(res, error, "Error creating rider profile");
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
			return sendError(res, 400, "Invalid rider ID");
		}

		const rider = await Rider.findById(id);
		if (!rider) {
			return sendError(res, 404, "Rider not found");
		}

		// Main admin / manager have view-only access to market-owned riders.
		// Only the market itself (or its market_* staff via marketAdmin routes)
		// can modify a rider that belongs to a market.
		if (
			rider.market &&
			(req.user.role === "admin" || req.user.role === "manager")
		) {
			return sendError(res, 403, "This rider belongs to a market. Main admins have view-only access.");
		}

		// Check authorization
		if (
			req.user.role !== "admin" &&
			req.user.role !== "manager" &&
			rider.user.toString() !== req.user.id
		) {
			return sendError(res, 403, "Not authorized to update this rider");
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

		const ras = { rider };
		sendResponse(res, 200, true, "Rider profile updated successfully", ras);
	} catch (error) {
		console.error("Error updating rider:", error);
		sendServerError(res, error, "Error updating rider profile");
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
			return sendError(res, 400, "Invalid rider ID");
		}

		if (!status) {
			return sendError(res, 400, "Status is required");
		}

		const rider = await Rider.findById(id);
		if (!rider) {
			return sendError(res, 404, "Rider not found");
		}

		// Main admin / manager have view-only access to market-owned riders.
		if (
			rider.market &&
			(req.user.role === "admin" || req.user.role === "manager")
		) {
			return sendError(res, 403, "This rider belongs to a market. Main admins have view-only access.");
		}

		// Check authorization
		if (
			req.user.role !== "admin" &&
			req.user.role !== "manager" &&
			rider.user.toString() !== req.user.id
		) {
			return sendError(res, 403, "Nicht autorisiert, diesen Fahrerstatus zu aktualisieren");
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

		const ras = {
			riderId: rider._id,
			status: rider.status,
			currentLocation: rider.currentLocation,
			lastActiveAt: rider.lastActiveAt,
		};

		sendResponse(res, 200, true, "Rider status updated successfully", ras);
	} catch (error) {
		console.error("Error updating rider status:", error);
		sendServerError(res, error, "Error updating rider status");
	}
};

// @desc    Update rider current location
// @route   PATCH /api/riders/:id/location
// @access  Private (Admin, Manager, Rider themselves)
exports.updateRiderLocation = async (req, res) => {
	try {
		const { latitude, longitude } = req.body;

		// Validate required fields
		if (latitude === undefined || longitude === undefined) {
			return sendError(res, 400, "Latitude and longitude are required");
		}

		// Validate latitude range
		if (latitude < -90 || latitude > 90) {
			return sendError(res, 400, "Breitengrad muss zwischen -90 und 90 liegen");
		}

		// Validate longitude range
		if (longitude < -180 || longitude > 180) {
			return sendError(res, 400, "Longitude must be between -180 and 180");
		}

		// Get rider ID from token (req.user.id)
		const rider = await Rider.findOne({ user: req.user.id });
		if (!rider) {
			return sendError(res, 404, "Rider not found");
		}

		// Update location
		rider.currentLocation = {
			latitude,
			longitude,
			lastUpdated: new Date(),
		};

		await rider.save();

		const ras = {
			riderId: rider._id,
			currentLocation: rider.currentLocation,
		};

		sendResponse(res, 200, true, "Rider location updated successfully", ras);
	} catch (error) {
		console.error("Error updating rider location:", error);
		sendServerError(res, error, "Error updating rider location");
	}
};

// @desc    Get available riders in zone
// @route   GET /api/riders/available/:zone
// @access  Private (Admin, Manager)
exports.getAvailableRiders = async (req, res) => {
	try {
		const { zone } = req.params;
		const { city } = req.query;

		let availableRiders = await Rider.findAvailableInZone(zone);

		// Optional geofence filter: only keep riders whose selected zones (each
		// backed by a map pin + radius on the Zones management page) actually
		// cover the requested delivery city.
		if (city) {
			const coords = getCityCoords(city);
			if (coords) {
				const allZoneNames = [
					...new Set(
						availableRiders.flatMap((r) => (Array.isArray(r.zones) ? r.zones : []))
					),
				];
				const zoneDocs = allZoneNames.length
					? await Zone.find({ zoneName: { $in: allZoneNames }, isActive: true }).lean()
					: [];
				availableRiders = availableRiders
					.filter((r) => namedZonesCoverPoint(r.zones, zoneDocs, coords.lat, coords.lng))
					.map((r) => {
						const obj = typeof r.toObject === "function" ? r.toObject() : r;
						obj.distanceKm = riderDistanceToPoint(r, zoneDocs, coords.lat, coords.lng);
						return obj;
					})
					.sort((a, b) => a.distanceKm - b.distanceKm);
			}
		}

		const ras = { availableRiders, count: availableRiders.length };
		sendResponse(res, 200, true, `Found ${availableRiders.length} available riders in ${zone}`, ras);
	} catch (error) {
		console.error("Error getting available riders:", error);
		sendServerError(res, error, "Error fetching available riders");
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

		const ras = {
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
		};

		sendResponse(res, 200, true, "Rider statistics fetched successfully", ras);
	} catch (error) {
		console.error("Error getting rider stats:", error);
		sendServerError(res, error, "Error fetching rider statistics");
	}
};

// @desc    Delete rider profile (permanent delete)
// @route   DELETE /api/riders/:id
// @access  Private (Admin only)
exports.deleteRider = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid rider ID");
		}

		const rider = await Rider.findById(id);
		if (!rider) {
			return sendError(res, 404, "Rider not found");
		}

		// Main admin / manager have view-only access to market-owned riders.
		if (
			rider.market &&
			(req.user.role === "admin" || req.user.role === "manager")
		) {
			return sendError(res, 403, "This rider belongs to a market. Main admins have view-only access.");
		}

		// Check for active orders
		const activeOrders = await Order.countDocuments({
			assignedRider: id,
			status: { $in: ["confirmed", "processing", "OnTheWay"] },
		});

		if (activeOrders > 0) {
			return sendError(res, 400, `Cannot delete rider with ${activeOrders} active orders`);
		}

		// Permanent delete
		await Rider.findByIdAndDelete(id);

		const ras = {};
		sendResponse(res, 200, true, "Rider profile permanently deleted", ras);
	} catch (error) {
		console.error("Error deleting rider:", error);
		sendServerError(res, error, "Error deleting rider profile");
	}
};
