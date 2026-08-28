// All endpoints for the market-admin dashboard.
// Tenant-scoped: every read and write is constrained to req.marketId.
//
// Sections:
//   - dashboard / stats
//   - staff (User docs with role 'market_staff' + market field)
//   - categories (MarketCategory)
//   - subcategories (MarketSubcategory)
//   - products (shared Product collection, filtered by market)
//   - orders (shared Order collection, filtered by market)
//   - sales statistics
//   - riders (MarketRider)
//   - waste (MarketWaste)
//   - promo codes (MarketPromoCode)
//   - announcements (MarketAnnouncement)
//   - settings (MarketSetting)
//   - profile (Market doc)

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const Market = require("../models/Market");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");

const MarketCategory = require("../models/MarketCategory");
const MarketSubcategory = require("../models/MarketSubcategory");
const MarketRider = require("../models/MarketRider");
const MarketWaste = require("../models/MarketWaste");
const MarketPromoCode = require("../models/MarketPromoCode");
const MarketAnnouncement = require("../models/MarketAnnouncement");
const MarketSetting = require("../models/MarketSetting");
const Shelf = require("../models/Shelf");
const { sendResponse, sendError, sendSuccess } = require("../utils/apiResponse");
const { escapeRegex } = require("../utils/sanitize");
const {
	imageUpload: logoUpload,
	uploadImageToCloudinary,
} = require("../utils/cloudinaryUpload");

const ok = (res, data, message = "OK") => {
	const ras = data;
	sendResponse(res, 200, true, message, ras);
};
const created = (res, data, message = "Created") => {
	const ras = data;
	sendResponse(res, 201, true, message, ras);
};

// Cloudinary is configured centrally in ../utils/cloudinaryUpload.
// NOTE: unlike marketController's logo upload (which fits within 500x500
// via crop:"limit"), this one always used the standard scale/width:500
// transform — preserved exactly via uploadImageToCloudinary.
const uploadLogoToCloudinary = (buffer) =>
	uploadImageToCloudinary(buffer, "markets/logos");
const fail = (res, code, message, errors) =>
	sendError(res, code, message, errors || null);

// Resolve sensible default zones for a market's driver: the market's OWN
// active Zone documents (each backed by a map pin + radius). Using these as
// the default means a newly-created driver automatically covers the exact
// same delivery area as the market — so assigning them to any order the
// market can receive never fails the "outside customer zone" geofence check.
// Falls back to ["Default"] only if the market has no zones configured yet.
const defaultMarketZones = async (marketId) => {
	try {
		const Zone = require("../models/Zone");
		const names = await Zone.find({ market: marketId, isActive: true })
			.distinct("zoneName");
		if (Array.isArray(names) && names.length) return names;
	} catch (e) {
		console.error("[market-admin] defaultMarketZones failed:", e.message);
	}
	return ["Default"];
};

const handleErr = (res, err) => {
	console.error("[market-admin]", err);
	if (err && err.name === "ValidationError") {
		return fail(
			res,
			400,
			"Validation Error",
			Object.values(err.errors).map((e) => e.message),
		);
	}
	if (err && err.code === 11000) {
		const keyValue = err.keyValue || {};
		const field = keyValue.barcode
			? "barcode"
			: keyValue.name
				? "name"
				: keyValue.code
					? "code"
					: Object.keys(keyValue).find((key) => key !== "market") || "field";
		return fail(res, 400, `${field} already exists`);
	}
	return fail(res, 500, err.message || "Server Error");
};

// ───────────────────────── helpers ─────────────────────────
const tFilter = (req, extra = {}) => ({ market: req.marketId, ...extra });

const paginate = (q) => {
	const page = Math.max(parseInt(q.page) || 1, 1);
	const limit = Math.min(Math.max(parseInt(q.limit) || 20, 1), 200);
	return { page, limit, skip: (page - 1) * limit };
};

const firstDefined = (...values) =>
	values.find((value) => value !== undefined && value !== null && value !== "");

const normalizeSubcategoryPayload = (body) => ({
	...body,
	category: firstDefined(body.category, body.parentCategory),
	sortOrder: firstDefined(body.sortOrder, body.sortorder),
});

const serializeSubcategory = (item) => {
	const subcategory = item && item.toObject ? item.toObject() : { ...(item || {}) };
	if (subcategory.category !== undefined) {
		subcategory.parentCategory = subcategory.category;
	}
	if (subcategory.sortOrder !== undefined) {
		subcategory.sortorder = subcategory.sortOrder;
	}
	return subcategory;
};

const normalizePromoCodePayload = (body) => ({
	...body,
	minOrderTotal: firstDefined(
		body.minOrderTotal,
		body.triggerCondition && body.triggerCondition.minOrderTotal,
	),
});

const normalizeAnnouncementPayload = (body) => ({
	...body,
	message: firstDefined(body.message, body.description),
});

const normalizeWasteReason = (reason) => {
	if (!reason) return reason;
	const key = String(reason).trim().toLowerCase();
	const map = {
		expired: "expired",
		damaged: "damaged",
		"quality issues": "spoiled",
		spoiled: "spoiled",
		stolen: "stolen",
		other: "other",
	};
	return map[key] || "other";
};

// Adjust a market product's stock by a signed delta (negative = consume,
// positive = restock). Scoped to the market so a tenant can't touch another
// market's inventory. No-ops quietly when the product can't be resolved.
const adjustProductStock = async (productId, marketId, delta) => {
	if (!productId || !delta) return;
	if (!mongoose.Types.ObjectId.isValid(productId)) return;
	const product = await Product.findOne({ _id: productId, market: marketId });
	if (!product) return;
	await product.updateStock(Math.abs(delta), delta < 0 ? "subtract" : "add");
};

const normalizeWastePayload = async (body, req) => {
	const out = {
		...body,
		productName: firstDefined(body.productName, body.name, body.barcode),
		reason: normalizeWasteReason(body.reason),
	};
	// Resolve the product this waste refers to (scoped to the market) so its
	// stock can be decremented now and restored if the record is later deleted.
	let product = null;
	const pid = body.productId || body.product;
	if (pid && mongoose.Types.ObjectId.isValid(pid)) {
		product = await Product.findOne({ _id: pid, market: req.marketId });
	}
	if (!product && body.barcode) {
		product = await Product.findOne({
			barcode: String(body.barcode).trim(),
			market: req.marketId,
			isActive: true,
		});
	}
	if (product) {
		out.product = product._id;
		if (!out.productName || out.productName === body.barcode) {
			out.productName = product.name;
		}
	}
	// Stamp who recorded this waste entry. `req.user` is populated by the
	// auth middleware for both market_staff accounts (User doc) and the
	// market owner itself (unified shape with role "market"), so it's always
	// present when this route is hit.
	if (req.user) {
		out.recordedBy = req.user._id || req.user.id;
		out.recordedByModel = req.user.role === "market" ? "Market" : "User";
		out.recordedByName = req.user.name || undefined;
	}
	return out;
};

const normalizeShelfPayload = (body) => ({
	...body,
	barcode: body.barcode && String(body.barcode).trim() ? body.barcode : undefined,
	capacity: Math.max(parseInt(body.capacity) || 0, 0),
	currentLoad: Math.max(parseInt(body.currentLoad) || 0, 0),
});

const normalizeVehicleType = (vehicleType) => {
	if (!vehicleType) return "scooter";
	const key = String(vehicleType).trim().toLowerCase();
	const map = {
		bicycle: "bicycle",
		bike: "bike",
		motorbike: "motorbike",
		scooter: "scooter",
		car: "car",
		van: "van",
		other: "other",
	};
	return map[key] || "other";
};

const buildDateFilter = ({ timeRange, dateFrom, dateTo } = {}) => {
	const dateFilter = {};
	const now = new Date();

	if (timeRange === "week") {
		const weekAgo = new Date(now);
		weekAgo.setDate(weekAgo.getDate() - 7);
		return { $gte: weekAgo, $lte: now };
	}
	if (timeRange === "month") {
		const monthAgo = new Date(now);
		monthAgo.setMonth(monthAgo.getMonth() - 1);
		return { $gte: monthAgo, $lte: now };
	}
	if (timeRange === "year") {
		const yearAgo = new Date(now);
		yearAgo.setFullYear(yearAgo.getFullYear() - 1);
		return { $gte: yearAgo, $lte: now };
	}

	if (dateFrom) {
		const fromDate = new Date(dateFrom);
		if (!Number.isNaN(fromDate.getTime())) dateFilter.$gte = fromDate;
	}
	if (dateTo) {
		const toDate = new Date(dateTo);
		if (!Number.isNaN(toDate.getTime())) {
			toDate.setHours(23, 59, 59, 999);
			dateFilter.$lte = toDate;
		}
	}

	return dateFilter;
};

const paginationMeta = (page, limit, totalProducts) => {
	const totalPages = Math.max(1, Math.ceil(totalProducts / Math.max(1, limit)));
	return {
		currentPage: page,
		totalPages,
		totalProducts,
		hasNextPage: page < totalPages,
		hasPrevPage: page > 1,
		limit,
	};
};

const serializeAnnouncement = (item) => {
	const announcement = item && item.toObject ? item.toObject() : { ...(item || {}) };
	if (announcement.message !== undefined) {
		announcement.description = announcement.message;
	}
	return announcement;
};

const normalizeRiderPayload = async (body) => {
	const data = {
		...body,
		vehicleType: normalizeVehicleType(body.vehicleType),
		vehiclePlate: firstDefined(body.vehiclePlate, body.vehicleNumber, body.licenseNumber),
		zone: firstDefined(
			body.zone,
			Array.isArray(body.zones) ? body.zones[0] : body.zones,
		),
		isActive: firstDefined(body.isActive, body.status && body.status !== "inactive"),
		isAvailable: firstDefined(body.isAvailable, body.status === "available"),
	};

	if (body.userId && (!data.name || !data.phoneNumber || !data.email)) {
		// Market drivers have role 'market_driver'; admin riders have role 'rider'.
		// Accept either so the rider record gets its name/phone/email auto-filled.
		const user = await User.findOne({
			_id: body.userId,
			role: { $in: ["rider", "market_driver"] },
		}).select("name phoneNumber email");
		if (user) {
			data.name = firstDefined(data.name, user.name);
			data.phoneNumber = firstDefined(data.phoneNumber, user.phoneNumber);
			data.email = firstDefined(data.email, user.email);
		}
	}

	return data;
};

// ───────────────────────── dashboard ─────────────────────────
exports.getDashboard = async (req, res) => {
	try {
		const marketId = req.marketId;
		const [activeProducts, totalOrders, activeRiders, customers] =
			await Promise.all([
				Product.countDocuments({ market: marketId, isActive: true }),
				Order.countDocuments({ market: marketId }),
				require("../models/Rider").countDocuments({
					market: marketId,
					isActive: true,
				}),
				User.countDocuments({
					role: "customer",
					// Customers are global; show count of customers who placed an order at this market
				}),
			]);

		// Customers who actually ordered from this market
		const distinctCustomers = await Order.distinct("customer", {
			market: marketId,
		});

		const salesAgg = await Order.aggregate([
			{ $match: { market: new mongoose.Types.ObjectId(marketId) } },
			{
				$group: {
					_id: null,
					totalSales: { $sum: { $ifNull: ["$total", 0] } },
					deliveredSales: {
						$sum: {
							$cond: [
								{ $eq: ["$status", "delivered"] },
								{ $ifNull: ["$total", 0] },
								0,
							],
						},
					},
				},
			},
		]);

		ok(res, {
			totalCustomers: distinctCustomers.length,
			totalProducts: activeProducts,
			totalOrders,
			totalRiders: activeRiders,
			totalSales: salesAgg[0]?.totalSales || 0,
			deliveredSales: salesAgg[0]?.deliveredSales || 0,
		});
	} catch (err) {
		handleErr(res, err);
	}
};

// ───────────────────────── staff (User-based) ─────────────────────────
// Staff are User documents with role='market_staff' and market=req.marketId
const MARKET_USER_ROLES = [
	"market_staff",
	"market_manager",
	"market_driver",
	"customer",
];

exports.getStaff = async (req, res) => {
	try {
		const user = await User.findOne({
			_id: req.params.id,
			market: req.marketId,
		}).select("-password");
		if (!user) return fail(res, 404, "Staff not found");
		ok(res, user, "OK");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.listStaff = async (req, res) => {
	try {
		const { page, limit, skip } = paginate(req.query);
		const search = (req.query.search || "").trim();
		const filter = {
			market: req.marketId,
			role: { $in: MARKET_USER_ROLES },
		};
		// Optional role filter: ?role=market_driver
		if (req.query.role) {
			const roles = String(req.query.role)
				.split(",")
				.map((r) => r.trim())
				.filter((r) => MARKET_USER_ROLES.includes(r));
			if (roles.length) filter.role = { $in: roles };
		}
		if (search) {
			filter.$or = [
				{ name: new RegExp(search, "i") },
				{ email: new RegExp(search, "i") },
				{ phoneNumber: new RegExp(search, "i") },
			];
		}
		const [items, total] = await Promise.all([
			User.find(filter)
				.select("-password")
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit),
			User.countDocuments(filter),
		]);
		ok(res, items, "OK");
		res.meta = { total, page, limit };
	} catch (err) {
		handleErr(res, err);
	}
};

exports.createStaff = async (req, res) => {
	try {
		const { name, email, phoneNumber, password, address, role, zones, vehicleType, vehicleNumber } = req.body;
		if (!name || !email || !phoneNumber || !password) {
			return fail(res, 400, "name, email, phoneNumber and password are required");
		}
		const safeRole = MARKET_USER_ROLES.includes(role) ? role : "market_staff";
		const user = await User.create({
			name,
			email,
			phoneNumber,
			password,
			role: safeRole,
			market: req.marketId,
			address: address || {
				street: "-",
				city: "-",
			},
			emailConfirmed: true,
		});

		// Market drivers are real Riders scoped to a market — auto-create the
		// Rider profile so the existing rider endpoints (location, status, list,
		// etc.) work out of the box.
		if (safeRole === "market_driver") {
			try {
				const Rider = require("../models/Rider");
				await Rider.create({
					user: user._id,
					market: req.marketId,
					zones:
						Array.isArray(zones) && zones.length
							? zones
							: await defaultMarketZones(req.marketId),
					vehicleType: vehicleType || "motorbike",
					vehicleNumber: vehicleNumber || undefined,
					status: "available",
					isActive: true,
					isVerified: true,
				});
			} catch (riderErr) {
				console.error(
					"[market-admin] Failed to auto-create Rider for market_driver:",
					riderErr,
				);
				// Roll back the user so we don't leave a driver without a Rider doc.
				await User.deleteOne({ _id: user._id });
				return fail(
					res,
					400,
					"Failed to create driver profile: " +
						(riderErr.message || "unknown error"),
				);
			}
		}

		const safe = user.toObject();
		delete safe.password;
		created(res, safe, "Staff created");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.updateStaff = async (req, res) => {
	try {
		const allowed = [
			"name",
			"email",
			"phoneNumber",
			"isActive",
			"address",
			"role",
		];
		const update = {};
		allowed.forEach((k) => {
			if (req.body[k] !== undefined) update[k] = req.body[k];
		});
		if (update.role && !MARKET_USER_ROLES.includes(update.role)) {
			return fail(res, 400, "Invalid role for market user");
		}
		const user = await User.findOneAndUpdate(
			{ _id: req.params.id, market: req.marketId },
			update,
			{ new: true, runValidators: true },
		).select("-password");
		if (!user) return fail(res, 404, "Staff not found");
		ok(res, user, "Staff updated");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.resetStaffPassword = async (req, res) => {
	try {
		const { password } = req.body;
		if (!password || password.length < 6) {
			return fail(res, 400, "Password must be at least 6 characters");
		}
		const user = await User.findOne({
			_id: req.params.id,
			market: req.marketId,
		}).select("+password");
		if (!user) return fail(res, 404, "Staff not found");
		user.password = password;
		await user.save();
		ok(res, { id: user._id }, "Password updated");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.deleteStaff = async (req, res) => {
	try {
		const user = await User.findOneAndDelete({
			_id: req.params.id,
			market: req.marketId,
		});
		if (!user) return fail(res, 404, "Staff not found");
		// If the deleted user was a market_driver, also delete the linked Rider doc.
		if (user.role === "market_driver") {
			try {
				const Rider = require("../models/Rider");
				await Rider.deleteOne({ user: user._id });
			} catch (e) {
				console.error("[market-admin] Failed to delete Rider for driver:", e);
			}
		}
		ok(res, { id: user._id }, "Staff deleted");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.listRiderUsers = async (req, res) => {
	try {
		// Market-scoped: only return this market's own drivers.
		// In the market world, a "rider" is a User with role 'market_driver'
		// that belongs to req.marketId.
		const Rider = require("../models/Rider");
		const users = await User.find({
			market: req.marketId,
			role: "market_driver",
			isActive: true,
		})
			.select("name email phoneNumber role isActive market")
			.sort({ name: 1 });

		// By default we return ALL of this market's drivers (most market_driver
		// users already have an auto-created Rider doc, so filtering linked ones
		// out would leave the dropdown empty). Pass ?excludeLinked=true to hide
		// drivers that are already linked to a Rider document.
		if (req.query.excludeLinked === "true") {
			const linkedUserIds = await Rider.find({
				user: { $in: users.map((u) => u._id) },
			}).distinct("user");
			const linkedSet = new Set(linkedUserIds.map((id) => String(id)));
			return ok(res, users.filter((u) => !linkedSet.has(String(u._id))));
		}
		ok(res, users);
	} catch (err) {
		handleErr(res, err);
	}
};

// ───────────────────────── market drivers (live location) ─────────────────────────
// Market drivers are real Rider documents scoped to a market.
// A market_driver User has a Rider doc (Rider.market = market, Rider.user = user)
// and pushes its GPS via the standard PATCH /api/riders/location endpoint.
exports.listMarketDrivers = async (req, res) => {
	try {
		const Rider = require("../models/Rider");

		// Self-heal: every market_driver User should have a Rider doc, because
		// Order.assignedRider references a Rider (not a User). Drivers created
		// before the auto-create logic — or via other paths — can be missing one,
		// which makes them show in the staff/drivers list (User-based) but NOT in
		// the "assign driver" dropdown (Rider-based). Backfill the missing Rider
		// docs on the fly so every driver becomes assignable.
		const driverUsers = await User.find({
			market: req.marketId,
			role: "market_driver",
			isActive: true,
		}).select("_id");

		if (driverUsers.length) {
			const linkedUserIds = await Rider.find({
				user: { $in: driverUsers.map((u) => u._id) },
			}).distinct("user");
			const linkedSet = new Set(linkedUserIds.map((id) => String(id)));
			const missing = driverUsers.filter(
				(u) => !linkedSet.has(String(u._id))
			);
			const backfillZones = missing.length
				? await defaultMarketZones(req.marketId)
				: null;
			for (const u of missing) {
				try {
					await Rider.create({
						user: u._id,
						market: req.marketId,
						zones: backfillZones,
						vehicleType: "motorbike",
						status: "available",
						isActive: true,
						isVerified: true,
					});
				} catch (e) {
					console.error(
						"[market-admin] Failed to backfill Rider for market_driver",
						String(u._id) + ":",
						e.message
					);
				}
			}
		}

		// Self-heal legacy drivers stuck on the placeholder ["Default"] zone
		// (created before drivers inherited the market's zones). If no actual
		// Zone named "Default" exists for this market, remap them to the
		// market's real zones so the geofence check stops rejecting them.
		try {
			const Zone = require("../models/Zone");
			const hasDefaultZone = await Zone.exists({
				market: req.marketId,
				zoneName: "Default",
				isActive: true,
			});
			if (!hasDefaultZone) {
				const marketZones = await defaultMarketZones(req.marketId);
				if (marketZones.length && marketZones[0] !== "Default") {
					await Rider.updateMany(
						{ market: req.marketId, zones: ["Default"] },
						{ $set: { zones: marketZones } }
					);
				}
			}
		} catch (e) {
			console.error("[market-admin] Zone self-heal failed:", e.message);
		}

		const riders = await Rider.find({
			market: req.marketId,
			isActive: true,
		})
			.populate("user", "name email phoneNumber address isActive role")
			.sort({ createdAt: -1 });

		// Optional geofence filter: only return drivers whose selected zones
		// (each backed by a map pin + radius configured on the Zones management
		// page) actually cover the customer's location. This is what keeps
		// out-of-range drivers out of the "Assign Driver" dropdown.
		//
		// Prefers the customer's EXACT map pin (lat/lng, captured on their
		// profile) when available — falls back to the delivery city's
		// approximate center only if no exact pin was provided.
		const { city, lat, lng } = req.query;
		const exactLat = lat !== undefined ? parseFloat(lat) : NaN;
		const exactLng = lng !== undefined ? parseFloat(lng) : NaN;
		const hasExactPoint = Number.isFinite(exactLat) && Number.isFinite(exactLng);

		if (hasExactPoint || city) {
			const Zone = require("../models/Zone");
			const { getCityCoords } = require("../utils/lebaneseCities");
			const { namedZonesCoverPoint, riderDistanceToPoint } = require("../utils/zoneGeo");
			const coords = hasExactPoint
				? { lat: exactLat, lng: exactLng }
				: getCityCoords(city);
			if (coords) {
				const allZoneNames = [
					...new Set(riders.flatMap((r) => (Array.isArray(r.zones) ? r.zones : []))),
				];
				// Fetch ALL of this market's active zones (not just the ones the
				// drivers reference): drivers inherit the market's full coverage.
				const zoneDocs = await Zone.find({
					isActive: true,
					market: req.marketId,
				}).lean();
				const marketZoneNames = zoneDocs.map((z) => z.zoneName);
				const marketCovers = namedZonesCoverPoint(
					marketZoneNames,
					zoneDocs,
					coords.lat,
					coords.lng
				);
				// Only keep drivers whose covering zone(s) reach this city, then
				// rank them by proximity (live GPS if available, else nearest
				// covering zone center) so the nearest driver appears first.
				// If the MARKET's zones cover the customer, every driver of the
				// market qualifies (drivers inherit the market's coverage).
				const covered = riders
					.filter(
						(r) =>
							marketCovers ||
							namedZonesCoverPoint(r.zones, zoneDocs, coords.lat, coords.lng)
					)
					.map((r) => {
						const obj = typeof r.toObject === "function" ? r.toObject() : r;
						obj.distanceKm = riderDistanceToPoint(r, zoneDocs, coords.lat, coords.lng);
						return obj;
					})
					.sort((a, b) => a.distanceKm - b.distanceKm);
				return ok(res, covered);
			}
		}

		ok(res, riders);
	} catch (err) {
		handleErr(res, err);
	}
};

// ───────────────────────── generic CRUD factory ─────────────────────────
const crud = (Model, allowedFields, opts = {}) => ({
	list: async (req, res) => {
		try {
			const { page, limit, skip } = paginate(req.query);
			const search = (req.query.search || "").trim();
			const filter = tFilter(req);
			if (req.query.isActive && req.query.isActive !== "all") {
				filter.isActive = req.query.isActive === "true";
			}
			if (search && opts.searchFields) {
				const safeSearch = escapeRegex(search);
				filter.$or = opts.searchFields.map((f) => ({
					[f]: new RegExp(safeSearch, "i"),
				}));
			}
			// Reserved query params that should never be treated as filters
			const reserved = new Set([
				"page",
				"limit",
				"search",
				"sortBy",
				"sortOrder",
				"isActive",
			]);
			Object.entries(req.query).forEach(([k, v]) => {
				if (reserved.has(k)) return;
				if (allowedFields.includes(k) && v !== "" && v !== undefined) {
					filter[k] = v;
				}
			});

			// Build sort: prefer explicit ?sortBy=&sortOrder= from the client,
			// fall back to the controller's defaultSort.
			let sort = opts.defaultSort || { createdAt: -1 };
			if (req.query.sortBy) {
				const dir =
					String(req.query.sortOrder || "asc").toLowerCase() === "desc"
						? -1
						: 1;
				sort = { [req.query.sortBy]: dir };
			}

			let q = Model.find(filter)
				.sort(sort)
				.skip(skip)
				.limit(limit);
			if (opts.populate) q = q.populate(opts.populate);
			const [items, total] = await Promise.all([
				q.exec(),
				Model.countDocuments(filter),
			]);
			const data = opts.transform ? items.map(opts.transform) : items;
			const ras = { items: data, meta: { total, page, limit } };
			sendResponse(res, 200, true, "OK", ras);
		} catch (err) {
			handleErr(res, err);
		}
	},
	get: async (req, res) => {
		try {
			let q = Model.findOne({ _id: req.params.id, market: req.marketId });
			if (opts.populate) q = q.populate(opts.populate);
			const item = await q.exec();
			if (!item) return fail(res, 404, "Not found");
			ok(res, opts.transform ? opts.transform(item) : item);
		} catch (err) {
			handleErr(res, err);
		}
	},
	create: async (req, res) => {
		try {
			const body = opts.normalize
				? await opts.normalize(req.body || {}, req)
				: req.body || {};
			const data = { market: req.marketId };
			allowedFields.forEach((f) => {
				if (body[f] !== undefined) data[f] = body[f];
			});
			const item = await Model.create(data);
			if (opts.afterCreate) await opts.afterCreate(item, req, body);
			created(res, opts.transform ? opts.transform(item) : item);
		} catch (err) {
			handleErr(res, err);
		}
	},
	update: async (req, res) => {
		try {
			const body = opts.normalize
				? await opts.normalize(req.body || {}, req)
				: req.body || {};
			const data = {};
			allowedFields.forEach((f) => {
				if (body[f] !== undefined) data[f] = body[f];
			});
			// When a resource needs to react to changes (e.g. waste adjusting
			// product stock), grab the pre-update document so the hook can diff.
			const prev = opts.afterUpdate
				? await Model.findOne({ _id: req.params.id, market: req.marketId })
				: null;
			const item = await Model.findOneAndUpdate(
				{ _id: req.params.id, market: req.marketId },
				data,
				{ new: true, runValidators: true },
			);
			if (!item) return fail(res, 404, "Not found");
			if (opts.afterUpdate) await opts.afterUpdate(item, req, prev, body);
			ok(res, opts.transform ? opts.transform(item) : item, "Updated");
		} catch (err) {
			handleErr(res, err);
		}
	},
	remove: async (req, res) => {
		try {
			const item = await Model.findOneAndDelete({
				_id: req.params.id,
				market: req.marketId,
			});
			if (!item) return fail(res, 404, "Not found");
			if (opts.afterRemove) await opts.afterRemove(item, req);
			ok(res, { id: item._id }, "Deleted");
		} catch (err) {
			handleErr(res, err);
		}
	},
});

// ───────────────────────── categories ─────────────────────────
exports.categories = crud(
	MarketCategory,
	["name", "description", "image", "icon", "sortOrder", "isActive"],
	{ searchFields: ["name", "description"], defaultSort: { sortOrder: 1, name: 1 } },
);

// ───────────────────────── shelves ─────────────────────────
exports.shelves = crud(
	Shelf,
	[
		"shelfNumber",
		"barcode",
		"description",
		"location",
		"capacity",
		"currentLoad",
		"isActive",
		"products",
		"orders",
	],
	{
		searchFields: ["shelfNumber", "barcode", "description", "location"],
		defaultSort: { shelfNumber: 1 },
		normalize: normalizeShelfPayload,
	},
);

// ───────────────────────── subcategories ─────────────────────────
exports.subcategories = crud(
	MarketSubcategory,
	[
		"name",
		"description",
		"image",
		"icon",
		"sortOrder",
		"isActive",
		"category",
	],
	{
		searchFields: ["name", "description"],
		defaultSort: { sortOrder: 1, name: 1 },
		populate: { path: "category", select: "name" },
		normalize: normalizeSubcategoryPayload,
		transform: serializeSubcategory,
	},
);

// ───────────────────────── products (shared Product) ─────────────────────────
exports.listProducts = async (req, res) => {
	try {
		const { page, limit, skip } = paginate(req.query);
		const search = (req.query.search || "").trim();
		const filter = { market: req.marketId };
		if (req.query.isActive && req.query.isActive !== "all") {
			filter.isActive = req.query.isActive === "true";
		}
		if (req.query.inAds && req.query.inAds !== "all") {
			filter.inAds = req.query.inAds === "true";
		}
		if (req.query.subcategory && req.query.subcategory !== "all") {
			filter.subcategory = req.query.subcategory;
		}
		if (req.query.priceRange && req.query.priceRange !== "all") {
			if (req.query.priceRange.endsWith("+")) {
				filter.price = { $gte: parseFloat(req.query.priceRange) || 0 };
			} else {
				const [min, max] = req.query.priceRange.split("-").map(Number);
				if (!Number.isNaN(min) && !Number.isNaN(max)) {
					filter.price = { $gte: min, $lte: max };
				}
			}
		}
		if (req.query.stockLevel && req.query.stockLevel !== "all") {
			if (req.query.stockLevel === "out") filter.stock = { $lte: 0 };
			else if (req.query.stockLevel === "low") filter.stock = { $gt: 0, $lte: 10 };
			else if (req.query.stockLevel === "in") filter.stock = { $gt: 10 };
		}
		if (search) {
			const safeSearch = escapeRegex(search);
			filter.$or = [
				{ name: new RegExp(safeSearch, "i") },
				{ barcode: new RegExp(safeSearch, "i") },
			];
		}

		const allowedSortFields = new Set([
			"createdAt",
			"name",
			"price",
			"stock",
			"sortOrder",
			"isActive",
		]);
		const sortBy = allowedSortFields.has(req.query.sortBy)
			? req.query.sortBy
			: "createdAt";
		const sortOrder = String(req.query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
		const sort = { [sortBy]: sortOrder };

		const [items, total] = await Promise.all([
			Product.find(filter)
				.sort(sort)
				.skip(skip)
				.limit(limit)
				.lean(),
			Product.countDocuments(filter),
		]);
		const subcategoryIds = items
			.map((item) => item.subcategory)
			.filter(Boolean)
			.map((id) => String(id));
		const marketSubcategories = await MarketSubcategory.find({
			_id: { $in: subcategoryIds },
			market: req.marketId,
		})
			.populate({ path: "category", select: "name image icon" })
			.lean();
		const subcategoryMap = new Map(
			marketSubcategories.map((subcategory) => [String(subcategory._id), subcategory]),
		);
		const data = items.map((item) => {
			const subcategory = subcategoryMap.get(String(item.subcategory));
			return {
				...item,
				category: subcategory && subcategory.category ? subcategory.category : item.category,
				subcategory: subcategory
					? {
						...subcategory,
						parentCategory: subcategory.category,
					}
					: item.subcategory,
			};
		});
		const ras = {
			items: data,
			meta: {
				total,
				page,
				limit,
				totalPages: Math.max(1, Math.ceil(total / limit)),
			},
			pagination: {
				totalProducts: total,
				total,
				page,
				currentPage: page,
				limit,
				totalPages: Math.max(1, Math.ceil(total / limit)),
			},
		};
		sendResponse(res, 200, true, "OK", ras);
	} catch (err) {
		handleErr(res, err);
	}
};

exports.createProduct = async (req, res) => {
	try {
		const allowed = [
			"name",
			"barcode",
			"shelfNumber",
			"subcategory",
			"price",
			"stock",
			"tax",
			"bottlerefund",
			"discount",
			"picture",
			"description",
			"category",
			"sortOrder",
			"inAds",
			"is18Plus",
			"isActive",
			"weight",
		];
		const data = { market: req.marketId };
		allowed.forEach((f) => {
			if (req.body[f] !== undefined) data[f] = req.body[f];
		});
		const item = await Product.create(data);
		created(res, item);
	} catch (err) {
		handleErr(res, err);
	}
};

exports.updateProduct = async (req, res) => {
	try {
		const allowed = [
			"name",
			"barcode",
			"shelfNumber",
			"subcategory",
			"price",
			"stock",
			"tax",
			"bottlerefund",
			"discount",
			"picture",
			"description",
			"category",
			"sortOrder",
			"inAds",
			"is18Plus",
			"isActive",
			"weight",
		];
		const data = {};
		allowed.forEach((f) => {
			if (req.body[f] !== undefined) data[f] = req.body[f];
		});
		const item = await Product.findOneAndUpdate(
			{ _id: req.params.id, market: req.marketId },
			data,
			{ new: true, runValidators: true },
		);
		if (!item) return fail(res, 404, "Product not found");
		ok(res, item, "Updated");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.deleteProduct = async (req, res) => {
	try {
		const item = await Product.findOneAndUpdate(
			{ _id: req.params.id, market: req.marketId },
			{ isActive: false },
			{ new: true },
		);
		if (!item) return fail(res, 404, "Product not found");
		ok(res, { id: item._id }, "Deactivated");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.updateProductStock = async (req, res) => {
	try {
		const { quantity, operation = "set" } = req.body;
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid product ID");
		}
		if (typeof quantity !== "number" || quantity < 0) {
			return fail(res, 400, "Quantity must be a non-negative number");
		}
		if (!["set", "add", "subtract"].includes(operation)) {
			return fail(res, 400, "Invalid stock operation");
		}

		const product = await Product.findOne({
			_id: req.params.id,
			market: req.marketId,
		});
		if (!product) return fail(res, 404, "Product not found");

		await product.updateStock(quantity, operation);
		if (operation === "add" || operation === "set") {
			product.lastRestocked = new Date();
			await product.save();
		}

		ok(res, product, "Product stock updated successfully");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.updateProductShelfNumber = async (req, res) => {
	try {
		const { shelfNumber } = req.body;
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid product ID");
		}
		if (!shelfNumber || typeof shelfNumber !== "string") {
			return fail(res, 400, "Shelf number is required and must be a string");
		}

		const product = await Product.findOneAndUpdate(
			{ _id: req.params.id, market: req.marketId },
			{ shelfNumber: shelfNumber.trim(), updatedAt: new Date() },
			{ new: true, runValidators: true },
		);
		if (!product) return fail(res, 404, "Product not found");

		ok(res, product, "Product shelf number updated successfully");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.permanentDeleteProduct = async (req, res) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid product ID");
		}
		const item = await Product.findOneAndDelete({
			_id: req.params.id,
			market: req.marketId,
		});
		if (!item) return fail(res, 404, "Product not found");
		ok(res, { id: item._id }, "Product permanently deleted");
	} catch (err) {
		handleErr(res, err);
	}
};

// ───────────────────────── orders (shared Order) ─────────────────────────
exports.listOrders = async (req, res) => {
	try {
		const { page, limit, skip } = paginate(req.query);
		const search = (req.query.search || "").trim();
		// Exclude soft-deleted orders (isActive:false). Use $ne:false so legacy
		// orders without the field still appear.
		const filter = { market: req.marketId, isActive: { $ne: false } };
		if (req.query.status) filter.status = req.query.status;
		// Date window, matching the main /api/orders contract so the shared
		// Order Management page filters identically in either context.
		if (req.query.dateFrom || req.query.dateTo) {
			filter.createdAt = {};
			if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
			if (req.query.dateTo) {
				const to = new Date(req.query.dateTo);
				to.setHours(23, 59, 59, 999);
				filter.createdAt.$lte = to;
			}
		}
		if (search) {
			filter.$or = [
				{ orderNumber: new RegExp(search, "i") },
				{ "customer.name": new RegExp(search, "i") },
				{ "customer.email": new RegExp(search, "i") },
			];
		}
		const [items, total] = await Promise.all([
			Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
			Order.countDocuments(filter),
		]);
		const totalPages = Math.max(1, Math.ceil(total / limit));
		// Expose the collection under BOTH names, and pagination under both
		// `meta` and `pagination`. Existing market-dashboard code reads
		// items/meta; the shared Order Management page and the main admin
		// dashboard read orders/pagination. Emitting both keeps either caller
		// working instead of silently rendering an empty table.
		const ras = {
			items,
			orders: items,
			meta: { total, page, limit, totalPages },
			pagination: {
				currentPage: page,
				page,
				limit,
				totalPages,
				totalOrders: total,
				total,
				hasNextPage: page < totalPages,
				hasPrevPage: page > 1,
			},
		};
		sendResponse(res, 200, true, "OK", ras);
	} catch (err) {
		handleErr(res, err);
	}
};

// Lightweight market-scoped order count used by the dashboard's live-update
// polling. Returns { success, count } to mirror the global /api/orders/count.
exports.ordersCount = async (req, res) => {
	try {
		const count = await Order.countDocuments({
			market: req.marketId,
			isActive: { $ne: false },
		});
		const ras = { count: count, total: count };
		sendResponse(res, 200, true, "Success", ras);
	} catch (err) {
		handleErr(res, err);
	}
};

// Get a single order (market-scoped) — used by the dashboard "View" action.
exports.getOrder = async (req, res) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid order ID");
		}
		const order = await Order.findOne({
			_id: req.params.id,
			market: req.marketId,
		})
			.populate("createdBy", "name email")
			.populate("updatedBy", "name email")
			.populate("assignedRider", "name email phone")
			.populate("market", "name username location logo")
			.populate(
				"items.product",
				"name barcode shelfNumber price discount tax bottlerefund picture market",
			);
		if (!order) return fail(res, 404, "Order not found");
		ok(res, order);
	} catch (err) {
		handleErr(res, err);
	}
};

// Update limited fields on an order (market-scoped) — used by the dashboard
// "Payed" action which sends { paymentStatus: "paidondelivery" }.
exports.updateOrder = async (req, res) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid order ID");
		}
		const allowed = [
			"status",
			"paymentStatus",
			"deliveryTime",
			"notes",
			"assignedRider",
			"shelfNumber",
		];
		const update = {};
		for (const key of allowed) {
			if (req.body[key] !== undefined) update[key] = req.body[key];
		}
		if (req.user && req.user.id) update.updatedBy = req.user.id;

		// Captured up front so we can tell after the update whether the status
		// actually changed (needed to avoid re-notifying the customer on every
		// unrelated field edit, e.g. saving a shelf number).
		const previousOrderForStatus = update.status !== undefined
			? await Order.findOne({ _id: req.params.id, market: req.marketId }).select("status")
			: null;
		const previousStatus = previousOrderForStatus ? previousOrderForStatus.status : undefined;

		// Hard enforcement: reject assigning a driver whose configured
		// delivery zone(s) don't cover the customer's location (exact map pin
		// preferred, falls back to delivery city). This blocks the actual
		// assignment even if called directly (not just filtering the dropdown).
		if (
			update.assignedRider !== undefined &&
			update.assignedRider &&
			update.assignedRider !== "unassigned"
		) {
			if (!mongoose.Types.ObjectId.isValid(update.assignedRider)) {
				return fail(res, 400, "Invalid rider ID");
			}
			const Rider = require("../models/Rider");
			const Zone = require("../models/Zone");
			const { riderCoversOrder } = require("../utils/zoneGeo");
			const [riderDoc, existingOrder] = await Promise.all([
				Rider.findOne({
					_id: update.assignedRider,
					market: req.marketId,
				}).select("zones currentLocation market"),
				Order.findOne({ _id: req.params.id, market: req.marketId }),
			]);
			if (!riderDoc) {
				return fail(res, 404, "Rider not found");
			}
			if (!existingOrder) {
				return fail(res, 404, "Order not found");
			}
			const { covers, reason } = await riderCoversOrder(
				riderDoc,
				existingOrder,
				Zone,
				req.marketId
			);
			if (!covers) {
				return fail(res, 400, reason || "This driver's zone does not cover the customer's delivery location");
			}
		}

		const order = await Order.findOneAndUpdate(
			{ _id: req.params.id, market: req.marketId },
			update,
			{ new: true, runValidators: true },
		);
		if (!order) return fail(res, 404, "Order not found");

		// Push-notify the customer (mirrors orderController.updateOrder) —
		// this endpoint is also how the scannn app assigns a driver
		// (status: "OnTheWay") and marks orders delivered for MARKET orders;
		// without this, only main-store status changes (via /api/orders/:id)
		// ever reached the customer's myMob app.
		if (update.status && update.status !== previousStatus) {
			const { notifyCustomerOrderStatus } = require("../services/orderStatusNotification");
			notifyCustomerOrderStatus(order, update.status).catch((e) =>
				console.error("Market order status notification failed:", e),
			);
		}

		ok(res, order, "Order updated");
	} catch (err) {
		handleErr(res, err);
	}
};

// Soft-delete an order (market-scoped) — used by the dashboard "Delete" action.
// Deleting restocks each item back into inventory, unless the order was already
// cancelled (cancelling already restored its stock).
exports.deleteOrder = async (req, res) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid order ID");
		}
		const order = await Order.findOne({
			_id: req.params.id,
			market: req.marketId,
		});
		if (!order) return fail(res, 404, "Order not found");

		// Already soft-deleted — return success without restocking again.
		if (order.isActive === false) {
			return ok(res, order, "Order already deleted");
		}

		// Restock items back into the market's inventory. Skip when the order is
		// already cancelled, because cancelling an order already restored its stock
		// and restocking here would inflate it.
		if (order.status !== "cancelled") {
			for (const item of order.items || []) {
				if (item.product && item.quantity) {
					await Product.findOneAndUpdate(
						{ _id: item.product, market: req.marketId },
						{ $inc: { stock: item.quantity } },
					);
				}
			}
		}

		const update = { isActive: false };
		if (req.user && req.user.id) update.updatedBy = req.user.id;
		const deleted = await Order.findOneAndUpdate(
			{ _id: req.params.id, market: req.marketId },
			update,
			{ new: true },
		);
		ok(res, deleted, "Order deleted successfully");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.updateOrderStatus = async (req, res) => {
	try {
		const { status } = req.body;
		if (!status) return fail(res, 400, "status is required");
		const previous = await Order.findOne({ _id: req.params.id, market: req.marketId }).select("status");
		if (!previous) return fail(res, 404, "Order not found");
		const order = await Order.findOneAndUpdate(
			{ _id: req.params.id, market: req.marketId },
			{ status },
			{ new: true },
		);
		if (!order) return fail(res, 404, "Order not found");

		// Push-notify the customer whenever the status actually changed — this
		// is the market-scoped twin of orderController.updateOrderStatus, which
		// already does this for main-store orders. Without it, market orders
		// (e.g. status changes made from the scannn app or market dashboard)
		// never reached the customer's myMob app.
		if (status !== previous.status) {
			const { notifyCustomerOrderStatus } = require("../services/orderStatusNotification");
			notifyCustomerOrderStatus(order, status).catch((e) =>
				console.error("Market order status notification failed:", e),
			);
		}

		ok(res, order, "Status updated");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.cancelOrder = async (req, res) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid order ID");
		}
		const order = await Order.findOne({ _id: req.params.id, market: req.marketId });
		if (!order) return fail(res, 404, "Order not found");
		if (order.status === "cancelled") return fail(res, 400, "Order is already cancelled");
		if (order.status === "delivered") return fail(res, 400, "Delivered order cannot be cancelled");

		for (const item of order.items || []) {
			if (item.product && item.quantity) {
				await Product.findOneAndUpdate(
					{ _id: item.product, market: req.marketId },
					{ $inc: { stock: item.quantity } },
				);
			}
		}

		const reason = firstDefined(req.body.reason, req.body.notes);
		order.status = "cancelled";
		order.paymentStatus = "cancelled";
		order.notes = reason
			? `${order.notes || ""}\nCancellation reason: ${reason}`.trim()
			: order.notes;
		order.updatedBy = req.user && req.user._id;
		await order.save();

		const { notifyCustomerOrderStatus } = require("../services/orderStatusNotification");
		notifyCustomerOrderStatus(order, "cancelled").catch((e) =>
			console.error("Market order status notification failed:", e),
		);

		ok(res, order, "Order cancelled successfully");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.getCustomerOrderCounts = async (req, res) => {
	try {
		const orderCounts = await Order.aggregate([
			{ $match: { market: new mongoose.Types.ObjectId(req.marketId), isActive: true } },
			{ $group: { _id: "$customer.email", orderCount: { $sum: 1 } } },
			{ $project: { email: "$_id", orderCount: 1, _id: 0 } },
		]);
		ok(res, orderCounts);
	} catch (err) {
		handleErr(res, err);
	}
};

exports.getProductSalesStats = async (req, res) => {
	try {
		const page = Math.max(parseInt(req.query.page) || 1, 1);
		const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 200);
		const skip = (page - 1) * limit;
		const sortBy = req.query.sortBy || "totalQuantitySold";
		const sortOrder = String(req.query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
		const dateFilter = buildDateFilter(req.query);
		const matchStage = {
			market: new mongoose.Types.ObjectId(req.marketId),
			isActive: true,
			status: "delivered",
		};
		if (Object.keys(dateFilter).length > 0) matchStage.createdAt = dateFilter;

		const pipeline = [
			{ $match: matchStage },
			{ $unwind: "$items" },
			{
				$lookup: {
					from: "products",
					localField: "items.product",
					foreignField: "_id",
					as: "productDetails",
				},
			},
			{ $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
			{
				$group: {
					_id: "$items.product",
					productName: { $first: "$productDetails.name" },
					productBarcode: { $first: "$productDetails.barcode" },
					productPrice: { $first: "$productDetails.price" },
					productIsActive: { $first: "$productDetails.isActive" },
					totalQuantitySold: { $sum: "$items.quantity" },
					totalRevenue: {
						$sum: { $multiply: ["$items.totalPrice", "$items.quantity"] },
					},
					orderCount: { $sum: 1 },
					averageQuantityPerOrder: { $avg: "$items.quantity" },
					firstSaleDate: { $min: "$createdAt" },
					lastSaleDate: { $max: "$createdAt" },
				},
			},
			{
				$project: {
					productName: { $ifNull: ["$productName", "Unknown Product"] },
					productBarcode: { $ifNull: ["$productBarcode", "N/A"] },
					productPrice: 1,
					productIsActive: 1,
					totalQuantitySold: 1,
					totalRevenue: { $round: ["$totalRevenue", 2] },
					orderCount: 1,
					averageQuantityPerOrder: { $round: ["$averageQuantityPerOrder", 2] },
					firstSaleDate: 1,
					lastSaleDate: 1,
				},
			},
			{ $sort: { [sortBy]: sortOrder } },
		];

		const countResult = await Order.aggregate([...pipeline, { $count: "total" }]);
		const totalProducts = countResult[0] ? countResult[0].total : 0;
		const data = await Order.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]);
		const summaryResult = await Order.aggregate([
			{ $match: matchStage },
			{ $unwind: "$items" },
			{
				$group: {
					_id: null,
					totalRevenue: {
						$sum: { $multiply: ["$items.totalPrice", "$items.quantity"] },
					},
					totalQuantitySold: { $sum: "$items.quantity" },
					totalOrders: { $addToSet: "$_id" },
					uniqueProducts: { $addToSet: "$items.product" },
				},
			},
			{
				$project: {
					_id: 0,
					totalRevenue: { $round: ["$totalRevenue", 2] },
					totalQuantitySold: 1,
					totalOrders: { $size: "$totalOrders" },
					uniqueProducts: { $size: "$uniqueProducts" },
				},
			},
		]);

		const ras = {
			items: data,
			summary: summaryResult[0] || {
				totalRevenue: 0,
				totalQuantitySold: 0,
				totalOrders: 0,
				uniqueProducts: 0,
			},
			pagination: paginationMeta(page, limit, totalProducts),
			filters: {
				timeRange: req.query.timeRange || "custom",
				dateFrom: dateFilter.$gte || null,
				dateTo: dateFilter.$lte || null,
			},
		};
		sendResponse(res, 200, true, "Success", ras);
	} catch (err) {
		handleErr(res, err);
	}
};

exports.getUnsoldProducts = async (req, res) => {
	try {
		const page = Math.max(parseInt(req.query.page) || 1, 1);
		const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 200);
		const skip = (page - 1) * limit;
		const dateFilter = buildDateFilter(req.query);
		const marketId = new mongoose.Types.ObjectId(req.marketId);
		const matchStage = { market: marketId, isActive: true, status: "delivered" };
		if (Object.keys(dateFilter).length > 0) matchStage.createdAt = dateFilter;

		const soldProducts = await Order.aggregate([
			{ $match: matchStage },
			{ $unwind: "$items" },
			{ $group: { _id: "$items.product" } },
		]);
		const soldProductIds = soldProducts.map((item) => item._id).filter(Boolean);
		const filter = { market: req.marketId, isActive: true };
		if (soldProductIds.length > 0) filter._id = { $nin: soldProductIds };

		const [totalProducts, products] = await Promise.all([
			Product.countDocuments(filter),
			Product.find(filter)
				.select("name barcode stock price isActive createdAt subcategory category")
				.sort({ stock: -1, name: 1 })
				.skip(skip)
				.limit(limit)
				.lean(),
		]);
		const subcategoryIds = products.map((product) => product.subcategory).filter(Boolean);
		const subcategories = await MarketSubcategory.find({
			_id: { $in: subcategoryIds },
			market: req.marketId,
		})
			.populate({ path: "category", select: "name" })
			.lean();
		const subcategoryMap = new Map(
			subcategories.map((subcategory) => [String(subcategory._id), subcategory]),
		);
		const data = products.map((product) => {
			const subcategory = subcategoryMap.get(String(product.subcategory));
			return {
				...product,
				categoryName:
					subcategory && subcategory.category ? subcategory.category.name : "N/A",
			};
		});

		const ras = {
			items: data,
			pagination: paginationMeta(page, limit, totalProducts),
			filters: {
				timeRange: req.query.timeRange || "custom",
				dateFrom: dateFilter.$gte || null,
				dateTo: dateFilter.$lte || null,
			},
		};
		sendResponse(res, 200, true, "Success", ras);
	} catch (err) {
		handleErr(res, err);
	}
};

// ───────────────────────── sales statistics ─────────────────────────
exports.getStatistics = async (req, res) => {
	try {
		const marketId = new mongoose.Types.ObjectId(req.marketId);
		const range = req.query.range || "30d";
		const since = new Date();
		if (range === "7d") since.setDate(since.getDate() - 7);
		else if (range === "90d") since.setDate(since.getDate() - 90);
		else if (range === "365d") since.setDate(since.getDate() - 365);
		else since.setDate(since.getDate() - 30);

		const [overall, byDay, byStatus, topProducts] = await Promise.all([
			Order.aggregate([
				{ $match: { market: marketId, createdAt: { $gte: since } } },
				{
					$group: {
						_id: null,
						orders: { $sum: 1 },
						revenue: { $sum: { $ifNull: ["$total", 0] } },
						avg: { $avg: { $ifNull: ["$total", 0] } },
					},
				},
			]),
			Order.aggregate([
				{ $match: { market: marketId, createdAt: { $gte: since } } },
				{
					$group: {
						_id: {
							$dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
						},
						orders: { $sum: 1 },
						revenue: { $sum: { $ifNull: ["$total", 0] } },
					},
				},
				{ $sort: { _id: 1 } },
			]),
			Order.aggregate([
				{ $match: { market: marketId, createdAt: { $gte: since } } },
				{ $group: { _id: "$status", count: { $sum: 1 } } },
			]),
			Order.aggregate([
				{ $match: { market: marketId, createdAt: { $gte: since } } },
				{ $unwind: { path: "$items", preserveNullAndEmptyArrays: false } },
				{
					$group: {
						_id: "$items.product",
						name: { $first: "$items.name" },
						quantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
						revenue: {
							$sum: {
								$multiply: [
									{ $ifNull: ["$items.quantity", 0] },
									{ $ifNull: ["$items.price", 0] },
								],
							},
						},
					},
				},
				{ $sort: { revenue: -1 } },
				{ $limit: 10 },
			]),
		]);

		ok(res, {
			range,
			overall: overall[0] || { orders: 0, revenue: 0, avg: 0 },
			byDay,
			byStatus,
			topProducts,
		});
	} catch (err) {
		handleErr(res, err);
	}
};

exports.getCategoryProductCount = async (req, res) => {
	try {
		const category = await MarketCategory.findOne({
			_id: req.params.id,
			market: req.marketId,
		});
		if (!category) return fail(res, 404, "Category not found");

		const subcategoryIds = await MarketSubcategory.find({
			market: req.marketId,
			category: category._id,
			isActive: true,
		}).distinct("_id");

		const productCount = await Product.countDocuments({
			market: req.marketId,
			subcategory: { $in: subcategoryIds },
			isActive: true,
		});

		ok(res, {
			categoryId: category._id,
			categoryName: category.name,
			productCount,
		});
	} catch (err) {
		handleErr(res, err);
	}
};

exports.getAllCategoryProductCounts = async (req, res) => {
	try {
		const counts = await MarketCategory.aggregate([
			{ $match: { market: req.marketId, isActive: true } },
			{
				$lookup: {
					from: "marketsubcategories",
					let: { categoryId: "$_id", marketId: "$market" },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $eq: ["$category", "$$categoryId"] },
										{ $eq: ["$market", "$$marketId"] },
										{ $eq: ["$isActive", true] },
									],
								},
							},
						},
						{ $project: { _id: 1 } },
					],
					as: "subcategories",
				},
			},
			{
				$lookup: {
					from: "products",
					let: { subcategoryIds: "$subcategories._id", marketId: "$market" },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $eq: ["$market", "$$marketId"] },
										{ $in: ["$subcategory", "$$subcategoryIds"] },
										{ $eq: ["$isActive", true] },
									],
								},
							},
						},
						{ $count: "count" },
					],
					as: "productCountResult",
				},
			},
			{
				$project: {
					categoryId: "$_id",
					categoryName: "$name",
					productCount: {
						$ifNull: [{ $arrayElemAt: ["$productCountResult.count", 0] }, 0],
					},
				},
			},
			{ $sort: { categoryName: 1 } },
		]);

		ok(res, counts);
	} catch (err) {
		handleErr(res, err);
	}
};

// ───────────────────────── riders ─────────────────────────
// IMPORTANT: market riders are stored in the global `Rider` collection
// (with `market` set to req.marketId) — NOT in a separate MarketRider
// collection. This guarantees a single source of truth so the main admin
// rider page and the market admin rider page show exactly the same record
// with all fields (zones, vehicleNumber, status, etc.).
const Rider = require("../models/Rider");

// Build a frontend-friendly rider object that works for both the market
// admin table renderer and the main admin table renderer.
const serializeRider = (rider) => {
	if (!rider) return rider;
	const obj = typeof rider.toObject === "function" ? rider.toObject() : { ...rider };
	const user = obj.user && typeof obj.user === "object" ? obj.user : null;
	if (user) {
		obj.userInfo = {
			name: user.name,
			email: user.email,
			phoneNumber: user.phoneNumber,
		};
		obj.name = user.name;
		obj.email = user.email;
		obj.phoneNumber = user.phoneNumber;
	}
	// Convenience aliases used by some frontends
	if (obj.vehicleNumber !== undefined) obj.vehiclePlate = obj.vehicleNumber;
	if (Array.isArray(obj.zones) && obj.zones.length) obj.zone = obj.zones[0];
	return obj;
};

exports.riders = {
	list: async (req, res) => {
		try {
			const { page, limit, skip } = paginate(req.query);
			const search = (req.query.search || "").trim();
			const filter = { market: req.marketId };
			if (req.query.isActive && req.query.isActive !== "all") {
				filter.isActive = req.query.isActive === "true";
			}
			if (req.query.status) filter.status = req.query.status;
			if (req.query.vehicleType) filter.vehicleType = req.query.vehicleType;
			if (req.query.zone) filter.zones = req.query.zone;

			let q = Rider.find(filter)
				.populate("user", "name email phoneNumber")
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit);

			let [items, total] = await Promise.all([
				q.exec(),
				Rider.countDocuments(filter),
			]);

			let data = items.map(serializeRider);
			if (search) {
				const re = new RegExp(escapeRegex(search), "i");
				data = data.filter(
					(r) =>
						re.test(r.name || "") ||
						re.test(r.email || "") ||
						re.test(r.phoneNumber || "") ||
						re.test(r.vehicleNumber || "") ||
						(Array.isArray(r.zones) && r.zones.some((z) => re.test(z))),
				);
			}

			const ras = { items: data, meta: { total, page, limit } };
			sendResponse(res, 200, true, "OK", ras);
		} catch (err) {
			handleErr(res, err);
		}
	},

	get: async (req, res) => {
		try {
			const rider = await Rider.findOne({
				_id: req.params.id,
				market: req.marketId,
			}).populate("user", "name email phoneNumber");
			if (!rider) return fail(res, 404, "Rider not found");
			ok(res, serializeRider(rider));
		} catch (err) {
			handleErr(res, err);
		}
	},

	create: async (req, res) => {
		try {
			const body = req.body || {};
			const userId = body.userId || body.user;
			if (!userId) {
				return fail(
					res,
					400,
					"userId is required — pick an existing market driver user",
				);
			}

			// Make sure the user exists and belongs to this market with the right role.
			const user = await User.findOne({
				_id: userId,
				market: req.marketId,
				role: { $in: ["market_driver", "rider"] },
			}).select("_id name email phoneNumber role");
			if (!user) {
				return fail(
					res,
					400,
					"Selected user is not a market driver of this market",
				);
			}

			// Find-or-update: never create a duplicate Rider for the same user.
			const existing = await Rider.findOne({ user: user._id });

			const zones =
				Array.isArray(body.zones) && body.zones.length
					? body.zones
					: body.zone
						? [body.zone]
						: undefined;

			const patch = {
				market: req.marketId,
				...(body.vehicleType !== undefined && {
					vehicleType: body.vehicleType,
				}),
				...((body.vehicleNumber !== undefined ||
					body.vehiclePlate !== undefined) && {
					vehicleNumber: body.vehicleNumber || body.vehiclePlate,
				}),
				...(zones !== undefined && { zones }),
				...(body.status !== undefined && { status: body.status }),
				...(body.isActive !== undefined && { isActive: body.isActive }),
				...(body.isVerified !== undefined && { isVerified: body.isVerified }),
				...(body.workingHours !== undefined && {
					workingHours: body.workingHours,
				}),
			};

			let rider;
			if (existing) {
				Object.assign(existing, patch);
				await existing.save();
				rider = existing;
			} else {
				rider = await Rider.create({
					user: user._id,
					zones:
						zones && zones.length
							? zones
							: await defaultMarketZones(req.marketId),
					vehicleType: patch.vehicleType || "motorbike",
					vehicleNumber: patch.vehicleNumber,
					status: patch.status || "available",
					isActive: patch.isActive !== false,
					isVerified: patch.isVerified !== false,
					market: req.marketId,
					workingHours: patch.workingHours,
				});
			}

			await rider.populate("user", "name email phoneNumber");
			created(res, serializeRider(rider), existing ? "Rider updated" : "Rider created");
		} catch (err) {
			handleErr(res, err);
		}
	},

	update: async (req, res) => {
		try {
			const body = req.body || {};
			const zones =
				Array.isArray(body.zones) && body.zones.length
					? body.zones
					: body.zone
						? [body.zone]
						: undefined;
			const patch = {
				...(body.vehicleType !== undefined && {
					vehicleType: body.vehicleType,
				}),
				...((body.vehicleNumber !== undefined ||
					body.vehiclePlate !== undefined) && {
					vehicleNumber: body.vehicleNumber || body.vehiclePlate,
				}),
				...(zones !== undefined && { zones }),
				...(body.status !== undefined && { status: body.status }),
				...(body.isActive !== undefined && { isActive: body.isActive }),
				...(body.isVerified !== undefined && { isVerified: body.isVerified }),
				...(body.workingHours !== undefined && {
					workingHours: body.workingHours,
				}),
			};

			const rider = await Rider.findOneAndUpdate(
				{ _id: req.params.id, market: req.marketId },
				patch,
				{ new: true, runValidators: true },
			).populate("user", "name email phoneNumber");
			if (!rider) return fail(res, 404, "Rider not found");
			ok(res, serializeRider(rider), "Rider updated");
		} catch (err) {
			handleErr(res, err);
		}
	},

	remove: async (req, res) => {
		try {
			const rider = await Rider.findOneAndDelete({
				_id: req.params.id,
				market: req.marketId,
			});
			if (!rider) return fail(res, 404, "Rider not found");
			ok(res, { id: rider._id }, "Deleted");
		} catch (err) {
			handleErr(res, err);
		}
	},
};

exports.updateRiderStatus = async (req, res) => {
	try {
		const { status } = req.body;
		if (!status) return fail(res, 400, "status is required");
		// Map UI status values to Rider model fields.
		const statusUpdate = {
			available: { status: "available", isActive: true },
			busy: { status: "busy", isActive: true },
			offline: { status: "offline" },
			"on-break": { status: "on-break" },
			inactive: { status: "offline", isActive: false },
		};
		const update = statusUpdate[status];
		if (!update) return fail(res, 400, "Invalid rider status");

		const rider = await Rider.findOneAndUpdate(
			{ _id: req.params.id, market: req.marketId },
			update,
			{ new: true, runValidators: true },
		).populate("user", "name email phoneNumber");
		if (!rider) return fail(res, 404, "Rider not found");
		ok(res, serializeRider(rider), "Rider status updated");
	} catch (err) {
		handleErr(res, err);
	}
};

// ───────────────────────── waste ─────────────────────────
exports.waste = crud(
	MarketWaste,
	[
		"productName",
		"barcode",
		"product",
		"quantity",
		"unit",
		"reason",
		"costValue",
		"notes",
		"recordedAt",
		"recordedBy",
		"recordedByModel",
		"recordedByName",
	],
	{
		searchFields: ["productName", "barcode"],
		defaultSort: { recordedAt: -1 },
		normalize: normalizeWastePayload,
		populate: [{ path: "recordedBy", select: "name email" }],
		// Recording waste consumes stock; editing applies only the difference;
		// deleting a record puts the quantity back (restock).
		afterCreate: async (item, req) => {
			await adjustProductStock(item.product, req.marketId, -item.quantity);
		},
		afterUpdate: async (item, req, prev) => {
			// Undo the previous deduction first, then apply the new one. This
			// correctly handles quantity changes and switching the product.
			if (prev && prev.product) {
				await adjustProductStock(prev.product, req.marketId, prev.quantity);
			}
			await adjustProductStock(item.product, req.marketId, -item.quantity);
		},
		afterRemove: async (item, req) => {
			await adjustProductStock(item.product, req.marketId, item.quantity);
		},
	},
);

exports.getWasteSummary = async (req, res) => {
	try {
		const marketId = new mongoose.Types.ObjectId(req.marketId);
		const summary = await MarketWaste.aggregate([
			{ $match: { market: marketId } },
			{
				$group: {
					_id: "$reason",
					quantity: { $sum: "$quantity" },
					cost: { $sum: "$costValue" },
					count: { $sum: 1 },
				},
			},
		]);
		const total = summary.reduce(
			(acc, r) => {
				acc.quantity += r.quantity;
				acc.cost += r.cost;
				acc.count += r.count;
				return acc;
			},
			{ quantity: 0, cost: 0, count: 0 },
		);
		ok(res, { summary, total });
	} catch (err) {
		handleErr(res, err);
	}
};

// Look up a single product by barcode within the requester's market.
// Used by the waste-management screen to auto-fill the product details
// (name, price, category, stock) when a barcode is entered.
exports.getWasteProductByBarcode = async (req, res) => {
	try {
		const barcode = String(req.params.barcode || "").trim();
		if (!barcode) return fail(res, 400, "Barcode is required");
		const product = await Product.findOne({
			barcode,
			market: req.marketId,
			isActive: true,
		})
			.populate("category", "name")
			.populate({
				path: "subcategory",
				select: "name parentCategory",
				populate: { path: "parentCategory", select: "name" },
			})
			.lean();
		if (!product) {
			return fail(res, 404, "Product not found with this barcode");
		}
		// Market-owned products' `category`/`subcategory` ObjectIds usually
		// point into the tenant-scoped MarketCategory/MarketSubcategory
		// collections, NOT the global Category/Subcategory collections used
		// by the .populate() calls above — so for those products both
		// populates above resolve to null even though the ids are valid.
		// resolveMarketSubcategories (shared with productController.getProduct)
		// re-reads the raw ids and looks them up in the Market* collections
		// instead, backfilling both `subcategory` and `category` in place.
		// Without this, the scannn app's Edit Product category dropdown
		// never had a real match (categoryId came back undefined) even
		// though the category *name* still showed correctly.
		const { resolveMarketSubcategories } = require("./productController");
		await resolveMarketSubcategories([product]);
		// NOTE: keep `category` as the populated { _id, name } object here —
		// do NOT flatten it to a bare name string. The Edit Product screen
		// (scannn app) needs the `_id` to preselect the category dropdown by
		// id (see extractRefId in scannn/app1/app/_lib/services/api.ts);
		// flattening to a name-only string previously made extractRefId()
		// return undefined, so the category dropdown never showed a default
		// selection even though the category *name* displayed correctly.
		ok(res, product);
	} catch (err) {
		handleErr(res, err);
	}
};

// ───────────────────────── promo codes ─────────────────────────
exports.promoCodes = crud(
	MarketPromoCode,
	[
		"companyName",
		"code",
		"description",
		"discountType",
		"discountValue",
		"isFromOwnCompany",
		"triggerCondition",
		"minOrderTotal",
		"emailSubject",
		"emailMessage",
		"usageLimit",
		"startsAt",
		"expiresAt",
		"isActive",
	],
	{ searchFields: ["code", "description"], normalize: normalizePromoCodePayload },
);

// ───────────────────────── announcements ─────────────────────────
exports.announcements = crud(
	MarketAnnouncement,
	[
		"title",
		"message",
		"audience",
		"image",
		"startsAt",
		"expiresAt",
		"isActive",
	],
	{
		searchFields: ["title", "message"],
		defaultSort: { startsAt: -1 },
		normalize: normalizeAnnouncementPayload,
		transform: serializeAnnouncement,
	},
);

// ───────────────────────── settings ─────────────────────────
exports.getSettings = async (req, res) => {
	try {
		let s = await MarketSetting.findOne({ market: req.marketId });
		if (!s) {
			s = await MarketSetting.create({ market: req.marketId });
		}
		ok(res, s);
	} catch (err) {
		handleErr(res, err);
	}
};

exports.updateSettings = async (req, res) => {
	try {
		const allowed = [
			"businessHours",
			"deliveryFee",
			"minOrderAmount",
			"freeDeliveryThreshold",
			"taxRate",
			"currency",
			"acceptingOrders",
			"notes",
			"extras",
		];
		const data = {};
		allowed.forEach((f) => {
			if (req.body[f] !== undefined) data[f] = req.body[f];
		});
		const s = await MarketSetting.findOneAndUpdate(
			{ market: req.marketId },
			data,
			{ new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
		);
		ok(res, s, "Settings updated");
	} catch (err) {
		handleErr(res, err);
	}
};

// ───────────────────────── notifications ─────────────────────────
// Broadcast a push notification to every customer who has ordered from THIS
// market at least once. Deliberately scoped this way (rather than reusing
// the admin-only /api/notifications/send/all) so a market can't blast every
// customer in the whole app — see NotificationService.sendToMarketCustomers.
exports.sendNotificationToMarketCustomers = async (req, res) => {
	try {
		const { title, body } = req.body;
		if (!title || !body) {
			return fail(res, 400, "title and body are required");
		}
		const NotificationService = require("../services/notifications");
		const result = await NotificationService.sendToMarketCustomers(
			req.marketId,
			title,
			body,
		);
		ok(res, result, `Notifications sent to ${result.totalSent} customers`);
	} catch (err) {
		handleErr(res, err);
	}
};

// ───────────────────────── profile (Market doc) ─────────────────────────
exports.getProfile = async (req, res) => {
	try {
		// Never let a browser/CDN cache this — a market owner who just saved new
		// delivery-coverage pins must always see the true current DB state on
		// their very next load/refresh, not a stale cached response.
		res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
		const market = await Market.findById(req.marketId);
		if (!market) return fail(res, 404, "Market not found");
		ok(res, market.toSafeObject());
	} catch (err) {
		handleErr(res, err);
	}
};

// Normalise the multi-pin "deliveryRegions" payload (JSON string via the
// dashboard's Edit Profile form, or already an array). Mirrors the same
// validation used on the main admin's Create/Edit Market page so a market
// owner can self-service the exact same pin+radius coverage.
const parseDeliveryRegionsForProfile = (regions) => {
	let arr = regions;
	if (typeof regions === "string") {
		try {
			arr = JSON.parse(regions);
		} catch (error) {
			return [];
		}
	}
	if (!Array.isArray(arr)) return [];
	return arr
		.map((r) => ({
			latitude: Number(r && r.latitude),
			longitude: Number(r && r.longitude),
			radiusKm: Number(r && r.radiusKm),
		}))
		.filter(
			(r) =>
				Number.isFinite(r.latitude) &&
				Number.isFinite(r.longitude) &&
				Number.isFinite(r.radiusKm) &&
				r.radiusKm > 0
		)
		.slice(0, 30);
};

exports.updateProfile = async (req, res) => {
	try {
		res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
		// Owner-only fields. Staff cannot edit profile.
		if (!req.isMarketOwner) {
			return fail(res, 403, "Only the market owner can update the profile");
		}
		const allowed = ["name", "email", "phoneNumber", "location", "logo", "logoPublicId", "cities", "deliveryZones", "deliveryRegions"];
		const data = {};
		allowed.forEach((f) => {
			if (req.body[f] !== undefined) data[f] = req.body[f];
		});
		if (data.cities !== undefined) {
			data.cities = Array.isArray(data.cities)
				? [
						...new Set(
							data.cities
								.filter((c) => typeof c === "string")
								.map((c) => c.trim())
								.filter(Boolean)
						),
				  ].slice(0, 60)
				: [];
		}
		if (data.deliveryZones !== undefined) {
			data.deliveryZones = Array.isArray(data.deliveryZones)
				? [
						...new Set(
							data.deliveryZones
								.filter((z) => typeof z === "string")
								.map((z) => z.trim())
								.filter(Boolean)
						),
				  ].slice(0, 60)
				: [];
		}
		if (data.deliveryRegions !== undefined) {
			data.deliveryRegions = parseDeliveryRegionsForProfile(data.deliveryRegions);
		}
		const market = await Market.findByIdAndUpdate(req.marketId, data, {
			new: true,
			runValidators: true,
		});
		if (!market) return fail(res, 404, "Market not found");
		ok(res, market.toSafeObject(), "Profile updated");
	} catch (err) {
		handleErr(res, err);
	}
};

// @desc    Market admin: upload a new logo/profile image to Cloudinary
// @route   POST /api/market-admin/profile/logo
// @access  Market owner only
exports.uploadLogoMiddleware = logoUpload.single("logo");
exports.uploadLogo = async (req, res) => {
	try {
		if (!req.isMarketOwner) {
			return fail(res, 403, "Only the market owner can update the profile");
		}
		if (!req.file) {
			return fail(res, 400, "No image file provided");
		}
		const uploadResult = await uploadLogoToCloudinary(req.file.buffer);

		const previous = await Market.findById(req.marketId).select("logoPublicId");
		const oldPublicId = previous && previous.logoPublicId;

		const market = await Market.findByIdAndUpdate(
			req.marketId,
			{ logo: uploadResult.url, logoPublicId: uploadResult.public_id },
			{ new: true, runValidators: true }
		);
		if (!market) return fail(res, 404, "Market not found");

		if (oldPublicId && oldPublicId !== uploadResult.public_id) {
			cloudinary.uploader.destroy(oldPublicId, () => {});
		}

		ok(res, market.toSafeObject(), "Logo updated");
	} catch (err) {
		handleErr(res, err);
	}
};

exports.changeProfilePassword = async (req, res) => {
	try {
		if (!req.isMarketOwner) {
			return fail(res, 403, "Only the market owner can change password");
		}
		const { currentPassword, newPassword } = req.body;
		if (!currentPassword || !newPassword || newPassword.length < 6) {
			return fail(res, 400, "currentPassword and newPassword (min 6) required");
		}
		const market = await Market.findById(req.marketId).select("+password");
		if (!market) return fail(res, 404, "Market not found");
		const isMatch = await market.comparePassword(currentPassword);
		if (!isMatch) return fail(res, 400, "Current password is incorrect");
		market.password = newPassword;
		await market.save();
		ok(res, { id: market._id }, "Password changed");
	} catch (err) {
		handleErr(res, err);
	}
};

// ───────────────────────── /me convenience ─────────────────────────
exports.me = async (req, res) => {
	try {
		const market = await Market.findById(req.marketId);
		if (!market) return fail(res, 404, "Market not found");
		ok(res, {
			market: market.toSafeObject(),
			role: req.isMarketOwner ? "market" : "market_staff",
			user: req.isMarketOwner
				? null
				: {
						id: req.user.id,
						name: req.user.name,
						email: req.user.email,
						role: req.user.role,
					},
		});
	} catch (err) {
		handleErr(res, err);
	}
};
