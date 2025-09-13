const Category = require("../models/Category");
const Product = require("../models/Product");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for image uploads
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		const uploadDir = path.join(__dirname, "../../public/images");
		// Ensure directory exists
		if (!fs.existsSync(uploadDir)) {
			fs.mkdirSync(uploadDir, { recursive: true });
		}
		cb(null, uploadDir);
	},
	filename: function (req, file, cb) {
		// Generate unique filename with timestamp
		const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
		const extension = path.extname(file.originalname);
		cb(null, uniqueName + extension);
	},
});

// File filter for images only
const fileFilter = (req, file, cb) => {
	if (file.mimetype.startsWith("image/")) {
		cb(null, true);
	} else {
		cb(new Error("Only image files are allowed!"), false);
	}
};

const upload = multer({
	storage: storage,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB limit
	},
	fileFilter: fileFilter,
});

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
exports.getCategories = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 50,
			search,
			isActive = "true",
			sortBy = "sortOrder",
			sortOrder = "asc",
			withProductCount = false,
		} = req.query;

		// Build filter object
		const filter = {};
		if (isActive !== "all") {
			filter.isActive = isActive === "true";
		}
		if (search) {
			filter.name = new RegExp(search, "i");
		}

		// Calculate pagination
		const pageNumber = parseInt(page);
		const limitNumber = parseInt(limit);
		const skip = (pageNumber - 1) * limitNumber;

		// Build sort object
		const sort = {};
		sort[sortBy] = sortOrder === "desc" ? -1 : 1;
		// Add secondary sort by name for consistent ordering
		if (sortBy !== "name") {
			sort.name = 1;
		}

		// Execute query
		let query = Category.find(filter).sort(sort).skip(skip).limit(limitNumber);

		if (withProductCount === "true") {
			query = query.populate("productCount");
		}

		query = query.populate("createdBy", "name email");

		const [categories, total] = await Promise.all([
			query.lean(),
			Category.countDocuments(filter),
		]);

		// Calculate pagination info
		const totalPages = Math.ceil(total / limitNumber);
		const hasNextPage = pageNumber < totalPages;
		const hasPrevPage = pageNumber > 1;

		res.json({
			success: true,
			data: categories,
			pagination: {
				currentPage: pageNumber,
				totalPages,
				totalCategories: total,
				hasNextPage,
				hasPrevPage,
				limit: limitNumber,
			},
		});
	} catch (error) {
		console.error("Error getting categories:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving categories",
			error: error.message,
		});
	}
};

// @desc    Get single category
// @route   GET /api/categories/:id
// @access  Public
exports.getCategory = async (req, res) => {
	try {
		const { id } = req.params;
		const { withProductCount = false } = req.query;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid category ID",
			});
		}

		let query = Category.findById(id).populate("createdBy", "name email");

		if (withProductCount === "true") {
			query = query.populate("productCount");
		}

		const category = await query;

		if (!category) {
			return res.status(404).json({
				success: false,
				message: "Category not found",
			});
		}

		res.json({
			success: true,
			data: category,
		});
	} catch (error) {
		console.error("Error getting category:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving category",
			error: error.message,
		});
	}
};

// @desc    Get category by name
// @route   GET /api/categories/name/:name
// @access  Public
exports.getCategoryByName = async (req, res) => {
	try {
		const { name } = req.params;
		const { withProductCount = false } = req.query;

		let query = Category.findOne({
			name: new RegExp(`^${name}$`, "i"),
			isActive: true,
		}).populate("createdBy", "name email");

		if (withProductCount === "true") {
			query = query.populate("productCount");
		}

		const category = await query;

		if (!category) {
			return res.status(404).json({
				success: false,
				message: "Category not found with this name",
			});
		}

		res.json({
			success: true,
			data: category,
		});
	} catch (error) {
		console.error("Error getting category by name:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving category by name",
			error: error.message,
		});
	}
};

// @desc    Create new category
// @route   POST /api/categories
// @access  Private (Admin/Manager)
exports.createCategory = async (req, res) => {
	try {
		const categoryData = { ...req.body };

		// Add creator if user is authenticated
		if (req.user) {
			categoryData.createdBy = req.user.id;
		}

		const category = await Category.create(categoryData);

		// Populate the created category
		await category.populate("createdBy", "name email");

		res.status(201).json({
			success: true,
			message: "Category created successfully",
			data: category,
		});
	} catch (error) {
		console.error("Error creating category:", error);

		// Handle duplicate name error
		if (error.code === 11000 && error.keyPattern?.name) {
			return res.status(400).json({
				success: false,
				message: "A category with this name already exists",
			});
		}

		res.status(400).json({
			success: false,
			message: "Error creating category",
			error: error.message,
		});
	}
};

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private (Admin/Manager)
exports.updateCategory = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid category ID",
			});
		}

		const category = await Category.findByIdAndUpdate(
			id,
			{ ...req.body, updatedAt: new Date() },
			{
				new: true,
				runValidators: true,
			}
		).populate("createdBy", "name email");

		if (!category) {
			return res.status(404).json({
				success: false,
				message: "Category not found",
			});
		}

		res.json({
			success: true,
			message: "Category updated successfully",
			data: category,
		});
	} catch (error) {
		console.error("Error updating category:", error);

		// Handle duplicate name error
		if (error.code === 11000 && error.keyPattern?.name) {
			return res.status(400).json({
				success: false,
				message: "A category with this name already exists",
			});
		}

		res.status(400).json({
			success: false,
			message: "Error updating category",
			error: error.message,
		});
	}
};

// @desc    Delete category (soft delete)
// @route   DELETE /api/categories/:id
// @access  Private (Admin)
exports.deleteCategory = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid category ID",
			});
		}

		// Check if category has products
		const productCount = await Product.countDocuments({
			category: id,
			isActive: true,
		});

		if (productCount > 0) {
			return res.status(400).json({
				success: false,
				message: `Cannot delete category because it has ${productCount} active products`,
			});
		}

		const category = await Category.findByIdAndUpdate(
			id,
			{ isActive: false, updatedAt: new Date() },
			{ new: true }
		);

		if (!category) {
			return res.status(404).json({
				success: false,
				message: "Category not found",
			});
		}

		res.json({
			success: true,
			message: "Category deleted successfully",
			data: category,
		});
	} catch (error) {
		console.error("Error deleting category:", error);
		res.status(500).json({
			success: false,
			message: "Error deleting category",
			error: error.message,
		});
	}
};

// @desc    Permanently delete category
// @route   DELETE /api/categories/:id/permanent
// @access  Private (Admin)
exports.permanentDeleteCategory = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid category ID",
			});
		}

		// Check if category has products
		const productCount = await Product.countDocuments({ category: id });

		if (productCount > 0) {
			return res.status(400).json({
				success: false,
				message: `Cannot permanently delete category because it has ${productCount} associated products`,
			});
		}

		const category = await Category.findByIdAndDelete(id);

		if (!category) {
			return res.status(404).json({
				success: false,
				message: "Category not found",
			});
		}

		res.json({
			success: true,
			message: "Category permanently deleted",
		});
	} catch (error) {
		console.error("Error permanently deleting category:", error);
		res.status(500).json({
			success: false,
			message: "Error permanently deleting category",
			error: error.message,
		});
	}
};

// @desc    Get categories with product counts
// @route   GET /api/categories/stats
// @access  Public
exports.getCategoryStats = async (req, res) => {
	try {
		const stats = await Category.aggregate([
			{ $match: { isActive: true } },
			{
				$lookup: {
					from: "products",
					localField: "_id",
					foreignField: "category",
					as: "products",
				},
			},
			{
				$project: {
					name: 1,
					color: 1,
					icon: 1,
					sortOrder: 1,
					productCount: { $size: "$products" },
					activeProductCount: {
						$size: {
							$filter: {
								input: "$products",
								as: "product",
								cond: { $eq: ["$$product.isActive", true] },
							},
						},
					},
				},
			},
			{ $sort: { sortOrder: 1, name: 1 } },
		]);

		res.json({
			success: true,
			data: stats,
		});
	} catch (error) {
		console.error("Error getting category stats:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving category statistics",
			error: error.message,
		});
	}
};

// @desc    Reorder categories
// @route   PATCH /api/categories/reorder
// @access  Private (Admin/Manager)
exports.reorderCategories = async (req, res) => {
	try {
		const { categoryOrders } = req.body;

		if (!Array.isArray(categoryOrders)) {
			return res.status(400).json({
				success: false,
				message: "categoryOrders must be an array",
			});
		}

		const updatePromises = categoryOrders.map((item) => {
			if (!mongoose.Types.ObjectId.isValid(item.id)) {
				throw new Error(`Invalid category ID: ${item.id}`);
			}

			return Category.findByIdAndUpdate(
				item.id,
				{ sortOrder: item.sortOrder },
				{ new: true }
			);
		});

		const updatedCategories = await Promise.all(updatePromises);

		res.json({
			success: true,
			message: "Categories reordered successfully",
			data: updatedCategories.filter(Boolean), // Remove any null results
		});
	} catch (error) {
		console.error("Error reordering categories:", error);
		res.status(400).json({
			success: false,
			message: "Error reordering categories",
			error: error.message,
		});
	}
};

// @desc    Upload category image
// @route   POST /api/categories/upload-image
// @access  Private (Admin, Manager)
exports.uploadImage = async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({
				success: false,
				message: "No image file provided",
			});
		}

		// Generate the URL for the uploaded image
		const imageUrl = `/images/${req.file.filename}`;

		res.json({
			success: true,
			message: "Image uploaded successfully",
			data: {
				filename: req.file.filename,
				url: imageUrl,
				size: req.file.size,
			},
		});
	} catch (error) {
		console.error("Error uploading image:", error);
		res.status(500).json({
			success: false,
			message: "Error uploading image",
			error: error.message,
		});
	}
};

// @desc    Get product count for a specific category
// @route   GET /api/categories/:id/product-count
// @access  Public
exports.getCategoryProductCount = async (req, res) => {
	try {
		const { id } = req.params;

		// Validate category ID
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid category ID format",
			});
		}

		// First check if the category exists
		const category = await Category.findById(id);
		if (!category) {
			return res.status(404).json({
				success: false,
				message: "Category not found",
			});
		}

		// Count products in this category
		const productCount = await Product.countDocuments({
			category: id,
			isActive: true,
		});

		res.json({
			success: true,
			data: {
				categoryId: id,
				categoryName: category.name,
				productCount: productCount,
			},
			message: `Category '${category.name}' has ${productCount} active products`,
		});
	} catch (error) {
		console.error("Error getting category product count:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving category product count",
			error: error.message,
		});
	}
};

// Export multer upload middleware
exports.uploadMiddleware = upload.single("image");
