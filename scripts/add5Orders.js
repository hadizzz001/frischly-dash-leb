const mongoose = require("mongoose");
require("dotenv").config();

// Import models
const Order = require("../src/models/Order");
const Product = require("../src/models/Product");
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

// Sample orders data
const sampleOrders = [
	{
		customer: {
			name: "John Smith",
			email: "john.smith@email.com",
			phone: "+1-555-0101",
			address: {
				street: "123 Main St",
				city: "New York",
				state: "NY",
				zipCode: "10001",
				country: "USA",
			},
		},
		items: [
			{ productName: "Apple", quantity: 5, unitPrice: 1.5 },
			{ productName: "Bread", quantity: 2, unitPrice: 2.99 },
		],
		tax: 1.25,
		discount: 0,
		paymentMethod: "card",
		notes: "Fresh produce order for family dinner",
	},
	{
		customer: {
			name: "Sarah Johnson",
			email: "sarah.johnson@email.com",
			phone: "+1-555-0102",
		},
		items: [
			{ productName: "Milk", quantity: 1, unitPrice: 3.99 },
			{ productName: "Eggs", quantity: 1, unitPrice: 4.5 },
			{ productName: "Cheese", quantity: 1, unitPrice: 5.99 },
		],
		tax: 1.15,
		discount: 2.0,
		paymentMethod: "cash",
		status: "confirmed",
		paymentStatus: "paid",
		notes: "Regular weekly order",
	},
	{
		customer: {
			name: "Mike Wilson",
			email: "mike.wilson@email.com",
			phone: "+1-555-0103",
		},
		items: [
			{ productName: "Chicken Breast", quantity: 2, unitPrice: 8.99 },
			{ productName: "Rice", quantity: 1, unitPrice: 3.5 },
		],
		tax: 1.0,
		discount: 0,
		paymentMethod: "online",
		status: "processing",
		paymentStatus: "paid",
		notes: "Meal prep ingredients",
	},
	{
		customer: {
			name: "Emily Davis",
			email: "emily.davis@email.com",
			phone: "+1-555-0104",
		},
		items: [
			{ productName: "Banana", quantity: 6, unitPrice: 0.79 },
			{ productName: "Orange Juice", quantity: 1, unitPrice: 4.99 },
			{ productName: "Yogurt", quantity: 3, unitPrice: 1.99 },
		],
		tax: 0.85,
		discount: 1.5,
		paymentMethod: "wallet",
		status: "shipped",
		paymentStatus: "paid",
		notes: "Healthy breakfast items",
	},
	{
		customer: {
			name: "Robert Brown",
			email: "robert.brown@email.com",
			phone: "+1-555-0105",
		},
		items: [
			{ productName: "Tomato", quantity: 4, unitPrice: 1.29 },
			{ productName: "Lettuce", quantity: 1, unitPrice: 2.49 },
			{ productName: "Cucumber", quantity: 2, unitPrice: 1.99 },
		],
		tax: 0.75,
		discount: 0,
		paymentMethod: "card",
		status: "delivered",
		paymentStatus: "paid",
		notes: "Fresh salad ingredients - delivered to office",
	},
];

// Function to find products by name (case insensitive)
const findProductByName = async (name) => {
	const product = await Product.findOne({
		name: { $regex: new RegExp(name, "i") },
		isActive: true,
	});
	return product;
};

// Function to create sample orders
const createSampleOrders = async () => {
	try {
		console.log("🔄 Creating sample orders...");

		// Get admin user to assign as creator
		const adminUser = await User.findOne({ role: "admin" });
		if (!adminUser) {
			console.error(
				"❌ No admin user found. Please create an admin user first."
			);
			return;
		}

		console.log(`👤 Using admin user: ${adminUser.name} (${adminUser.email})`);

		// Get existing customers from database
		const customers = await User.find({ role: "customer", isActive: true });
		console.log(`👥 Found ${customers.length} customers in database`);

		if (customers.length === 0) {
			console.error(
				"❌ No customers found. Please create customers first using: npm run add-customers"
			);
			return;
		}

		// Get available products
		const allProducts = await Product.find({ isActive: true });
		console.log(`📦 Found ${allProducts.length} active products`);

		if (allProducts.length === 0) {
			console.error("❌ No active products found. Please add products first.");
			return;
		}

		let ordersCreated = 0;
		const numberOfOrdersToCreate = Math.min(5, customers.length);

		// Shuffle customers and take first 5
		const shuffledCustomers = customers.sort(() => 0.5 - Math.random());
		const selectedCustomers = shuffledCustomers.slice(
			0,
			numberOfOrdersToCreate
		);

		for (let i = 0; i < numberOfOrdersToCreate; i++) {
			try {
				const customer = selectedCustomers[i];
				const orderTemplate = sampleOrders[i % sampleOrders.length];

				// Process order items - match products by name
				const processedItems = [];
				let itemsValid = true;

				for (const item of orderTemplate.items) {
					// Try to find exact match first, then partial match
					let product = await findProductByName(item.productName);

					// If no exact match, try to find similar product
					if (!product && allProducts.length > 0) {
						// Use a random product if we can't find a match
						const randomIndex = Math.floor(Math.random() * allProducts.length);
						product = allProducts[randomIndex];
						console.log(
							`⚠️  Product "${item.productName}" not found, using "${product.name}" instead`
						);
					}

					if (!product) {
						console.error(
							`❌ Could not find or substitute product: ${item.productName}`
						);
						itemsValid = false;
						break;
					}

					// Check stock
					if (product.stock < item.quantity) {
						console.log(
							`⚠️  Insufficient stock for ${product.name}. Available: ${
								product.stock
							}, adjusting quantity from ${item.quantity} to ${Math.min(
								item.quantity,
								product.stock
							)}`
						);
						item.quantity = Math.max(1, Math.min(item.quantity, product.stock));
					}

					const totalPrice = item.quantity * item.unitPrice;

					processedItems.push({
						product: product._id,
						productName: product.name,
						productBarcode: product.barcode,
						quantity: item.quantity,
						unitPrice: item.unitPrice,
						totalPrice: totalPrice,
					});
				}

				if (!itemsValid) {
					console.log(
						`⏭️  Skipping order for ${customer.name} due to product issues`
					);
					continue;
				}

				// Calculate totals
				const subtotal = processedItems.reduce(
					(sum, item) => sum + item.totalPrice,
					0
				);
				const total =
					subtotal + (orderTemplate.tax || 0) - (orderTemplate.discount || 0);

				// Create customer object for order (using real customer data)
				const customerData = {
					name: customer.name,
					email: customer.email,
					phone: customer.phoneNumber,
					address: customer.address,
				};

				// Create the order
				const newOrder = new Order({
					customer: customerData,
					customerId: customer._id, // Link to actual customer
					items: processedItems,
					tax: orderTemplate.tax || 0,
					discount: orderTemplate.discount || 0,
					status: orderTemplate.status || "pending",
					paymentStatus: orderTemplate.paymentStatus || "pending",
					paymentMethod: orderTemplate.paymentMethod || "cash",
					notes: orderTemplate.notes || `Order for ${customer.name}`,
					createdBy: adminUser._id,
				});

				// The pre-save middleware will calculate subtotal and total automatically

				await newOrder.save();

				// Update product stock
				for (const item of processedItems) {
					await Product.findByIdAndUpdate(item.product, {
						$inc: { stock: -item.quantity },
					});
				}

				ordersCreated++;
				console.log(
					`✅ Created order ${newOrder.orderNumber} for ${customer.name} (${
						customer.email
					}) - Total: $${total.toFixed(2)}`
				);
			} catch (error) {
				console.error(`❌ Error creating order for customer:`, error.message);
			}
		}

		console.log(`\n🎉 Successfully created ${ordersCreated} sample orders!`);

		// Display summary
		const totalOrders = await Order.countDocuments({ isActive: true });
		const totalRevenue = await Order.aggregate([
			{ $match: { isActive: true, paymentStatus: "paid" } },
			{ $group: { _id: null, total: { $sum: "$total" } } },
		]);

		console.log(`\n📊 Order Summary:`);
		console.log(`   Total Orders: ${totalOrders}`);
		console.log(
			`   Total Revenue: $${totalRevenue[0]?.total?.toFixed(2) || "0.00"}`
		);
	} catch (error) {
		console.error("❌ Error creating sample orders:", error);
	}
};

// Main execution
const main = async () => {
	console.log("🚀 Starting orders creation for existing customers...");
	console.log("====================================================");

	await connectDB();
	await createSampleOrders();

	console.log("\n✅ Orders creation completed!");
	console.log(
		"🌐 You can now view the orders in your dashboard at: http://localhost:3001/dashboard.html"
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
