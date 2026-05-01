require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../src/models/User");
const Order = require("../src/models/Order");
const Zone = require("../src/models/Zone");

async function removePostalCodes() {
	const mongoUri = process.env.MONGODB_URI;

	if (!mongoUri) {
		throw new Error("MONGODB_URI is not configured");
	}

	await mongoose.connect(mongoUri);

	const [usersResult, ordersResult, zonesResult] = await Promise.all([
		User.updateMany(
			{ "address.zipCode": { $exists: true } },
			{ $unset: { "address.zipCode": "" } }
		),
		Order.updateMany(
			{ "customer.address.zipCode": { $exists: true } },
			{ $unset: { "customer.address.zipCode": "" } }
		),
		Zone.updateMany(
			{ zipCode: { $exists: true } },
			{ $unset: { zipCode: "" } }
		),
	]);

	console.log("Postal-code cleanup complete:");
	console.log(`- Users matched: ${usersResult.matchedCount}, modified: ${usersResult.modifiedCount}`);
	console.log(`- Orders matched: ${ordersResult.matchedCount}, modified: ${ordersResult.modifiedCount}`);
	console.log(`- Zones matched: ${zonesResult.matchedCount}, modified: ${zonesResult.modifiedCount}`);
}

removePostalCodes()
	.catch((error) => {
		console.error("Postal-code cleanup failed:", error.message);
		process.exitCode = 1;
	})
	.finally(async () => {
		await mongoose.disconnect();
	});
