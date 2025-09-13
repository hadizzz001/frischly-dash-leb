const mongoose = require("mongoose");
require("dotenv").config();

// Import models
const Rider = require("../src/models/Rider");
const User = require("../src/models/User");

// Connect to MongoDB
const connectDB = async () => {
	try {
		const conn = await mongoose.connect(process.env.MONGODB_URI);
		console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
		console.log(`📊 Database: ${conn.connection.name}`);
	} catch (error) {
		console.error("❌ Database connection failed:", error.message);
		process.exit(1);
	}
};

// Sample rider data
const sampleRiders = [
	{
		zone: "Downtown",
		vehicleType: "motorbike",
		vehicleNumber: "MB-001",
		workingHours: {
			start: "08:00",
			end: "20:00",
		},
		status: "available",
		isVerified: true,
	},
	{
		zone: "North Zone",
		vehicleType: "bike",
		vehicleNumber: "BK-002",
		workingHours: {
			start: "09:00",
			end: "18:00",
		},
		status: "busy",
		ordersPickedCount: 15,
		ordersDeliveredCount: 14,
		totalEarnings: 450.75,
		isVerified: true,
	},
	{
		zone: "South Zone",
		vehicleType: "car",
		vehicleNumber: "CAR-003",
		workingHours: {
			start: "10:00",
			end: "22:00",
		},
		status: "available",
		ordersPickedCount: 8,
		ordersDeliveredCount: 7,
		totalEarnings: 320.5,
		isVerified: false,
	},
	{
		zone: "East Zone",
		vehicleType: "bicycle",
		vehicleNumber: "BC-004",
		workingHours: {
			start: "07:00",
			end: "15:00",
		},
		status: "offline",
		ordersPickedCount: 22,
		ordersDeliveredCount: 20,
		totalEarnings: 680.25,
		isVerified: true,
	},
	{
		zone: "West Zone",
		vehicleType: "motorbike",
		vehicleNumber: "MB-005",
		workingHours: {
			start: "12:00",
			end: "24:00",
		},
		status: "on-break",
		ordersPickedCount: 5,
		ordersDeliveredCount: 5,
		totalEarnings: 175.0,
		isVerified: true,
	},
];

// Function to create sample riders
const createSampleRiders = async () => {
	try {
		console.log("🔄 Creating sample riders...");

		// Get all rider users from database
		const riderUsers = await User.find({ role: "rider", isActive: true });
		console.log(`👥 Found ${riderUsers.length} rider users in database`);

		if (riderUsers.length === 0) {
			console.error(
				"❌ No rider users found. Please create rider users first."
			);
			console.log(
				"💡 You can modify existing users to have 'rider' role or create new ones."
			);
			return;
		}

		// Check existing rider profiles
		const existingRiders = await Rider.find({ isActive: true });
		console.log(`🏍️  Found ${existingRiders.length} existing rider profiles`);

		let ridersCreated = 0;
		let ridersSkipped = 0;

		// Use available rider users
		const availableUsers = riderUsers.slice(0, sampleRiders.length);

		for (let i = 0; i < availableUsers.length && i < sampleRiders.length; i++) {
			try {
				const user = availableUsers[i];
				const riderData = sampleRiders[i];

				// Check if rider profile already exists for this user
				const existingRider = await Rider.findOne({ user: user._id });
				if (existingRider) {
					console.log(
						`⏭️  Rider profile already exists for ${user.name}, skipping...`
					);
					ridersSkipped++;
					continue;
				}

				// Create rider profile
				const newRider = new Rider({
					user: user._id,
					zone: riderData.zone,
					vehicleType: riderData.vehicleType,
					vehicleNumber: riderData.vehicleNumber,
					workingHours: riderData.workingHours,
					status: riderData.status,
					ordersPickedCount: riderData.ordersPickedCount || 0,
					ordersDeliveredCount: riderData.ordersDeliveredCount || 0,
					totalEarnings: riderData.totalEarnings || 0,
					isVerified: riderData.isVerified,
					rating: {
						average: Math.random() * 2 + 3, // Random rating between 3-5
						totalRatings: Math.floor(Math.random() * 50) + 10, // Random ratings count
					},
				});

				await newRider.save();
				ridersCreated++;

				console.log(
					`✅ Created rider profile for ${user.name} - Zone: ${riderData.zone}, Vehicle: ${riderData.vehicleType}`
				);
			} catch (error) {
				console.error(`❌ Error creating rider for user:`, error.message);
			}
		}

		console.log(`\n🎉 Rider creation completed!`);
		console.log(`   ✅ Created: ${ridersCreated} rider profiles`);
		console.log(`   ⏭️  Skipped: ${ridersSkipped} riders (already exist)`);

		// Display summary
		const totalRiders = await Rider.countDocuments({ isActive: true });
		console.log(`\n📊 Database Summary:`);
		console.log(`   Total Active Riders: ${totalRiders}`);

		// Show riders by status
		const statusStats = await Rider.aggregate([
			{ $match: { isActive: true } },
			{ $group: { _id: "$status", count: { $sum: 1 } } },
			{ $sort: { count: -1 } },
		]);

		console.log(`\n🚦 Riders by Status:`);
		statusStats.forEach((stat) => {
			console.log(`   ${stat._id}: ${stat.count} riders`);
		});

		// Show riders by zone
		const zoneStats = await Rider.aggregate([
			{ $match: { isActive: true } },
			{ $group: { _id: "$zone", count: { $sum: 1 } } },
			{ $sort: { count: -1 } },
		]);

		console.log(`\n🗺️  Riders by Zone:`);
		zoneStats.forEach((stat) => {
			console.log(`   ${stat._id}: ${stat.count} riders`);
		});
	} catch (error) {
		console.error("❌ Error creating sample riders:", error);
	}
};

// Function to test rider API functionality
const testRiderAPI = async () => {
	try {
		console.log("\n🧪 Testing Rider API functionality...");

		// Test 1: Get all riders with stats
		console.log("\n📊 Testing getRidersWithStats...");
		const ridersWithStats = await Rider.getRidersWithStats();
		console.log(
			`✅ Found ${ridersWithStats.length} riders with complete stats`
		);

		// Test 2: Find available riders in a zone
		console.log("\n🔍 Testing findAvailableInZone...");
		const availableInDowntown = await Rider.findAvailableInZone("Downtown");
		console.log(
			`✅ Found ${availableInDowntown.length} available riders in Downtown`
		);

		// Test 3: Test rider instance methods
		console.log("\n🧮 Testing rider instance methods...");
		const sampleRider = await Rider.findOne({ isActive: true });
		if (sampleRider) {
			console.log(
				`✅ Completion rate for rider: ${sampleRider.getCompletionRate()}%`
			);
			const summary = sampleRider.getSummary();
			console.log(`✅ Rider summary:`, {
				zone: summary.zone,
				status: summary.status,
				completionRate: summary.completionRate,
				rating: summary.rating,
			});
		}

		// Test 4: Location update simulation
		console.log("\n📍 Testing location update...");
		if (sampleRider) {
			sampleRider.currentLocation = {
				latitude: 40.7128,
				longitude: -74.006,
				lastUpdated: new Date(),
			};
			await sampleRider.save();
			console.log(`✅ Updated location for rider in ${sampleRider.zone}`);
		}
	} catch (error) {
		console.error("❌ Error testing rider API:", error);
	}
};

// Main execution
const main = async () => {
	console.log("🚀 Starting rider setup and testing...");
	console.log("=====================================");

	await connectDB();
	await createSampleRiders();
	await testRiderAPI();

	console.log("\n✅ Rider setup and testing completed!");
	console.log("🌐 You can now test the rider API endpoints:");
	console.log("   GET    /api/riders              - Get all riders");
	console.log("   GET    /api/riders/stats        - Get rider statistics");
	console.log("   GET    /api/riders/:id          - Get single rider");
	console.log("   POST   /api/riders              - Create rider profile");
	console.log("   PUT    /api/riders/:id          - Update rider profile");
	console.log("   PATCH  /api/riders/:id/status   - Update rider status");
	console.log(
		"   GET    /api/riders/available/:zone - Get available riders in zone"
	);

	mongoose.connection.close();
	process.exit(0);
};

// Handle errors
process.on("unhandledRejection", (err) => {
	console.error("❌ Unhandled Promise Rejection:", err);
	process.exit(1);
});

// Run the script
main().catch(console.error);
