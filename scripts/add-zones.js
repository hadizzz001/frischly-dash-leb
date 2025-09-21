require("dotenv").config();
const mongoose = require("mongoose");
const Zone = require("./src/models/Zone");
const connectDB = require("./src/config/database");

const zones = [
	{ zoneName: "Barrien-Heide", distance: 3.9, zipCode: "28857" },
	{ zoneName: "Clues (Niedersachsen)", distance: 3.9, zipCode: "28857" },
	{ zoneName: "Ristedt bei Syke", distance: 4.0, zipCode: "28857" },
	{ zoneName: "Sörhausen bei Syke", distance: 4.5, zipCode: "28857" },
	{ zoneName: "Osterholz bei Syke", distance: 4.7, zipCode: "28857" },
	{ zoneName: "Halbetzen, Niedersachsen", distance: 4.8, zipCode: "28857" },
	{ zoneName: "Weyhe", distance: 6.7, zipCode: "28844" },
	{ zoneName: "Süstedt", distance: 9.2, zipCode: "27305" },
	{ zoneName: "Bassum", distance: 9.7, zipCode: "27211" },
	{ zoneName: "Emtinghausen", distance: 9.9, zipCode: "27321" },
];

async function addZones() {
	try {
		await connectDB();
		const result = await Zone.insertMany(zones, { ordered: false });
		console.log("Zones added:", result.length);
	} catch (err) {
		if (err.code === 11000) {
			console.log("Some zones already exist, skipped duplicates.");
		} else {
			console.error("Error adding zones:", err);
		}
	} finally {
		mongoose.connection.close();
	}
}

addZones();
