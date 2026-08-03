/**
 * Global API Configuration
 * Automatically detects environment and sets appropriate API base URL
 */

// Configuration object
const CONFIG = {
	// Environment detection. Also treats private LAN addresses as development
	// so testing from a phone on the same network stays on the local server.
	isDevelopment: (function () {
		const host = window.location.hostname.toLowerCase();
		return (
			host === "localhost" ||
			host === "127.0.0.1" ||
			host === "::1" ||
			host === "" ||
			host.endsWith(".localhost") ||
			/^192\.168\./.test(host) ||
			/^10\./.test(host) ||
			/^172\.(1[6-9]|2\d|3[01])\./.test(host)
		);
	})(),

	// API URLs
	API_URLS: {
		development: "http://localhost:10000/api",
		production: "https://freshlylb.onrender.com/api",
	},

	// Get current API base URL based on environment
	getApiBaseUrl() {
		if (this.isDevelopment) {
			return this.API_URLS.development;
		} else {
			return this.API_URLS.production;
		}
	},

	// Storefront (shop) URLs. On localhost we stay on the local server so
	// development never bounces out to the live public site.
	SHOP_URLS: {
		development: "/shop",
		production: "https://frischlyshop.com",
	},

	// Get the storefront URL appropriate for the current environment.
	getShopUrl() {
		const env = this.forceEnvironment || (this.isDevelopment ? "development" : "production");
		return this.SHOP_URLS[env];
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

// Global storefront URL — "/shop" locally, the public site in production.
const SHOP_URL = CONFIG.getShopUrl();

/**
 * The product-table page a given role is actually allowed to open.
 *
 * Both dashboards open on their Products section by default, so these land
 * the user directly on the product table.
 *
 * This must stay in sync with the role gates on the destination pages,
 * otherwise the destination bounces the user back and you get a redirect
 * loop (market users previously went to /market-products, which is
 * admin-only, which forwarded to /dashboard, which rejected "market" and
 * sent them to signin, which sent them back again).
 */
function getProductPageForRole(role) {
	switch (role) {
		// Market-side roles use the market dashboard.
		case "market":
		case "market_manager":
		case "market_staff":
		case "market_driver":
			return "/market-dashboard";

		// Freshly admin-side roles use the main dashboard.
		case "admin":
		case "manager":
		case "staff":
		case "rider":
			return "/dashboard";

		// Customers (and anything unrecognised) have no dashboard access.
		default:
			return "/profile";
	}
}

/**
 * Turn an API error payload into a message that names the EXACT field(s)
 * that failed, instead of the vague one-liner we used to show.
 *
 * The backend already returns:
 *   { success:false, message:"...", errors:[{field,message,received,location}] }
 * but every page was reading only `.message`, so the user never saw which
 * input was wrong or what value the server actually received.
 *
 * @param {object} payload parsed JSON body of a failed response
 * @param {string} [fallback] used when the payload carries nothing useful
 * @returns {string}
 */
function formatApiError(payload, fallback = "Unknown error occurred") {
	if (!payload || typeof payload !== "object") return fallback;

	const list = Array.isArray(payload.errors)
		? payload.errors
		: Array.isArray(payload.data && payload.data.errors)
		? payload.data.errors
		: [];

	const details = list
		.map((e) => {
			if (typeof e === "string") return e;
			if (!e || typeof e !== "object") return "";
			// express-validator uses msg/path/param; our helper uses message/field.
			const field = e.field || e.path || e.param || "";
			const msg = e.message || e.msg || "";
			if (!field && !msg) return "";
			const got =
				e.received === undefined || e.received === null || e.received === ""
					? ""
					: ` (you entered: "${e.received}")`;
			return field ? `• ${field}: ${msg}${got}` : `• ${msg}${got}`;
		})
		.filter(Boolean);

	if (details.length) {
		// Strip the redundant "Validation failed: field: msg | ..." prefix so the
		// detail list isn't shown twice.
		const headline = String(payload.message || "").split(":")[0] || "Validation failed";
		return `${headline}:\n${details.join("\n")}`;
	}

	return payload.message || fallback;
}

/**
 * Extract a list of rows from an API payload, whatever shape it arrives in.
 *
 * The API is NOT uniform:
 *   - hand-written controllers return  { data: { subcategories: [...] } }
 *   - the crud() factory returns       { data: { items: [...], meta } }
 *   - a few endpoints return           { data: [...] }
 *   - some legacy ones return          [...]
 *
 * This helper was being CALLED in both dashboards but was never defined
 * anywhere, so every caller threw a ReferenceError that the surrounding
 * try/catch swallowed — the table then rendered as "no data" even though the
 * request had succeeded and the rows were sitting right there in the payload.
 *
 * @param {*} payload parsed JSON body
 * @param {string} [key] preferred named key, e.g. "subcategories"
 * @returns {Array} always an array (empty when nothing matches)
 */
function listFrom(payload, key) {
	if (!payload) return [];
	if (Array.isArray(payload)) return payload;

	// Preferred key at the top level or nested under data.
	if (key) {
		if (Array.isArray(payload[key])) return payload[key];
		if (payload.data && Array.isArray(payload.data[key])) return payload.data[key];
	}

	const data = payload.data;
	if (Array.isArray(data)) return data;
	if (Array.isArray(payload.items)) return payload.items;

	if (data && typeof data === "object") {
		if (Array.isArray(data.items)) return data.items;
		// Last resort: any array-valued property (covers renamed keys).
		for (const k of Object.keys(data)) {
			if (Array.isArray(data[k])) return data[k];
		}
	}

	return [];
}

/**
 * Extract a SINGLE record from an API payload, whatever shape it arrives in.
 *
 * Companion to listFrom(). Most detail endpoints wrap the record under a named
 * key — GET /orders/:id returns { data: { order: {...} } } — but several pages
 * passed `result.data` (the wrapper) straight into their render function. The
 * renderer then read `order.customer.name` on the wrapper and threw
 * "Cannot read properties of undefined (reading 'name')".
 *
 * Handles:
 *   { data: { order: {...} } }   named key   (most detail endpoints)
 *   { data: {...} }              bare object (a few endpoints)
 *   { order: {...} }             key at top level
 *   {...}                        already unwrapped
 *
 * @param {*} payload parsed JSON body
 * @param {string} [key] preferred key, e.g. "order"
 * @returns {object|null} the record, or null when nothing usable is present
 */
function objectFrom(payload, key) {
	if (!payload || typeof payload !== "object") return null;
	if (Array.isArray(payload)) return payload[0] || null;

	const isRecord = (v) => v && typeof v === "object" && !Array.isArray(v);

	// Preferred key, at the top level or nested under data.
	if (key) {
		if (isRecord(payload[key])) return payload[key];
		if (isRecord(payload.data) && isRecord(payload.data[key])) return payload.data[key];
	}

	const data = payload.data;
	if (isRecord(data)) {
		// A wrapper is an envelope holding exactly one record, e.g. { order: {...} }.
		const keys = Object.keys(data);
		if (keys.length === 1 && isRecord(data[keys[0]]) && !("_id" in data)) {
			return data[keys[0]];
		}
		return data;
	}

	// Already unwrapped (has its own identity fields).
	if ("_id" in payload || "id" in payload) return payload;

	return null;
}

// Console info for debugging
console.log(
	`🌍 Environment: ${
		CONFIG.isDevelopment
			? "Development"
			: CONFIG.isProduction
			? "Production"
			: "Production"
	}`
);
console.log(`🔗 API Base URL: ${API_BASE_URL}`);

// Export for modules (if needed)
if (typeof module !== "undefined" && module.exports) {
	module.exports = CONFIG;
}
