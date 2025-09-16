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

// @desc    Get all products
// @route   GET /api/products
// @access  Public
exports.getProducts = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 10,
			search,
			category, // Keep for backward compatibility - will filter by parent category
			subcategory,
			shelfNumber,
			isActive = true,
			sortBy = "createdAt",
			sortOrder = "desc",
		} = req.query;

		// Build filter object
		const filter = {};
		if (isActive !== "all") {
			filter.isActive = isActive === "true" || isActive === true;
		}
		if (subcategory) {
			// Direct subcategory filtering
			if (mongoose.Types.ObjectId.isValid(subcategory)) {
				filter.subcategory = subcategory;
			} else {
				// Will need to lookup subcategory by name in aggregation pipeline
				filter.subcategoryName = new RegExp(subcategory, "i");
			}
		} else if (category) {
			// Filter by parent category - requires aggregation pipeline
			if (mongoose.Types.ObjectId.isValid(category)) {
				filter.parentCategory = category;
			} else {
				// Will need to lookup category by name in aggregation pipeline
				filter.categoryName = new RegExp(category, "i");
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
		} else {
			// Regular query without category name filtering
			delete filter.categoryName;
			productsQuery = Product.find(filter)
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

		// Add creator if user is authenticated
		if (req.user) {
			productData.createdBy = req.user.id;
		}

		const product = await Product.create(productData);

		// Populate the created product
		await product.populate([
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
// @access  Private (Admin/Manager)
exports.updateProduct = async (req, res) => {
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
			{ ...req.body, updatedAt: new Date() },
			{
				new: true,
				runValidators: true,
			}
		)
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
			message: "Product updated successfully",
			data: product,
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

		const product = await Product.findByIdAndDelete(id);

		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Product not found",
			});
		}

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

// Export multer upload middleware
exports.uploadMiddleware = upload.single("image");
