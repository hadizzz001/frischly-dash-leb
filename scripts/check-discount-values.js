const mongoose = require("mongoose");
const Product = require("../src/models/Product");

// Connect to MongoDB
mongoose.connect(
	process.env.MONGODB_URI || "mongodb://localhost:27017/frischly",
	{
		useNewUrlParser: true,
		useUnifiedTopology: true,
	}
);

async function checkDiscountValues() {
	try {
		console.log("🔍 Checking discount values in database...\n");

		// Get count of products with different discount values
		const totalProducts = await Product.countDocuments();
		console.log(`Total products: ${totalProducts}`);

		const productsWithDiscount = await Product.countDocuments({
			discount: { $gt: 0 },
		});
		console.log(`Products with discount > 0: ${productsWithDiscount}`);

		const productsWithZeroDiscount = await Product.countDocuments({
			discount: 0,
		});
		console.log(`Products with discount = 0: ${productsWithZeroDiscount}`);

		const productsWithNullDiscount = await Product.countDocuments({
			discount: { $exists: false },
		});
		console.log(`Products with no discount field: ${productsWithNullDiscount}`);

		const productsWithUndefinedDiscount = await Product.countDocuments({
			discount: null,
		});
		console.log(
			`Products with discount = null: ${productsWithUndefinedDiscount}`
		);

		// Get some examples of products with discount > 0
		console.log("\n📋 Examples of products with discount > 0:");
		const discountedProducts = await Product.find({ discount: { $gt: 0 } })
			.limit(10)
			.select("name discount");
		discountedProducts.forEach((product) => {
			console.log(`   - ${product.name}: ${product.discount}%`);
		});

		// Get unique discount values
		console.log("\n📊 Unique discount values:");
		const uniqueDiscounts = await Product.distinct("discount");
		console.log(
			"Unique discount values:",
			uniqueDiscounts.sort((a, b) => b - a)
		);

		console.log("\n✅ Discount analysis complete!");
	} catch (error) {
		console.error("❌ Error:", error);
	} finally {
		mongoose.connection.close();
	}
}

checkDiscountValues();
