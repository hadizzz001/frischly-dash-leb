const mongoose = require("mongoose");
const Category = require("../src/models/Category");
require("dotenv").config();

const categories = [
	{ name: "Obst", description: "Fresh fruits" },
	{ name: "Gemüse", description: "Fresh vegetables" },
	{ name: "Eier, Milch & Butter", description: "Eggs, milk and butter" },
	{ name: "Cerealien & Aufstriche", description: "Cereals and spreads" },
	{ name: "Joghurt & Desserts", description: "Yogurt and desserts" },
	{ name: "Käse", description: "Cheese products" },
	{
		name: "Konserven, Instantgerichte & Ba",
		description: "Canned goods, instant meals and more",
	},
	{ name: "Backwaren", description: "Baked goods" },
	{ name: "Frisch & Fertig", description: "Fresh and ready meals" },
	{
		name: "Aufschnitt & Brotaufstriche",
		description: "Cold cuts and bread spreads",
	},
	{ name: "Kaffee, Tee & Kakao", description: "Coffee, tea and cocoa" },
	{ name: "Alkoholfreie Getränke", description: "Non-alcoholic beverages" },
	{ name: "Eis", description: "Ice cream and frozen desserts" },
	{ name: "Tiefkühlkost", description: "Frozen foods" },
	{ name: "Saucen, Öle & Gewürze", description: "Sauces, oils and spices" },
	{
		name: "Nudeln, Reis & Internationales Kochen",
		description: "Pasta, rice and international cooking",
	},
	{ name: "Vegan & Vegetarisch", description: "Vegan and vegetarian products" },
	{ name: "Salzige Snacks", description: "Salty snacks" },
	{ name: "Chocolate & Cookies", description: "Chocolate and cookies" },
	{ name: "Household", description: "Household items and cleaning products" },
	{ name: "Fitness & Health", description: "Fitness and health products" },
	{ name: "Spirits & More", description: "Alcoholic beverages" },
	{
		name: "Fruit gums, candies & chewing",
		description: "Sweets, candies and chewing gum",
	},
	{ name: "Beer", description: "Beer and beer products" },
	{ name: "Drugstore", description: "Personal care and hygiene products" },
	{ name: "Cat & Dog", description: "Pet supplies for cats and dogs" },
];

const addCategories = async () => {
	try {
		console.log("🔗 Connecting to MongoDB...");
		await mongoose.connect(process.env.MONGODB_URI);
		console.log("✅ MongoDB Connected");

		console.log(`\n📋 Adding ${categories.length} German categories...`);

		let addedCount = 0;
		let skippedCount = 0;
		const addedCategories = [];
		const skippedCategories = [];

		for (let i = 0; i < categories.length; i++) {
			const categoryData = categories[i];

			try {
				// Check if category already exists
				const existingCategory = await Category.findOne({
					name: categoryData.name,
				});

				if (existingCategory) {
					console.log(
						`   ⚠️  Category "${categoryData.name}" already exists - skipping`
					);
					skippedCategories.push(categoryData.name);
					skippedCount++;
					continue;
				}

				// Create new category
				const category = new Category({
					name: categoryData.name,
					description: categoryData.description,
					isActive: true,
					sortOrder: i + 1,
					createdBy: null, // Will be set by system
				});

				await category.save();
				addedCategories.push(categoryData.name);
				addedCount++;
				console.log(`   ✅ Added: "${categoryData.name}"`);
			} catch (error) {
				console.error(
					`   ❌ Error adding "${categoryData.name}":`,
					error.message
				);
				skippedCategories.push(categoryData.name);
				skippedCount++;
			}
		}

		console.log("\n🎉 Category addition completed!");
		console.log("📊 Summary:");
		console.log(`   ✅ Successfully added: ${addedCount} categories`);
		console.log(`   ⚠️  Skipped/Failed: ${skippedCount} categories`);

		if (addedCategories.length > 0) {
			console.log("\n✅ Added Categories:");
			addedCategories.forEach((name, index) => {
				console.log(`   ${index + 1}. ${name}`);
			});
		}

		if (skippedCategories.length > 0) {
			console.log("\n⚠️  Skipped Categories:");
			skippedCategories.forEach((name, index) => {
				console.log(`   ${index + 1}. ${name}`);
			});
		}

		// Verification
		console.log("\n🔍 Verifying addition...");
		const totalCategories = await Category.countDocuments({});
		const activeCategories = await Category.countDocuments({ isActive: true });

		console.log("📊 Database Status:");
		console.log(`   Total categories: ${totalCategories}`);
		console.log(`   Active categories: ${activeCategories}`);

		console.log("\n💡 Next Steps:");
		console.log("══════════════════════════════════════════════════");
		console.log("1. 🗂️  Create subcategories under main categories");
		console.log("2. 📦 Assign products to appropriate categories");
		console.log("3. 🎨 Add category icons and images if needed");
		console.log("4. 📱 Update mobile apps with new categories");
		console.log("5. 🧪 Test category filtering in dashboard");

		console.log("\n🏁 Script completed successfully!");
	} catch (error) {
		console.error("❌ Error adding categories:", error.message);
		process.exit(1);
	} finally {
		console.log("📡 Database connection closed");
		await mongoose.connection.close();
		process.exit(0);
	}
};

// Run the script
addCategories();
