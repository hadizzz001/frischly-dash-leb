const mongoose = require("mongoose");
const Subcategory = require("../src/models/Subcategory");
require("dotenv").config();

async function fixNullSlugs() {
	try {
		await mongoose.connect(process.env.MONGODB_URI);
		console.log("Connected to MongoDB");

		// Find all subcategories with null slugs
		const subcategoriesWithNullSlug = await mongoose.connection.db
			.collection('subcategories')
			.find({ slug: null })
			.toArray();

		console.log(`Found ${subcategoriesWithNullSlug.length} subcategories with null slugs`);

		for (const sub of subcategoriesWithNullSlug) {
			console.log(`Fixing subcategory: ${sub.name} (${sub._id})`);

			// Generate slug using the model logic
			const subcategory = await Subcategory.findById(sub._id);
			if (subcategory) {
				console.log(`  Before save - slug: ${subcategory.slug}`);
				await subcategory.save(); // This will trigger the pre-save hook
				console.log(`  After save - slug: ${subcategory.slug}`);
			} else {
				console.log(`  Subcategory not found in model`);
			}
		}

		console.log("All null slugs fixed!");
		await mongoose.connection.close();
	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
}

fixNullSlugs();