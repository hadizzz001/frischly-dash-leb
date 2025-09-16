// Script to import products from excel-to-json.json into the database
// Usage: node scripts/addProductsFromJson.js

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");
const Subcategory = require("../src/models/Subcategory");
require("dotenv").config();

const DATA_PATH = path.join(__dirname, "../excel-to-json.json");

const DEFAULT_CATEGORY = "Others";
const DEFAULT_SUBCATEGORY = "Others";
const DEFAULT_STOCK = 0;
const DEFAULT_IS_ACTIVE = true;

// Generate unique barcodes
function generateUniqueBarcode(index) {
	return `BAR${String(index).padStart(6, "0")}`;
}

// Generate shelf numbers like A-1, B-1, ...
function* shelfNumberGenerator() {
	const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	let i = 0;
	while (true) {
		yield `${letters[i % letters.length]}-${
			Math.floor(i / letters.length) + 1
		}`;
		i++;
	}
}

async function getOrCreateCategory(name) {
	let cat = await Category.findOne({ name });
	if (!cat) {
		try {
			cat = await Category.create({ name });
			console.log(`Created category: ${name}`);
		} catch (err) {
			if (err.code === 11000) {
				// Duplicate key error, try to find existing one
				cat = await Category.findOne({ name });
				if (!cat) {
					throw err;
				}
				console.log(`Using existing category: ${name}`);
			} else {
				throw err;
			}
		}
	}
	return cat;
}

async function getOrCreateSubcategory(name, parentCategoryId) {
	let sub = await Subcategory.findOne({
		name,
		parentCategory: parentCategoryId,
	});
	if (!sub) {
		try {
			sub = await Subcategory.create({
				name,
				parentCategory: parentCategoryId,
			});
			console.log(`Created subcategory: ${name}`);
		} catch (err) {
			if (err.code === 11000) {
				// Duplicate key error, try to find existing one
				sub = await Subcategory.findOne({ name });
				if (!sub) {
					throw err; // If still not found, re-throw the error
				}
				console.log(`Using existing subcategory: ${name}`);
			} else {
				throw err;
			}
		}
	}
	return sub;
}

async function main() {
	await mongoose.connect(process.env.MONGODB_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
	});
	console.log("Connected to MongoDB");

	const raw = fs.readFileSync(DATA_PATH, "utf8");
	const products = JSON.parse(raw);
	const shelfGen = shelfNumberGenerator();

	// Use existing Others category and subcategory
	const defaultCat = await Category.findOne({ name: "Others" });
	const defaultSub = await Subcategory.findOne({ name: "others" });

	if (!defaultCat || !defaultSub) {
		console.error("Others category or subcategory not found in database");
		process.exit(1);
	}

	console.log(
		`Using default category: ${defaultCat.name} and subcategory: ${defaultSub.name}`
	);

	let added = 0,
		failed = 0;

	for (let i = 0; i < products.length; i++) {
		const p = products[i];
		// Category/subcategory logic
		const catName =
			p.category && p.category.trim() ? p.category.trim() : "Others";
		const subcatName =
			p["SPC.category"] && p["SPC.category"].trim()
				? p["SPC.category"].trim()
				: "others";

		let cat, subcat;

		if (catName === "Others") {
			cat = defaultCat;
		} else {
			cat = await getOrCreateCategory(catName);
		}

		if (subcatName === "others") {
			subcat = defaultSub;
		} else {
			subcat = await getOrCreateSubcategory(subcatName, cat._id);
		}

		// Compose description from extra fields
		const descFields = Object.entries(p)
			.filter(
				([k]) =>
					![
						"name",
						"category",
						"SPC.category",
						"priceFR.",
						"price.E",
						"id",
					].includes(k)
			)
			.map(([k, v]) => `${k}: ${v}`)
			.join(" | ");
		const description = descFields;

		// Build product doc
		const productDoc = {
			name: p.name || "Unnamed Product",
			barcode: generateUniqueBarcode(i + 1),
			shelfNumber: shelfGen.next().value,
			subcategory: subcat._id,
			price:
				typeof p["priceFR."] === "number"
					? Math.round(p["priceFR."] * 100) / 100
					: Math.round((parseFloat(p["priceFR."]) || 0) * 100) / 100,
			stock: DEFAULT_STOCK,
			isActive: DEFAULT_IS_ACTIVE,
			description,
		};

		try {
			await Product.create(productDoc);
			added++;
		} catch (err) {
			console.error("Failed to add product:", productDoc.name, err.message);
			failed++;
		}
	}

	console.log(`\nImport complete. Added: ${added}, Failed: ${failed}`);
	mongoose.disconnect();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
