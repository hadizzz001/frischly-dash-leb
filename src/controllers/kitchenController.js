const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const Kitchen = require("../models/Kitchen");
const Product = require("../models/Product");

// Cloudinary is already configured in productController on require, but we
// reconfigure defensively in case this module is loaded first.
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

const uploadBufferToCloudinary = (buffer, folder = "kitchens") =>
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

const ok = (res, data, message = "OK") =>
	res.json({ success: true, message, data });
const fail = (res, code, message) =>
	res.status(code).json({ success: false, message });

// Build a market-scoping filter so admins see everything but market admins
// only see their own kitchens.
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

const sanitizeItems = (raw) => {
	if (!Array.isArray(raw)) return [];
	return [
		...new Set(
			raw
				.map((id) => (id && id._id ? String(id._id) : String(id)))
				.filter((id) => mongoose.Types.ObjectId.isValid(id)),
		),
	];
};

// @desc Get all kitchens
// @route GET /api/kitchens
exports.getKitchens = async (req, res) => {
	try {
		const filter = scope(req);
		if (req.query.isActive && req.query.isActive !== "all") {
			filter.isActive = req.query.isActive === "true" || req.query.isActive === true;
		}
		if (req.query.search) {
			const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			filter.name = new RegExp(safe, "i");
		}
		const kitchens = await Kitchen.find(filter)
			.populate({
				path: "items",
				select: "name barcode price stock isActive picture shelfNumber",
			})
			.populate("market", "name username location")
			.sort({ sortOrder: 1, createdAt: -1 })
			.lean();
		ok(res, kitchens);
	} catch (err) {
		console.error("getKitchens:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc Get single kitchen
// @route GET /api/kitchens/:id
exports.getKitchen = async (req, res) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid kitchen ID");
		}
		const filter = { _id: req.params.id, ...scope(req) };
		// scope() already added market when applicable; we ignore ?market in single-doc GETs.
		const kitchen = await Kitchen.findOne(filter)
			.populate({
				path: "items",
				select: "name barcode price stock isActive picture shelfNumber",
			})
			.populate("market", "name username location")
			.lean();
		if (!kitchen) return fail(res, 404, "Kitchen not found");
		ok(res, kitchen);
	} catch (err) {
		console.error("getKitchen:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc Create kitchen
// @route POST /api/kitchens
exports.createKitchen = async (req, res) => {
	try {
		const name = (req.body && req.body.name ? String(req.body.name).trim() : "");
		if (!name) return fail(res, 400, "Kitchen name is required");

		const items = sanitizeItems(req.body && req.body.items);

		const doc = {
			name,
			items,
			isActive: req.body && req.body.isActive !== undefined ? !!req.body.isActive : true,
			picture: req.body && req.body.picture ? String(req.body.picture).trim() : "",
			picturePublicId: req.body && req.body.picturePublicId ? String(req.body.picturePublicId).trim() : "",
			createdBy: req.user ? req.user._id || req.user.id : undefined,
		};

		// Market scope: market admins always create under their own market.
		if (req.user && req.user.role === "market") {
			doc.market = req.user.marketId;
		} else if (req.body && req.body.market) {
			if (mongoose.Types.ObjectId.isValid(req.body.market)) {
				doc.market = req.body.market;
			}
		}

		const kitchen = await Kitchen.create(doc);
		const populated = await Kitchen.findById(kitchen._id)
			.populate({
				path: "items",
				select: "name barcode price stock isActive picture shelfNumber",
			})
			.populate("market", "name username location")
			.lean();
		res.status(201).json({
			success: true,
			message: "Kitchen created successfully",
			data: populated,
		});
	} catch (err) {
		console.error("createKitchen:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc Update kitchen
// @route PUT /api/kitchens/:id
exports.updateKitchen = async (req, res) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid kitchen ID");
		}

		const update = {};
		if (req.body && req.body.name !== undefined) {
			update.name = String(req.body.name).trim();
			if (!update.name) return fail(res, 400, "Kitchen name cannot be empty");
		}
		if (req.body && req.body.items !== undefined) {
			update.items = sanitizeItems(req.body.items);
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

		// Tenant scoping: market admins can only modify their own kitchens and
		// cannot reassign them to another market.
		const filter = { _id: req.params.id };
		if (req.user && req.user.role === "market") {
			filter.market = req.user.marketId;
		}

		// If the picture is being replaced or cleared, queue deletion of the old
		// Cloudinary asset (best-effort).
		if (update.picture !== undefined || update.picturePublicId !== undefined) {
			const prev = await Kitchen.findOne(filter).select("picture picturePublicId").lean();
			if (prev && prev.picturePublicId && prev.picturePublicId !== update.picturePublicId) {
				safeDestroy(prev.picturePublicId);
			}
		}

		const kitchen = await Kitchen.findOneAndUpdate(filter, update, {
			new: true,
			runValidators: true,
		})
			.populate({
				path: "items",
				select: "name barcode price stock isActive picture shelfNumber",
			})
			.populate("market", "name username location")
			.lean();

		if (!kitchen) return fail(res, 404, "Kitchen not found");
		ok(res, kitchen, "Kitchen updated successfully");
	} catch (err) {
		console.error("updateKitchen:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc Delete kitchen
// @route DELETE /api/kitchens/:id
exports.deleteKitchen = async (req, res) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid kitchen ID");
		}
		const filter = { _id: req.params.id };
		if (req.user && req.user.role === "market") {
			filter.market = req.user.marketId;
		}
		const kitchen = await Kitchen.findOneAndDelete(filter);
		if (!kitchen) return fail(res, 404, "Kitchen not found");
		if (kitchen.picturePublicId) safeDestroy(kitchen.picturePublicId);
		ok(res, { id: kitchen._id }, "Kitchen deleted successfully");
	} catch (err) {
		console.error("deleteKitchen:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc List products selectable for a kitchen (active + in stock).
// Scoped to the same market as the requester (so main admin sees main-store
// products with market=null; market admins see only their market's products).
// @route GET /api/kitchens/selectable-products
exports.getSelectableProducts = async (req, res) => {
	try {
		const filter = { isActive: true, stock: { $gt: 0 } };

		if (req.user && req.user.role === "market") {
			filter.market = req.user.marketId;
		} else if (req.query.market !== undefined && req.query.market !== "all") {
			if (req.query.market === "none" || req.query.market === "null") {
				filter.market = null;
			} else if (mongoose.Types.ObjectId.isValid(req.query.market)) {
				filter.market = req.query.market;
			}
		} else {
			// Default for main admin: show main-store products (market=null).
			filter.market = null;
		}

		if (req.query.search) {
			const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			filter.$or = [
				{ name: new RegExp(safe, "i") },
				{ barcode: new RegExp(safe, "i") },
			];
		}

		const products = await Product.find(filter)
			.select("name barcode price stock isActive picture shelfNumber market")
			.sort({ name: 1 })
			.limit(2000)
			.lean();
		ok(res, products);
	} catch (err) {
		console.error("getSelectableProducts:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc Upload a kitchen image to Cloudinary
// @route POST /api/kitchens/upload-image
exports.uploadImage = async (req, res) => {
	try {
		if (!req.file) return fail(res, 400, "No image file provided");
		const result = await uploadBufferToCloudinary(req.file.buffer, "kitchens");
		res.json({
			success: true,
			message: "Image uploaded successfully",
			data: {
				url: result.url,
				public_id: result.public_id,
				size: req.file.size,
			},
		});
	} catch (err) {
		console.error("uploadImage (kitchen):", err);
		fail(res, 500, err.message || "Error uploading image");
	}
};

exports.uploadMiddleware = upload.single("image");

// @desc Save a new ordering for kitchens
// @route PUT /api/kitchens/reorder
// Body: { order: [kitchenId, kitchenId, ...] }
exports.reorderKitchens = async (req, res) => {
	try {
		const order = Array.isArray(req.body && req.body.order) ? req.body.order : null;
		if (!order || !order.length) return fail(res, 400, "Missing 'order' array");
		const ids = order
			.map((id) => String(id))
			.filter((id) => mongoose.Types.ObjectId.isValid(id));
		if (!ids.length) return fail(res, 400, "No valid kitchen IDs provided");

		const scopeFilter = scope(req);
		// Only update kitchens this caller is allowed to see.
		const allowed = await Kitchen.find({ _id: { $in: ids }, ...scopeFilter })
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

		if (!ops.length) return fail(res, 403, "No kitchens accessible for reordering");

		const result = await Kitchen.bulkWrite(ops);
		ok(
			res,
			{ matched: result.matchedCount, modified: result.modifiedCount },
			"Kitchen order saved",
		);
	} catch (err) {
		console.error("reorderKitchens:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

