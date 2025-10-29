const mongoose = require("mongoose");
require("dotenv").config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
});

const Shelf = require("../src/models/Shelf");

const seedShelves = async () => {
	try {
		console.log("🚀 Starting shelf seeding...");

		// Clear existing shelves (optional - comment out if you want to keep existing ones)
		// await Shelf.deleteMany({});
		// console.log("Cleared existing shelves");

		const shelves = [];
		const sections = ["A", "B", "C", "D", "E", "F"];
		let count = 0;

		// Generate shelves with pattern {A-F}-{1-99}
		for (const section of sections) {
			// Generate 17 shelves per section to get close to 100 total (6 sections × 17 = 102)
			for (let i = 1; i <= 17 && count < 100; i++) {
				const shelfNumber = `${section}-${i}`;
				shelves.push({
					shelfNumber: shelfNumber,
					barcode: shelfNumber.replace("-", ""), // e.g., AA001, B002
					description: `Shelf ${shelfNumber} in Section ${section}`,
					location: `Warehouse Section ${section}`,
					capacity: Math.floor(Math.random() * 50) + 20, // Random capacity between 20-70
					currentLoad: 0,
					isActive: true,
					products: [],
					orders: [],
				});
				count++;
			}
		}

		console.log(`📦 Creating ${shelves.length} shelves...`);

		// Insert all shelves
		const result = await Shelf.insertMany(shelves);
		console.log(`✅ Successfully created ${result.length} shelves!`);

		// Display summary
		console.log("\n📊 Summary:");
		sections.forEach((section) => {
			const sectionCount = result.filter((s) =>
				s.shelfNumber.startsWith(section)
			).length;
			console.log(`   Section ${section}: ${sectionCount} shelves`);
		});

		console.log("\n✨ Shelf seeding completed successfully!");
		process.exit(0);
	} catch (error) {
		console.error("❌ Error seeding shelves:", error);
		process.exit(1);
	}
};

// Run the seed function
seedShelves();
