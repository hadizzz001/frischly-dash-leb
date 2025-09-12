const mongoose = require("mongoose");
const User = require("../src/models/User");
require("dotenv").config();

// Connect to MongoDB
const connectDB = async () => {
	try {
		await mongoose.connect(process.env.MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
		console.log("MongoDB Connected for admin user creation");
	} catch (error) {
		console.error("Error connecting to MongoDB:", error.message);
		process.exit(1);
	}
};

// Create admin user
const createAdminUser = async () => {
	try {
		// Check if admin user already exists
		const existingAdmin = await User.findOne({ email: "admin@frischly.com" });

		if (existingAdmin) {
			console.log("Admin user already exists!");
			console.log("Email: admin@frischly.com");
			console.log("Role:", existingAdmin.role);
			return;
		}

		// Create admin user
		const adminUser = await User.create({
			name: "System Administrator",
			phoneNumber: "+1234567890",
			email: "admin@frischly.com",
			password: "Admin123!", // This will be hashed automatically
			role: "admin",
			address: {
				street: "123 Admin Street",
				city: "Admin City",
				state: "Admin State",
				zipCode: "12345",
				country: "USA",
			},
			isActive: true,
		});

		console.log("✅ Admin user created successfully!");
		console.log("📧 Email: admin@frischly.com");
		console.log("🔑 Password: Admin123!");
		console.log("👤 Role: admin");
		console.log("📝 Name:", adminUser.name);
		console.log("\n⚠️  Please change the password after first login!");
	} catch (error) {
		console.error("❌ Error creating admin user:", error.message);
	}
};

// Create manager user as well
const createManagerUser = async () => {
	try {
		// Check if manager user already exists
		const existingManager = await User.findOne({
			email: "manager@frischly.com",
		});

		if (existingManager) {
			console.log("Manager user already exists!");
			console.log("Email: manager@frischly.com");
			console.log("Role:", existingManager.role);
			return;
		}

		// Create manager user
		const managerUser = await User.create({
			name: "System Manager",
			phoneNumber: "+1234567891",
			email: "manager@frischly.com",
			password: "Manager123!", // This will be hashed automatically
			role: "manager",
			address: {
				street: "456 Manager Avenue",
				city: "Manager City",
				state: "Manager State",
				zipCode: "54321",
				country: "USA",
			},
			isActive: true,
		});

		console.log("✅ Manager user created successfully!");
		console.log("📧 Email: manager@frischly.com");
		console.log("🔑 Password: Manager123!");
		console.log("👤 Role: manager");
		console.log("📝 Name:", managerUser.name);
		console.log("\n⚠️  Please change the password after first login!");
	} catch (error) {
		console.error("❌ Error creating manager user:", error.message);
	}
};

// Main execution
const main = async () => {
	await connectDB();

	console.log("🚀 Creating default admin and manager users...\n");

	await createAdminUser();
	console.log("\n" + "=".repeat(50) + "\n");
	await createManagerUser();

	console.log("\n🎉 User creation process completed!");
	console.log("\nYou can now sign in with:");
	console.log("👤 Admin: admin@frischly.com / Admin123!");
	console.log("👤 Manager: manager@frischly.com / Manager123!");

	// Close database connection
	await mongoose.connection.close();
	console.log("\n📴 Database connection closed.");
	process.exit(0);
};

// Run the script
main().catch((error) => {
	console.error("❌ Script execution failed:", error);
	process.exit(1);
});
