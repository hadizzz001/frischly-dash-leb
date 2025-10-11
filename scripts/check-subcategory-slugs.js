const mongoose = require("mongoose");
require("dotenv").config();

async function checkSubcategories() {
	try {
		await mongoose.connect(process.env.MONGODB_URI);
		console.log("Connected to MongoDB");

		const total = await mongoose.connection.db
			.collection("subcategories")
			.countDocuments();
		const withSlug = await mongoose.connection.db
			.collection("subcategories")
			.countDocuments({ slug: { $exists: true } });
		const nullSlug = await mongoose.connection.db
			.collection("subcategories")
			.countDocuments({ slug: null });
		const nonNullSlug = await mongoose.connection.db
			.collection("subcategories")
			.countDocuments({ slug: { $ne: null } });

		console.log("Total subcategories:", total);
		console.log("With slug field:", withSlug);
		console.log("With null slug:", nullSlug);
		console.log("With non-null slug:", nonNullSlug);

		if (nonNullSlug > 0) {
			const sample = await mongoose.connection.db
				.collection("subcategories")
				.findOne({ slug: { $ne: null } });
			console.log("Sample slug:", sample.slug);
		}

		await mongoose.connection.close();
	} catch (error) {
		console.error("Error:", error);
	}
}

checkSubcategories();
