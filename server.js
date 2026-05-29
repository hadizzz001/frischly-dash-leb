const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const cron = require("node-cron");
require("dotenv").config();

const connectDB = require("./src/config/database");
const initializeFirebase = require("./src/config/firebase");

// Route files
const authRoutes = require("./src/routes/auth");
const productRoutes = require("./src/routes/products");
const categoryRoutes = require("./src/routes/categories");
const orderRoutes = require("./src/routes/orders");
const riderRoutes = require("./src/routes/riders");
const zoneRoutes = require("./src/routes/zones");
const wasteRoutes = require("./src/routes/waste");
const subcategoryRoutes = require("./src/routes/subcategories");
const adminRoutes = require("./src/routes/admin");
const shelfRoutes = require("./src/routes/shelves");
const settingRoutes = require("./src/routes/settings");
const promoCodeRoutes = require("./src/routes/promoCodes");
const notificationRoutes = require("./src/routes/notifications");
const announcementRoutes = require("./src/routes/announcements");
const marketRoutes = require("./src/routes/markets");
const marketAdminRoutes = require("./src/routes/marketAdmin");
const kitchenRoutes = require("./src/routes/kitchens");
const backupRoutes = require("./src/routes/backup");

// Controllers
const { cancelOrder } = require("./src/controllers/orderController");

// Models
const Order = require("./src/models/Order");

// Connect to database
connectDB();

// Initialize Firebase
initializeFirebase();

// Cron job to count orders and cancel expired orders every end of day
cron.schedule("00 01 * * *", async () => {
	// try {
	// 	const orderCount = await Order.countDocuments({ isActive: true });
	// 	console.log(
	// 		`📊 Order count: ${orderCount} (checked at ${new Date().toISOString()})`
	// 	);
	// 	// Check and cancel orders that are more than one hour old
	// 	const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
	// 	const oldOrders = await Order.find({
	// 		isActive: true,
	// 		createdAt: { $lt: oneHourAgo },
	// 		status: { $nin: ["cancelled", "delivered", "OnTheWay"] }, // Don't cancel already cancelled, delivered, or on-the-way orders
	// 	});
	// 	if (oldOrders.length > 0) {
	// 		console.log(
	// 			`🚫 Found ${oldOrders.length} orders older than 1 day - cancelling...`
	// 		);
	// 		let cancelledCount = 0;
	// 		for (const order of oldOrders) {
	// 			try {
	// 				console.log(`   - Cancelling order ${order.orderNumber}...`);
	// 				// Create mock request and response objects for cancelOrder function
	// 				const mockReq = {
	// 					params: { id: order._id.toString() },
	// 					body: { reason: "expired" },
	// 					user: {
	// 						id: null, // System user
	// 						role: "admin", // System has admin privileges
	// 					},
	// 				};
	// 				let mockResStatus = 200;
	// 				let mockResData = null;
	// 				const mockRes = {
	// 					status: (code) => {
	// 						mockResStatus = code;
	// 						return mockRes;
	// 					},
	// 					json: (data) => {
	// 						mockResData = data;
	// 						return mockRes;
	// 					},
	// 				};
	// 				// Call the cancelOrder function
	// 				await cancelOrder(mockReq, mockRes);
	// 				if (mockResStatus === 200 && mockResData?.success) {
	// 					cancelledCount++;
	// 					console.log(
	// 						`   ✅ Order ${order.orderNumber} cancelled successfully`
	// 					);
	// 				} else {
	// 					console.error(
	// 						`   ❌ Failed to cancel order ${order.orderNumber}: ${
	// 							mockResData?.message || "Unknown error"
	// 						}`
	// 					);
	// 				}
	// 			} catch (orderError) {
	// 				console.error(
	// 					`   ❌ Error cancelling order ${order.orderNumber}:`,
	// 					orderError.message
	// 				);
	// 			}
	// 		}
	// 		console.log(
	// 			`🚫 Cancelled ${cancelledCount} orders older than 1 day (expired)`
	// 		);
	// 	} else {
	// 		console.log(`✅ All orders are within the last 24 hours`);
	// 	}
	// } catch (error) {
	// 	console.error("❌ Error in order monitoring:", error.message);
	// }
});

const app = express();

// Trust proxy - Required for Render deployment and rate limiting
app.set("trust proxy", 1);

// Security middleware - Configure CSP with conditional unsafe directives for development
const isDevelopment = process.env.NODE_ENV === "development";

app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: [
					"'self'",
					"'unsafe-inline'", // Allow inline scripts in both dev and production
					...(isDevelopment ? ["'unsafe-eval'"] : []),
					"https://cdn.jsdelivr.net",
					"https://cdnjs.cloudflare.com",
					"https://unpkg.com",
					// Add onrender.com domains
					"https://*.onrender.com",
					//"https://frischly-dash-leb.onrender.com",
					"https://frischly-dash-leb.onrender.com",
				],
				scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers in both dev and production
				styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
				imgSrc: ["'self'", "data:", "https:"],
				connectSrc: [
					"'self'",
					"http://localhost:*",
					"https://localhost:*",
					// Add production API URLs
					//"https://frischly-dash-leb.onrender.com",
					"https://frischly-dash-leb.onrender.com",
				], // Allow API calls
				fontSrc: [
					"'self'",
					"https://fonts.gstatic.com",
					"https://fonts.googleapis.com",
					"https://cdnjs.cloudflare.com",
				],
				frameSrc: [
					"'self'",
					"https://maps.google.com",
					"https://www.google.com",
				], // Allow Google Maps and Google domains
			},
		},
	}),
);

// CORS Configuration with Security
// Parse allowed origins from environment variable
const getAllowedOrigins = () => {
	const originsEnv =
		process.env.CLIENT_URL || process.env.ALLOWED_ORIGINS || "";

	// Split by comma and trim whitespace
	const origins = originsEnv
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

	// Add specific allowed origins
	const extraOrigins = [
		"https://frischly.onrender.com",
		"https://www.frischlyshop.com",
		"https://frischlyshop.com",
	];

	extraOrigins.forEach((origin) => {
		if (!origins.includes(origin)) {
			origins.push(origin);
		}
	});

	// Always allow localhost in development
	if (process.env.NODE_ENV === "development") {
		const devOrigins = [
			"http://localhost:3000",
			"http://localhost:3001",
			"http://localhost:5173", // Vite default
			"http://127.0.0.1:3000",
			"http://127.0.0.1:3001",
		];
		// Add dev origins if not already present
		devOrigins.forEach((devOrigin) => {
			if (!origins.includes(devOrigin)) {
				origins.push(devOrigin);
			}
		});
	}

	// Log allowed origins for debugging (only in development)
	if (process.env.NODE_ENV === "development") {
		console.log("🔒 CORS Allowed Origins:", origins);
	}

	return origins;
};

const allowedOrigins = getAllowedOrigins();

// CORS middleware with origin validation
app.use(
	cors({
		origin: function (origin, callback) {
			// Allow requests with no origin (like mobile apps, Postman, curl)
			if (!origin) {
				return callback(null, true);
			}

			// Check if origin is in allowed list
			if (allowedOrigins.length === 0) {
				// If no origins configured, warn and reject in production
				if (process.env.NODE_ENV === "production") {
					console.error(
						"❌ SECURITY WARNING: No CORS origins configured in production!",
					);
					return callback(new Error("CORS origin not allowed"), false);
				}
				// Allow in development but log warning
				console.warn("⚠️  WARNING: No CORS origins configured");
				return callback(null, true);
			}

			if (allowedOrigins.indexOf(origin) !== -1) {
				// Origin is allowed
				callback(null, true);
			} else {
				// Origin is not allowed
				console.warn(
					`⚠️  CORS blocked request from unauthorized origin: ${origin}`,
				);
				callback(new Error("CORS policy: Origin not allowed"), false);
			}
		},
		credentials: true, // Allow credentials (cookies, authorization headers)
		methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
		exposedHeaders: ["Content-Range", "X-Content-Range"],
		maxAge: 600, // Cache preflight requests for 10 minutes
	}),
);

// Rate limiting - Enabled in both development and production with different limits
const limiter = rateLimit({
	windowMs: isDevelopment ? 5 * 60 * 1000 : 20 * 60 * 1000, // 5 minutes in dev, 20 in prod
	max: isDevelopment ? 20000 : 3000, // very high in dev so dashboards don't get blocked
	message: {
		success: false,
		message: "Too many requests from this IP, please try again later.",
	},
	standardHeaders: true,
	legacyHeaders: false,
	// Don't count preflight or static asset requests against the limit
	skip: (req) => {
		if (req.method === "OPTIONS") return true;
		const url = req.originalUrl || req.url || "";
		if (!url.startsWith("/api")) return true;
		return false;
	},
});

app.use(limiter);

// Body parser - Reduced limits for security
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Data sanitization against NoSQL injection attacks
// This middleware removes any keys that start with $ or contain . from user input
// Prevents attacks like: { "$gt": "" } or { "user.password": "secret" }
app.use(
	mongoSanitize({
		replaceWith: "_", // Replace prohibited characters with underscore
		onSanitize: ({ req, key }) => {
			console.warn(`⚠️  NoSQL injection attempt detected and blocked: ${key}`);
		},
	}),
);

// Serve static files
app.use(express.static("public"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/riders", riderRoutes);
app.use("/api/zones", zoneRoutes);
app.use("/api/waste", wasteRoutes);
app.use("/api/subcategories", subcategoryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/shelves", shelfRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/promocodes", promoCodeRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/markets", marketRoutes);
app.use("/api/market-admin", marketAdminRoutes);
app.use("/api/kitchens", kitchenRoutes);
app.use("/api/backup", backupRoutes);

// Route for customer shop page
app.get("/shop", (req, res) => {
	res.sendFile(__dirname + "/public/shop.html");
	res.redirect("https://frischlyshop.com");
});

// Route for staff dashboard page
app.get("/ordermanagement", (req, res) => {
	res.sendFile(__dirname + "/public/ordermanagement.html");
});

// Route for rider dashboard page
app.get("/rider", (req, res) => {
	res.sendFile(__dirname + "/public/rider.html");
});

// Route for dashboard page
app.get("/dashboard", (req, res) => {
	res.sendFile(__dirname + "/public/dashboard.html");
});

// Route for signin page
app.get("/signin", (req, res) => {
	res.sendFile(__dirname + "/public/signin.html");
});

// Route for signup page
app.get("/signup", (req, res) => {
	res.sendFile(__dirname + "/public/signup.html");
});

// Route for profile page
app.get("/profile", (req, res) => {
	res.sendFile(__dirname + "/public/profile.html");
});

// Route for forgot password page
app.get("/forgot-password", (req, res) => {
	res.sendFile(__dirname + "/public/forgot-password.html");
});

// Route for reset password page
app.get("/reset-password", (req, res) => {
	res.sendFile(__dirname + "/public/reset-password.html");
});

// Route for payment success page
app.get("/payment/success", (req, res) => {
	res.sendFile(__dirname + "/public/payment/success-pod.html");
});

// Route for shop1 page - redirect to frischlyshop.com
app.get("/shop1", (req, res) => {
	res.redirect("https://frischlyshop.com");
});

// Route for market admin dashboard page (login)
app.get("/market", (req, res) => {
	res.sendFile(__dirname + "/public/market.html");
});

// Route for the full market-admin dashboard (after login)
app.get("/market-dashboard", (req, res) => {
	res.sendFile(__dirname + "/public/market-dashboard.html");
});

// Route for admin's markets management page
app.get("/markets", (req, res) => {
	res.sendFile(__dirname + "/public/markets.html");
});

// Admin: manage a single market (details + tabs)
app.get("/market-manage", (req, res) => {
	res.sendFile(__dirname + "/public/market-manage.html");
});

// Admin: view a market's products (read-only)
app.get("/market-products", (req, res) => {
	res.sendFile(__dirname + "/public/market-products.html");
});

// Admin: view a market's orders (read-only)
app.get("/market-orders", (req, res) => {
	res.sendFile(__dirname + "/public/market-orders.html");
});

// Health check route
app.get("/api/health", (req, res) => {
	res.json({
		success: true,
		message: "Server is running",
		timestamp: new Date().toISOString(),
	});
});

// 404 handler
app.use("*", (req, res) => {
	res.status(404).json({
		success: false,
		message: "Route not found",
	});
});

// Global error handler
app.use((err, req, res, next) => {
	console.error("Error:", err);

	// Mongoose validation error
	if (err.name === "ValidationError") {
		const errors = Object.values(err.errors).map((val) => val.message);
		return res.status(400).json({
			success: false,
			message: "Validation Error",
			errors,
		});
	}

	// Mongoose duplicate key error
	if (err.code === 11000) {
		const field = Object.keys(err.keyValue)[0];
		return res.status(400).json({
			success: false,
			message: `${field} already exists`,
		});
	}

	// JWT errors
	if (err.name === "JsonWebTokenError") {
		return res.status(401).json({
			success: false,
			message: "Invalid token",
		});
	}

	if (err.name === "TokenExpiredError") {
		return res.status(401).json({
			success: false,
			message: "Token expired",
		});
	}

	// Default server error
	res.status(err.statusCode || 500).json({
		success: false,
		message: err.message || "Server Error",
	});
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
	console.log(`🚀 FRISCHLY Server running on port ${PORT}`);
	console.log(`📍 Server URL: http://localhost:${PORT}`);
	console.log(`🌐 Dashboard: http://localhost:${PORT}/dashboard.html`);
	console.log(`🔐 Environment: ${process.env.NODE_ENV || "development"}`);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err, promise) => {
	console.log(`❌ Unhandled Promise Rejection: ${err.message}`);
	// Close server & exit process
	server.close(() => {
		process.exit(1);
	});
});

module.exports = app;
