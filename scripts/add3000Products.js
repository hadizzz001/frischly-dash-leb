const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");
require("dotenv").config();

// Connect to MongoDB
const connectDB = async () => {
	try {
		await mongoose.connect(process.env.MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
		console.log("MongoDB Connected for product creation");
	} catch (error) {
		console.error("Error connecting to MongoDB:", error.message);
		process.exit(1);
	}
};

// Sample categories data
const categoriesData = [
	{
		name: "Fresh Produce",
		description: "Fresh fruits and vegetables",
		icon: "🥬",
	},
	{
		name: "Dairy & Eggs",
		description: "Milk, cheese, yogurt and eggs",
		icon: "🥛",
	},
	{
		name: "Meat & Seafood",
		description: "Fresh meat, poultry and seafood",
		icon: "🥩",
	},
	{
		name: "Bakery",
		description: "Fresh bread, pastries and baked goods",
		icon: "🍞",
	},
	{
		name: "Pantry Staples",
		description: "Rice, pasta, canned goods",
		icon: "🥫",
	},
	{
		name: "Snacks",
		description: "Chips, crackers and snack foods",
		icon: "🍿",
	},
	{
		name: "Beverages",
		description: "Soft drinks, juices and water",
		icon: "🥤",
	},
	{
		name: "Frozen Foods",
		description: "Frozen vegetables, meals and desserts",
		icon: "🧊",
	},
	{
		name: "Health & Beauty",
		description: "Personal care and beauty products",
		icon: "🧴",
	},
	{
		name: "Household Items",
		description: "Cleaning supplies and paper products",
		icon: "🧽",
	},
	{
		name: "Baby Products",
		description: "Baby food, diapers and care items",
		icon: "🍼",
	},
	{ name: "Pet Supplies", description: "Pet food and accessories", icon: "🐕" },
];

// Product name templates for different categories
const productTemplates = {
	"Fresh Produce": [
		"Organic Bananas",
		"Fresh Apples",
		"Carrots",
		"Broccoli",
		"Spinach",
		"Tomatoes",
		"Potatoes",
		"Onions",
		"Bell Peppers",
		"Lettuce",
		"Cucumbers",
		"Oranges",
		"Strawberries",
		"Grapes",
		"Avocados",
		"Lemons",
		"Garlic",
		"Ginger",
	],
	"Dairy & Eggs": [
		"Whole Milk",
		"Skim Milk",
		"Greek Yogurt",
		"Cheddar Cheese",
		"Mozzarella",
		"Large Eggs",
		"Butter",
		"Cream Cheese",
		"Sour Cream",
		"Heavy Cream",
		"Cottage Cheese",
		"Swiss Cheese",
		"Parmesan Cheese",
	],
	"Meat & Seafood": [
		"Ground Beef",
		"Chicken Breast",
		"Salmon Fillet",
		"Pork Chops",
		"Turkey Slices",
		"Shrimp",
		"Tuna Steaks",
		"Beef Steaks",
		"Chicken Thighs",
		"Ground Turkey",
		"Bacon",
		"Ham",
		"Cod Fillet",
		"Crab Meat",
	],
	Bakery: [
		"White Bread",
		"Whole Wheat Bread",
		"Croissants",
		"Bagels",
		"Dinner Rolls",
		"Muffins",
		"Donuts",
		"Sourdough Bread",
		"Pita Bread",
		"Tortillas",
		"Danish Pastry",
		"Cinnamon Rolls",
	],
	"Pantry Staples": [
		"White Rice",
		"Brown Rice",
		"Pasta",
		"Olive Oil",
		"Tomato Sauce",
		"Black Beans",
		"Peanut Butter",
		"Flour",
		"Sugar",
		"Salt",
		"Pepper",
		"Cereal",
		"Oats",
		"Honey",
		"Vinegar",
		"Soy Sauce",
	],
	Snacks: [
		"Potato Chips",
		"Pretzels",
		"Crackers",
		"Nuts",
		"Granola Bars",
		"Cookies",
		"Chocolate",
		"Candy",
		"Popcorn",
		"Trail Mix",
		"Beef Jerky",
	],
	Beverages: [
		"Coca Cola",
		"Pepsi",
		"Orange Juice",
		"Apple Juice",
		"Water Bottles",
		"Sports Drinks",
		"Energy Drinks",
		"Coffee",
		"Tea",
		"Soda Water",
		"Beer",
	],
	"Frozen Foods": [
		"Frozen Pizza",
		"Ice Cream",
		"Frozen Vegetables",
		"Frozen Berries",
		"Frozen Chicken",
		"TV Dinners",
		"Frozen Fries",
		"Popsicles",
		"Frozen Fish",
	],
	"Health & Beauty": [
		"Shampoo",
		"Conditioner",
		"Body Wash",
		"Toothpaste",
		"Deodorant",
		"Lotion",
		"Soap",
		"Razor",
		"Vitamins",
		"First Aid Kit",
	],
	"Household Items": [
		"Paper Towels",
		"Toilet Paper",
		"Dish Soap",
		"Laundry Detergent",
		"All-Purpose Cleaner",
		"Trash Bags",
		"Sponges",
		"Aluminum Foil",
	],
	"Baby Products": [
		"Baby Formula",
		"Diapers",
		"Baby Wipes",
		"Baby Food",
		"Baby Lotion",
		"Baby Shampoo",
		"Pacifiers",
		"Baby Bottles",
	],
	"Pet Supplies": [
		"Dog Food",
		"Cat Food",
		"Pet Treats",
		"Cat Litter",
		"Dog Toys",
		"Pet Shampoo",
		"Pet Bowls",
		"Leashes",
		"Pet Beds",
	],
};

// Generate random barcode
const generateBarcode = () => {
	return Math.random().toString(36).substr(2, 12).toUpperCase();
};

// Generate random shelf number
const generateShelfNumber = () => {
	const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	const letter = letters[Math.floor(Math.random() * letters.length)];
	const number = Math.floor(Math.random() * 999) + 1;
	const section = Math.floor(Math.random() * 20) + 1;
	return `${letter}${section}-${number}`;
};

// Generate random price based on category
const generatePrice = (categoryName) => {
	const priceRanges = {
		"Fresh Produce": [0.5, 8.99],
		"Dairy & Eggs": [1.99, 12.99],
		"Meat & Seafood": [4.99, 29.99],
		Bakery: [1.49, 8.99],
		"Pantry Staples": [0.99, 15.99],
		Snacks: [1.29, 6.99],
		Beverages: [0.99, 8.99],
		"Frozen Foods": [2.49, 12.99],
		"Health & Beauty": [1.99, 24.99],
		"Household Items": [2.99, 19.99],
		"Baby Products": [3.99, 29.99],
		"Pet Supplies": [4.99, 39.99],
	};

	const [min, max] = priceRanges[categoryName] || [1.99, 19.99];
	return Math.round((Math.random() * (max - min) + min) * 100) / 100;
};

// Generate random stock
const generateStock = () => {
	return Math.floor(Math.random() * 200) + 1; // 1-200 items
};

// Generate product description
const generateDescription = (productName, categoryName) => {
	const descriptions = [
		`Premium quality ${productName.toLowerCase()} from trusted suppliers`,
		`Fresh ${productName.toLowerCase()} perfect for your daily needs`,
		`High-quality ${productName.toLowerCase()} at competitive prices`,
		`Popular ${productName.toLowerCase()} loved by customers`,
		`Essential ${productName.toLowerCase()} for your household`,
		`Top-rated ${productName.toLowerCase()} with excellent value`,
		`Best-selling ${productName.toLowerCase()} in ${categoryName.toLowerCase()}`,
		`Carefully selected ${productName.toLowerCase()} for quality assurance`,
	];
	return descriptions[Math.floor(Math.random() * descriptions.length)];
};

// Create categories if they don't exist
const createCategories = async () => {
	console.log("Creating categories...");
	const createdCategories = new Map();

	for (let i = 0; i < categoriesData.length; i++) {
		const categoryData = categoriesData[i];

		try {
			let category = await Category.findOne({ name: categoryData.name });

			if (!category) {
				category = new Category({
					...categoryData,
					sortOrder: i + 1,
					isActive: true,
				});
				await category.save();
				console.log(`✓ Created category: ${category.name}`);
			} else {
				console.log(`✓ Category exists: ${category.name}`);
			}

			createdCategories.set(category.name, category._id);
		} catch (error) {
			console.error(
				`Error creating category ${categoryData.name}:`,
				error.message
			);
		}
	}

	return createdCategories;
};

// Create products
const createProducts = async (categories) => {
	console.log("Creating 3000 products...");
	const categoryNames = Array.from(categories.keys());
	const createdProducts = [];
	const batchSize = 100; // Process in batches to avoid memory issues

	for (let batch = 0; batch < Math.ceil(3000 / batchSize); batch++) {
		const batchProducts = [];
		const startIndex = batch * batchSize;
		const endIndex = Math.min(startIndex + batchSize, 3000);

		console.log(
			`Processing batch ${batch + 1}: Products ${startIndex + 1}-${endIndex}`
		);

		for (let i = startIndex; i < endIndex; i++) {
			// Select random category
			const categoryName =
				categoryNames[Math.floor(Math.random() * categoryNames.length)];
			const categoryId = categories.get(categoryName);
			const templates = productTemplates[categoryName] || ["Generic Product"];

			// Select random product template and add variation
			const baseTemplate =
				templates[Math.floor(Math.random() * templates.length)];
			const variations = [
				"Premium",
				"Organic",
				"Fresh",
				"Extra",
				"Deluxe",
				"Special",
				"Classic",
			];
			const brands = [
				"Brand A",
				"Brand B",
				"Brand C",
				"FreshMart",
				"Quality Co",
				"Best Choice",
			];
			const sizes = ["Small", "Medium", "Large", "Family Size", "Regular"];

			let productName = baseTemplate;

			// Add variation to make products unique
			if (Math.random() > 0.3) {
				const variation =
					Math.random() > 0.5
						? variations[Math.floor(Math.random() * variations.length)]
						: brands[Math.floor(Math.random() * brands.length)];
				productName = `${variation} ${baseTemplate}`;
			}

			if (Math.random() > 0.7) {
				const size = sizes[Math.floor(Math.random() * sizes.length)];
				productName += ` - ${size}`;
			}

			// Add number suffix to ensure uniqueness
			productName += ` #${i + 1}`;

			let barcode, shelfNumber;
			let attempts = 0;

			// Generate unique barcode and shelf number
			do {
				barcode = generateBarcode();
				shelfNumber = generateShelfNumber();
				attempts++;
			} while (
				attempts < 10 &&
				(createdProducts.some((p) => p.barcode === barcode) ||
					batchProducts.some((p) => p.barcode === barcode))
			);

			const product = {
				name: productName,
				barcode: barcode,
				shelfNumber: shelfNumber,
				description: generateDescription(baseTemplate, categoryName),
				category: categoryId,
				price: generatePrice(categoryName),
				stock: generateStock(),
				isActive: Math.random() > 0.05, // 95% active
				tags: [categoryName.toLowerCase(), baseTemplate.toLowerCase()],
				dimensions: {
					length: Math.round((Math.random() * 50 + 5) * 100) / 100,
					width: Math.round((Math.random() * 30 + 3) * 100) / 100,
					height: Math.round((Math.random() * 20 + 2) * 100) / 100,
					unit: "cm",
				},
				weight: {
					value: Math.round((Math.random() * 2000 + 50) * 100) / 100,
					unit: "g",
				},
			};

			batchProducts.push(product);
		}

		try {
			// Insert batch
			const insertedProducts = await Product.insertMany(batchProducts, {
				ordered: false,
			});
			createdProducts.push(...insertedProducts);
			console.log(
				`✓ Successfully created ${insertedProducts.length} products in batch ${
					batch + 1
				}`
			);
		} catch (error) {
			console.error(`Error creating batch ${batch + 1}:`, error.message);

			// Try to insert individually if batch insert fails
			for (const productData of batchProducts) {
				try {
					const product = new Product(productData);
					await product.save();
					createdProducts.push(product);
				} catch (individualError) {
					console.error(
						`Failed to create product ${productData.name}:`,
						individualError.message
					);
				}
			}
		}

		// Small delay between batches
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	return createdProducts;
};

// Main function
const main = async () => {
	try {
		console.log("🚀 Starting to create 3000 products...");
		console.log("⏱️  This may take a few minutes...\n");

		await connectDB();

		// Create categories first
		const categories = await createCategories();
		console.log(`\n📁 Categories ready: ${categories.size} categories\n`);

		// Create products
		const products = await createProducts(categories);

		console.log(`\n🎉 SUCCESS! Created ${products.length} products`);
		console.log("\n📊 Summary:");
		console.log(`   Total Products: ${products.length}`);
		console.log(`   Categories Used: ${categories.size}`);
		console.log(
			`   Active Products: ${products.filter((p) => p.isActive).length}`
		);
		console.log(
			`   Inactive Products: ${products.filter((p) => !p.isActive).length}`
		);

		// Show category distribution
		console.log("\n📈 Products per Category:");
		for (const [categoryName, categoryId] of categories) {
			const count = products.filter(
				(p) => p.category.toString() === categoryId.toString()
			).length;
			console.log(`   ${categoryName}: ${count} products`);
		}

		console.log(
			"\n✅ All done! You can now view your products in the dashboard."
		);
	} catch (error) {
		console.error("❌ Error:", error);
	} finally {
		mongoose.connection.close();
	}
};

// Run the script
main();
