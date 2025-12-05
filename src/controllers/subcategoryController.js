const Subcategory = require("../models/Subcategory");
const Category = require("../models/Category");

// Create subcategory
exports.createSubcategory = async (req, res) => {
	try {
		const { name, parentCategory, sortorder } = req.body;

		if (!name || !parentCategory) {
			return res.status(400).json({
				success: false,
				error: "Name and parentCategory are required",
			});
		}

		// Ensure parent category exists
		const category = await Category.findById(parentCategory);
		if (!category)
			return res
				.status(404)
				.json({ success: false, error: "Parent category not found" });

		const sub = await Subcategory.create({
			name,
			parentCategory,
			sortorder,
			createdBy: req.user ? req.user.id : undefined,
		});

		res.status(201).json({ success: true, data: sub });
	} catch (error) {
		res.status(400).json({ success: false, error: error.message });
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
		res.status(200).json({
			success: true,
			count: subcategories.length,
			data: subcategories,
		});
	} catch (error) {
		res.status(400).json({ success: false, error: error.message });
	}
};

// Get single subcategory
exports.getSubcategoryById = async (req, res) => {
	try {
		const sub = await Subcategory.findById(req.params.id).populate(
			"parentCategory",
			"name image"
		);
		if (!sub)
			return res
				.status(404)
				.json({ success: false, error: "Subcategory not found" });
		res.status(200).json({ success: true, data: sub });
	} catch (error) {
		res.status(400).json({ success: false, error: error.message });
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
		if (!sub)
			return res
				.status(404)
				.json({ success: false, error: "Subcategory not found" });
		res.status(200).json({ success: true, data: sub });
	} catch (error) {
		res.status(400).json({ success: false, error: error.message });
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
		if (!sub)
			return res
				.status(404)
				.json({ success: false, error: "Subcategory not found" });
		res.status(200).json({ success: true, data: {} });
	} catch (error) {
		res.status(400).json({ success: false, error: error.message });
	}
};
