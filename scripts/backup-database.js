const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// Load environment variables
require("dotenv").config();

// Configuration
const BACKUP_DIR = path.join(__dirname, "..", "backups");
const COLLECTIONS = [
	"users",
	"categories",
	"subcategories",
	"products",
	"orders",
	"riders",
	"zones",
	"wastes",
];

class DatabaseBackup {
	constructor() {
		this.timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		this.backupPath = path.join(BACKUP_DIR, `backup-${this.timestamp}`);
	}

	async connect() {
		try {
			console.log("🔗 Connecting to MongoDB...");
			await mongoose.connect(process.env.MONGODB_URI);
			console.log(`✅ Connected to database: ${mongoose.connection.name}`);
		} catch (error) {
			console.error("❌ Failed to connect to MongoDB:", error.message);
			process.exit(1);
		}
	}

	createBackupDirectory() {
		if (!fs.existsSync(BACKUP_DIR)) {
			fs.mkdirSync(BACKUP_DIR, { recursive: true });
		}

		if (!fs.existsSync(this.backupPath)) {
			fs.mkdirSync(this.backupPath, { recursive: true });
		}

		console.log(`📁 Created backup directory: ${this.backupPath}`);
	}

	async backupCollection(collectionName) {
		try {
			console.log(`🔄 Backing up collection: ${collectionName}`);

			const collection = mongoose.connection.db.collection(collectionName);
			const documents = await collection.find({}).toArray();

			const backupData = {
				collection: collectionName,
				timestamp: new Date().toISOString(),
				documentCount: documents.length,
				documents: documents,
			};

			const filePath = path.join(this.backupPath, `${collectionName}.json`);
			fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

			console.log(
				`✅ ${collectionName}: ${documents.length} documents backed up`
			);
			return documents.length;
		} catch (error) {
			console.error(
				`❌ Failed to backup collection ${collectionName}:`,
				error.message
			);
			return 0;
		}
	}

	async createMetadata(totalDocuments, collectionsBackedUp, imageStats) {
		const metadata = {
			timestamp: new Date().toISOString(),
			database: mongoose.connection.name,
			totalDocuments: totalDocuments,
			collectionsCount: collectionsBackedUp,
			collections: COLLECTIONS,
			backupPath: this.backupPath,
			images: imageStats,
		};

		const metadataPath = path.join(this.backupPath, "backup-info.json");
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
		console.log(`📋 Saved backup metadata`);
	}

	async downloadImage(url, filepath) {
		return new Promise((resolve, reject) => {
			const protocol = url.startsWith("https") ? https : http;
			const request = protocol.get(url, (response) => {
				if (response.statusCode !== 200) {
					reject(new Error(`Failed to download image: ${response.statusCode}`));
					return;
				}

				const fileStream = fs.createWriteStream(filepath);
				response.pipe(fileStream);

				fileStream.on("finish", () => {
					fileStream.close();
					resolve();
				});

				fileStream.on("error", (error) => {
					fs.unlink(filepath, () => {}); // Delete the file on error
					reject(error);
				});
			});

			request.on("error", (error) => {
				reject(error);
			});

			request.setTimeout(30000, () => {
				request.destroy();
				reject(new Error("Download timeout"));
			});
		});
	}

	async backupCloudImages() {
		try {
			console.log(`🔄 Backing up cloud images...`);

			const imagesDir = path.join(this.backupPath, "images");
			const productsImagesDir = path.join(imagesDir, "products");
			const categoriesImagesDir = path.join(imagesDir, "categories");

			if (!fs.existsSync(productsImagesDir)) {
				fs.mkdirSync(productsImagesDir, { recursive: true });
			}
			if (!fs.existsSync(categoriesImagesDir)) {
				fs.mkdirSync(categoriesImagesDir, { recursive: true });
			}

			let totalDownloaded = 0;
			let totalFailed = 0;

			// Backup product images
			console.log(`📦 Backing up product images...`);
			const productCollection = mongoose.connection.db.collection("products");
			const products = await productCollection
				.find({ picture: { $exists: true, $ne: null } })
				.toArray();

			let productDownloaded = 0;
			let productFailed = 0;
			for (const product of products) {
				if (product.picture && typeof product.picture === "string") {
					try {
						let filename;
						if (product.picture.includes("/")) {
							filename = path.basename(product.picture.split("?")[0]);
							if (!filename.includes(".")) {
								filename += ".jpg";
							}
						} else {
							filename = `product_${product._id}.jpg`;
						}

						const filepath = path.join(productsImagesDir, filename);
						await this.downloadImage(product.picture, filepath);
						productDownloaded++;
						totalDownloaded++;
					} catch (error) {
						console.error(
							`❌ Failed to download product image for ${product.name}:`,
							error.message
						);
						productFailed++;
						totalFailed++;
					}
				}
			}

			// Backup category images
			console.log(`📦 Backing up category images...`);
			const categoryCollection =
				mongoose.connection.db.collection("categories");
			const categories = await categoryCollection
				.find({ image: { $exists: true, $ne: null, $ne: "" } })
				.toArray();

			let categoryDownloaded = 0;
			let categoryFailed = 0;
			for (const category of categories) {
				if (category.image && typeof category.image === "string") {
					try {
						let filename;
						if (category.image.includes("/")) {
							filename = path.basename(category.image.split("?")[0]);
							if (!filename.includes(".")) {
								filename += ".jpg";
							}
						} else {
							filename = `category_${category._id}.jpg`;
						}

						const filepath = path.join(categoriesImagesDir, filename);
						await this.downloadImage(category.image, filepath);
						categoryDownloaded++;
						totalDownloaded++;
					} catch (error) {
						console.error(
							`❌ Failed to download category image for ${category.name}:`,
							error.message
						);
						categoryFailed++;
						totalFailed++;
					}
				}
			}

			console.log(
				`✅ Cloud images: ${totalDownloaded} downloaded, ${totalFailed} failed`
			);
			console.log(
				`   📦 Products: ${productDownloaded} downloaded, ${productFailed} failed`
			);
			console.log(
				`   📂 Categories: ${categoryDownloaded} downloaded, ${categoryFailed} failed`
			);

			return {
				total: { downloaded: totalDownloaded, failed: totalFailed },
				products: { downloaded: productDownloaded, failed: productFailed },
				categories: { downloaded: categoryDownloaded, failed: categoryFailed },
			};
		} catch (error) {
			console.error(`❌ Failed to backup cloud images:`, error.message);
			return {
				total: { downloaded: 0, failed: 0 },
				products: { downloaded: 0, failed: 0 },
				categories: { downloaded: 0, failed: 0 },
			};
		}
	}

	async backupLocalImages() {
		try {
			console.log(`🔄 Backing up local images...`);

			const publicDir = path.join(__dirname, "..", "public");
			const imagesDir = path.join(this.backupPath, "local-images");

			if (!fs.existsSync(imagesDir)) {
				fs.mkdirSync(imagesDir, { recursive: true });
			}

			let copiedCount = 0;
			let failedCount = 0;

			// Function to copy directory recursively
			const copyDirectory = (src, dest) => {
				if (!fs.existsSync(src)) return;

				const items = fs.readdirSync(src);
				for (const item of items) {
					const srcPath = path.join(src, item);
					const destPath = path.join(dest, item);

					const stat = fs.statSync(srcPath);
					if (stat.isDirectory()) {
						if (!fs.existsSync(destPath)) {
							fs.mkdirSync(destPath, { recursive: true });
						}
						copyDirectory(srcPath, destPath);
					} else {
						// Only copy image files
						const ext = path.extname(item).toLowerCase();
						if (
							[
								".jpg",
								".jpeg",
								".png",
								".gif",
								".webp",
								".svg",
								".ico",
							].includes(ext)
						) {
							try {
								fs.copyFileSync(srcPath, destPath);
								copiedCount++;
							} catch (error) {
								console.error(`❌ Failed to copy ${srcPath}:`, error.message);
								failedCount++;
							}
						}
					}
				}
			};

			// Copy images from public directories
			copyDirectory(
				path.join(publicDir, "images"),
				path.join(imagesDir, "images")
			);
			copyDirectory(
				path.join(publicDir, "icons"),
				path.join(imagesDir, "icons")
			);

			console.log(
				`✅ Local images: ${copiedCount} copied, ${failedCount} failed`
			);
			return { copied: copiedCount, failed: failedCount };
		} catch (error) {
			console.error(`❌ Failed to backup local images:`, error.message);
			return { copied: 0, failed: 0 };
		}
	}

	async run() {
		console.log("🚀 Starting MongoDB Database Backup");
		console.log(`📅 Timestamp: ${this.timestamp}`);

		if (!process.env.MONGODB_URI) {
			console.error("❌ MONGODB_URI environment variable not found");
			console.error("🔧 Please check your .env file");
			process.exit(1);
		}

		try {
			await this.connect();
			this.createBackupDirectory();

			let totalDocuments = 0;
			let collectionsBackedUp = 0;

			console.log(`\n📦 Backing up ${COLLECTIONS.length} collections...`);

			for (const collectionName of COLLECTIONS) {
				const docCount = await this.backupCollection(collectionName);
				if (docCount >= 0) {
					totalDocuments += docCount;
					collectionsBackedUp++;
				}
			}

			// Backup images
			console.log(`\n🖼️  Backing up images...`);
			const cloudImageStats = await this.backupCloudImages();
			const localImageStats = await this.backupLocalImages();

			const imageStats = {
				cloudImages: cloudImageStats,
				localImages: localImageStats,
			};

			await this.createMetadata(
				totalDocuments,
				collectionsBackedUp,
				imageStats
			);

			console.log("\n✅ Database backup completed successfully!");
			console.log(`📁 Backup location: ${this.backupPath}`);
			console.log(`📊 Total documents: ${totalDocuments}`);
			console.log(
				`📂 Collections backed up: ${collectionsBackedUp}/${COLLECTIONS.length}`
			);
			console.log(
				`🖼️  Cloud images: ${imageStats.cloudImages.total.downloaded} downloaded (${imageStats.cloudImages.products.downloaded} products, ${imageStats.cloudImages.categories.downloaded} categories)`
			);
			console.log(`📸 Local images: ${imageStats.localImages.copied} copied`);
		} catch (error) {
			console.error("❌ Backup failed:", error.message);
			process.exit(1);
		} finally {
			await mongoose.disconnect();
			console.log("🔌 Disconnected from MongoDB");
		}
	}
}

// Run the backup
const backup = new DatabaseBackup();
backup.run().catch((error) => {
	console.error("❌ Unexpected error:", error);
	process.exit(1);
});
