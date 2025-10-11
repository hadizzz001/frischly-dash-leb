const mongoose = require("mongoose");
const Product = require("../src/models/Product");
require("dotenv").config();

// ANSI color codes for console output
const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
};

const log = (message, color = colors.reset) => {
	console.log(`${color}${message}${colors.reset}`);
};

// Parse command line arguments
const parseArgs = () => {
	const args = process.argv.slice(2);
	const options = {
		action: "list", // 'list', 'deactivate', 'delete'
		force: false,
	};

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--deactivate":
			case "-d":
				options.action = "deactivate";
				break;
			case "--delete":
			case "-del":
				options.action = "delete";
				break;
			case "--force":
			case "-f":
				options.force = true;
				break;
			case "--help":
			case "-h":
				showHelp();
				process.exit(0);
				break;
			default:
				log(`❌ Unknown option: ${args[i]}`, colors.red);
				showHelp();
				process.exit(1);
		}
	}

	return options;
};

// Show help information
const showHelp = () => {
	log("", colors.cyan);
	log(
		"╔══════════════════════════════════════════════════════════╗",
		colors.cyan
	);
	log(
		"║          🔍 LIST PRODUCTS WITH DEFAULT IMAGE 🔍          ║",
		colors.cyan
	);
	log(
		"╚══════════════════════════════════════════════════════════╝",
		colors.cyan
	);
	log("");
	log("Usage:", colors.bright);
	log("  node list-products-with-default-image.js [options]", colors.blue);
	log("");
	log("Options:", colors.bright);
	log(
		"  --deactivate, -d    Deactivate all products with default image",
		colors.yellow
	);
	log(
		"  --delete, -del      Delete all products with default image",
		colors.red
	);
	log("  --force, -f         Skip confirmation prompts", colors.yellow);
	log("  --help, -h          Show this help message", colors.blue);
	log("");
	log("Examples:", colors.bright);
	log("  node list-products-with-default-image.js", colors.blue);
	log("  node list-products-with-default-image.js --deactivate", colors.yellow);
	log(
		"  node list-products-with-default-image.js --delete --force",
		colors.red
	);
	log("");
};

// Banner
const showBanner = () => {
	log("", colors.cyan);
	log(
		"╔══════════════════════════════════════════════════════════╗",
		colors.cyan
	);
	log(
		"║          🔍 LIST PRODUCTS WITH DEFAULT IMAGE 🔍          ║",
		colors.cyan
	);
	log(
		"║                                                          ║",
		colors.cyan
	);
	log(
		"║    Find products using /icons/app_icon_256x256.png      ║",
		colors.cyan
	);
	log(
		"╚══════════════════════════════════════════════════════════╝",
		colors.cyan
	);
	log("");
};

// Connect to MongoDB
const connectDB = async () => {
	try {
		const MONGODB_URI = process.env.MONGODB_URI;
		if (!MONGODB_URI) {
			throw new Error("MONGODB_URI not found in environment variables");
		}

		log("🔗 Connecting to MongoDB...", colors.blue);
		const conn = await mongoose.connect(MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
		log("✅ Connected to MongoDB successfully", colors.green);
		log(`📍 Database: ${conn.connection.name}`, colors.blue);
		log("");
	} catch (error) {
		log(`❌ MongoDB connection failed: ${error.message}`, colors.red);
		process.exit(1);
	}
};

// Get confirmation from user
const getConfirmation = (message) => {
	return new Promise((resolve) => {
		const readline = require("readline");
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		rl.question(message + " (yes/no): ", (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
		});
	});
};

// Deactivate products with default image
const deactivateProductsWithDefaultImage = async (force = false) => {
	try {
		const targetImage = "/icons/app_icon_256x256.png";

		// Find products with the specific image that are currently active
		const products = await Product.find({
			picture: targetImage,
			isActive: true,
		}).select("name barcode shelfNumber picture isActive");

		if (products.length === 0) {
			log("✅ No active products found using the default image.", colors.green);
			return;
		}

		log(
			`⚠️  Found ${products.length} active product(s) using the default image:`,
			colors.yellow
		);
		log("═".repeat(80), colors.cyan);

		products.forEach((product, index) => {
			log(`${index + 1}. ${product.name}`, colors.bright);
			log(`   📊 Barcode: ${product.barcode}`, colors.blue);
			log(`   📍 Shelf: ${product.shelfNumber}`, colors.blue);
		});

		log("═".repeat(80), colors.cyan);

		if (!force) {
			const confirmed = await getConfirmation(
				`\n⚠️  Are you sure you want to deactivate ${products.length} products?`
			);
			if (!confirmed) {
				log("❌ Operation cancelled by user.", colors.red);
				return;
			}
		}

		log(`🔄 Deactivating ${products.length} products...`, colors.yellow);

		// Update all products to inactive
		const result = await Product.updateMany(
			{ picture: targetImage, isActive: true },
			{ $set: { isActive: false } }
		);

		log(
			`✅ Successfully deactivated ${result.modifiedCount} products.`,
			colors.green
		);
	} catch (error) {
		log(`❌ Error deactivating products: ${error.message}`, colors.red);
		throw error;
	}
};

// Delete products with default image
const deleteProductsWithDefaultImage = async (force = false) => {
	try {
		const targetImage = "/icons/app_icon_256x256.png";

		// Find products with the specific image
		const products = await Product.find({
			picture: targetImage,
		}).select("name barcode shelfNumber picture isActive");

		if (products.length === 0) {
			log("✅ No products found using the default image.", colors.green);
			return;
		}

		log(
			`🗑️  Found ${products.length} product(s) using the default image:`,
			colors.red
		);
		log("═".repeat(80), colors.cyan);

		products.forEach((product, index) => {
			const status = product.isActive ? "✅ Active" : "❌ Inactive";
			const statusColor = product.isActive ? colors.green : colors.red;

			log(`${index + 1}. ${product.name}`, colors.bright);
			log(`   📊 Barcode: ${product.barcode}`, colors.blue);
			log(`   📍 Shelf: ${product.shelfNumber}`, colors.blue);
			log(`   📊 Status: ${status}`, statusColor);
		});

		log("═".repeat(80), colors.cyan);

		if (!force) {
			const confirmed = await getConfirmation(
				`\n🗑️  Are you sure you want to PERMANENTLY DELETE ${products.length} products? This action cannot be undone!`
			);
			if (!confirmed) {
				log("❌ Operation cancelled by user.", colors.red);
				return;
			}
		}

		log(`🗑️  Deleting ${products.length} products...`, colors.red);

		// Delete all products with default image
		const result = await Product.deleteMany({ picture: targetImage });

		log(
			`✅ Successfully deleted ${result.deletedCount} products.`,
			colors.green
		);
	} catch (error) {
		log(`❌ Error deleting products: ${error.message}`, colors.red);
		throw error;
	}
};

// List products with default image
const listProductsWithDefaultImage = async () => {
	try {
		const targetImage = "/icons/app_icon_256x256.png";

		log(`🔍 Searching for products with image: ${targetImage}`, colors.yellow);
		log("");

		// Find products with the specific image
		const products = await Product.find({
			picture: targetImage,
		}).select("name barcode shelfNumber picture isActive");

		if (products.length === 0) {
			log("✅ No products found using the default image.", colors.green);
			return;
		}

		log(
			`📦 Found ${products.length} product(s) using the default image:`,
			colors.bright
		);
		log("═".repeat(80), colors.cyan);

		products.forEach((product, index) => {
			const status = product.isActive ? "✅ Active" : "❌ Inactive";
			const statusColor = product.isActive ? colors.green : colors.red;

			log(`${index + 1}. ${product.name}`, colors.bright);
			log(`   📊 Barcode: ${product.barcode}`, colors.blue);
			log(`   📍 Shelf: ${product.shelfNumber}`, colors.blue);
			log(`   🖼️  Image: ${product.picture}`, colors.magenta);
			log(`   📊 Status: ${status}`, statusColor);
			log("");
		});

		log("═".repeat(80), colors.cyan);

		// Summary statistics
		const activeCount = products.filter((p) => p.isActive).length;
		const inactiveCount = products.filter((p) => !p.isActive).length;

		log("📊 Summary:", colors.bright);
		log(
			`   Total products with default image: ${products.length}`,
			colors.blue
		);
		log(`   Active products: ${activeCount}`, colors.green);
		log(`   Inactive products: ${inactiveCount}`, colors.red);
	} catch (error) {
		log(`❌ Error listing products: ${error.message}`, colors.red);
		throw error;
	}
};

// Main execution function
const main = async () => {
	const options = parseArgs();

	showBanner();
	await connectDB();

	switch (options.action) {
		case "list":
			await listProductsWithDefaultImage();
			break;
		case "deactivate":
			await deactivateProductsWithDefaultImage(options.force);
			break;
		case "delete":
			await deleteProductsWithDefaultImage(options.force);
			break;
		default:
			log(`❌ Unknown action: ${options.action}`, colors.red);
			process.exit(1);
	}

	await mongoose.connection.close();
	log("🔌 Database connection closed", colors.blue);
};

// Run the script
main().catch((error) => {
	log(`❌ Unexpected error: ${error.message}`, colors.red);
	process.exit(1);
});
