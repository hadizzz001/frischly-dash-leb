const Subcategory = require("../models/Subcategory");
const Category = require("../models/Category");
const { sendSuccess, sendError, sendResponse } = require("../utils/apiResponse");

// Create subcategory
exports.createSubcategory = async (req, res) => {
	try {
		const { name, parentCategory, sortorder } = req.body;

		if (!name || !parentCategory) {
			return sendError(res, 400, "Name and parentCategory are required");
		}

		// Ensure parent category exists
		const category = await Category.findById(parentCategory);
		if (!category)
			return sendError(res, 404, "Parent category not found");

		const sub = await Subcategory.create({
			name,
			parentCategory,
			sortorder,
			createdBy: req.user ? req.user.id : undefined,
		});

		const ras = { subcategory: sub };
		sendResponse(res, 201, true, "Subcategory created", ras);
	} catch (error) {
		sendError(res, 400, error.message);
	}
};

// Get all subcategories (with optional parent filter)
exports.getAllSubcategories = async (req, res) => {
	try {
		const { parent, active } = req.query;
		const query = {};
		if (active !== undefined) {
			if (active === "all") {
				// no isActive filter
			} else {
				query.isActive = active === "false" ? false : true;
			}
		} else {
			query.isActive = true; // default
		}
		if (parent) query.parentCategory = parent;

		const subcategories = await Subcategory.find(query)
			.populate("parentCategory", "name image")
			.sort({ sortorder: 1 });
		const ras2 = { subcategories, count: subcategories.length };
		sendResponse(res, 200, true, "Subcategories fetched", ras2);
	} catch (error) {
		sendError(res, 400, error.message);
	}
};

// Get single subcategory
exports.getSubcategoryById = async (req, res) => {
	try {
		const sub = await Subcategory.findById(req.params.id).populate(
			"parentCategory",
			"name image"
		);
		if (!sub) return sendError(res, 404, "Subcategory not found");
		const ras3 = { subcategory: sub };
		sendResponse(res, 200, true, "Success", ras3);
	} catch (error) {
		sendError(res, 400, error.message);
	}
};

// Update subcategory
exports.updateSubcategory = async (req, res) => {
	try {
		const { name, isActive, sortorder } = req.body;
		const update = {};
		if (name !== undefined) update.name = name;
		if (isActive !== undefined) update.isActive = isActive;
		if (sortorder !== undefined) update.sortorder = sortorder;

		const sub = await Subcategory.findByIdAndUpdate(req.params.id, update, {
			new: true,
			runValidators: true,
		});
		if (!sub) return sendError(res, 404, "Subcategory not found");
		const ras4 = { subcategory: sub };
		sendResponse(res, 200, true, "Success", ras4);
	} catch (error) {
		sendError(res, 400, error.message);
	}
};

// Delete (soft delete) subcategory
exports.deleteSubcategory = async (req, res) => {
	try {
		const sub = await Subcategory.findByIdAndUpdate(
			req.params.id,
			{ isActive: false },
			{ new: true }
		);
		if (!sub) return sendError(res, 404, "Subcategory not found");
		const ras5 = {};
		sendResponse(res, 200, true, "Success", ras5);
	} catch (error) {
		sendError(res, 400, error.message);
	}
};
