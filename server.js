const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const connectDB = require("./src/config/database");

// Route files
const authRoutes = require("./src/routes/auth");
const productRoutes = require("./src/routes/products");
const categoryRoutes = require("./src/routes/categories");

// Connect to database
connectDB();

const app = express();

// Security middleware - Configure CSP to allow inline scripts for development
app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", "'unsafe-inline'"],
				scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", "data:", "https:"],
			},
		},
	})
);

// CORS
app.use(
	cors({
		origin: [
			process.env.CLIENT_URL || "http://localhost:3000",
			"http://localhost:3001", // Allow same origin for the HTML page
		],
		credentials: true,
	})
);

// Rate limiting
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // limit each IP to 100 requests per windowMs
	message: {
		success: false,
		message: "Too many requests from this IP, please try again later.",
	},
});
app.use(limiter);

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static("public"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);

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
