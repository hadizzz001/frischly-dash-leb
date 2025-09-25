srequire("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");
const Subcategory = require("../src/models/Subcategory");

async function checkProductCategorySubcategoryConsistency() {
	try {
		// Connect to database
		console.log("🔗 Connecting to MongoDB...");
		const conn = await mongoose.connect(process.env.MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
		console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
		console.log(`📊 Database: ${conn.connection.name}`);

		// Get all products with populated category and subcategory
		const products = await Product.find({})
			.populate("category", "name")
			.populate({
				path: "subcategory",
				populate: {
					path: "parentCategory",
					select: "name",
				},
			})
			.select("name category subcategory");

		console.log(
			`Checking ${products.length} products for category/subcategory consistency...\n`
		);

		let mismatchCount = 0;
		let productsWithBoth = 0;
		let productsWithCategoryOnly = 0;
		let productsWithSubcategoryOnly = 0;
		let productsWithNeither = 0;

		for (const product of products) {
			const productName = product.name || "Unnamed Product";
			const productId = product._id;

			// Check what fields are present
			const hasCategory =
				product.category !== null && product.category !== undefined;
			const hasSubcategory =
				product.subcategory !== null && product.subcategory !== undefined;

			if (hasCategory && hasSubcategory) {
				productsWithBoth++;

				// Check if subcategory has parentCategory
				const subcategoryParent = product.subcategory.parentCategory;

				if (subcategoryParent) {
					// Compare category IDs
					const productCategoryId = product.category._id.toString();
					const subcategoryParentId = subcategoryParent._id.toString();

					if (productCategoryId !== subcategoryParentId) {
						mismatchCount++;
						console.log(`❌ MISMATCH #${mismatchCount}:`);
						console.log(`   Product: "${productName}" (ID: ${productId})`);
						console.log(
							`   Product Category: "${product.category.name}" (ID: ${productCategoryId})`
						);
						console.log(`   Subcategory: "${product.subcategory.name}"`);
						console.log(
							`   Subcategory Parent: "${subcategoryParent.name}" (ID: ${subcategoryParentId})`
						);
						console.log("");
					}
				} else {
					mismatchCount++;
					console.log(`❌ MISMATCH #${mismatchCount}:`);
					console.log(`   Product: "${productName}" (ID: ${productId})`);
					console.log(`   Product Category: "${product.category.name}"`);
					console.log(`   Subcategory: "${product.subcategory.name}"`);
					console.log(`   Issue: Subcategory has no parent category set`);
					console.log("");
				}
			} else if (hasCategory && !hasSubcategory) {
				productsWithCategoryOnly++;
			} else if (!hasCategory && hasSubcategory) {
				productsWithSubcategoryOnly++;
				console.log(
					`⚠️  WARNING: Product "${productName}" has subcategory but no category`
				);
				console.log(`   Subcategory: "${product.subcategory.name}"`);
				if (product.subcategory.parentCategory) {
					console.log(
						`   Subcategory Parent: "${product.subcategory.parentCategory.name}"`
					);
				}
				console.log("");
			} else {
				productsWithNeither++;
			}
		}

		// Summary
		console.log("=".repeat(60));
		console.log("SUMMARY:");
		console.log("=".repeat(60));
		console.log(`Total products checked: ${products.length}`);
		console.log(
			`Products with both category and subcategory: ${productsWithBoth}`
		);
		console.log(`Products with category only: ${productsWithCategoryOnly}`);
		console.log(
			`Products with subcategory only: ${productsWithSubcategoryOnly}`
		);
		console.log(`Products with neither: ${productsWithNeither}`);
		console.log("");
		console.log(`❌ Total mismatches found: ${mismatchCount}`);

		if (mismatchCount === 0) {
			console.log(
				"✅ All products with both category and subcategory have consistent data!"
			);
		} else {
			console.log(
				`⚠️  Found ${mismatchCount} products with inconsistent category/subcategory relationships.`
			);
			console.log("These products may need to be fixed.");
		}

		process.exit(0);
	} catch (error) {
		console.error("Error checking product consistency:", error);
		process.exit(1);
	}
}

checkProductCategorySubcategoryConsistency();
