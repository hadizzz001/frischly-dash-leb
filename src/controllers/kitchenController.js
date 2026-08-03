const mongoose = require("mongoose");
const Kitchen = require("../models/Kitchen");
const Product = require("../models/Product");
const { sendSuccess, sendError, sendResponse } = require("../utils/apiResponse");
const { escapeRegex } = require("../utils/sanitize");
const { marketScopeFilter } = require("../utils/marketScope");
const {
	imageUpload: upload,
	uploadImageToCloudinary,
	safeDeleteFromCloudinary: safeDestroy,
} = require("../utils/cloudinaryUpload");

// Cloudinary is configured centrally in ../utils/cloudinaryUpload.
const uploadBufferToCloudinary = (buffer, folder = "kitchens") =>
	uploadImageToCloudinary(buffer, folder);

const ok = (res, data, message = "OK") => sendSuccess(res, data, message);
const fail = (res, code, message) => sendError(res, code, message);

// Build a market-scoping filter so admins see everything but market admins
// only see their own kitchens.
const scope = marketScopeFilter;

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

// Normalize an incoming kitchen category value to an ObjectId string or null
// (so a kitchen can be created/updated without a category, or have it cleared).
const sanitizeCategory = (raw) => {
	if (raw === undefined || raw === null || raw === "") return null;
	const id = raw && raw._id ? String(raw._id) : String(raw);
	return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

// Guard: market-owned kitchens are view-only for the main admin. They are
// managed by the owning market on its own dashboard, so a non-market (admin)
// caller may read them but must not edit or delete them. Market admins are
// already restricted to their own kitchens by the scoped filters, so this
// check is skipped for them. Returns true when the caller may proceed; when it
// returns false a response has already been sent.
const assertAdminMayModify = async (req, res, kitchenId) => {
	if (req.user && req.user.role === "market") return true;
	const owned = await Kitchen.findById(kitchenId).select("market").lean();
	if (!owned) {
		fail(res, 404, "Kitchen not found");
		return false;
	}
	if (owned.market) {
		fail(res, 403, "This kitchen belongs to a market and is view-only");
		return false;
	}
	return true;
};

// @desc Public: list active kitchens for the storefront / mobile app.
// Items are populated with the fields the cart needs (price/discount/tax/
// bottlerefund/stock/is18Plus/market). Item.market is left as an ObjectId so
// the app can detect each kitchen's source (market vs main store).
// @route GET /api/kitchens/public
// @access Public
exports.getPublicKitchens = async (req, res) => {
	try {
		const filter = { isActive: true };
		if (req.query.market !== undefined && req.query.market !== "all") {
			if (req.query.market === "none" || req.query.market === "null") {
				filter.market = null;
			} else if (mongoose.Types.ObjectId.isValid(req.query.market)) {
				filter.market = req.query.market;
			}
		}
		const kitchens = await Kitchen.find(filter)
			.populate({
				path: "items",
				select:
					"name barcode price discount tax bottlerefund stock isActive is18Plus picture shelfNumber market",
			})
			.populate("category", "name picture isActive sortOrder")
			.populate("market", "name username location logo cities")
			.sort({ sortOrder: 1, createdAt: -1 })
			.lean();
		const ras = { kitchens };
		sendResponse(res, 200, true, "OK", ras);
	} catch (err) {
		console.error("getPublicKitchens:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

// @desc Public: get a single active kitchen with its items (view-only).
// @route GET /api/kitchens/public/:id
// @access Public
exports.getPublicKitchen = async (req, res) => {
	try {
		if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
			return fail(res, 400, "Invalid kitchen ID");
		}
		const kitchen = await Kitchen.findOne({
			_id: req.params.id,
			isActive: true,
		})
			.populate({
				path: "items",
				select:
					"name barcode price discount tax bottlerefund stock isActive is18Plus picture shelfNumber market",
			})
			.populate("category", "name picture isActive sortOrder")
			.populate("market", "name username location logo cities")
			.lean();
		if (!kitchen) return fail(res, 404, "Kitchen not found");
		const ras = { kitchen };
		sendResponse(res, 200, true, "OK", ras);
	} catch (err) {
		console.error("getPublicKitchen:", err);
		fail(res, 500, err.message || "Server Error");
	}
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
			const safe = escapeRegex(String(req.query.search));
			filter.name = new RegExp(safe, "i");
		}
		const kitchens = await Kitchen.find(filter)
			.populate({
				path: "items",
				select: "name barcode price stock isActive picture shelfNumber",
			})
			.populate("category", "name picture isActive sortOrder")
			.populate("market", "name username location cities")
			.sort({ sortOrder: 1, createdAt: -1 })
			.lean();
		const ras = { kitchens };
		sendResponse(res, 200, true, "OK", ras);
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
			.populate("category", "name picture isActive sortOrder")
			.populate("market", "name username location cities")
			.lean();
		if (!kitchen) return fail(res, 404, "Kitchen not found");
		const ras = { kitchen };
		sendResponse(res, 200, true, "OK", ras);
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
			category: sanitizeCategory(req.body && req.body.category),
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
			.populate("category", "name picture isActive sortOrder")
			.populate("market", "name username location cities")
			.lean();
		const ras = { kitchen: populated };
		sendResponse(res, 201, true, "Kitchen created successfully", ras);
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

		// Main admin cannot edit a kitchen owned by a market (view-only).
		if (!(await assertAdminMayModify(req, res, req.params.id))) return;

		const update = {};
		if (req.body && req.body.name !== undefined) {
			update.name = String(req.body.name).trim();
			if (!update.name) return fail(res, 400, "Kitchen name cannot be empty");
		}
		if (req.body && req.body.items !== undefined) {
			update.items = sanitizeItems(req.body.items);
		}
		if (req.body && req.body.category !== undefined) {
			update.category = sanitizeCategory(req.body.category);
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
			.populate("category", "name picture isActive sortOrder")
			.populate("market", "name username location cities")
			.lean();

		if (!kitchen) return fail(res, 404, "Kitchen not found");
		const ras = { kitchen };
		sendResponse(res, 200, true, "Kitchen updated successfully", ras);
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

		// Main admin cannot delete a kitchen owned by a market (view-only).
		if (!(await assertAdminMayModify(req, res, req.params.id))) return;

		const filter = { _id: req.params.id };
		if (req.user && req.user.role === "market") {
			filter.market = req.user.marketId;
		}
		const kitchen = await Kitchen.findOneAndDelete(filter);
		if (!kitchen) return fail(res, 404, "Kitchen not found");
		if (kitchen.picturePublicId) safeDestroy(kitchen.picturePublicId);
		const ras = { id: kitchen._id };
		sendResponse(res, 200, true, "Kitchen deleted successfully", ras);
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
			const safe = escapeRegex(String(req.query.search));
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
		const ras = { products };
		sendResponse(res, 200, true, "OK", ras);
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
		const ras = {
			url: result.url,
			public_id: result.public_id,
			size: req.file.size,
		};
		sendResponse(res, 200, true, "Image uploaded successfully", ras);
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
		const ras = { matched: result.matchedCount, modified: result.modifiedCount };
		sendResponse(res, 200, true, "Kitchen order saved", ras);
	} catch (err) {
		console.error("reorderKitchens:", err);
		fail(res, 500, err.message || "Server Error");
	}
};

