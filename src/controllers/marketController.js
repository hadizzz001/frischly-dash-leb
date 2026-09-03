const Market = require("../models/Market");
const Product = require("../models/Product");
const Order = require("../models/Order");
const mongoose = require("mongoose");
const { sendResponse, sendError, sendSuccess, sendServerError } = require("../utils/apiResponse");
const {
	generateToken,
	generateRefreshToken,
} = require("../utils/jwt");
const {
	findDuplicateAccount,
	duplicateAccountMessage,
} = require("../utils/accountDuplicates");
const { pointInAnyRegion } = require("../utils/geo");
const { escapeRegex } = require("../utils/sanitize");
const {
	imageUpload: upload,
	uploadLogoToCloudinary: uploadLogoToCloudinaryShared,
	deleteFromCloudinary,
} = require("../utils/cloudinaryUpload");

// Cloudinary is configured centrally in ../utils/cloudinaryUpload.
const uploadLogoToCloudinary = (buffer) =>
	uploadLogoToCloudinaryShared(buffer, "market-logos");

const deleteLogoFromCloudinary = (publicId) => {
	if (!publicId) return Promise.resolve();
	return deleteFromCloudinary(publicId);
};

const parseLocation = (location) => {
	if (!location) return location;
	if (typeof location !== "string") {
		return { city: location.city || "" };
	}
	try {
		const parsedLocation = JSON.parse(location);
		return { city: parsedLocation.city || "" };
	} catch (error) {
		return undefined;
	}
};

// Normalise the multi-select "cities" payload. Accepts a JSON string (sent via
// multipart FormData), a comma-separated string, or an array. Trims, drops
// blanks, de-duplicates and caps the list.
const parseCities = (cities) => {
	let arr = cities;
	if (typeof cities === "string") {
		try {
			arr = JSON.parse(cities);
		} catch (error) {
			arr = cities.split(",");
		}
	}
	if (!Array.isArray(arr)) return [];
	return [
		...new Set(
			arr
				.filter((c) => typeof c === "string")
				.map((c) => c.trim())
				.filter(Boolean)
		),
	].slice(0, 60);
};

// Normalise the multi-pin "deliveryRegions" payload (JSON string via
// multipart FormData, or already an array). Each entry must have numeric
// latitude/longitude/radiusKm; invalid entries are dropped.
const parseDeliveryRegions = (regions) => {
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

// Commission rate helpers — the rate is a percent (2 = 2%) stored per market.
const {
	parseCommissionRate,
	MAX_COMMISSION_RATE,
} = require("../utils/commission");

const COMMISSION_RATE_ERROR = `Commission rate must be a number between 0 and ${MAX_COMMISSION_RATE}`;

const buildMarketDuplicateQuery = ({ name, username, email }, excludeId) => {
	const conditions = [];
	if (name) conditions.push({ name: String(name).trim() });
	if (username) conditions.push({ username: String(username).toLowerCase().trim() });
	if (email) conditions.push({ email: String(email).toLowerCase().trim() });

	if (!conditions.length) return null;

	const query = { $or: conditions };
	if (excludeId) query._id = { $ne: excludeId };
	return query;
};

const duplicateMarketMessage = (existingMarket, { name, username, email }) => {
	if (name && existingMarket.name === String(name).trim()) {
		return "A market with this name already exists";
	}
	if (
		username &&
		existingMarket.username === String(username).toLowerCase().trim()
	) {
		return "A market with this username already exists";
	}
	if (email && existingMarket.email === String(email).toLowerCase().trim()) {
		return "A market with this email already exists";
	}
	return "A market with this name, username, or email already exists";
};

const marketErrorResponse = (error, fallbackMessage) => {
	if (error.name === "ValidationError") {
		const messages = Object.values(error.errors).map(
			(validationError) => validationError.message,
		);
		return {
			message: messages.join(", "),
			errors: messages,
		};
	}

	if (error.code === 11000) {
		const duplicateFields = Object.keys(error.keyValue || {});
		return {
			message: duplicateFields.length
				? `Duplicate market ${duplicateFields.join(", ")}: ${duplicateFields.map((field) => error.keyValue[field]).join(", ")}`
				: "Market name, username, or email already exists",
		};
	}

	return {
		message: error.message || fallbackMessage,
	};
};

// @desc    Admin: create new market with credentials
// @route   POST /api/markets
// @access  Private (admin)
exports.createMarket = async (req, res) => {
	try {
		const {
			name,
			username,
			password,
			email,
			phoneNumber,
			location: rawLocation,
			cities: rawCities,
			deliveryRegions: rawDeliveryRegions,
			commissionRate: rawCommissionRate,
			logo,
		} = req.body;

		const missingFields = [];
		if (!String(name || "").trim()) missingFields.push("market name");
		if (!String(username || "").trim()) missingFields.push("username");
		if (!String(password || "").trim()) missingFields.push("password");

		if (missingFields.length) {
			return sendError(res, 400, `Missing required field${missingFields.length > 1 ? "s" : ""}: ${missingFields.join(", ")}`);
		}

		const duplicate = await findDuplicateAccount({ name, username, email });
		if (duplicate) {
			return sendError(res, 400, duplicateAccountMessage(duplicate));
		}

		// Commission is optional on create — omitting it leaves the schema
		// default in place, but a value that was sent and is unusable is an error
		// rather than something to silently discard.
		const commissionRate = parseCommissionRate(rawCommissionRate);
		if (
			rawCommissionRate !== undefined &&
			rawCommissionRate !== "" &&
			commissionRate === null
		) {
			return sendError(res, 400, COMMISSION_RATE_ERROR);
		}

		const cities = parseCities(rawCities);
		const location = parseLocation(rawLocation) || {};
		// Keep a single representative city in location.city for legacy displays
		// and search; default it to the first selected city when not provided.
		if (!location.city && cities.length) location.city = cities[0];

		const marketData = {
			name: String(name).trim(),
			username: String(username).toLowerCase().trim(),
			password,
			email: email ? String(email).toLowerCase().trim() : undefined,
			phoneNumber,
			location,
			cities,
			deliveryRegions: parseDeliveryRegions(rawDeliveryRegions),
			...(commissionRate === null ? {} : { commissionRate }),
			logo,
			createdBy: req.user ? req.user.id : undefined,
		};

		if (req.file) {
			try {
				const uploadResult = await uploadLogoToCloudinary(req.file.buffer);
				marketData.logo = uploadResult.url;
				marketData.logoPublicId = uploadResult.public_id;
			} catch (uploadError) {
				console.error("Error uploading market logo:", uploadError);
				return sendServerError(res, uploadError, "Error uploading market logo");
			}
		}

		const market = await Market.create(marketData);

		const ras = { market: market.toSafeObject() };
		sendResponse(res, 201, true, "Market created successfully", ras);
	} catch (error) {
		console.error("Create market error:", error);
		const errorResponse = marketErrorResponse(error, "Error creating market");
		const ras = { errors: errorResponse.errors };
		sendResponse(res, 400, false, errorResponse.message, ras);
	}
};

// @desc    Admin: list all markets
// @route   GET /api/markets
// @access  Private (admin)
exports.getMarkets = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 20,
			search,
			isActive = "all",
			sortBy = "createdAt",
			sortOrder = "desc",
		} = req.query;

		const filter = {};
		if (isActive !== "all") filter.isActive = isActive === "true";
		if (search) {
			filter.$or = [
				{ name: { $regex: search, $options: "i" } },
				{ username: { $regex: search, $options: "i" } },
				{ "location.city": { $regex: search, $options: "i" } },
			];
		}

		const pageNum = parseInt(page);
		const limitNum = parseInt(limit);
		const skip = (pageNum - 1) * limitNum;

		const sort = {};
		sort[sortBy] = sortOrder === "desc" ? -1 : 1;

		const [markets, total] = await Promise.all([
			Market.find(filter)
				.populate("totalItems")
				.populate("createdBy", "name email")
				.sort(sort)
				.skip(skip)
				.limit(limitNum),
			Market.countDocuments(filter),
		]);

		// The totalSales/totalOrders fields on the Market document are denormalized
		// and not kept in sync, so compute the real values from the Order collection
		// for the markets on this page in a single aggregation.
		const marketIds = markets.map((m) => m._id);
		const statsAgg = marketIds.length
			? await Order.aggregate([
					{ $match: { market: { $in: marketIds }, isActive: true } },
					{
						$group: {
							_id: "$market",
							totalOrders: { $sum: 1 },
							totalSales: { $sum: "$total" },
						},
					},
				])
			: [];
		const statsByMarket = new Map(
			statsAgg.map((s) => [String(s._id), s]),
		);
		markets.forEach((m) => {
			const s = statsByMarket.get(String(m._id));
			m.totalOrders = s ? s.totalOrders : 0;
			m.totalSales = s ? s.totalSales : 0;
		});

		const ras = {
			markets,
			pagination: {
				currentPage: pageNum,
				totalPages: Math.ceil(total / limitNum),
				totalMarkets: total,
				hasNextPage: pageNum * limitNum < total,
				hasPrevPage: pageNum > 1,
			},
		};
		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Get markets error:", error);
		sendServerError(res, error, "Error fetching markets");
	}
};

// @desc    Get a single market
// @route   GET /api/markets/:id
// @access  Private (admin or the market itself)
exports.getMarket = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid market ID");
		}

		// Market admins can only view themselves
		if (
			req.user.role === "market" &&
			String(req.user.marketId) !== String(id)
		) {
			return sendError(res, 403, "Not authorized");
		}

		const market = await Market.findById(id)
			.populate("totalItems")
			.populate("createdBy", "name email");

		if (!market) {
			return sendError(res, 404, "Market not found");
		}

		const ras = { market };
		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Get market error:", error);
		sendServerError(res, error, "Error fetching market");
	}
};

// @desc    Update market (admin can update everything; market admin a subset)
// @route   PUT /api/markets/:id
// @access  Private (admin) / market (self – limited fields)
exports.updateMarket = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid market ID");
		}

		const market = await Market.findById(id).select("+password");
		if (!market) {
			return sendError(res, 404, "Market not found");
		}

		const isAdmin = ["admin", "manager"].includes(req.user.role);
		const isSelf =
			req.user.role === "market" &&
			String(req.user.marketId) === String(id);

		if (!isAdmin && !isSelf) {
			return sendError(res, 403, "Not authorized");
		}

		const updatable = isAdmin
			? [
					"name",
					"username",
					"email",
					"phoneNumber",
					"location",
					"cities",
					"deliveryRegions",
					"commissionRate",
					"logo",
					"logoPublicId",
					"isActive",
				]
			: ["email", "phoneNumber", "location", "cities", "logo"];

		if (typeof req.body.location === "string") {
			req.body.location = parseLocation(req.body.location);
		}
		if (req.body.cities !== undefined) {
			req.body.cities = parseCities(req.body.cities);
		}
		if (req.body.deliveryRegions !== undefined) {
			req.body.deliveryRegions = parseDeliveryRegions(req.body.deliveryRegions);
		}
		// Only an admin can change a market's commission; for anyone else the
		// field is not in `updatable` and is dropped, so it is not validated here
		// either (rejecting a value that would be ignored anyway helps nobody).
		if (isAdmin && req.body.commissionRate !== undefined) {
			const parsedRate = parseCommissionRate(req.body.commissionRate);
			if (parsedRate === null) {
				return sendError(res, 400, COMMISSION_RATE_ERROR);
			}
			req.body.commissionRate = parsedRate;
		}

		const duplicate = await findDuplicateAccount(
			{
				name: req.body.name,
				username: req.body.username,
				email: req.body.email,
			},
			{ type: "market", id },
		);
		if (duplicate) {
			return sendError(res, 400, duplicateAccountMessage(duplicate));
		}

		updatable.forEach((field) => {
			if (req.body[field] !== undefined) {
				if (field === "username") {
					market.username = String(req.body.username).toLowerCase().trim();
				} else if (field === "email") {
					market.email = req.body.email
						? String(req.body.email).toLowerCase().trim()
						: undefined;
				} else {
					market[field] = req.body[field];
				}
			}
		});

		// Keep the legacy single-city field aligned with the multi-select.
		if (Array.isArray(req.body.cities) && req.body.cities.length) {
			if (!market.location) market.location = {};
			if (!market.location.city) market.location.city = req.body.cities[0];
		}

		if (req.file) {
			try {
				const uploadResult = await uploadLogoToCloudinary(req.file.buffer);
				if (market.logoPublicId) {
					await deleteLogoFromCloudinary(market.logoPublicId);
				}
				market.logo = uploadResult.url;
				market.logoPublicId = uploadResult.public_id;
			} catch (uploadError) {
				console.error("Error uploading market logo:", uploadError);
				return sendServerError(res, uploadError, "Error uploading market logo");
			}
		}

		// Password change (admin can reset, market admin must supply current)
		if (req.body.password) {
			if (isSelf) {
				if (!req.body.currentPassword) {
					return sendError(res, 400, "Current password is required");
				}
				const ok = await market.comparePassword(req.body.currentPassword);
				if (!ok) {
					return sendError(res, 401, "Current password is incorrect");
				}
			}
			market.password = req.body.password;
		}

		await market.save();

		const ras = { market: market.toSafeObject() };
		sendResponse(res, 200, true, "Market updated successfully", ras);
	} catch (error) {
		console.error("Update market error:", error);
		const errorResponse = marketErrorResponse(error, "Error updating market");
		const ras = { errors: errorResponse.errors };
		sendResponse(res, 400, false, errorResponse.message, ras);
	}
};

// @desc    Admin: deactivate (soft) or permanently delete a market
// @route   DELETE /api/markets/:id   (soft)
// @route   DELETE /api/markets/:id/permanent
// @access  Private (admin)
exports.deleteMarket = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid market ID");
		}
		const market = await Market.findById(id);
		if (!market) {
			return sendError(res, 404, "Market not found");
		}
		market.isActive = false;
		await market.save();
		// Also deactivate this market's products
		await Product.updateMany({ market: market._id }, { isActive: false });
		const ras = { market: market.toSafeObject() };
		sendResponse(res, 200, true, "Market deactivated successfully", ras);
	} catch (error) {
		console.error("Delete market error:", error);
		sendServerError(res, error, "Error deleting market");
	}
};

exports.permanentDeleteMarket = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid market ID");
		}
		const market = await Market.findById(id);
		if (!market) {
			return sendError(res, 404, "Market not found");
		}
		if (market.isActive) {
			return sendError(res, 400, "Only inactive markets can be permanently deleted. Deactivate this market first.");
		}

		await market.deleteOne();
		// Detach products from this market (keep them but unset market ref)
		await Product.updateMany(
			{ market: id },
			{ $set: { market: null, isActive: false } },
		);
		const ras = {};
		sendResponse(res, 200, true, "Market permanently deleted", ras);
	} catch (error) {
		console.error("Permanent delete market error:", error);
		sendServerError(res, error, "Error permanently deleting market");
	}
};

// @desc    Market admin login
// @route   POST /api/markets/login
// @access  Public
exports.marketLogin = async (req, res) => {
	try {
		const { username, email, password } = req.body;
		const identifier = String(username || email || "").toLowerCase().trim();
		if (!identifier || !password) {
			return sendError(res, 400, "Username or email and password are required");
		}

		const market = await Market.findOne({
			$or: [{ username: identifier }, { email: identifier }],
		}).select("+password +loginAttempts +lockUntil");

		if (!market) {
			return sendError(res, 401, "Invalid credentials");
		}

		if (market.isLocked) {
			return sendError(res, 423, "Account temporarily locked due to multiple failed login attempts. Try again later.");
		}

		if (!market.isActive) {
			return sendError(res, 401, "Market account is deactivated");
		}

		const ok = await market.comparePassword(password);
		if (!ok) {
			await market.incLoginAttempts();
			return sendError(res, 401, "Invalid credentials");
		}

		if (market.loginAttempts > 0 || market.lockUntil) {
			await market.resetLoginAttempts();
		}
		market.lastLogin = new Date();
		await market.save();

		const token = generateToken({ id: market._id, isMarket: true });
		const refreshToken = generateRefreshToken({
			id: market._id,
			isMarket: true,
		});

		const ras = {
			market: market.toSafeObject(),
			token,
			refreshToken,
		};
		sendResponse(res, 200, true, "Login successful", ras);
	} catch (error) {
		console.error("Market login error:", error);
		sendServerError(res, error, "Server error during market login");
	}
};

// @desc    Market admin: get own profile
// @route   GET /api/markets/me/profile
// @access  Private (market)
exports.getMyMarket = async (req, res) => {
	try {
		const market = await Market.findById(req.user.marketId).populate(
			"totalItems",
		);
		if (!market) {
			return sendError(res, 404, "Market not found");
		}
		const ras = { market };
		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("getMyMarket error:", error);
		sendServerError(res, error, "Error fetching market");
	}
};

// @desc    Market stats (totalItems / totalSales / totalOrders)
// @route   GET /api/markets/:id/stats
// @access  Private (admin or self market)
exports.getMarketStats = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid market ID");
		}
		if (
			req.user.role === "market" &&
			String(req.user.marketId) !== String(id)
		) {
			return sendError(res, 403, "Not authorized");
		}

		const marketObjectId = new mongoose.Types.ObjectId(id);

		const [totalItems, totalActiveItems, orderAgg] = await Promise.all([
			Product.countDocuments({ market: marketObjectId }),
			Product.countDocuments({ market: marketObjectId, isActive: true }),
			Order.aggregate([
				{ $match: { market: marketObjectId, isActive: true } },
				{
					$group: {
						_id: null,
						totalOrders: { $sum: 1 },
						totalSales: { $sum: "$total" },
						deliveredOrders: {
							$sum: {
								$cond: [{ $eq: ["$status", "delivered"] }, 1, 0],
							},
						},
						deliveredSales: {
							$sum: {
								$cond: [
									{ $eq: ["$status", "delivered"] },
									"$total",
									0,
								],
							},
						},
					},
				},
			]),
		]);

		const stats = orderAgg[0] || {
			totalOrders: 0,
			totalSales: 0,
			deliveredOrders: 0,
			deliveredSales: 0,
		};

		const ras = {
			totalItems,
			totalActiveItems,
			...stats,
		};
		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Market stats error:", error);
		sendServerError(res, error, "Error fetching market stats");
	}
};

exports.uploadLogoMiddleware = upload.single("logo");

// Public: list active markets (id, name, logo, location) for the mobile app
//
// Optional ?lat=&lng= (the shopper's exact map pin): when present, a market
// is only returned if that pin actually falls inside the market's own
// delivery-range pin(s) + radius — the "green zone" configured either
// directly on the market (`deliveryRegions`, drawn on the market's own
// coverage map) or via named Zone documents it has opted into
// (`deliveryZones`, each carrying its own map pin + radius, set on the
// Zones management page). A market with NO range configured at all is not
// filtered out here — it stays visible and is instead scoped by ?city= only
// (matched client-side too), since it hasn't opted into precise-range
// matching yet.
exports.getPublicMarkets = async (req, res) => {
	try {
		// Optional ?city= filter: only markets located in that city.
		const filter = { isActive: true };
		const city = (req.query.city || "").trim();
		if (city) {
			const escaped = escapeRegex(city);
			const cityRegex = new RegExp(`^${escaped}$`, "i");
			// A market serves a city if it is listed in its `cities` array (the
			// new multi-select) or matches the legacy single `location.city`.
			filter.$or = [{ cities: cityRegex }, { "location.city": cityRegex }];
		}

		let markets = await Market.find(filter)
			.select("name username logo location cities deliveryRegions deliveryZones")
			.sort({ name: 1 })
			.lean();

		const lat = parseFloat(req.query.lat);
		const lng = parseFloat(req.query.lng);
		const hasPin = Number.isFinite(lat) && Number.isFinite(lng);

		if (hasPin && markets.length) {
			const Zone = require("../models/Zone");
			const marketIds = markets.map((m) => m._id);
			const zoneNames = [
				...new Set(
					markets.flatMap((m) =>
						Array.isArray(m.deliveryZones) ? m.deliveryZones : []
					)
				),
			];

			let zoneDocs = [];
			if (zoneNames.length) {
				zoneDocs = await Zone.find({
					market: { $in: marketIds },
					isActive: true,
					zoneName: {
						$in: zoneNames.map(
							(n) => new RegExp(`^${escapeRegex(n)}$`, "i")
						),
					},
				})
					.select("market zoneName coordinates distance distanceUnit")
					.lean();
			}

			// Group each market's own named zones by market id for a quick lookup.
			const zonesByMarket = {};
			zoneDocs.forEach((z) => {
				const key = String(z.market);
				(zonesByMarket[key] = zonesByMarket[key] || []).push(z);
			});

			markets = markets.filter((m) => {
				// Combine the market's own multi-pin regions with its named
				// zones' pin+radius (converted to km) into one region list.
				const regions = Array.isArray(m.deliveryRegions)
					? m.deliveryRegions.slice()
					: [];
				const myZoneNames = new Set(
					(Array.isArray(m.deliveryZones) ? m.deliveryZones : []).map((n) =>
						String(n).trim().toLowerCase()
					)
				);
				(zonesByMarket[String(m._id)] || []).forEach((z) => {
					if (!myZoneNames.has(String(z.zoneName).trim().toLowerCase())) return;
					if (
						z.coordinates &&
						typeof z.coordinates.latitude === "number" &&
						typeof z.coordinates.longitude === "number" &&
						typeof z.distance === "number" &&
						z.distance > 0
					) {
						const radiusKm =
							z.distanceUnit === "miles" ? z.distance * 1.60934 : z.distance;
						regions.push({
							latitude: z.coordinates.latitude,
							longitude: z.coordinates.longitude,
							radiusKm,
						});
					}
				});

				// No range configured at all -> don't exclude, city filter already applied.
				if (!regions.length) return true;
				const inRange = pointInAnyRegion(lat, lng, regions);
				if (!inRange) {
					console.log(
						`[getPublicMarkets] Excluding "${m.name}" (${m._id}) — shopper pin (${lat}, ${lng}) is outside its ${regions.length} delivery region(s)`
					);
				}
				return inRange;
			});
		}

		// Attach each market's own delivery fee (MarketSetting.deliveryFee, set
		// on the market dashboard's Settings page) so the app can show and add
		// it at checkout. Markets without a settings document keep 0.
		if (markets.length) {
			try {
				const MarketSetting = require("../models/MarketSetting");
				const marketSettings = await MarketSetting.find({
					market: { $in: markets.map((m) => m._id) },
				})
					.select("market deliveryFee freeDeliveryThreshold minOrderAmount")
					.lean();
				const settingsByMarket = new Map(
					marketSettings.map((ms) => [
						String(ms.market),
						{
							deliveryFee: Number(ms.deliveryFee) || 0,
							freeDeliveryThreshold: Number(ms.freeDeliveryThreshold) || 0,
							minOrderAmount: Number(ms.minOrderAmount) || 0,
						},
					])
				);
				markets = markets.map((m) => {
					const cfg = settingsByMarket.get(String(m._id)) || {};
					return {
						...m,
						deliveryFee: cfg.deliveryFee || 0,
						// Dynamic delivery: free once subtotal reaches this (0 = disabled).
						freeDeliveryThreshold: cfg.freeDeliveryThreshold || 0,
						minOrderAmount: cfg.minOrderAmount || 0,
					};
				});
			} catch (feeError) {
				// A settings lookup failure must never hide the markets themselves.
				console.warn("Delivery fee lookup failed:", feeError.message);
			}
		}

		const ras = { markets };
		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Get public markets error:", error);
		sendServerError(res, error, "Error fetching markets");
	}
};

// Public: list active categories for a specific market (mobile app)
exports.getMarketCategories = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid market id");
		}

		const MarketCategory = require("../models/MarketCategory");
		const MarketSubcategory = require("../models/MarketSubcategory");

		const [categories, subcategories] = await Promise.all([
			MarketCategory.find({ market: id, isActive: true })
				.select("name image icon sortOrder")
				.sort({ sortOrder: 1, name: 1 })
				.lean(),
			MarketSubcategory.find({ market: id, isActive: true })
				.select("name category sortOrder")
				.sort({ sortOrder: 1, name: 1 })
				.lean(),
		]);

		// Group subcategories under their parent category so the mobile app
		// can show each market's own categories AND subcategories.
		const byCategory = new Map();
		subcategories.forEach((sub) => {
			const key = String(sub.category);
			if (!byCategory.has(key)) byCategory.set(key, []);
			byCategory.get(key).push({ _id: sub._id, name: sub.name });
		});

		const data = categories.map((cat) => ({
			_id: cat._id,
			name: cat.name,
			image: cat.image,
			icon: cat.icon,
			subcategories: byCategory.get(String(cat._id)) || [],
		}));

		const ras = { data, subcategories };
		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Get market categories error:", error);
		sendServerError(res, error, "Error fetching market categories");
	}
};

// Public: list active products that belong to a specific market (mobile app)
exports.getMarketProducts = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return sendError(res, 400, "Invalid market id");
		}

		const market = await Market.findOne({ _id: id, isActive: true }).select(
			"name username logo location"
		);
		if (!market) {
			return sendError(res, 404, "Market not found");
		}

		const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
		const limit = Math.min(
			Math.max(parseInt(req.query.limit, 10) || 12, 1),
			100
		);
		const skip = (page - 1) * limit;

		const filter = { market: id, isActive: true };

		const [products, total] = await Promise.all([
			Product.find(filter)
				.populate("category", "name")
				.populate("subcategory", "name")
				.populate("market", "name username location logo")
				.sort({ sortOrder: 1, name: 1 })
				.skip(skip)
				.limit(limit),
			Product.countDocuments(filter),
		]);

		const ras = {
			products,
			market,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
				hasNextPage: page * limit < total,
			},
		};
		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		console.error("Get market products error:", error);
		sendServerError(res, error, "Error fetching market products");
	}
};
