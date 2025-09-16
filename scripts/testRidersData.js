// Test script to check riders API response structure
const mongoose = require("mongoose");
const Rider = require("../src/models/Rider");
require("dotenv").config();

async function testRidersData() {
	try {
		await mongoose.connect(process.env.MONGODB_URI);
		console.log("Connected to MongoDB");

		// Check what riders exist in database
		const riders = await Rider.find({})
			.populate("user", "name email phoneNumber")
			.populate("zone");
		console.log(`\nFound ${riders.length} riders in database:`);

		if (riders.length === 0) {
			console.log("No riders found in database");
		} else {
			riders.forEach((rider, index) => {
				console.log(`${index + 1}. Rider ID: ${rider._id}`);
				console.log(
					`   User: ${
						rider.user
							? rider.user.name + " (" + rider.user.email + ")"
							: "No User"
					}`
				);
				console.log(`   Status: ${rider.status}`);
				console.log(
					`   Vehicle: ${rider.vehicleType} - ${rider.vehicleNumber}`
				);
				console.log(`   Zone: ${rider.zone ? rider.zone.zoneName : "No Zone"}`);
				console.log(`   Rating: ${rider.rating || "N/A"}`);
				console.log(`   Active: ${rider.isActive}`);
				console.log("");
			});
		}

		// Test the aggregate query similar to what the API uses
		console.log("\n--- Testing API-style aggregate query ---");
		const aggregateRiders = await Rider.aggregate([
			{ $match: { isActive: true } },
			{
				$lookup: {
					from: "users",
					localField: "user",
					foreignField: "_id",
					as: "userInfo",
				},
			},
			{ $unwind: "$userInfo" },
			{
				$lookup: {
					from: "orders",
					let: { riderId: "$_id" },
					pipeline: [
						{
							$match: {
								$expr: { $eq: ["$assignedRider", "$$riderId"] },
								status: { $in: ["confirmed", "processing", "shipped"] },
							},
						},
					],
					as: "activeOrders",
				},
			},
			{
				$addFields: {
					activeOrdersCount: { $size: "$activeOrders" },
					completionRate: {
						$cond: {
							if: { $eq: ["$ordersPickedCount", 0] },
							then: 0,
							else: {
								$multiply: [
									{ $divide: ["$ordersDeliveredCount", "$ordersPickedCount"] },
									100,
								],
							},
						},
					},
				},
			},
			{
				$project: {
					zone: 1,
					status: 1,
					vehicleType: 1,
					vehicleNumber: 1,
					ordersPickedCount: 1,
					ordersDeliveredCount: 1,
					activeOrdersCount: 1,
					completionRate: 1,
					totalEarnings: 1,
					rating: 1,
					isVerified: 1,
					lastActiveAt: 1,
					createdAt: 1,
					"userInfo.name": 1,
					"userInfo.email": 1,
					"userInfo.phoneNumber": 1,
				},
			},
			{ $sort: { createdAt: -1 } },
			{ $limit: 10 },
		]);

		console.log(`Aggregate query returned ${aggregateRiders.length} riders:`);
		aggregateRiders.forEach((rider, index) => {
			console.log(
				`${index + 1}. ${rider.userInfo?.name || "No Name"} - ${
					rider.status
				} - ${rider.vehicleType || "No Vehicle"}`
			);
		});

		mongoose.disconnect();
		console.log("\nDatabase connection closed");
	} catch (error) {
		console.error("❌ Error:", error.message);
		process.exit(1);
	}
}

testRidersData();
