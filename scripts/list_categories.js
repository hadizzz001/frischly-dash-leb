require("dotenv").config();
const connectDB = require("../src/config/database");
const Category = require("../src/models/Category");

async function listCategories() {
	try {
		console.log("🔄 Connecting to database...");
		await connectDB();

		console.log("📝 Finding all categories...");

		// Find all categories
		const categories = await Category.find({}).sort({ name: 1 });

		console.log(`📊 Found ${categories.length} categories:\n`);

		categories.forEach((category, index) => {
			console.log(
				`${index + 1}. ${category.name} (ID: ${category._id}) - Active: ${
					category.isActive
				}`
			);
		});

		process.exit(0);
	} catch (error) {
		console.error("❌ Error listing categories:", error.message);
		process.exit(1);
	}
}

listCategories();
