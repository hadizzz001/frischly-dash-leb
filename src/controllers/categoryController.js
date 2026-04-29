const Category = require("../models/Category");
const Product = require("../models/Product");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;

// Configure Cloudinary
cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dbgnsnrto",
	api_key: process.env.CLOUDINARY_API_KEY || "431121896297761",
	api_secret:
		process.env.CLOUDINARY_API_SECRET || "omVgd2HdystgoGQ5yXngAZ40yTg",
});

// Configure multer for memory storage (for Cloudinary)
const storage = multer.memoryStorage();

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

// Helper function to upload image to Cloudinary
const uploadToCloudinary = (buffer, folder = "categories") => {
	return new Promise((resolve, reject) => {
		const uploadOptions = {
			folder: folder,
			resource_type: "image",
			quality: "auto",
			format: "webp",
			transformation: [
				{ quality: "auto:eco", width: 500, crop: "scale" }, // Resize to the specified width, maintaining aspect ratio
			],
		};

		const stream = cloudinary.uploader.upload_stream(
			uploadOptions,
			(error, result) => {
				if (error) {
					reject(error);
				} else {
					resolve({
						url: result.secure_url,
						public_id: result.public_id,
					});
				}
			}
		);

		stream.end(buffer);
	});
};

// Helper function to delete image from Cloudinary
const deleteFromCloudinary = (publicId) => {
	return new Promise((resolve, reject) => {
		cloudinary.uploader.destroy(publicId, (error, result) => {
			if (error) {
				reject(error);
			} else {
				resolve(result);
			}
		});
	});
};

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
		// Add secondary sort by sortOrder for consistent ordering
		if (sortBy !== "sortOrder") {
			sort.sortOrder = 1;
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
			message: "Error fetching categories",
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
			message: "Error fetching category",
			error: error.message,
		});
	}
};

// @desc    Get category by name
// @route   GET /api/categories/name/:name
// @access  Public
// exports.getCategoryByName = async (req, res) => {
// 	try {
// 		const { name } = req.params;
// 		const { withProductCount = false } = req.query;

// 		let query = Category.findOne({
// 			name: new RegExp(`^${name}$`, "i"),
// 			isActive: true,
// 		}).populate("createdBy", "name email");

// 		if (withProductCount === "true") {
// 			query = query.populate("productCount");
// 		}

// 		const category = await query;

// 		if (!category) {
// 			return res.status(404).json({
// 				success: false,
// 				message: "Category not found with this name",
// 			});
// 		}

// 		res.json({
// 			success: true,
// 			data: category,
// 		});
// 	} catch (error) {
// 		console.error("Error getting category by name:", error);
// 		res.status(500).json({
// 			success: false,
// 			message: "Error retrieving category by name",
// 			error: error.message,
// 		});
// 	}
// };

// @desc    Create new category
// @route   POST /api/categories
// @access  Private (Admin/Manager)
exports.createCategory = async (req, res) => {
	try {
		const categoryData = { ...req.body };

		// Handle image upload if provided
		if (req.file) {
			try {
				const uploadResult = await uploadToCloudinary(req.file.buffer);
				categoryData.image = uploadResult.url;
				categoryData.imagePublicId = uploadResult.public_id;
			} catch (uploadError) {
				console.error("Error uploading image to Cloudinary:", uploadError);
				return res.status(500).json({
					success: false,
					message: "Error uploading image",
					error: uploadError.message,
				});
			}
		}

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

		const category = await Category.findById(id);
		if (!category) {
			return res.status(404).json({
				success: false,
				message: "Category not found",
			});
		}

		const updateData = { ...req.body, updatedAt: new Date() };

		// Handle image upload if provided
		if (req.file) {
			try {
				// Delete old image from Cloudinary if it exists
				if (category.imagePublicId) {
					await deleteFromCloudinary(category.imagePublicId);
				}

				// Upload new image to Cloudinary
				const uploadResult = await uploadToCloudinary(req.file.buffer);
				updateData.image = uploadResult.url;
				updateData.imagePublicId = uploadResult.public_id;
			} catch (uploadError) {
				console.error("Error uploading image to Cloudinary:", uploadError);
				return res.status(500).json({
					success: false,
					message: "Error uploading image",
					error: uploadError.message,
				});
			}
		}

		const updatedCategory = await Category.findByIdAndUpdate(id, updateData, {
			new: true,
			runValidators: true,
		}).populate("createdBy", "name email");

		// If category is being deactivated, also deactivate all its subcategories
		if (updateData.isActive === false && category.isActive !== false) {
			const Subcategory = require("../models/Subcategory");
			await Subcategory.updateMany(
				{ parentCategory: id },
				{ isActive: false, updatedAt: new Date() }
			);
		}

		res.json({
			success: true,
			message: "Category updated successfully",
			data: updatedCategory,
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

		// Check if category has products through subcategories
		const Subcategory = require("../models/Subcategory");
		const subcategories = await Subcategory.find({
			parentCategory: id,
			isActive: true,
		}).select("_id");

		const subcategoryIds = subcategories.map((sub) => sub._id);
		const productCount = await Product.countDocuments({
			subcategory: { $in: subcategoryIds },
			isActive: true,
		});

		if (productCount > 0) {
			return res.status(400).json({
				success: false,
				message: `Category cannot be deleted because it has ${productCount} active products`,
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

		// Deactivate all subcategories of this category
		await Subcategory.updateMany(
			{ parentCategory: id },
			{ isActive: false, updatedAt: new Date() }
		);

		res.json({
			success: true,
			message: "Category and its subcategories deleted successfully",
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

		// Check if category has products through subcategories
		const Subcategory = require("../models/Subcategory");
		const subcategories = await Subcategory.find({ parentCategory: id }).select(
			"_id"
		);
		const subcategoryIds = subcategories.map((sub) => sub._id);
		const productCount = await Product.countDocuments({
			subcategory: { $in: subcategoryIds },
		});

		if (productCount > 0) {
			return res.status(400).json({
				success: false,
				message: `Category cannot be permanently deleted because it has ${productCount} associated products`,
			});
		}

		const category = await Category.findById(id);

		if (!category) {
			return res.status(404).json({
				success: false,
				message: "Category not found",
			});
		}

		// Delete image from Cloudinary if it exists
		if (category.imagePublicId) {
			try {
				await deleteFromCloudinary(category.imagePublicId);
			} catch (deleteError) {
				console.error("Error deleting image from Cloudinary:", deleteError);
				// Continue with category deletion even if image deletion fails
			}
		}

		// Permanently delete the category
		await Category.findByIdAndDelete(id);

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
// exports.getCategoryStats = async (req, res) => {
// 	try {
// 		const stats = await Category.aggregate([
// 			{ $match: { isActive: true } },
// 			{
// 				$lookup: {
// 					from: "products",
// 					localField: "_id",
// 					foreignField: "category",
// 					as: "products",
// 				},
// 			},
// 			{
// 				$project: {
// 					name: 1,
// 					color: 1,
// 					icon: 1,
// 					sortOrder: 1,
// 					productCount: { $size: "$products" },
// 					activeProductCount: {
// 						$size: {
// 							$filter: {
// 								input: "$products",
// 								as: "product",
// 								cond: { $eq: ["$$product.isActive", true] },
// 							},
// 						},
// 					},
// 				},
// 			},
// 			{ $sort: { sortOrder: 1, name: 1 } },
// 		]);

// 		res.json({
// 			success: true,
// 			data: stats,
// 		});
// 	} catch (error) {
// 		console.error("Error getting category stats:", error);
// 		res.status(500).json({
// 			success: false,
// 			message: "Error retrieving category statistics",
// 			error: error.message,
// 		});
// 	}
// };

// @desc    Reorder categories
// @route   PATCH /api/categories/reorder
// @access  Private (Admin/Manager)
// exports.reorderCategories = async (req, res) => {
// 	try {
// 		const { categoryOrders } = req.body;

// 		if (!Array.isArray(categoryOrders)) {
// 			return res.status(400).json({
// 				success: false,
// 				message: "categoryOrders must be an array",
// 			});
// 		}

// 		const updatePromises = categoryOrders.map((item) => {
// 			if (!mongoose.Types.ObjectId.isValid(item.id)) {
// 				throw new Error(`Invalid category ID: ${item.id}`);
// 			}

// 			return Category.findByIdAndUpdate(
// 				item.id,
// 				{ sortOrder: item.sortOrder },
// 				{ new: true }
// 			);
// 		});

// 		const updatedCategories = await Promise.all(updatePromises);

// 		res.json({
// 			success: true,
// 			message: "Categories reordered successfully",
// 			data: updatedCategories.filter(Boolean), // Remove any null results
// 		});
// 	} catch (error) {
// 		console.error("Error reordering categories:", error);
// 		res.status(400).json({
// 			success: false,
// 			message: "Error reordering categories",
// 			error: error.message,
// 		});
// 	}
// };

// @desc    Upload category image
// @route   POST /api/categories/upload-image
// @access  Private (Admin, Manager)
exports.uploadImage = async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({
				success: false,
				message: "Keine Bilddatei bereitgestellt",
			});
		}

		// Upload image to Cloudinary
		const uploadResult = await uploadToCloudinary(req.file.buffer);

		res.json({
			success: true,
			message: "Image uploaded successfully",
			data: {
				url: uploadResult.url,
				public_id: uploadResult.public_id,
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

		// Count products in this category through subcategories
		const Subcategory = require("../models/Subcategory");

		// Find all active subcategories for this category
		const subcategories = await Subcategory.find({
			parentCategory: id,
			isActive: true,
		}).select("_id");

		const subcategoryIds = subcategories.map((sub) => sub._id);

		// Count products that belong to these subcategories
		const productCount = await Product.countDocuments({
			subcategory: { $in: subcategoryIds },
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
			message: "Error fetching category product count",
			error: error.message,
		});
	}
};

// @desc    Get product count for all categories
// @route   GET /api/categories/all/product-count
// @access  Public
exports.getAllCategoriesProductCount = async (req, res) => {
	try {
		// Use MongoDB aggregation for better performance
		const categoryProductCounts = await Category.aggregate([
			{
				$match: { isActive: true },
			},
			{
				$lookup: {
					from: "subcategories",
					let: { categoryId: "$_id" },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $eq: ["$parentCategory", "$$categoryId"] },
										{ $eq: ["$isActive", true] },
									],
								},
							},
						},
					],
					as: "subcategories",
				},
			},
			{
				$lookup: {
					from: "products",
					let: { subcategoryIds: "$subcategories._id" },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $in: ["$subcategory", "$$subcategoryIds"] },
										{ $eq: ["$isActive", true] },
									],
								},
							},
						},
						{
							$count: "count",
						},
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
			{
				$sort: { categoryName: 1 },
			},
		]);

		res.json({
			success: true,
			data: categoryProductCounts,
			total: categoryProductCounts.length,
			message: `Product counts retrieved for ${categoryProductCounts.length} categories`,
		});
	} catch (error) {
		console.error("Error getting all categories product count:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching category product counts",
			error: error.message,
		});
	}
};

// Export multer upload middleware
exports.uploadMiddleware = upload.single("image");
