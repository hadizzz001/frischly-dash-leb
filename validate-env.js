// Environment Variable Validation Script
// Run this to ensure all required environment variables are set
// Usage: node validate-env.js

const fs = require("fs");
const path = require("path");

console.log("🔍 Validating Environment Variables...\n");

// Define required environment variables
const requiredVars = {
	critical: [
		"MONGODB_URI",
		"JWT_SECRET",
		"JWT_REFRESH_SECRET",
		"CLOUDINARY_CLOUD_NAME",
		"CLOUDINARY_API_KEY",
		"CLOUDINARY_API_SECRET",
		"PORTAL_KEY",
		"MERCHANT_ID",
		"PORTAL_ID",
		"ACCOUNT_ID",
	],
	important: [
		"NODE_ENV",
		"PORT",
		"CLIENT_URL",
		"FRONTEND_URL",
		"BACKEND_URL",
		"EMAIL_USER",
		"EMAIL_PASS",
	],
	optional: [
		"IMAGEKIT_PUBLIC_KEY",
		"IMAGEKIT_PRIVATE_KEY",
		"IMAGEKIT_URL_ENDPOINT",
		"EMAIL_SERVICE",
		"EMAIL_HOST",
		"EMAIL_PORT",
		"PAYONE_API_BASE_URL",
	],
};

// Load .env file
require("dotenv").config();

let hasErrors = false;
let hasWarnings = false;

// Check critical variables
console.log("🔴 CRITICAL Variables (Required):");
requiredVars.critical.forEach((varName) => {
	const value = process.env[varName];
	if (!value) {
		console.log(`   ❌ ${varName} - MISSING`);
		hasErrors = true;
	} else if (
		value.includes("your_") ||
		value.includes("placeholder") ||
		value.length < 10
	) {
		console.log(`   ⚠️  ${varName} - Set but looks like placeholder value`);
		hasWarnings = true;
	} else {
		console.log(`   ✅ ${varName} - OK`);
	}
});

console.log("\n🟡 IMPORTANT Variables (Highly Recommended):");
requiredVars.important.forEach((varName) => {
	const value = process.env[varName];
	if (!value) {
		console.log(`   ⚠️  ${varName} - MISSING`);
		hasWarnings = true;
	} else if (value.includes("your_") || value.includes("placeholder")) {
		console.log(`   ⚠️  ${varName} - Set but looks like placeholder value`);
		hasWarnings = true;
	} else {
		console.log(`   ✅ ${varName} - OK`);
	}
});

console.log("\n🟢 OPTIONAL Variables:");
requiredVars.optional.forEach((varName) => {
	const value = process.env[varName];
	if (!value) {
		console.log(`   ℹ️  ${varName} - Not set (optional)`);
	} else {
		console.log(`   ✅ ${varName} - OK`);
	}
});

// Security checks
console.log("\n🔒 Security Checks:");

// Check JWT secret length
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
	console.log(
		"   ⚠️  JWT_SECRET is too short (minimum 32 characters recommended)"
	);
	hasWarnings = true;
} else if (process.env.JWT_SECRET) {
	console.log("   ✅ JWT_SECRET length is adequate");
}

// Check if JWT secrets are different
if (process.env.JWT_SECRET && process.env.JWT_REFRESH_SECRET) {
	if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
		console.log("   ⚠️  JWT_SECRET and JWT_REFRESH_SECRET should be different");
		hasWarnings = true;
	} else {
		console.log("   ✅ JWT secrets are different");
	}
}

// Check NODE_ENV
if (
	process.env.NODE_ENV !== "production" &&
	process.env.NODE_ENV !== "development"
) {
	console.log('   ⚠️  NODE_ENV should be either "production" or "development"');
	hasWarnings = true;
} else {
	console.log(`   ✅ NODE_ENV is set to "${process.env.NODE_ENV}"`);
}

// Check CORS configuration
const corsOrigins = process.env.CLIENT_URL || process.env.ALLOWED_ORIGINS || '';
if (corsOrigins === "*") {
	console.log(
		'   ❌ CLIENT_URL is set to "*" (wildcard) - CRITICAL SECURITY RISK!'
	);
	if (process.env.NODE_ENV === 'production') {
		console.log('   🚨 This MUST be fixed before production deployment!');
		hasErrors = true;
	} else {
		hasWarnings = true;
	}
} else if (!corsOrigins) {
	console.log('   ⚠️  CLIENT_URL not set - CORS origins not configured');
	if (process.env.NODE_ENV === 'production') {
		console.log('   🚨 Configure allowed origins for production!');
		hasErrors = true;
	} else {
		console.log('   ℹ️  Development will allow localhost by default');
	}
} else if (corsOrigins) {
	const origins = corsOrigins.split(',').map(o => o.trim()).filter(Boolean);
	console.log(`   ✅ CLIENT_URL configured with ${origins.length} allowed origin(s)`);
	
	// Check for potential issues
	const hasWildcard = origins.some(o => o.includes('*'));
	if (hasWildcard) {
		console.log('   ⚠️  WARNING: Wildcard (*) detected in origins - be cautious!');
		hasWarnings = true;
	}
	
	// Warn about http in production
	if (process.env.NODE_ENV === 'production') {
		const hasHttp = origins.some(o => o.startsWith('http://') && !o.includes('localhost'));
		if (hasHttp) {
			console.log('   ⚠️  WARNING: Non-localhost HTTP origins in production - use HTTPS!');
			hasWarnings = true;
		}
	}
}

// Final summary
console.log("\n" + "=".repeat(60));
if (hasErrors) {
	console.log(
		"❌ VALIDATION FAILED - Critical environment variables are missing!"
	);
	console.log(
		"   Please copy .env.example to .env and fill in all required values."
	);
	process.exit(1);
} else if (hasWarnings) {
	console.log("⚠️  VALIDATION PASSED WITH WARNINGS");
	console.log("   Some variables need attention before production deployment.");
	process.exit(0);
} else {
	console.log("✅ ALL VALIDATIONS PASSED");
	console.log("   Environment is properly configured.");
	process.exit(0);
}
