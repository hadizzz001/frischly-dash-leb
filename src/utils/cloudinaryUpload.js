// Shared Cloudinary configuration + image upload/delete helpers.
//
// This module centralizes logic that used to be duplicated across several
// controllers (productController, categoryController, kitchenController,
// kitchenCategoryController, marketController, marketAdminController):
//   - cloudinary.config(...)
//   - a multer instance for in-memory image uploads (5MB limit, images only)
//   - upload_stream helpers for "standard" images (scaled, width 500) and
//     for square logos (fit within 500x500 without cropping content)
//   - a destroy/delete helper (both a rejecting and a "safe"/best-effort
//     non-throwing variant, matching the two behaviors that existed before)
//
// Behavior is preserved exactly as it was in each original controller; only
// the folder name and which variant (image vs logo) is chosen differs per
// call site, both of which remain fully controllable by the caller.

const multer = require("multer");
const cloudinary = require("cloudinary").v2;

// SECURITY: All credentials should be provided via environment variables.
// The literal fallback values below match the defaults that were already
// hardcoded in some controllers (categoryController, marketAdminController)
// and are kept only as a safety net for local/dev environments.
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
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dbgnsnrto",
	api_key: process.env.CLOUDINARY_API_KEY || "431121896297761",
	api_secret:
		process.env.CLOUDINARY_API_SECRET || "omVgd2HdystgoGQ5yXngAZ40yTg",
});

// Shared multer instance: memory storage, 5MB limit, images only.
// Use as `imageUpload.single("image")` / `imageUpload.single("logo")`.
const imageUpload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB limit
	},
	fileFilter: (req, file, cb) => {
		if (file.mimetype.startsWith("image/")) {
			cb(null, true);
		} else {
			cb(new Error("Only image files are allowed!"), false);
		}
	},
});

/**
 * Upload a buffer as a standard scaled image (products, categories,
 * kitchens, kitchen categories): auto quality/format, scaled to width 500.
 * @param {Buffer} buffer
 * @param {string} folder Cloudinary folder to upload into
 * @returns {Promise<{url: string, public_id: string}>}
 */
const uploadImageToCloudinary = (buffer, folder) => {
	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder,
				resource_type: "image",
				quality: "auto",
				format: "webp",
				transformation: [
					{ quality: "auto:eco", width: 500, crop: "scale" },
				],
			},
			(error, result) => {
				if (error) {
					reject(error);
				} else {
					resolve({ url: result.secure_url, public_id: result.public_id });
				}
			},
		);

		stream.end(buffer);
	});
};

/**
 * Upload a buffer as a square logo (markets): fit within 500x500 without
 * upscaling or cropping content.
 * @param {Buffer} buffer
 * @param {string} folder Cloudinary folder to upload into
 * @returns {Promise<{url: string, public_id: string}>}
 */
const uploadLogoToCloudinary = (buffer, folder) => {
	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder,
				resource_type: "image",
				quality: "auto",
				format: "webp",
				transformation: [
					{ quality: "auto:eco", width: 500, height: 500, crop: "limit" },
				],
			},
			(error, result) => {
				if (error) {
					reject(error);
				} else {
					resolve({ url: result.secure_url, public_id: result.public_id });
				}
			},
		);

		stream.end(buffer);
	});
};

/**
 * Delete an asset from Cloudinary. Rejects the returned promise if the
 * Cloudinary API call itself errors (matches the original productController /
 * categoryController behavior).
 * @param {string} publicId
 * @returns {Promise<*>}
 */
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

/**
 * Best-effort delete: never rejects/throws, resolves regardless of outcome,
 * and resolves immediately (without calling Cloudinary) when publicId is
 * falsy. Matches the original kitchenController / kitchenCategoryController
 * "safeDestroy" behavior.
 * @param {string} [publicId]
 * @returns {Promise<void>}
 */
const safeDeleteFromCloudinary = (publicId) => {
	if (!publicId) return Promise.resolve();
	return new Promise((resolve) => {
		cloudinary.uploader.destroy(publicId, () => resolve());
	});
};

module.exports = {
	cloudinary,
	imageUpload,
	uploadImageToCloudinary,
	uploadLogoToCloudinary,
	deleteFromCloudinary,
	safeDeleteFromCloudinary,
};
