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
const uploadToCloudinary = (buffer, folder = "products") => {
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

// @desc    Get all products
// @route   GET /api/products
// @access  Public
exports.getProducts = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 10,
			search,
			category, // Filter by direct category field
			subcategory,
			shelfNumber,
			isActive = true,
			inAds,
			sortBy = "createdAt",
			sortOrder = "desc",
			priceRange,
			stockLevel,
		} = req.query;

		// Build filter object
		const filter = {};
		if (isActive !== "all") {
			filter.isActive = isActive === "true" || isActive === true;
		}
		if (inAds !== undefined && inAds !== "all") {
			filter.inAds = inAds === "true" || inAds === true;
		}
		if (category) {
			// Filter by direct category field
			if (mongoose.Types.ObjectId.isValid(category)) {
				filter.category = category;
			} else {
				// Will need to lookup category by name in aggregation pipeline
				filter.categoryName = new RegExp(category, "i");
			}
		}
		if (subcategory) {
			// Direct subcategory filtering
			if (mongoose.Types.ObjectId.isValid(subcategory)) {
				filter.subcategory = subcategory;
			} else {
				// Will need to lookup subcategory by name in aggregation pipeline
				filter.subcategoryName = new RegExp(subcategory, "i");
			}
		}
		if (shelfNumber) {
			filter.shelfNumber = new RegExp(shelfNumber, "i");
		}
		if (search) {
			filter.$or = [
				{ name: new RegExp(search, "i") },
				{ barcode: new RegExp(search, "i") },
				{ description: new RegExp(search, "i") },
			];
		}

		// Price range filtering
		if (priceRange && priceRange !== "all") {
			const [minPrice, maxPrice] = priceRange
				.split("-")
				.map((p) => parseFloat(p));
			if (maxPrice) {
				filter.price = { $gte: minPrice, $lte: maxPrice };
			} else if (priceRange.endsWith("+")) {
				filter.price = { $gte: minPrice };
			} else {
				filter.price = { $lt: minPrice };
			}
		}

		// Stock level filtering
		if (stockLevel && stockLevel !== "all") {
			switch (stockLevel) {
				case "out":
					filter.stock = 0;
					break;
				case "low":
					filter.stock = { $gte: 1, $lte: 10 };
					break;
				case "medium":
					filter.stock = { $gte: 11, $lte: 50 };
					break;
				case "high":
					filter.stock = { $gte: 51 };
					break;
				case "Available":
					filter.stock = { $gte: 1 };
			}
		}

		// Calculate pagination
		const pageNumber = parseInt(page);
		const limitNumber = parseInt(limit);
		const skip = (pageNumber - 1) * limitNumber;

		// Build sort object
		const sort = {};
		sort[sortBy] = sortOrder === "desc" ? -1 : 1;

		// Execute queries with category lookup if needed
		let productsQuery;
		let countQuery;

		if (filter.categoryName) {
			// Use aggregation pipeline for category name filtering
			const pipeline = [
				{
					$lookup: {
						from: "categories",
						localField: "category",
						foreignField: "_id",
						as: "categoryInfo",
					},
				},
				{
					$match: {
						...filter,
						"categoryInfo.name": filter.categoryName,
					},
				},
				{
					$lookup: {
						from: "users",
						localField: "createdBy",
						foreignField: "_id",
						as: "createdBy",
						pipeline: [{ $project: { name: 1, email: 1 } }],
					},
				},
				{ $sort: sort },
				{ $skip: skip },
				{ $limit: limitNumber },
			];
			delete pipeline[1].$match.categoryName; // Remove the helper field

			productsQuery = Product.aggregate(pipeline);
			countQuery = Product.aggregate([
				{
					$lookup: {
						from: "categories",
						localField: "category",
						foreignField: "_id",
						as: "categoryInfo",
					},
				},
				{
					$match: {
						...filter,
						"categoryInfo.name": filter.categoryName,
					},
				},
				{ $count: "total" },
			]);
			delete countQuery[1].$match.categoryName; // Remove the helper field from count query
		} else {
			// Regular query without category name filtering
			delete filter.categoryName;
			delete filter.subcategoryName;
			productsQuery = Product.find(filter)
				.populate("category", "name color icon")
				.populate({
					path: "subcategory",
					select: "name slug parentCategory",
					populate: {
						path: "parentCategory",
						select: "name color icon",
					},
				})
				.populate("createdBy", "name email")
				.sort(sort)
				.skip(skip)
				.limit(limitNumber)
				.lean();
			countQuery = Product.countDocuments(filter);
		}

		const [products, totalResult] = await Promise.all([
			productsQuery,
			countQuery,
		]);
		const total = Array.isArray(totalResult)
			? totalResult[0]?.total || 0
			: totalResult;

		// Calculate pagination info
		const totalPages = Math.ceil(total / limitNumber);
		const hasNextPage = pageNumber < totalPages;
		const hasPrevPage = pageNumber > 1;

		res.json({
			success: true,
			data: products,
			pagination: {
				currentPage: pageNumber,
				totalPages,
				totalProducts: total,
				hasNextPage,
				hasPrevPage,
				limit: limitNumber,
			},
		});
	} catch (error) {
		console.error("Error getting products:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving products",
			error: error.message,
		});
	}
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid product ID",
			});
		}

		const product = await Product.findById(id)
			.populate("category", "name color icon")
			.populate({
				path: "subcategory",
				select: "name slug parentCategory",
				populate: {
					path: "parentCategory",
					select: "name color icon",
				},
			})
			.populate("createdBy", "name email");

		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Product not found",
			});
		}

		res.json({
			success: true,
			data: product,
		});
	} catch (error) {
		console.error("Error getting product:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving product",
			error: error.message,
		});
	}
};

// @desc    Get product by barcode
// @route   GET /api/products/barcode/:barcode
// @access  Public
exports.getProductByBarcode = async (req, res) => {
	try {
		const { barcode } = req.params;

		const product = await Product.findByBarcode(barcode)
			.populate("category", "name color icon")
			.populate({
				path: "subcategory",
				select: "name slug parentCategory",
				populate: {
					path: "parentCategory",
					select: "name color icon",
				},
			})
			.populate("createdBy", "name email");

		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Product not found with this barcode",
			});
		}

		res.json({
			success: true,
			data: product,
		});
	} catch (error) {
		console.error("Error getting product by barcode:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving product by barcode",
			error: error.message,
		});
	}
};

// @desc    Get products by shelf number
// @route   GET /api/products/shelf/:shelfNumber
// @access  Public
exports.getProductsByShelfNumber = async (req, res) => {
	try {
		const { shelfNumber } = req.params;

		const products = await Product.findByShelfNumber(shelfNumber)
			.populate("category", "name color icon")
			.populate({
				path: "subcategory",
				select: "name slug parentCategory",
				populate: {
					path: "parentCategory",
					select: "name color icon",
				},
			})
			.populate("createdBy", "name email");

		res.json({
			success: true,
			data: products,
			count: products.length,
		});
	} catch (error) {
		console.error("Error getting products by shelf number:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving products by shelf number",
			error: error.message,
		});
	}
};

// @desc    Create new product
// @route   POST /api/products
// @access  Private (Admin/Manager)
exports.createProduct = async (req, res) => {
	try {
		const productData = { ...req.body };

		// Handle image upload if provided
		if (req.file) {
			try {
				const uploadResult = await uploadToCloudinary(req.file.buffer);
				productData.picture = uploadResult.url;
				productData.imagePublicId = uploadResult.public_id;
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
			productData.createdBy = req.user.id;
		}

		const product = await Product.create(productData);

		// Populate the created product
		await product.populate([
			{ path: "category", select: "name color icon" },
			{
				path: "subcategory",
				select: "name slug parentCategory",
				populate: {
					path: "parentCategory",
					select: "name color icon",
				},
			},
			{ path: "createdBy", select: "name email" },
		]);

		res.status(201).json({
			success: true,
			message: "Product created successfully",
			data: product,
		});
	} catch (error) {
		console.error("Error creating product:", error);

		// Handle duplicate barcode error
		if (error.code === 11000 && error.keyPattern?.barcode) {
			return res.status(400).json({
				success: false,
				message: "A product with this barcode already exists",
			});
		}

		res.status(400).json({
			success: false,
			message: "Error creating product",
			error: error.message,
		});
	}
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private (Admin/Manager/staff)
exports.updateProduct = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid product ID",
			});
		}

		const product = await Product.findById(id);
		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Product not found",
			});
		}

		const updateData = { ...req.body, updatedAt: new Date() };

		// Handle image upload if provided
		if (req.file) {
			try {
				// Delete old image from Cloudinary if it exists
				if (product.imagePublicId) {
					await deleteFromCloudinary(product.imagePublicId);
				}

				// Upload new image to Cloudinary
				const uploadResult = await uploadToCloudinary(req.file.buffer);
				updateData.picture = uploadResult.url;
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

		const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
			new: true,
			runValidators: true,
		})
			.populate("category", "name color icon")
			.populate({
				path: "subcategory",
				select: "name slug parentCategory",
				populate: {
					path: "parentCategory",
					select: "name color icon",
				},
			})
			.populate("createdBy", "name email");

		res.json({
			success: true,
			message: "Product updated successfully",
			data: updatedProduct,
		});
	} catch (error) {
		console.error("Error updating product:", error);

		// Handle duplicate barcode error
		if (error.code === 11000 && error.keyPattern?.barcode) {
			return res.status(400).json({
				success: false,
				message: "A product with this barcode already exists",
			});
		}

		res.status(400).json({
			success: false,
			message: "Error updating product",
			error: error.message,
		});
	}
};

// @desc    Update product stock
// @route   PATCH /api/products/:id/stock
// @access  Private (Admin/Manager)
exports.updateProductStock = async (req, res) => {
	try {
		const { id } = req.params;
		const { quantity, operation = "set" } = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid product ID",
			});
		}

		if (typeof quantity !== "number" || quantity < 0) {
			return res.status(400).json({
				success: false,
				message: "Quantity must be a non-negative number",
			});
		}

		const product = await Product.findById(id);

		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Product not found",
			});
		}

		await product.updateStock(quantity, operation);

		// Update last restocked date if adding stock
		if (operation === "add" || operation === "set") {
			product.lastRestocked = new Date();
			await product.save();
		}

		await product.populate([
			{ path: "category", select: "name color icon" },
			{
				path: "subcategory",
				select: "name slug parentCategory",
				populate: {
					path: "parentCategory",
					select: "name color icon",
				},
			},
			{ path: "createdBy", select: "name email" },
		]);

		res.json({
			success: true,
			message: `Product stock ${operation}ed successfully`,
			data: product,
		});
	} catch (error) {
		console.error("Error updating product stock:", error);
		res.status(400).json({
			success: false,
			message: "Error updating product stock",
			error: error.message,
		});
	}
};

// @desc    Update product shelf number
// @route   PATCH /api/products/:id/shelf
// @access  Private (Admin/Manager/Staff)
exports.updateProductShelfNumber = async (req, res) => {
	try {
		const { id } = req.params;
		const { shelfNumber } = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid product ID",
			});
		}

		if (!shelfNumber || typeof shelfNumber !== "string") {
			return res.status(400).json({
				success: false,
				message: "Shelf number is required and must be a string",
			});
		}

		const product = await Product.findById(id);

		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Product not found",
			});
		}

		product.shelfNumber = shelfNumber.trim();
		product.updatedAt = new Date();
		await product.save();

		await product.populate([
			{ path: "category", select: "name color icon" },
			{
				path: "subcategory",
				select: "name slug parentCategory",
				populate: {
					path: "parentCategory",
					select: "name color icon",
				},
			},
			{ path: "createdBy", select: "name email" },
		]);

		res.json({
			success: true,
			message: "Product shelf number updated successfully",
			data: product,
		});
	} catch (error) {
		console.error("Error updating product shelf number:", error);
		res.status(400).json({
			success: false,
			message: "Error updating product shelf number",
			error: error.message,
		});
	}
};

// @desc    Delete product (soft delete)
// @route   DELETE /api/products/:id
// @access  Private (Admin)
exports.deleteProduct = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid product ID",
			});
		}

		const product = await Product.findByIdAndUpdate(
			id,
			{ isActive: false, updatedAt: new Date() },
			{ new: true }
		);

		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Product not found",
			});
		}

		res.json({
			success: true,
			message: "Product deleted successfully",
			data: product,
		});
	} catch (error) {
		console.error("Error deleting product:", error);
		res.status(500).json({
			success: false,
			message: "Error deleting product",
			error: error.message,
		});
	}
};

// @desc    Permanently delete product
// @route   DELETE /api/products/:id/permanent
// @access  Private (Admin)
exports.permanentDeleteProduct = async (req, res) => {
	try {
		const { id } = req.params;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Invalid product ID",
			});
		}

		const product = await Product.findById(id);

		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Product not found",
			});
		}

		// Delete image from Cloudinary if it exists
		if (product.imagePublicId) {
			try {
				await deleteFromCloudinary(product.imagePublicId);
			} catch (deleteError) {
				console.error("Error deleting image from Cloudinary:", deleteError);
				// Continue with product deletion even if image deletion fails
			}
		}

		// Permanently delete the product
		await Product.findByIdAndDelete(id);

		res.json({
			success: true,
			message: "Product permanently deleted",
		});
	} catch (error) {
		console.error("Error permanently deleting product:", error);
		res.status(500).json({
			success: false,
			message: "Error permanently deleting product",
			error: error.message,
		});
	}
};

// @desc    Get shelf numbers
// @route   GET /api/products/shelves
// @access  Public
exports.getShelfNumbers = async (req, res) => {
	try {
		const shelfNumbers = await Product.distinct("shelfNumber", {
			isActive: true,
		});

		res.json({
			success: true,
			data: shelfNumbers.sort(),
		});
	} catch (error) {
		console.error("Error getting shelf numbers:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving shelf numbers",
			error: error.message,
		});
	}
};

// @desc    Upload product image
// @route   POST /api/products/upload-image
// @access  Private (Admin, Manager)
exports.uploadImage = async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({
				success: false,
				message: "No image file provided",
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

// @desc    Get products by category name
// @route   GET /api/products/category
// @access  Public
exports.getProductsByCategory = async (req, res) => {
	try {
		const {
			categoryName,
			page = 1,
			limit = 10,
			search,
			isActive = true,
			sortBy = "createdAt",
			sortOrder = "desc",
			priceRange,
			stockLevel,
		} = req.query;

		if (!categoryName) {
			return res.status(400).json({
				success: false,
				message: "Category name is required",
			});
		}

		// First, find the category by name to get its ID
		const Category = require("../models/Category");
		const category = await Category.findOne({
			name: new RegExp(categoryName, "i"),
			isActive: true,
		});

		if (!category) {
			return res.status(404).json({
				success: false,
				message: `Category "${categoryName}" not found`,
			});
		}

		// Build base filter with the category ID
		const baseFilter = {
			category: category._id, // Products must have this category ID
		};

		if (isActive !== "all") {
			baseFilter.isActive = isActive === "true" || isActive === true;
		}

		// Add search filter if provided
		if (search) {
			baseFilter.$or = [
				{ name: new RegExp(search, "i") },
				{ barcode: new RegExp(search, "i") },
				{ description: new RegExp(search, "i") },
			];
		}

		// Price range filtering
		if (priceRange && priceRange !== "all") {
			if (priceRange.includes("-")) {
				const [minPrice, maxPrice] = priceRange
					.split("-")
					.map((p) => parseFloat(p));
				if (maxPrice) {
					baseFilter.price = { $gte: minPrice, $lte: maxPrice };
				} else {
					baseFilter.price = { $gte: minPrice };
				}
			} else if (priceRange.endsWith("+")) {
				const minPrice = parseFloat(priceRange.replace("+", ""));
				baseFilter.price = { $gte: minPrice };
			}
		}

		// Stock level filtering
		if (stockLevel && stockLevel !== "all") {
			switch (stockLevel) {
				case "out":
					baseFilter.stock = 0;
					break;
				case "low":
					baseFilter.stock = { $gte: 1, $lte: 10 };
					break;
				case "medium":
					baseFilter.stock = { $gte: 11, $lte: 50 };
					break;
				case "high":
					baseFilter.stock = { $gte: 51 };
					break;
				case "Available":
					baseFilter.stock = { $gte: 1 };
					break;
			}
		}

		// Calculate pagination
		const pageNumber = parseInt(page);
		const limitNumber = parseInt(limit);
		const skip = (pageNumber - 1) * limitNumber;

		// Build sort object
		const sort = {};
		sort[sortBy] = sortOrder === "desc" ? -1 : 1;

		// Execute queries with population
		const [products, total] = await Promise.all([
			Product.find(baseFilter)
				.populate("category", "name color icon")
				.populate({
					path: "subcategory",
					select: "name slug parentCategory",
					populate: {
						path: "parentCategory",
						select: "name color icon",
					},
				})
				.populate("createdBy", "name email")
				.sort(sort)
				.skip(skip)
				.limit(limitNumber)
				.lean(),
			Product.countDocuments(baseFilter),
		]);

		// Calculate pagination info
		const totalPages = Math.ceil(total / limitNumber);
		const hasNextPage = pageNumber < totalPages;
		const hasPrevPage = pageNumber > 1;

		res.json({
			success: true,
			data: products,
			pagination: {
				currentPage: pageNumber,
				totalPages,
				totalProducts: total,
				hasNextPage,
				hasPrevPage,
				limit: limitNumber,
			},
			message: `Found ${total} products in category "${categoryName}"`,
		});
	} catch (error) {
		console.error("Error getting products by category:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving products by category",
			error: error.message,
		});
	}
};

// @desc    Get total count of all products
// @route   GET /api/products/count
// @access  Public
exports.getProductsCount = async (req, res) => {
	try {
		const totalProducts = await Product.countDocuments({ isActive: true });

		res.json({
			success: true,
			count: totalProducts,
			message: `Total active products: ${totalProducts}`,
		});
	} catch (error) {
		console.error("Error getting products count:", error);
		res.status(500).json({
			success: false,
			message: "Error retrieving products count",
			error: error.message,
		});
	}
};

// Export multer upload middleware
exports.uploadMiddleware = upload.single("image");
