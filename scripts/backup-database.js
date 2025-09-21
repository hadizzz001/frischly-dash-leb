const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

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

	async createMetadata(totalDocuments, collectionsBackedUp) {
		const metadata = {
			timestamp: new Date().toISOString(),
			database: mongoose.connection.name,
			totalDocuments: totalDocuments,
			collectionsCount: collectionsBackedUp,
			collections: COLLECTIONS,
			backupPath: this.backupPath,
		};

		const metadataPath = path.join(this.backupPath, "backup-info.json");
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
		console.log(`📋 Saved backup metadata`);
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

			await this.createMetadata(totalDocuments, collectionsBackedUp);

			console.log("\n✅ Database backup completed successfully!");
			console.log(`📁 Backup location: ${this.backupPath}`);
			console.log(`📊 Total documents: ${totalDocuments}`);
			console.log(
				`📂 Collections backed up: ${collectionsBackedUp}/${COLLECTIONS.length}`
			);
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
