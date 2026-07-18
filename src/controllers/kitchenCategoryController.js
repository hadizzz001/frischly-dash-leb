const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const KitchenCategory = require("../models/KitchenCategory");
const Kitchen = require("../models/Kitchen");
const { sendSuccess, sendError } = require("../utils/apiResponse");

// Cloudinary is configured elsewhere on require, but reconfigure defensively in
// case this module is loaded first.
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
		else cb(new Error("Only image files are allowed"), false);
	},
});

const uploadBufferToCloudinary = (buffer, folder = "kitchen-categories") =>
	new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder,
				resource_type: "image",
				quality: "auto",
				format: "webp",
				transformation: [{ quality: "auto:eco", width: 500, crop: "scale" }],
			},
			(err, result) => {
				if (err) reject(err);
				else resolve({ url: result.secure_url, public_id: result.public_id });
			},
		);
		stream.end(buffer);
	});

const safeDestroy = (publicId) => {
	if (!publicId) return Promise.resolve();
	return new Promise((resolve) => {
		cloudinary.uploader.destroy(publicId, () => resolve());
	});
};

const ok = (res, data, message = "OK") => sendSuccess(res, data, message);
const fail = (res, code, message) => sendError(res, code, message);

// Build a market-scoping filter so the main admin sees everything but market
// admins only see their own categories.
const scope = (req, extra = {}) => {
	if (req.user && req.user.role === "market") {
		return { market: req.user.marketId, ...extra };
	}
	if (req.query && req.query.market !== undefined && req.query.market !== "all") {
		if (req.query.market === "none" || req.query.market === "null") {
			return { market: null, ...extra };
		}
		if (mongoose.Types.ObjectId.isValid(req.query.market)) {
			return { market: req.query.market, ...extra };
		}
	}
	return { ...extra };
};

// Guard: market-owned categories are view-only for the main admin. Returns true
// when the caller may proceed; when it returns false a response has already
// been sent.
const assertAdminMayModify = async (req, res, categoryId) => {
	if (req.user && req.user.role === "market") return true;
	const owned = await KitchenCategory.findById(categoryId).select("market").lean();
	if (!owned) {
		fail(res, 404, "Kitchen category not found");
		return false;
	}
	if (owned.market) {
		fail(res, 403, "This category belongs to a market and is view-only");
		return false;
	}
	return true;
};

// @desc Public: list active kitchen categories for the storefront / mobile app.
// @route GET /api/kitchen-categories/public
// @access Public
exports.getPublicKitchenCategories = async (req, res) => {
	try {
		const filter = { isActive: true };
		if (req.query.market !== undefined && req.query.market !== "all") {
			if (req.query.market === "none" || req.query.market === "null") {
				filter.market = null;
			} else if (mongoose.Types.ObjectId.isValid(req.query.market)) {
				filter.market = req.query.market;
			}
		}
		const categories = await KitchenCategory.find(filter)
			.populate("market", "name username location logo cities")
			.sort({ sortOrder: 1, createdAt: -1 })
			.lean();
		ok(res, categories);
	} catch (err) {
		console.error("getPublicKitchenCategories:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc Get all kitchen categories
// @route GET /api/kitchen-categories
exports.getKitchenCategories = async (req, res) => {
	try {
		const filter = scope(req);
		if (req.query.isActive && req.query.isActive !== "all") {
			filter.isActive =
				req.query.isActive === "true" || req.query.isActive === true;
		}
		if (req.query.search) {
			const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			filter.name = new RegExp(safe, "i");
		}
		const categories = await KitchenCategory.find(filter)
			.populate("market", "name username location cities")
			.sort({ sortOrder: 1, createdAt: -1 })
			.lean();
		ok(res, categories);
	} catch (err) {
		console.error("getKitchenCategories:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc Get single kitchen category
// @route GET /api/kitchen-categories/:id
exports.getKitchenCategory = async (req, res) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid category ID");
		}
		const filter = { _id: req.params.id, ...scope(req) };
		const category = await KitchenCategory.findOne(filter)
			.populate("market", "name username location cities")
			.lean();
		if (!category) return fail(res, 404, "Kitchen category not found");
		ok(res, category);
	} catch (err) {
		console.error("getKitchenCategory:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc Create kitchen category
// @route POST /api/kitchen-categories
exports.createKitchenCategory = async (req, res) => {
	try {
		const name = req.body && req.body.name ? String(req.body.name).trim() : "";
		if (!name) return fail(res, 400, "Category name is required");

		const doc = {
			name,
			description:
				req.body && req.body.description
					? String(req.body.description).trim()
					: "",
			isActive:
				req.body && req.body.isActive !== undefined
					? !!req.body.isActive
					: true,
			picture:
				req.body && req.body.picture ? String(req.body.picture).trim() : "",
			picturePublicId:
				req.body && req.body.picturePublicId
					? String(req.body.picturePublicId).trim()
					: "",
			createdBy: req.user ? req.user._id || req.user.id : undefined,
		};

		// Market scope: market admins always create under their own market.
		if (req.user && req.user.role === "market") {
			doc.market = req.user.marketId;
		} else if (
			req.body &&
			req.body.market &&
			mongoose.Types.ObjectId.isValid(req.body.market)
		) {
			doc.market = req.body.market;
		}

		const category = await KitchenCategory.create(doc);
		const populated = await KitchenCategory.findById(category._id)
			.populate("market", "name username location cities")
			.lean();
		sendSuccess(res, populated, "Kitchen category created successfully", 201);
	} catch (err) {
		console.error("createKitchenCategory:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc Update kitchen category
// @route PUT /api/kitchen-categories/:id
exports.updateKitchenCategory = async (req, res) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid category ID");
		}

		// Main admin cannot edit a category owned by a market (view-only).
		if (!(await assertAdminMayModify(req, res, req.params.id))) return;

		const update = {};
		if (req.body && req.body.name !== undefined) {
			update.name = String(req.body.name).trim();
			if (!update.name) return fail(res, 400, "Category name cannot be empty");
		}
		if (req.body && req.body.description !== undefined) {
			update.description = String(req.body.description || "").trim();
		}
		if (req.body && req.body.isActive !== undefined) {
			update.isActive = !!req.body.isActive;
		}
		if (req.body && req.body.picture !== undefined) {
			update.picture = String(req.body.picture || "").trim();
		}
		if (req.body && req.body.picturePublicId !== undefined) {
			update.picturePublicId = String(req.body.picturePublicId || "").trim();
		}

		// Tenant scoping: market admins can only modify their own categories.
		const filter = { _id: req.params.id };
		if (req.user && req.user.role === "market") {
			filter.market = req.user.marketId;
		}

		// Queue deletion of a replaced/cleared Cloudinary asset (best-effort).
		if (update.picture !== undefined || update.picturePublicId !== undefined) {
			const prev = await KitchenCategory.findOne(filter)
				.select("picture picturePublicId")
				.lean();
			if (
				prev &&
				prev.picturePublicId &&
				prev.picturePublicId !== update.picturePublicId
			) {
				safeDestroy(prev.picturePublicId);
			}
		}

		const category = await KitchenCategory.findOneAndUpdate(filter, update, {
			new: true,
			runValidators: true,
		})
			.populate("market", "name username location cities")
			.lean();

		if (!category) return fail(res, 404, "Kitchen category not found");
		ok(res, category, "Kitchen category updated successfully");
	} catch (err) {
		console.error("updateKitchenCategory:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc Delete kitchen category. Any kitchens referencing it are detached
// (their category is cleared) rather than deleted.
// @route DELETE /api/kitchen-categories/:id
exports.deleteKitchenCategory = async (req, res) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid category ID");
		}

		// Main admin cannot delete a category owned by a market (view-only).
		if (!(await assertAdminMayModify(req, res, req.params.id))) return;

		const filter = { _id: req.params.id };
		if (req.user && req.user.role === "market") {
			filter.market = req.user.marketId;
		}
		const category = await KitchenCategory.findOneAndDelete(filter);
		if (!category) return fail(res, 404, "Kitchen category not found");

		// Detach this category from any kitchens that used it.
		await Kitchen.updateMany(
			{ category: category._id },
			{ $set: { category: null } },
		);

		if (category.picturePublicId) safeDestroy(category.picturePublicId);
		ok(res, { id: category._id }, "Kitchen category deleted successfully");
	} catch (err) {
		console.error("deleteKitchenCategory:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc Upload a kitchen category image to Cloudinary
// @route POST /api/kitchen-categories/upload-image
exports.uploadImage = async (req, res) => {
	try {
		if (!req.file) return fail(res, 400, "No image file provided");
		const result = await uploadBufferToCloudinary(
			req.file.buffer,
			"kitchen-categories",
		);
		sendSuccess(res, {
			url: result.url,
			public_id: result.public_id,
			size: req.file.size,
		}, "Image uploaded successfully");
	} catch (err) {
		console.error("uploadImage (kitchen category):", err);
		fail(res, 500, err.message || "Error uploading image");
	}
};

exports.uploadMiddleware = upload.single("image");

// @desc Save a new ordering for kitchen categories
// @route PUT /api/kitchen-categories/reorder
// Body: { order: [categoryId, categoryId, ...] }
exports.reorderKitchenCategories = async (req, res) => {
	try {
		const order = Array.isArray(req.body && req.body.order)
			? req.body.order
			: null;
		if (!order || !order.length) return fail(res, 400, "Missing 'order' array");
		const ids = order
			.map((id) => String(id))
			.filter((id) => mongoose.Types.ObjectId.isValid(id));
		if (!ids.length) return fail(res, 400, "No valid category IDs provided");

		const scopeFilter = scope(req);
		// Only update categories this caller is allowed to see.
		const allowed = await KitchenCategory.find({
			_id: { $in: ids },
			...scopeFilter,
		})
			.select("_id")
			.lean();
		const allowedSet = new Set(allowed.map((k) => String(k._id)));

		const ops = [];
		ids.forEach((id, idx) => {
			if (!allowedSet.has(id)) return;
			ops.push({
				updateOne: {
					filter: { _id: id, ...scopeFilter },
					update: { $set: { sortOrder: idx } },
				},
			});
		});

		if (!ops.length)
			return fail(res, 403, "No categories accessible for reordering");

		const result = await KitchenCategory.bulkWrite(ops);
		ok(
			res,
			{ matched: result.matchedCount, modified: result.modifiedCount },
			"Kitchen category order saved",
		);
	} catch (err) {
		console.error("reorderKitchenCategories:", err);
		fail(res, 500, err.message || "Server Error");
	}
};
