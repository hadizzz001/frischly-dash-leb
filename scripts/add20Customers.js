const mongoose = require("mongoose");
require("dotenv").config();

// Import models
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

// Sample customer data
const sampleCustomers = [
	{
		name: "Alice Johnson",
		email: "alice.johnson@email.com",
		password: "customer123",
		phoneNumber: "+15551001",
		address: {
			street: "123 Oak Street",
			city: "Springfield",
			state: "IL",
			zipCode: "62701",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Bob Smith",
		email: "bob.smith@email.com",
		password: "customer123",
		phoneNumber: "+15551002",
		address: {
			street: "456 Pine Avenue",
			city: "Chicago",
			state: "IL",
			zipCode: "60601",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Carol Davis",
		email: "carol.davis@email.com",
		password: "customer123",
		phoneNumber: "+15551003",
		address: {
			street: "789 Maple Drive",
			city: "Aurora",
			state: "IL",
			zipCode: "60502",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "David Wilson",
		email: "david.wilson@email.com",
		password: "customer123",
		phoneNumber: "+15551004",
		address: {
			street: "321 Elm Street",
			city: "Rockford",
			state: "IL",
			zipCode: "61101",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Emma Brown",
		email: "emma.brown@email.com",
		password: "customer123",
		phoneNumber: "+15551005",
		address: {
			street: "654 Cedar Lane",
			city: "Peoria",
			state: "IL",
			zipCode: "61601",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Frank Miller",
		email: "frank.miller@email.com",
		password: "customer123",
		phoneNumber: "+15551006",
		address: {
			street: "987 Birch Road",
			city: "Joliet",
			state: "IL",
			zipCode: "60431",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Grace Taylor",
		email: "grace.taylor@email.com",
		password: "customer123",
		phoneNumber: "+15551007",
		address: {
			street: "147 Walnut Circle",
			city: "Naperville",
			state: "IL",
			zipCode: "60540",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Henry Anderson",
		email: "henry.anderson@email.com",
		password: "customer123",
		phoneNumber: "+15551008",
		address: {
			street: "258 Cherry Boulevard",
			city: "Elgin",
			state: "IL",
			zipCode: "60120",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Iris Martinez",
		email: "iris.martinez@email.com",
		password: "customer123",
		phoneNumber: "+15551009",
		address: {
			street: "369 Poplar Street",
			city: "Waukegan",
			state: "IL",
			zipCode: "60085",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Jack Thompson",
		email: "jack.thompson@email.com",
		password: "customer123",
		phoneNumber: "+15551010",
		address: {
			street: "741 Ash Avenue",
			city: "Schaumburg",
			state: "IL",
			zipCode: "60173",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Katherine Lee",
		email: "katherine.lee@email.com",
		password: "customer123",
		phoneNumber: "+15551011",
		address: {
			street: "852 Willow Way",
			city: "Evanston",
			state: "IL",
			zipCode: "60201",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Liam Garcia",
		email: "liam.garcia@email.com",
		password: "customer123",
		phoneNumber: "+15551012",
		address: {
			street: "963 Spruce Court",
			city: "Cicero",
			state: "IL",
			zipCode: "60804",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Mia Rodriguez",
		email: "mia.rodriguez@email.com",
		password: "customer123",
		phoneNumber: "+15551013",
		address: {
			street: "159 Hickory Drive",
			city: "Des Plaines",
			state: "IL",
			zipCode: "60016",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Noah White",
		email: "noah.white@email.com",
		password: "customer123",
		phoneNumber: "+15551014",
		address: {
			street: "357 Sycamore Lane",
			city: "Mount Prospect",
			state: "IL",
			zipCode: "60056",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Olivia Harris",
		email: "olivia.harris@email.com",
		password: "customer123",
		phoneNumber: "+15551015",
		address: {
			street: "468 Magnolia Street",
			city: "Arlington Heights",
			state: "IL",
			zipCode: "60004",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Peter Clark",
		email: "peter.clark@email.com",
		password: "customer123",
		phoneNumber: "+15551016",
		address: {
			street: "579 Dogwood Avenue",
			city: "Palatine",
			state: "IL",
			zipCode: "60067",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Quinn Lewis",
		email: "quinn.lewis@email.com",
		password: "customer123",
		phoneNumber: "+15551017",
		address: {
			street: "681 Redwood Circle",
			city: "Hoffman Estates",
			state: "IL",
			zipCode: "60169",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Rachel Walker",
		email: "rachel.walker@email.com",
		password: "customer123",
		phoneNumber: "+15551018",
		address: {
			street: "792 Cypress Road",
			city: "Streamwood",
			state: "IL",
			zipCode: "60107",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Samuel Hall",
		email: "samuel.hall@email.com",
		password: "customer123",
		phoneNumber: "+15551019",
		address: {
			street: "803 Juniper Boulevard",
			city: "Bartlett",
			state: "IL",
			zipCode: "60103",
			country: "USA",
		},
		role: "customer",
	},
	{
		name: "Tiffany Young",
		email: "tiffany.young@email.com",
		password: "customer123",
		phoneNumber: "+15551020",
		address: {
			street: "914 Fir Street",
			city: "Hanover Park",
			state: "IL",
			zipCode: "60133",
			country: "USA",
		},
		role: "customer",
	},
];

// Function to create sample customers
const createSampleCustomers = async () => {
	try {
		console.log("🔄 Creating sample customers...");

		// Check current customer count
		const currentCustomers = await User.countDocuments({ role: "customer" });
		console.log(`👥 Current customers in database: ${currentCustomers}`);

		let customersCreated = 0;
		let customersSkipped = 0;

		for (const customerData of sampleCustomers) {
			try {
				// Check if customer already exists
				const existingCustomer = await User.findOne({
					email: customerData.email,
				});

				if (existingCustomer) {
					console.log(
						`⏭️  Customer ${customerData.email} already exists, skipping...`
					);
					customersSkipped++;
					continue;
				}

				// Create new customer
				const newCustomer = new User({
					name: customerData.name,
					email: customerData.email,
					password: customerData.password, // Will be hashed by pre-save middleware
					phoneNumber: customerData.phoneNumber,
					address: customerData.address,
					role: customerData.role,
					isActive: true,
				});

				await newCustomer.save();
				customersCreated++;

				console.log(
					`✅ Created customer: ${customerData.name} (${customerData.email})`
				);
			} catch (error) {
				console.error(
					`❌ Error creating customer ${customerData.name}:`,
					error.message
				);
			}
		}

		console.log(`\n🎉 Customer creation completed!`);
		console.log(`   ✅ Created: ${customersCreated} customers`);
		console.log(
			`   ⏭️  Skipped: ${customersSkipped} customers (already exist)`
		);

		// Display summary
		const totalCustomers = await User.countDocuments({ role: "customer" });
		const totalUsers = await User.countDocuments();

		console.log(`\n📊 Database Summary:`);
		console.log(`   Total Customers: ${totalCustomers}`);
		console.log(`   Total Users: ${totalUsers}`);

		// Show user breakdown by role
		const roleStats = await User.aggregate([
			{ $group: { _id: "$role", count: { $sum: 1 } } },
			{ $sort: { count: -1 } },
		]);

		console.log(`\n👥 Users by Role:`);
		roleStats.forEach((stat) => {
			console.log(`   ${stat._id}: ${stat.count} users`);
		});
	} catch (error) {
		console.error("❌ Error creating sample customers:", error);
	}
};

// Main execution
const main = async () => {
	console.log("🚀 Starting customer creation...");
	console.log("==================================");

	await connectDB();
	await createSampleCustomers();

	console.log("\n✅ Customer creation process completed!");
	console.log(
		"🌐 You can now view the customers in your dashboard at: http://localhost:3001/dashboard.html"
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
