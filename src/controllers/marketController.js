const Market = require("../models/Market");
const Product = require("../models/Product");
const Order = require("../models/Order");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const {
	generateToken,
	generateRefreshToken,
} = require("../utils/jwt");
const {
	findDuplicateAccount,
	duplicateAccountMessage,
} = require("../utils/accountDuplicates");

if (
	!process.env.CLOUDINARY_CLOUD_NAME ||
	!process.env.CLOUDINARY_API_KEY ||
	!process.env.CLOUDINARY_API_SECRET
) {
	console.error(
		"❌ CRITICAL: Cloudinary credentials are not configured properly in environment variables",
	);
}

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (req, file, cb) => {
		if (file.mimetype.startsWith("image/")) cb(null, true);
		else cb(new Error("Only image files are allowed!"), false);
	},
});

const uploadLogoToCloudinary = (buffer) => {
	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder: "market-logos",
				resource_type: "image",
				quality: "auto",
				format: "webp",
				transformation: [
					{ quality: "auto:eco", width: 500, height: 500, crop: "limit" },
				],
			},
			(error, result) => {
				if (error) reject(error);
				else resolve({ url: result.secure_url, public_id: result.public_id });
			},
		);

		stream.end(buffer);
	});
};

const deleteLogoFromCloudinary = (publicId) => {
	return new Promise((resolve, reject) => {
		if (!publicId) return resolve();
		cloudinary.uploader.destroy(publicId, (error, result) => {
			if (error) reject(error);
			else resolve(result);
		});
	});
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
			logo,
		} = req.body;

		const missingFields = [];
		if (!String(name || "").trim()) missingFields.push("market name");
		if (!String(username || "").trim()) missingFields.push("username");
		if (!String(password || "").trim()) missingFields.push("password");

		if (missingFields.length) {
			return res.status(400).json({
				success: false,
				message: `Missing required field${missingFields.length > 1 ? "s" : ""}: ${missingFields.join(", ")}`,
			});
		}

		const duplicate = await findDuplicateAccount({ name, username, email });
		if (duplicate) {
			return res.status(400).json({
				success: false,
				message: duplicateAccountMessage(duplicate),
			});
		}

		const marketData = {
			name: String(name).trim(),
			username: String(username).toLowerCase().trim(),
			password,
			email: email ? String(email).toLowerCase().trim() : undefined,
			phoneNumber,
			location: parseLocation(rawLocation),
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
				return res.status(500).json({
					success: false,
					message: "Error uploading market logo",
					error: uploadError.message,
				});
			}
		}

		const market = await Market.create(marketData);

		res.status(201).json({
			success: true,
			message: "Market created successfully",
			data: market.toSafeObject(),
		});
	} catch (error) {
		console.error("Create market error:", error);
		const errorResponse = marketErrorResponse(error, "Error creating market");
		res.status(400).json({
			success: false,
			message: errorResponse.message,
			errors: errorResponse.errors,
			error: error.message,
		});
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

		res.json({
			success: true,
			data: markets,
			pagination: {
				currentPage: pageNum,
				totalPages: Math.ceil(total / limitNum),
				totalMarkets: total,
				hasNextPage: pageNum * limitNum < total,
				hasPrevPage: pageNum > 1,
			},
		});
	} catch (error) {
		console.error("Get markets error:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching markets",
			error: error.message,
		});
	}
};

// @desc    Get a single market
// @route   GET /api/markets/:id
// @access  Private (admin or the market itself)
exports.getMarket = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res
				.status(400)
				.json({ success: false, message: "Invalid market ID" });
		}

		// Market admins can only view themselves
		if (
			req.user.role === "market" &&
			String(req.user.marketId) !== String(id)
		) {
			return res
				.status(403)
				.json({ success: false, message: "Not authorized" });
		}

		const market = await Market.findById(id)
			.populate("totalItems")
			.populate("createdBy", "name email");

		if (!market) {
			return res
				.status(404)
				.json({ success: false, message: "Market not found" });
		}

		res.json({ success: true, data: market });
	} catch (error) {
		console.error("Get market error:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching market",
			error: error.message,
		});
	}
};

// @desc    Update market (admin can update everything; market admin a subset)
// @route   PUT /api/markets/:id
// @access  Private (admin) / market (self – limited fields)
exports.updateMarket = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res
				.status(400)
				.json({ success: false, message: "Invalid market ID" });
		}

		const market = await Market.findById(id).select("+password");
		if (!market) {
			return res
				.status(404)
				.json({ success: false, message: "Market not found" });
		}

		const isAdmin = ["admin", "manager"].includes(req.user.role);
		const isSelf =
			req.user.role === "market" &&
			String(req.user.marketId) === String(id);

		if (!isAdmin && !isSelf) {
			return res
				.status(403)
				.json({ success: false, message: "Not authorized" });
		}

		const updatable = isAdmin
			? [
					"name",
					"username",
					"email",
					"phoneNumber",
					"location",
					"logo",
					"logoPublicId",
					"isActive",
				]
			: ["email", "phoneNumber", "location", "logo"];

		if (typeof req.body.location === "string") {
			req.body.location = parseLocation(req.body.location);
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
			return res.status(400).json({
				success: false,
				message: duplicateAccountMessage(duplicate),
			});
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
				return res.status(500).json({
					success: false,
					message: "Error uploading market logo",
					error: uploadError.message,
				});
			}
		}

		// Password change (admin can reset, market admin must supply current)
		if (req.body.password) {
			if (isSelf) {
				if (!req.body.currentPassword) {
					return res.status(400).json({
						success: false,
						message: "Current password is required",
					});
				}
				const ok = await market.comparePassword(req.body.currentPassword);
				if (!ok) {
					return res.status(401).json({
						success: false,
						message: "Current password is incorrect",
					});
				}
			}
			market.password = req.body.password;
		}

		await market.save();

		res.json({
			success: true,
			message: "Market updated successfully",
			data: market.toSafeObject(),
		});
	} catch (error) {
		console.error("Update market error:", error);
		const errorResponse = marketErrorResponse(error, "Error updating market");
		res.status(400).json({
			success: false,
			message: errorResponse.message,
			errors: errorResponse.errors,
			error: error.message,
		});
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
			return res
				.status(400)
				.json({ success: false, message: "Invalid market ID" });
		}
		const market = await Market.findById(id);
		if (!market) {
			return res
				.status(404)
				.json({ success: false, message: "Market not found" });
		}
		market.isActive = false;
		await market.save();
		// Also deactivate this market's products
		await Product.updateMany({ market: market._id }, { isActive: false });
		res.json({
			success: true,
			message: "Market deactivated successfully",
			data: market.toSafeObject(),
		});
	} catch (error) {
		console.error("Delete market error:", error);
		res.status(500).json({
			success: false,
			message: "Error deleting market",
			error: error.message,
		});
	}
};

exports.permanentDeleteMarket = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res
				.status(400)
				.json({ success: false, message: "Invalid market ID" });
		}
		const market = await Market.findById(id);
		if (!market) {
			return res
				.status(404)
				.json({ success: false, message: "Market not found" });
		}
		if (market.isActive) {
			return res.status(400).json({
				success: false,
				message: "Only inactive markets can be permanently deleted. Deactivate this market first.",
			});
		}

		await market.deleteOne();
		// Detach products from this market (keep them but unset market ref)
		await Product.updateMany(
			{ market: id },
			{ $set: { market: null, isActive: false } },
		);
		res.json({
			success: true,
			message: "Market permanently deleted",
		});
	} catch (error) {
		console.error("Permanent delete market error:", error);
		res.status(500).json({
			success: false,
			message: "Error permanently deleting market",
			error: error.message,
		});
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
			return res.status(400).json({
				success: false,
				message: "Username or email and password are required",
			});
		}

		const market = await Market.findOne({
			$or: [{ username: identifier }, { email: identifier }],
		}).select("+password +loginAttempts +lockUntil");

		if (!market) {
			return res
				.status(401)
				.json({ success: false, message: "Invalid credentials" });
		}

		if (market.isLocked) {
			return res.status(423).json({
				success: false,
				message:
					"Account temporarily locked due to multiple failed login attempts. Try again later.",
			});
		}

		if (!market.isActive) {
			return res
				.status(401)
				.json({ success: false, message: "Market account is deactivated" });
		}

		const ok = await market.comparePassword(password);
		if (!ok) {
			await market.incLoginAttempts();
			return res
				.status(401)
				.json({ success: false, message: "Invalid credentials" });
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

		res.json({
			success: true,
			message: "Login successful",
			data: {
				market: market.toSafeObject(),
				token,
				refreshToken,
			},
		});
	} catch (error) {
		console.error("Market login error:", error);
		res.status(500).json({
			success: false,
			message: "Server error during market login",
		});
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
			return res
				.status(404)
				.json({ success: false, message: "Market not found" });
		}
		res.json({ success: true, data: market });
	} catch (error) {
		console.error("getMyMarket error:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching market",
			error: error.message,
		});
	}
};

// @desc    Market stats (totalItems / totalSales / totalOrders)
// @route   GET /api/markets/:id/stats
// @access  Private (admin or self market)
exports.getMarketStats = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res
				.status(400)
				.json({ success: false, message: "Invalid market ID" });
		}
		if (
			req.user.role === "market" &&
			String(req.user.marketId) !== String(id)
		) {
			return res
				.status(403)
				.json({ success: false, message: "Not authorized" });
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

		res.json({
			success: true,
			data: {
				totalItems,
				totalActiveItems,
				...stats,
			},
		});
	} catch (error) {
		console.error("Market stats error:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching market stats",
			error: error.message,
		});
	}
};

exports.uploadLogoMiddleware = upload.single("logo");

// Public: list active markets (id, name, logo, location) for the mobile app
exports.getPublicMarkets = async (req, res) => {
	try {
		// Optional ?city= filter: only markets located in that city.
		const filter = { isActive: true };
		const city = (req.query.city || "").trim();
		if (city) {
			const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			filter["location.city"] = new RegExp(`^${escaped}$`, "i");
		}

		const markets = await Market.find(filter)
			.select("name username logo location")
			.sort({ name: 1 });

		res.json({
success: true,
data: markets,
});
	} catch (error) {
		console.error("Get public markets error:", error);
		res.status(500).json({
success: false,
message: "Error fetching markets",
error: error.message,
});
	}
};

// Public: list active products that belong to a specific market (mobile app)
exports.getMarketProducts = async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid market id",
			});
		}

		const market = await Market.findOne({ _id: id, isActive: true }).select(
			"name username logo location"
		);
		if (!market) {
			return res.status(404).json({
				success: false,
				message: "Market not found",
			});
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

		res.json({
			success: true,
			market,
			data: products,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
				hasNextPage: page * limit < total,
			},
		});
	} catch (error) {
		console.error("Get market products error:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching market products",
			error: error.message,
		});
	}
};
