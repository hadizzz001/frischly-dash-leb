const mongoose = require("mongoose");
const Category = require("../src/models/Category");
const Subcategory = require("../src/models/Subcategory");

// Load environment variables
require("dotenv").config();

// MongoDB connection
const mongoURI =
	process.env.MONGODB_URI || "mongodb://localhost:27017/frischly";

// Subcategories data organized by parent category
const subcategoriesData = {
	Obst: ["Bananen", "Beeren", "Exoten", "Tiefkühl-Obst", "Trauben"],
	Eis: ["Eis-Einzelpackungen"],
	"Alkoholfreie Getränke": ["Fresh juices & smoothies", "Juice"],
	"Konserven, Instantgerichte & Ba": [
		"Backzutaten",
		"Eintöpfe & Suppen",
		"Fischkonserven",
		"Instantgerichte",
		"Mehl",
	],
	Gemüse: [
		"Aubergine, Paprika & Zucchini",
		"Avocado, Gurken & Tomaten",
		"Blattgemüse & Salate",
		"Hülsenfrüchte & Kürbis",
		"Kohl & Staudengemüse",
		"Kräuter",
		"Lauch & Zwiebeln",
	],
	Tiefkühlkost: ["Fertiggerichte", "Fisch", "Gemüse", "Kartoffelprodukte"],
	"Saucen, Öle & Gewürze": ["Fixprodukte", "Ketchup & Grillsaucen"],
	Backwaren: ["Geschnittenes Brot & Toast", "Zum Aufbacken"],
	"Frisch & Fertig": [
		"Coffee To Go",
		"Frische Nudeln, Teigwaren & Beilagen",
		"Gekühlte Fertiggerichte & Snacks",
		"Käsespezialitäten",
		"Pastasaucen & Pesto",
	],
	"Nudeln, Reis & Internationales Kochen": [
		"Nudeln",
		"Pastasaucen & Pesto",
		"Tomatenkonserven",
	],
	"Aufschnitt & Brotaufstriche": [
		"Aufschnittalternativen",
		"Frische Brotaufstriche",
		"Frischkäse",
		"Kochschinken & Braten",
		"Roher Schinken & Speck",
		"Salami",
	],
	"Cat & Dog": ["Katzen"],
	"Vegan & Vegetarisch": [
		"Joghurt & Desserts Alternativen",
		"Käse- & Wurstalternativen",
	],
	"Salzige Snacks": [
		"Chips & Flips",
		"Cracker & Laugengebäck",
		"Nüsse",
		"Popcorn",
		"Tortillas & Dips",
	],
	"Chocolate & Cookies": ["Chocolate", "Riegel"],
	"Kaffee, Tee & Kakao": ["Früchtetee", "Instantkaffee", "Kaffeepads"],
	"Joghurt & Desserts": ["Desserts"],
	Household: ["Wäsche"],
};

async function addSubcategories() {
	try {
		console.log("Connecting to MongoDB...");
		await mongoose.connect(mongoURI);
		console.log("Connected to MongoDB successfully!");

		let totalAdded = 0;
		let totalSkipped = 0;
		let errors = [];

		for (const [categoryName, subcategoryNames] of Object.entries(
			subcategoriesData
		)) {
			console.log(`\nProcessing category: ${categoryName}`);

			// Find the parent category
			const parentCategory = await Category.findOne({ name: categoryName });

			if (!parentCategory) {
				console.log(
					`❌ Parent category '${categoryName}' not found - skipping subcategories`
				);
				errors.push(`Parent category '${categoryName}' not found`);
				continue;
			}

			console.log(
				`✅ Found parent category: ${parentCategory.name} (${parentCategory._id})`
			);

			// Add each subcategory
			for (const subcategoryName of subcategoryNames) {
				try {
					// Check if subcategory already exists
					const existingSubcategory = await Subcategory.findOne({
						name: subcategoryName,
						parentCategory: parentCategory._id,
					});

					if (existingSubcategory) {
						console.log(
							`   ⚠️ Subcategory '${subcategoryName}' already exists - skipping`
						);
						totalSkipped++;
						continue;
					}

					// Create new subcategory
					const newSubcategory = new Subcategory({
						name: subcategoryName,
						parentCategory: parentCategory._id,
						isActive: true,
					});

					await newSubcategory.save();
					console.log(`   ✅ Added subcategory: ${subcategoryName}`);
					totalAdded++;
				} catch (error) {
					console.log(
						`   ❌ Error adding subcategory '${subcategoryName}': ${error.message}`
					);
					errors.push(`Error adding '${subcategoryName}': ${error.message}`);
				}
			}
		}

		console.log("\n" + "=".repeat(50));
		console.log("SUMMARY:");
		console.log(`✅ Total subcategories added: ${totalAdded}`);
		console.log(`⚠️ Total subcategories skipped: ${totalSkipped}`);
		console.log(`❌ Total errors: ${errors.length}`);

		if (errors.length > 0) {
			console.log("\nErrors encountered:");
			errors.forEach((error, index) => {
				console.log(`${index + 1}. ${error}`);
			});
		}

		// Show final counts
		const totalSubcategories = await Subcategory.countDocuments();
		const totalCategories = await Category.countDocuments();
		console.log(`\nDatabase totals after script:`);
		console.log(`📁 Total categories: ${totalCategories}`);
		console.log(`📂 Total subcategories: ${totalSubcategories}`);
	} catch (error) {
		console.error("Script failed:", error);
	} finally {
		await mongoose.disconnect();
		console.log("Disconnected from MongoDB.");
	}
}

// Run the script
if (require.main === module) {
	addSubcategories();
}

module.exports = addSubcategories;
