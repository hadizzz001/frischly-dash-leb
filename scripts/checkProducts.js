const mongoose = require("mongoose");
const Product = require("../src/models/Product");
require("dotenv").config();

async function checkProducts() {
	await mongoose.connect(process.env.MONGODB_URI);

	const count = await Product.countDocuments({});
	console.log(`Total products in database: ${count}`);

	const recentProducts = await Product.find({})
		.sort({ createdAt: -1 })
		.limit(10);
	console.log("\nLast 10 products added:");
	recentProducts.forEach((p) =>
		console.log(`- ${p.name} (Barcode: ${p.barcode})`)
	);

	mongoose.disconnect();
}

checkProducts().catch(console.error);
