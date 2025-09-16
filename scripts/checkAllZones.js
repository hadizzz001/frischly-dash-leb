const mongoose = require("mongoose");
const Zone = require("../src/models/Zone");
require("dotenv").config();

async function checkZones() {
	await mongoose.connect(process.env.MONGODB_URI);

	console.log("All zones in database:");
	const zones = await Zone.find({});
	console.log(`Total zones: ${zones.length}`);

	zones.forEach((z, index) => {
		console.log(
			`${index + 1}. ${z.zoneName || "UNNAMED"} (${z.zipCode || "NO ZIP"}) - ${
				z.distance || "NO DISTANCE"
			}km - ID: ${z._id}`
		);
	});

	// Check for zones with null/undefined names
	const nullNameZones = await Zone.find({
		$or: [{ zoneName: null }, { zoneName: undefined }, { zoneName: "" }],
	});

	if (nullNameZones.length > 0) {
		console.log(
			`\n⚠️  Found ${nullNameZones.length} zones with null/empty names:`
		);
		nullNameZones.forEach((z, index) => {
			console.log(
				`${index + 1}. ID: ${z._id} - ZipCode: ${z.zipCode} - Distance: ${
					z.distance
				}`
			);
		});
	}

	mongoose.disconnect();
}

checkZones().catch(console.error);
