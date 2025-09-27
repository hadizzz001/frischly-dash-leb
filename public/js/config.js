/**
 * Global API Configuration
 * Automatically detects environment and sets appropriate API base URL
 */

// Configuration object
const CONFIG = {
	// Environment detection
	isDevelopment:
		window.location.hostname === "localhost" ||
		window.location.hostname === "127.0.0.1",

	// API URLs
	API_URLS: {
		development: "http://localhost:3001/api",
		production: "https://frischly-server-v1.onrender.com/api",
		production_alt: "https://frischly-server.onrender.com/api", // Alternate production URL
	},

	// Get current API base URL based on environment
	getApiBaseUrl() {
		return this.isDevelopment
			? this.API_URLS.development
			: this.API_URLS.production;
	},

	// Manual override (for testing)
	forceEnvironment: null, // Set to 'development' or 'production' to override detection

	// Get API URL with manual override support
	getApiUrl() {
		if (this.forceEnvironment) {
			return this.API_URLS[this.forceEnvironment];
		}
		return this.getApiBaseUrl();
	},
};

// Global API_BASE_URL variable for backward compatibility
const API_BASE_URL = CONFIG.getApiUrl();

// Console info for debugging
console.log(
	`🌍 Environment: ${CONFIG.isDevelopment ? "Development" : "Production"}`
);
console.log(`🔗 API Base URL: ${API_BASE_URL}`);

// Export for modules (if needed)
if (typeof module !== "undefined" && module.exports) {
	module.exports = CONFIG;
}
