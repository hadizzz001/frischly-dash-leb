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

// Banner
const showBanner = () => {
	log("", colors.cyan);
	log("╔══════════════════════════════════════════════════╗", colors.cyan);
	log("║         🔄 UPDATE PRODUCTS STATUS 🔄            ║", colors.cyan);
	log("║                                                  ║", colors.cyan);
	log("║       SET ALL PRODUCTS TO ACTIVE/INACTIVE       ║", colors.cyan);
	log("║              ⚠️  WARNING ⚠️                      ║", colors.cyan);
	log("║        THIS WILL AFFECT PRODUCT VISIBILITY      ║", colors.cyan);
	log("╚══════════════════════════════════════════════════╝", colors.cyan);
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
		await mongoose.connect(MONGODB_URI);
		log("✅ Connected to MongoDB successfully", colors.green);
		log(`📍 Database: ${mongoose.connection.db.databaseName}`, colors.blue);
		log("");
	} catch (error) {
		log(`❌ MongoDB connection failed: ${error.message}`, colors.red);
		process.exit(1);
	}
};

// Get current product statistics
const getProductStats = async () => {
	try {
		const totalProducts = await Product.countDocuments();
		const activeProducts = await Product.countDocuments({ isActive: true });
		const inactiveProducts = await Product.countDocuments({ isActive: false });

		return {
			totalProducts,
			activeProducts,
			inactiveProducts,
		};
	} catch (error) {
		log(`❌ Error getting product statistics: ${error.message}`, colors.red);
		return null;
	}
};

// Display current database statistics
const showCurrentStats = async () => {
	log("📊 Current Database Statistics:", colors.bright);
	const stats = await getProductStats();

	if (!stats) {
		log("❌ Could not retrieve statistics", colors.red);
		return;
	}

	log(`   📦 Total Products: ${stats.totalProducts}`, colors.blue);
	log(`   ✅ Active Products: ${stats.activeProducts}`, colors.green);
	log(`   ❌ Inactive Products: ${stats.inactiveProducts}`, colors.red);
	log("");
};

// Update all products to specified status
const updateAllProductsStatus = async (targetStatus) => {
	try {
		const statusText = targetStatus ? "active" : "inactive";
		log(`🔄 Updating all products to ${statusText} status...`, colors.yellow);

		const result = await Product.updateMany(
			{}, // Update all products
			{ $set: { isActive: targetStatus } }
		);

		log(`✅ Update completed successfully!`, colors.green);
		log(`   📝 Modified ${result.modifiedCount} products`, colors.blue);
		log(`   📝 Matched ${result.matchedCount} products`, colors.blue);
		log("");

		return result;
	} catch (error) {
		log(`❌ Error updating products: ${error.message}`, colors.red);
		throw error;
	}
};

// Main execution function
const main = async () => {
	showBanner();

	// Show current stats
	await showCurrentStats();

	const readline = require("readline");
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	// Ask for target status
	rl.question(
		"Do you want to set all products to ACTIVE or INACTIVE? (active/inactive): ",
		async (statusAnswer) => {
			const targetStatus = statusAnswer.toLowerCase() === "active";
			const statusText = targetStatus ? "active" : "inactive";

			log("");
			log(
				`⚠️  This will set ALL products to ${statusText.toUpperCase()} status.`,
				colors.yellow
			);
			if (targetStatus) {
				log("   Products will be visible in the app.", colors.yellow);
			} else {
				log("   Products will no longer be visible in the app.", colors.yellow);
			}
			log("");

			rl.question(
				"Are you sure you want to continue? (yes/no): ",
				async (confirmAnswer) => {
					if (
						confirmAnswer.toLowerCase() === "yes" ||
						confirmAnswer.toLowerCase() === "y"
					) {
						try {
							await connectDB();
							await updateAllProductsStatus(targetStatus);

							// Show updated stats
							log("📊 Updated Database Statistics:", colors.bright);
							await showCurrentStats();

							log("🎉 Operation completed successfully!", colors.green);
						} catch (error) {
							log(`❌ Operation failed: ${error.message}`, colors.red);
							process.exit(1);
						} finally {
							await mongoose.connection.close();
							log("🔌 Database connection closed", colors.blue);
						}
					} else {
						log("❌ Operation cancelled by user", colors.red);
					}

					rl.close();
					process.exit(0);
				}
			);
		}
	);
};

// Run the script
main().catch((error) => {
	log(`❌ Unexpected error: ${error.message}`, colors.red);
	process.exit(1);
});
