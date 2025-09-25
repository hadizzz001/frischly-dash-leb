const fs = require("fs");
const path = require("path");

async function checkAndFixProductCategoryConsistency() {
	try {
		console.log("🔗 Loading backup data files...");

		// Load the backup files
		const productsPath = path.join(
			__dirname,
			"backups",
			"backup-2025-09-25T12-21-58-264Z",
			"products.json"
		);
		const categoriesPath = path.join(
			__dirname,
			"backups",
			"backup-2025-09-25T12-21-58-264Z",
			"categories.json"
		);
		const subcategoriesPath = path.join(
			__dirname,
			"backups",
			"backup-2025-09-25T12-21-58-264Z",
			"subcategories.json"
		);

		const productsData = JSON.parse(fs.readFileSync(productsPath, "utf8"));
		const categoriesData = JSON.parse(fs.readFileSync(categoriesPath, "utf8"));
		const subcategoriesData = JSON.parse(
			fs.readFileSync(subcategoriesPath, "utf8")
		);

		console.log(`✅ Loaded ${productsData.documentCount} products`);
		console.log(`✅ Loaded ${categoriesData.documentCount} categories`);
		console.log(`✅ Loaded ${subcategoriesData.documentCount} subcategories`);

		// Create lookup maps
		const categoriesMap = new Map();
		categoriesData.documents.forEach((cat) => {
			categoriesMap.set(cat._id, cat);
		});

		const subcategoriesMap = new Map();
		subcategoriesData.documents.forEach((sub) => {
			subcategoriesMap.set(sub._id, sub);
		});

		console.log("\n🔍 Checking product category/subcategory consistency...\n");

		let mismatchCount = 0;
		let fixedCount = 0;
		let productsWithBoth = 0;
		let productsWithSubcategoryOnly = 0;
		let productsWithCategoryOnly = 0;
		let productsWithNeither = 0;

		// Process each product
		for (const product of productsData.documents) {
			const productName = product.name || "Unnamed Product";
			const productId = product._id;

			const hasCategory = product.category && product.category.trim() !== "";
			const hasSubcategory =
				product.subcategory && product.subcategory.trim() !== "";

			if (hasCategory && hasSubcategory) {
				productsWithBoth++;

				const subcategory = subcategoriesMap.get(product.subcategory);
				if (subcategory && subcategory.parentCategory) {
					const expectedCategoryId = subcategory.parentCategory;

					if (product.category !== expectedCategoryId) {
						mismatchCount++;
						console.log(`❌ MISMATCH #${mismatchCount}:`);
						console.log(`   Product: "${productName}" (ID: ${productId})`);
						console.log(`   Current Category ID: ${product.category}`);
						console.log(`   Subcategory: "${subcategory.name}"`);
						console.log(`   Expected Category ID: ${expectedCategoryId}`);

						const currentCategory = categoriesMap.get(product.category);
						const expectedCategory = categoriesMap.get(expectedCategoryId);

						console.log(
							`   Current Category Name: ${
								currentCategory ? currentCategory.name : "NOT FOUND"
							}`
						);
						console.log(
							`   Expected Category Name: ${
								expectedCategory ? expectedCategory.name : "NOT FOUND"
							}`
						);

						// Fix the category
						console.log(
							`   ✅ FIXING: Updating category from ${product.category} to ${expectedCategoryId}`
						);
						product.category = expectedCategoryId;
						fixedCount++;
						console.log("");
					}
				} else if (subcategory && !subcategory.parentCategory) {
					mismatchCount++;
					console.log(`❌ MISMATCH #${mismatchCount}:`);
					console.log(`   Product: "${productName}" (ID: ${productId})`);
					console.log(`   Subcategory: "${subcategory.name}"`);
					console.log(`   Issue: Subcategory has no parent category set`);
					console.log("");
				} else {
					mismatchCount++;
					console.log(`❌ MISMATCH #${mismatchCount}:`);
					console.log(`   Product: "${productName}" (ID: ${productId})`);
					console.log(`   Subcategory ID: ${product.subcategory}`);
					console.log(`   Issue: Subcategory not found in database`);
					console.log("");
				}
			} else if (hasSubcategory && !hasCategory) {
				productsWithSubcategoryOnly++;

				const subcategory = subcategoriesMap.get(product.subcategory);
				if (subcategory && subcategory.parentCategory) {
					const expectedCategoryId = subcategory.parentCategory;
					const expectedCategory = categoriesMap.get(expectedCategoryId);

					mismatchCount++;
					console.log(`❌ MISMATCH #${mismatchCount}:`);
					console.log(`   Product: "${productName}" (ID: ${productId})`);
					console.log(`   Issue: Product has subcategory but no category`);
					console.log(`   Subcategory: "${subcategory.name}"`);
					console.log(
						`   Expected Category: ${
							expectedCategory ? expectedCategory.name : "NOT FOUND"
						} (ID: ${expectedCategoryId})`
					);

					// Fix by adding the missing category
					console.log(
						`   ✅ FIXING: Adding missing category ${expectedCategoryId}`
					);
					product.category = expectedCategoryId;
					fixedCount++;
					console.log("");
				} else {
					console.log(
						`⚠️  WARNING: Product "${productName}" has subcategory but no category, and subcategory data is incomplete`
					);
				}
			} else if (hasCategory && !hasSubcategory) {
				productsWithCategoryOnly++;
				// This is not necessarily an error - some products might only have categories
			} else {
				productsWithNeither++;
				// This is not necessarily an error - some products might be uncategorized
			}
		}

		// Save the updated products.json if any fixes were made
		if (fixedCount > 0) {
			console.log(`💾 Saving ${fixedCount} fixes to products.json...`);
			fs.writeFileSync(
				productsPath,
				JSON.stringify(productsData, null, 2),
				"utf8"
			);
			console.log("✅ products.json updated successfully!");
		}

		// Summary
		console.log("=".repeat(60));
		console.log("SUMMARY:");
		console.log("=".repeat(60));
		console.log(`Total products checked: ${productsData.documentCount}`);
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
		console.log(`✅ Total fixes applied: ${fixedCount}`);

		if (mismatchCount === 0) {
			console.log(
				"🎉 All products have consistent category/subcategory relationships!"
			);
		} else {
			console.log(
				`⚠️  Found and fixed ${fixedCount} out of ${mismatchCount} inconsistencies.`
			);
		}

		process.exit(0);
	} catch (error) {
		console.error("❌ Error checking product consistency:", error);
		console.error(error.stack);
		process.exit(1);
	}
}

checkAndFixProductCategoryConsistency();
