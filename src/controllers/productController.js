const Product = require("../models/Product");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;
const {
	sanitizeQuery,
	sanitizePagination,
	sanitizeSort,
	createSafeRegex,
} = require("../utils/sanitize");

// Configure Cloudinary
// SECURITY: All credentials must be provided via environment variables
if (
	!process.env.CLOUDINARY_CLOUD_NAME ||
	!process.env.CLOUDINARY_API_KEY ||
	!process.env.CLOUDINARY_API_SECRET
) {
	console.error(
		"❌ CRITICAL: Cloudinary credentials are not configured properly in environment variables",
	);
	console.error(
		"Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env file",
	);
}

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
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
			},
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

// @desc    Get all products with filter options including discount
// @route   GET /api/products
// @access  Public
exports.getProducts = async (req, res) => {
	try {
		// Sanitize query parameters to prevent NoSQL injection
		const sanitizedQuery = sanitizeQuery(req.query);

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
			discount,
			minDiscount,
		} = sanitizedQuery;

		// Build filter object
		let filter = {};
		if (isActive !== "all") {
			filter.isActive = isActive === "true" || isActive === true;
		}
		if (inAds !== undefined && inAds !== "all") {
			filter.inAds = inAds === "true" || inAds === true;
		}

		// Handle category filtering (same as getProductsByCategory)
		if (category) {
			const Category = require("../models/Category");
			let categoryDoc;

			if (mongoose.Types.ObjectId.isValid(category)) {
				categoryDoc = await Category.findById(category);
			} else {
				categoryDoc = await Category.findOne({
					name: new RegExp(category, "i"),
					isActive: true,
				});
			}

			if (!categoryDoc) {
				return res.status(404).json({
					success: false,
					message: `Kategorie "${category}" nicht gefunden`,
				});
			}

			// Find all subcategories in this category
			const Subcategory = require("../models/Subcategory");
			const subcategories = await Subcategory.find({
				parentCategory: categoryDoc._id,
				isActive: true,
			}).select("_id");

			if (subcategories.length === 0) {
				return res.json({
					success: true,
					data: [],
					pagination: {
						currentPage: parseInt(page),
						totalPages: 0,
						totalProducts: 0,
						hasNextPage: false,
						hasPrevPage: false,
						limit: parseInt(limit),
					},
					message: `Keine Unterkategorien in Kategorie "${categoryDoc.name}" gefunden`,
				});
			}

			const subcategoryIds = subcategories.map((sub) => sub._id);
			filter.subcategory = { $in: subcategoryIds };
		}

		if (subcategory) {
			// Direct subcategory filtering by ID
			if (mongoose.Types.ObjectId.isValid(subcategory)) {
				filter.subcategory = subcategory;
			} else {
				// Lookup subcategory by name and get ID
				const Subcategory = require("../models/Subcategory");
				const subcat = await Subcategory.findOne({
					name: new RegExp(subcategory, "i"),
					isActive: true,
				});
				if (subcat) {
					filter.subcategory = subcat._id;
				} else {
					return res.status(404).json({
						success: false,
						message: `Unterkategorie "${subcategory}" nicht gefunden`,
					});
				}
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
		} else {
			//filter.stock = { $gte: 1 };
		}

		// Discount filtering
		if (discount !== undefined && discount !== "all") {
			if (discount === "true" || discount === true) {
				// Products with any discount (> 0)
				filter.discount = { $gt: 0 };
			} else if (discount === "false" || discount === false) {
				// Products without discount (= 0)
				filter.discount = { $lte: 0 };
			}
		}

		// Minimum discount filtering
		if (minDiscount !== undefined && minDiscount !== "") {
			const minDiscountValue = parseFloat(minDiscount);
			if (!isNaN(minDiscountValue)) {
				filter.discount = { $gte: minDiscountValue };
			}
		}

		// Calculate pagination
		const pageNumber = parseInt(page);
		const isInAdsFilter = inAds === "true" || inAds === true;
		const limitNumber = isInAdsFilter ? 30 : parseInt(30);
		const skip = (pageNumber - 1) * limitNumber;

		// Build sort object
		let sortObj = {};
		if (sortBy === "categorySortOrder") {
			sortObj["subcategory.parentCategory.sortOrder"] =
				sortOrder === "desc" ? -1 : 1;
			sortObj["subcategory.sortorder"] = sortOrder === "desc" ? -1 : 1;
			sortObj["sortOrder"] = sortOrder === "desc" ? -1 : 1;
		} else if (sortBy === "sortOrder") {
			sortObj["sortOrder"] = sortOrder === "desc" ? -1 : 1;
		} else {
			sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;
		}

		// Execute queries
		let productsQuery;
		let countQuery;
		let useAggregation = sortBy === "categorySortOrder";

		if (useAggregation) {
			// Build aggregation pipeline
			let pipeline = [];

			let matchFilter = { ...filter };

			pipeline.push({ $match: matchFilter });

			// Lookup category
			pipeline.push({
				$lookup: {
					from: "categories",
					localField: "category",
					foreignField: "_id",
					as: "category",
					pipeline: [{ $project: { name: 1, color: 1, icon: 1 } }],
				},
			});
			pipeline.push({
				$unwind: { path: "$category", preserveNullAndEmptyArrays: true },
			});

			// Lookup subcategory with parentCategory
			pipeline.push({
				$lookup: {
					from: "subcategories",
					localField: "subcategory",
					foreignField: "_id",
					as: "subcategory",
					pipeline: [
						{ $project: { name: 1, parentCategory: 1, sortorder: 1 } },
						{
							$lookup: {
								from: "categories",
								localField: "parentCategory",
								foreignField: "_id",
								as: "parentCategory",
								pipeline: [
									{ $project: { name: 1, color: 1, icon: 1, sortOrder: 1 } },
								],
							},
						},
						{
							$unwind: {
								path: "$parentCategory",
								preserveNullAndEmptyArrays: true,
							},
						},
					],
				},
			});
			pipeline.push({
				$unwind: { path: "$subcategory", preserveNullAndEmptyArrays: true },
			});

			// Lookup createdBy
			pipeline.push({
				$lookup: {
					from: "users",
					localField: "createdBy",
					foreignField: "_id",
					as: "createdBy",
					pipeline: [{ $project: { name: 1, email: 1 } }],
				},
			});
			pipeline.push({
				$unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true },
			});

			// Sort
			pipeline.push({ $sort: sortObj });

			pipeline.push({ $skip: skip });
			pipeline.push({ $limit: limitNumber });

			productsQuery = Product.aggregate(pipeline);

			// Count
			let countPipeline = [{ $match: matchFilter }, { $count: "total" }];
			countQuery = Product.aggregate(countPipeline);
		} else {
			// Regular query
			productsQuery = Product.find(filter)
				.populate("category", "name color icon")
				.populate({
					path: "subcategory",
					select: "name parentCategory",
					populate: {
						path: "parentCategory",
						select: "name color icon",
					},
				})
				.populate("createdBy", "name email")
				.sort(sortObj)
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
			message: "Fehler beim Abrufen der Produkte",
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
				message: "Ungültige Produkt-ID",
			});
		}

		const product = await Product.findById(id)
			.populate("category", "name color icon")
			.populate({
				path: "subcategory",
				select: "name parentCategory",
				populate: {
					path: "parentCategory",
					select: "name color icon",
				},
			})
			.populate("createdBy", "name email");

		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Produkt nicht gefunden",
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
			message: "Fehler beim Abrufen des Produkts",
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

		let product = await Product.findByBarcode(barcode).populate({
			path: "subcategory",
			select: "name parentCategory",
			populate: {
				path: "parentCategory",
				select: "name",
			},
		});

		// If not found, try to find by prefix (e.g. if check digit is missing in search)
		if (!product) {
			// Escape special regex characters to prevent ReDoS
			const escapedBarcode = barcode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			product = await Product.findOne({
				barcode: new RegExp(`^${escapedBarcode}`),
				isActive: true,
			}).populate({
				path: "subcategory",
				select: "name parentCategory",
				populate: {
					path: "parentCategory",
					select: "name",
				},
			});
		}

		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Produkt mit diesem Barcode nicht gefunden",
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
			message: "Fehler beim Abrufen des Produkts nach Barcode",
			error: error.message,
		});
	}
};

// // @desc    Get products by shelf number
// // @route   GET /api/products/shelf/:shelfNumber
// // @access  Public
// exports.getProductsByShelfNumber = async (req, res) => {
// 	try {
// 		const { shelfNumber } = req.params;

// 		const products = await Product.findByShelfNumber(shelfNumber)
// 			.populate("category", "name color icon")
// 			.populate({
// 				path: "subcategory",
// 				select: "name parentCategory",
// 				populate: {
// 					path: "parentCategory",
// 					select: "name color icon",
// 				},
// 			})
// 			.populate("createdBy", "name email");

// 		res.json({
// 			success: true,
// 			data: products,
// 			count: products.length,
// 		});
// 	} catch (error) {
// 		console.error("Error getting products by shelf number:", error);
// 		res.status(500).json({
// 			success: false,
// 			message: "Error retrieving products by shelf number",
// 			error: error.message,
// 		});
// 	}
// };

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
					message: "Fehler beim Hochladen des Bildes",
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
				select: "name parentCategory",
				populate: {
					path: "parentCategory",
					select: "name color icon",
				},
			},
			{ path: "createdBy", select: "name email" },
		]);

		res.status(201).json({
			success: true,
			message: "Produkt erfolgreich erstellt",
			data: product,
		});
	} catch (error) {
		console.error("Error creating product:", error);

		// Handle duplicate barcode error
		if (error.code === 11000 && error.keyPattern?.barcode) {
			return res.status(400).json({
				success: false,
				message: "Ein Produkt mit diesem Barcode existiert bereits",
			});
		}

		res.status(400).json({
			success: false,
			message: "Fehler beim Erstellen des Produkts",
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
					message: "Fehler beim Hochladen des Bildes",
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
				select: "name parentCategory",
				populate: {
					path: "parentCategory",
					select: "name color icon",
				},
			})
			.populate("createdBy", "name email");

		res.json({
			success: true,
			message: "Produkt erfolgreich aktualisiert",
			data: updatedProduct,
		});
	} catch (error) {
		console.error("Error updating product:", error);

		// Handle duplicate barcode error
		if (error.code === 11000 && error.keyPattern?.barcode) {
			return res.status(400).json({
				success: false,
				message: "Ein Produkt mit diesem Barcode existiert bereits",
			});
		}

		res.status(400).json({
			success: false,
			message: "Fehler beim Aktualisieren des Produkts",
			error: error.message,
		});
	}
};

// @desc    Update product stock
// @route   PATCH /api/products/:id/stock
// @access  Private (Admin/Manager/Staff)
exports.updateProductStock = async (req, res) => {
	try {
		const { id } = req.params;
		const { quantity, operation = "set" } = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				success: false,
				message: "Ungültige Produkt-ID",
			});
		}

		if (typeof quantity !== "number" || quantity < 0) {
			return res.status(400).json({
				success: false,
				message: "Menge muss eine nicht-negative Zahl sein",
			});
		}

		const product = await Product.findById(id);

		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Produkt nicht gefunden",
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
				select: "name parentCategory",
				populate: {
					path: "parentCategory",
					select: "name color icon",
				},
			},
			{ path: "createdBy", select: "name email" },
		]);

		res.json({
			success: true,
			message: `Produktlager erfolgreich ${operation}iert`,
			data: product,
		});
	} catch (error) {
		console.error("Error updating product stock:", error);
		res.status(400).json({
			success: false,
			message: "Fehler beim Aktualisieren des Produktlagers",
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
				message: "Ungültige Produkt-ID",
			});
		}

		if (!shelfNumber || typeof shelfNumber !== "string") {
			return res.status(400).json({
				success: false,
				message: "Regalnummer ist erforderlich und muss eine Zeichenkette sein",
			});
		}

		const product = await Product.findById(id);

		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Produkt nicht gefunden",
			});
		}

		product.shelfNumber = shelfNumber.trim();
		product.updatedAt = new Date();
		await product.save();

		await product.populate([
			{ path: "category", select: "name color icon" },
			{
				path: "subcategory",
				select: "name parentCategory",
				populate: {
					path: "parentCategory",
					select: "name color icon",
				},
			},
			{ path: "createdBy", select: "name email" },
		]);

		res.json({
			success: true,
			message: "Produkt-Regalnummer erfolgreich aktualisiert",
			data: product,
		});
	} catch (error) {
		console.error("Error updating product shelf number:", error);
		res.status(400).json({
			success: false,
			message: "Fehler beim Aktualisieren der Produkt-Regalnummer",
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
				message: "Ungültige Produkt-ID",
			});
		}

		const product = await Product.findByIdAndUpdate(
			id,
			{ isActive: false, updatedAt: new Date() },
			{ new: true },
		);

		if (!product) {
			return res.status(404).json({
				success: false,
				message: "Produkt nicht gefunden",
			});
		}

		res.json({
			success: true,
			message: "Produkt erfolgreich gelöscht",
			data: product,
		});
	} catch (error) {
		console.error("Error deleting product:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Löschen des Produkts",
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
			message: "Produkt dauerhaft gelöscht",
		});
	} catch (error) {
		console.error("Error permanently deleting product:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim dauerhaften Löschen des Produkts",
			error: error.message,
		});
	}
};

// // @desc    Get shelf numbers
// // @route   GET /api/products/shelves
// // @access  Public
// exports.getShelfNumbers = async (req, res) => {
// 	try {
// 		const shelfNumbers = await Product.distinct("shelfNumber", {
// 			isActive: true,
// 		});

// 		res.json({
// 			success: true,
// 			data: shelfNumbers.sort(),
// 		});
// 	} catch (error) {
// 		console.error("Error getting shelf numbers:", error);
// 		res.status(500).json({
// 			success: false,
// 			message: "Error retrieving shelf numbers",
// 			error: error.message,
// 		});
// 	}
// };

// @desc    Upload product image
// @route   POST /api/products/upload-image
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
			message: "Bild erfolgreich hochgeladen",
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
			message: "Fehler beim Hochladen des Bildes",
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
			limit = 100,
			search,
			isActive = true,
			sortBy = "createdAt",
			sortOrder = "desc",
			priceRange,
			stockLevel,
			subcategoryName,
		} = req.query;

		if (!categoryName) {
			return res.status(400).json({
				success: false,
				message: "Kategoriename ist erforderlich",
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
				message: `Kategorie "${categoryName}" nicht gefunden`,
			});
		}

		// Find all subcategories in this category
		const Subcategory = require("../models/Subcategory");
		const subcategories = await Subcategory.find({
			parentCategory: category._id,
			isActive: true,
		}).select("_id");

		if (subcategories.length === 0) {
			return res.json({
				success: true,
				data: [],
				pagination: {
					currentPage: parseInt(page),
					totalPages: 0,
					totalProducts: 0,
					hasNextPage: false,
					hasPrevPage: false,
					limit: parseInt(limit),
				},
				message: `Keine Unterkategorien in Kategorie "${categoryName}" gefunden`,
			});
		}

		const subcategoryIds = subcategories.map((sub) => sub._id);

		// Build base filter with subcategory IDs
		const baseFilter = {
			subcategory: { $in: subcategoryIds }, // Products must have subcategory in this category's subcategories
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
					select: "name parentCategory",
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
			message: `${total} Produkte in Kategorie "${categoryName}" gefunden`,
		});
	} catch (error) {
		console.error("Error getting products by category:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Abrufen der Produkte nach Kategorie",
			error: error.message,
		});
	}
};

// @desc    Get products by subcategory name
// @route   GET /api/products/subcategory
// @access  Public
exports.getProductsBySubcategory = async (req, res) => {
	try {
		const {
			subcategoryName,
			page = 1,
			limit = 10,
			search,
			isActive = true,
			sortBy = "createdAt",
			sortOrder = "desc",
			priceRange,
			stockLevel,
		} = req.query;

		if (!subcategoryName) {
			return res.status(400).json({
				success: false,
				message: "Unterkategoriename ist erforderlich",
			});
		}

		// First, find the subcategory by name to get its ID
		const Subcategory = require("../models/Subcategory");
		const subcategory = await Subcategory.findOne({
			name: new RegExp(subcategoryName, "i"),
			isActive: true,
		}).populate("parentCategory", "name");

		if (!subcategory) {
			return res.status(404).json({
				success: false,
				message: `Unterkategorie "${subcategoryName}" nicht gefunden`,
			});
		}

		// Build base filter with the subcategory ID
		const baseFilter = {
			subcategory: subcategory._id, // Products must have this subcategory ID
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
					select: "name parentCategory",
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
			message: `${total} Produkte in Unterkategorie "${subcategoryName}" gefunden`,
		});
	} catch (error) {
		console.error("Error getting products by subcategory:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Abrufen der Produkte nach Unterkategorie",
			error: error.message,
		});
	}
};

// @desc    Get products with discount
// @route   GET /api/products/discount
// @access  Public
exports.getProductsWithDiscount = async (req, res) => {
	try {
		const {
			page = 1,
			limit = 10,
			search,
			isActive = true,
			sortBy = "finalPrice",
			sortOrder = "asc",
			priceRange,
			stockLevel,
			inAds,
			minDiscount = 0,
		} = req.query;

		// Build base filter - products with discount > minDiscount or inAds true
		let baseFilter = {
			$or: [{ discount: { $gt: parseFloat(minDiscount) } }, { inAds: true }],
		};
		if (inAds !== undefined && inAds !== "all") {
			baseFilter.inAds = inAds === "true" || inAds === true;
		}
		if (isActive !== "all") {
			const activeValue = isActive === "true" || isActive === true;
			baseFilter.$or[0].isActive = activeValue;
			baseFilter.$or[1].isActive = activeValue;
		}

		// Add search filter if provided
		if (search) {
			const searchOr = [
				{ name: new RegExp(search, "i") },
				{ barcode: new RegExp(search, "i") },
				{ description: new RegExp(search, "i") },
			];
			baseFilter.$or[0].$or = searchOr;
			baseFilter.$or[1].$or = searchOr;
		}

		// Price range filtering
		if (priceRange && priceRange !== "all") {
			let priceFilter;
			if (priceRange.includes("-")) {
				const [minPrice, maxPrice] = priceRange
					.split("-")
					.map((p) => parseFloat(p));
				if (maxPrice) {
					priceFilter = { $gte: minPrice, $lte: maxPrice };
				} else {
					priceFilter = { $gte: minPrice };
				}
			} else if (priceRange.endsWith("+")) {
				const minPrice = parseFloat(priceRange.replace("+", ""));
				priceFilter = { $gte: minPrice };
			}
			if (priceFilter) {
				baseFilter.$or[0].price = priceFilter;
				baseFilter.$or[1].price = priceFilter;
			}
		}

		// Stock level filtering
		if (stockLevel && stockLevel !== "all") {
			let stockFilter;
			switch (stockLevel) {
				case "out":
					stockFilter = 0;
					break;
				case "low":
					stockFilter = { $gte: 1, $lte: 10 };
					break;
				case "medium":
					stockFilter = { $gte: 11, $lte: 50 };
					break;
				case "high":
					stockFilter = { $gte: 51 };
					break;
				case "Available":
					stockFilter = { $gte: 1 };
					break;
			}
			if (stockFilter !== undefined) {
				baseFilter.$or[0].stock = stockFilter;
				baseFilter.$or[1].stock = stockFilter;
			}
		}

		// Calculate pagination
		const pageNumber = parseInt(page);
		const limitNumber = parseInt(limit);
		const skip = (pageNumber - 1) * limitNumber;

		// Determine if we need to sort by final price (computed field)
		const isSortingByFinalPrice = sortBy === "finalPrice";

		// Build sort object for MongoDB (skip if sorting by final price)
		let mongoSort = {};
		if (!isSortingByFinalPrice) {
			mongoSort[sortBy] = sortOrder === "desc" ? -1 : 1;
		}

		// Execute queries with population
		const [products, total] = await Promise.all([
			Product.find(baseFilter)
				.populate("category", "name color icon")
				.populate({
					path: "subcategory",
					select: "name parentCategory",
					populate: {
						path: "parentCategory",
						select: "name color icon",
					},
				})
				.populate("createdBy", "name email")
				.sort(isSortingByFinalPrice ? {} : mongoSort) // Skip MongoDB sort if sorting by final price
				.skip(skip)
				.limit(limitNumber)
				.lean(),
			Product.countDocuments(baseFilter),
		]);

		// Sort by final discounted price if requested
		if (isSortingByFinalPrice) {
			products.sort((a, b) => {
				const finalPriceA = a.price * (1 - (a.discount || 0) / 100);
				const finalPriceB = b.price * (1 - (b.discount || 0) / 100);
				if (sortOrder === "desc") {
					return finalPriceB - finalPriceA;
				} else {
					return finalPriceA - finalPriceB;
				}
			});
		}

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
			message: `${total} Produkte mit Rabatt größer als ${minDiscount}% gefunden`,
		});
	} catch (error) {
		console.error("Error getting products with discount:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Abrufen der Produkte mit Rabatt",
			error: error.message,
		});
	}
};

// @route   GET /api/products/count
// @access  Public
exports.getProductsCount = async (req, res) => {
	try {
		const totalProducts = await Product.countDocuments({ isActive: true });

		res.json({
			success: true,
			count: totalProducts,
			message: `Gesamtanzahl aktiver Produkte: ${totalProducts}`,
		});
	} catch (error) {
		console.error("Error getting products count:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Abrufen der Produktanzahl",
			error: error.message,
		});
	}
};

// @route   PUT /api/products/bulk-status
// @access  Private (Admin only)
exports.bulkUpdateProductStatus = async (req, res) => {
	try {
		const { status } = req.body;

		// Validate status
		if (!status || !["active", "inactive"].includes(status)) {
			return res.status(400).json({
				success: false,
				message: "Ungültiger Status. Muss 'active' oder 'inactive' sein",
			});
		}

		// Update all products
		const result = await Product.updateMany(
			{}, // Update all products
			{
				isActive: status === "active",
				updatedAt: new Date(),
			},
		);

		res.json({
			success: true,
			message: `Erfolgreich ${result.modifiedCount} Produkte auf ${status}-Status aktualisiert`,
			modifiedCount: result.modifiedCount,
			matchedCount: result.matchedCount,
		});
	} catch (error) {
		console.error("Error updating product status:", error);
		res.status(500).json({
			success: false,
			message: "Fehler beim Aktualisieren des Produktstatus",
			error: error.message,
		});
	}
};

// Export multer upload middleware
exports.uploadMiddleware = upload.single("image");
