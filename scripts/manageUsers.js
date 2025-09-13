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
		console.log("MongoDB Connected for user management");
	} catch (error) {
		console.error("Error connecting to MongoDB:", error.message);
		process.exit(1);
	}
};

// List all users
const listUsers = async () => {
	try {
		const users = await User.find(
			{},
			"name email role isActive createdAt"
		).sort({ createdAt: -1 });

		console.log("📋 All Users in System:");
		console.log("=".repeat(80));

		if (users.length === 0) {
			console.log("No users found in the system.");
			return;
		}

		users.forEach((user, index) => {
			console.log(`${index + 1}. ${user.name}`);
			console.log(`   📧 Email: ${user.email}`);
			console.log(`   👤 Role: ${user.role.toUpperCase()}`);
			console.log(`   🟢 Status: ${user.isActive ? "Active" : "Inactive"}`);
			console.log(`   📅 Created: ${user.createdAt.toLocaleDateString()}`);
			console.log("-".repeat(40));
		});

		console.log(`\n📊 Total Users: ${users.length}`);

		// Count by role
		const roleCounts = users.reduce((acc, user) => {
			acc[user.role] = (acc[user.role] || 0) + 1;
			return acc;
		}, {});

		console.log("📈 Users by Role:");
		Object.entries(roleCounts).forEach(([role, count]) => {
			console.log(`   ${role.toUpperCase()}: ${count}`);
		});
	} catch (error) {
		console.error("❌ Error listing users:", error.message);
	}
};

// Update user role
const updateUserRole = async (email, newRole) => {
	try {
		const validRoles = ["manager", "admin"];

		if (!validRoles.includes(newRole)) {
			throw new Error(
				`Invalid role. Valid roles are: ${validRoles.join(", ")}`
			);
		}

		const user = await User.findOne({ email });

		if (!user) {
			throw new Error("User not found with that email");
		}

		const oldRole = user.role;
		user.role = newRole;
		await user.save();

		console.log("✅ User role updated successfully!");
		console.log(`👤 User: ${user.name} (${user.email})`);
		console.log(
			`🔄 Role changed from: ${oldRole.toUpperCase()} → ${newRole.toUpperCase()}`
		);
	} catch (error) {
		console.error("❌ Error updating user role:", error.message);
	}
};

// Delete user
const deleteUser = async (email) => {
	try {
		const user = await User.findOne({ email });

		if (!user) {
			throw new Error("User not found with that email");
		}

		await User.deleteOne({ email });

		console.log("✅ User deleted successfully!");
		console.log(`👤 Deleted: ${user.name} (${user.email})`);
		console.log(`👤 Role: ${user.role.toUpperCase()}`);
	} catch (error) {
		console.error("❌ Error deleting user:", error.message);
	}
};

// Main execution
const main = async () => {
	await connectDB();

	const args = process.argv.slice(2);
	const command = args[0];

	switch (command) {
		case "list":
			await listUsers();
			break;

		case "update-role":
			if (args.length < 3) {
				console.log(
					"Usage: npm run manage-users update-role <email> <new-role>"
				);
				console.log("Valid roles: rider, user, manager, admin");
				break;
			}
			await updateUserRole(args[1], args[2]);
			break;

		case "delete":
			if (args.length < 2) {
				console.log("Usage: npm run manage-users delete <email>");
				break;
			}
			await deleteUser(args[1]);
			break;

		default:
			console.log("🔧 User Management Script");
			console.log("Available commands:");
			console.log("  list                           - List all users");
			console.log("  update-role <email> <role>     - Update user role");
			console.log("  delete <email>                 - Delete user");
			console.log("\nExamples:");
			console.log("  npm run manage-users list");
			console.log("  npm run manage-users update-role user@example.com admin");
			console.log("  npm run manage-users delete user@example.com");
			break;
	}

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
