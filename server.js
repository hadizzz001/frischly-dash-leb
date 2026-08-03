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
const kitchenCategoryRoutes = require("./src/routes/kitchenCategories");
const backupRoutes = require("./src/routes/backup");
const translateRoutes = require("./src/routes/translate");
const scannerRoutes = require("./src/routes/scanner");
const feedbackRoutes = require("./src/routes/feedback");

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
					//"https://freshlylb.onrender.com",
					"https://freshlylb.onrender.com",
				],
				scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers in both dev and production
				styleSrc: [
					"'self'",
					"'unsafe-inline'",
					"https://cdnjs.cloudflare.com",
					"https://cdn.jsdelivr.net", // OpenLayers (ol.css) map picker stylesheet
				],
				imgSrc: [
					"'self'",
					"data:",
					"https:",
					"blob:", // OpenLayers renders map tiles onto canvas via blob URLs
				],
				connectSrc: [
					"'self'",
					"http://localhost:*",
					"https://localhost:*",
					// Add production API URLs
					//"https://freshlylb.onrender.com",
					"https://freshlylb.onrender.com",
					"https://cdn.jsdelivr.net", // OpenLayers library + its (optional) source maps
					"https://*.tile.openstreetmap.org", // OSM raster map tiles used by the delivery-region picker
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
				workerSrc: [
					"'self'",
					"blob:", // OpenLayers (webgl.js) spins up its renderer in a worker created from a blob: URL
				],
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

// Snapshot the body exactly as the client sent it, BEFORE any express-validator
// sanitizer rewrites it. Validation errors can then tell the user what *they*
// typed ("12") instead of the normalized value the sanitizer produced
// ("+96112"), which is confusing because they never entered it.
app.use((req, res, next) => {
	if (req.body && typeof req.body === "object") {
		try {
			req.rawBody = JSON.parse(JSON.stringify(req.body));
		} catch {
			req.rawBody = undefined;
		}
	}
	next();
});

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
// JS and CSS files get no-cache so a bug fix (e.g. to the delivery-region
// map picker, or a table image-size tweak) is guaranteed to reach every
// browser on next load instead of being silently served from a stale disk
// cache, which previously made fixed client-side validation/style bugs
// appear to still be happening (e.g. product thumbnails staying large
// after the CSS was already fixed on the server, because the browser
// never re-requested the unchanged-looking .css file).
app.use(
	express.static("public", {
		setHeaders: (res, filePath) => {
			if (filePath.endsWith(".js") || filePath.endsWith(".css")) {
				res.setHeader("Cache-Control", "no-cache, must-revalidate");
			}
		},
	}),
);

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
app.use("/api/kitchen-categories", kitchenCategoryRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/translate", translateRoutes);
app.use("/api/scanner", scannerRoutes);
app.use("/api/feedback", feedbackRoutes);

// True when the request was made against a local development host. Used so
// local development never bounces the developer out to the live public site.
const isLocalRequest = (req) => {
	const host = (req.hostname || "").toLowerCase();
	return (
		host === "localhost" ||
		host === "127.0.0.1" ||
		host === "::1" ||
		host === "0.0.0.0" ||
		host.endsWith(".localhost") ||
		// LAN addresses used when testing from a phone on the same network
		/^192\.168\./.test(host) ||
		/^10\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host)
	);
};

// Route for customer shop page.
// On localhost we serve the bundled shop.html so the local build is testable;
// anywhere else we send shoppers to the public storefront.
// (Previously this called sendFile() AND redirect(), which threw
// ERR_HTTP_HEADERS_SENT because only the first response can win.)
app.get("/shop", (req, res) => {
	if (isLocalRequest(req)) {
		return res.sendFile(__dirname + "/public/shop.html");
	}
	return res.redirect("https://frischlyshop.com");
});

// Route for staff dashboard page
app.get("/ordermanagement", (req, res) => {
	res.sendFile(__dirname + "/public/ordermanagement.html");
});

// The Rider Dashboard page was removed — its features (live location,
// deliveries) now live on the Profile page, so redirect old links there.
app.get("/rider", (req, res) => {
	res.redirect("/profile");
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

// Route for shop1 page - redirect to frischlyshop.com (kept local on localhost)
app.get("/shop1", (req, res) => {
	if (isLocalRequest(req)) {
		return res.sendFile(__dirname + "/public/shop1.html");
	}
	return res.redirect("https://frischlyshop.com");
});

// There is now a SINGLE sign-in page for every role. The old market-only
// login screen (/market) is retired: /api/auth/login-profile already
// authenticates market accounts (it falls back to the Market collection by
// username/email), so the shared page at /signin handles markets too and
// then routes each role to its own dashboard.
// Kept as a redirect so existing links, bookmarks and old QR codes still work.
app.get("/market", (req, res) => {
	res.redirect(301, "/signin");
});

// Route for the full market-admin dashboard (after login)
app.get("/market-dashboard", (req, res) => {
	// Never let a browser cache this page — this dashboard has been edited
	// repeatedly and a stale cached copy previously made fixed bugs appear
	// to still be happening for some users.
	res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
	res.sendFile(__dirname + "/public/market-dashboard.html");
});

// Standalone delivery-coverage-regions map page for a market owner's own
// Profile — literally the same createMultiPinPicker component/behavior as
// the main admin's Markets Management page, embedded via iframe from the
// market dashboard's Profile tab so both surfaces always share identical,
// single-source-of-truth code (instead of two independently-maintained
// clones that can drift out of sync).
app.get("/market-profile-map", (req, res) => {
	res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
	res.sendFile(__dirname + "/public/market-profile-map.html");
});

// Standalone delivery-coverage-regions map page for the main (Freshly) admin's
// own Profile — same createMultiPinPicker component as the market owner's
// page above, just backed by /api/admin/settings instead of
// /api/market-admin/profile.
app.get("/admin-profile-map", (req, res) => {
	res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
	res.sendFile(__dirname + "/public/admin-profile-map.html");
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
