// Input Validation and Sanitization Utilities
// Additional security layer for user input validation

/**
 * Sanitize object by removing potentially dangerous MongoDB operators
 * and deep nested objects that could be used for injection
 * @param {Object} obj - Object to sanitize
 * @param {Number} maxDepth - Maximum allowed nesting depth (default: 3)
 * @returns {Object} Sanitized object
 */
const sanitizeObject = (obj, maxDepth = 3, currentDepth = 0) => {
	if (currentDepth > maxDepth) {
		console.warn("⚠️  Object nesting too deep, truncating");
		return null;
	}

	if (typeof obj !== "object" || obj === null) {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => sanitizeObject(item, maxDepth, currentDepth + 1));
	}

	const sanitized = {};
	for (const [key, value] of Object.entries(obj)) {
		// Skip keys that start with $ (MongoDB operators)
		if (key.startsWith("$")) {
			console.warn(`⚠️  Blocked MongoDB operator in key: ${key}`);
			continue;
		}

		// Skip keys with dots (can be used for prototype pollution)
		if (key.includes(".")) {
			console.warn(`⚠️  Blocked key with dot notation: ${key}`);
			continue;
		}

		// Skip __proto__, constructor, prototype
		if (["__proto__", "constructor", "prototype"].includes(key)) {
			console.warn(`⚠️  Blocked dangerous property: ${key}`);
			continue;
		}

		// Recursively sanitize nested objects
		if (typeof value === "object" && value !== null) {
			sanitized[key] = sanitizeObject(value, maxDepth, currentDepth + 1);
		} else {
			sanitized[key] = value;
		}
	}

	return sanitized;
};

/**
 * Validate and sanitize MongoDB ObjectId
 * @param {String} id - ID to validate
 * @returns {Boolean} Whether ID is valid
 */
const isValidObjectId = (id) => {
	if (!id || typeof id !== "string") return false;
	// MongoDB ObjectId is 24 character hex string
	return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Sanitize string input to prevent injection attacks
 * @param {String} str - String to sanitize
 * @param {Object} options - Sanitization options
 * @returns {String} Sanitized string
 */
const sanitizeString = (str, options = {}) => {
	if (typeof str !== "string") return str;

	const { maxLength = 1000, allowHtml = false, trim = true } = options;

	let sanitized = str;

	// Trim whitespace
	if (trim) {
		sanitized = sanitized.trim();
	}

	// Limit length
	if (sanitized.length > maxLength) {
		console.warn(
			`⚠️  String truncated from ${sanitized.length} to ${maxLength} characters`
		);
		sanitized = sanitized.substring(0, maxLength);
	}

	// Remove HTML tags if not allowed
	if (!allowHtml) {
		sanitized = sanitized.replace(/<[^>]*>/g, "");
	}

	// Remove null bytes
	sanitized = sanitized.replace(/\0/g, "");

	return sanitized;
};

/**
 * Sanitize email address
 * @param {String} email - Email to sanitize
 * @returns {String|null} Sanitized email or null if invalid
 */
const sanitizeEmail = (email) => {
	if (typeof email !== "string") return null;

	// Convert to lowercase and trim
	const sanitized = email.toLowerCase().trim();

	// Basic email validation
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(sanitized)) {
		return null;
	}

	// Check length
	if (sanitized.length > 254) {
		// RFC 5321
		return null;
	}

	return sanitized;
};

/**
 * Sanitize query parameters for database queries
 * @param {Object} query - Query object from req.query
 * @returns {Object} Sanitized query
 */
const sanitizeQuery = (query) => {
	const sanitized = {};

	for (const [key, value] of Object.entries(query)) {
		// Skip dangerous keys
		if (key.startsWith("$") || key.includes(".")) {
			console.warn(`⚠️  Blocked dangerous query parameter: ${key}`);
			continue;
		}

		// Sanitize string values
		if (typeof value === "string") {
			sanitized[key] = sanitizeString(value, { maxLength: 500 });
		} else if (typeof value === "object") {
			// Sanitize nested objects
			sanitized[key] = sanitizeObject(value, 2);
		} else {
			sanitized[key] = value;
		}
	}

	return sanitized;
};

/**
 * Validate pagination parameters
 * @param {Object} params - Pagination parameters { page, limit }
 * @returns {Object} Validated and sanitized pagination
 */
const sanitizePagination = (params = {}) => {
	const page = parseInt(params.page) || 1;
	const limit = parseInt(params.limit) || 20;

	return {
		page: Math.max(1, Math.min(page, 1000)), // Max page 1000
		limit: Math.max(1, Math.min(limit, 100)), // Max limit 100
	};
};

/**
 * Sanitize sort parameters to prevent injection
 * @param {String} sortBy - Field to sort by
 * @param {String} sortOrder - Sort order (asc/desc)
 * @param {Array} allowedFields - Allowed fields for sorting
 * @returns {Object} Validated sort parameters
 */
const sanitizeSort = (sortBy, sortOrder, allowedFields = []) => {
	// Default sort
	let field = "createdAt";
	let order = "desc";

	// Validate sortBy
	if (sortBy && typeof sortBy === "string") {
		// Remove any MongoDB operators or dots
		const cleanField = sortBy.replace(/[\$\.]/g, "");

		if (allowedFields.length === 0 || allowedFields.includes(cleanField)) {
			field = cleanField;
		} else {
			console.warn(`⚠️  Invalid sort field attempted: ${sortBy}`);
		}
	}

	// Validate sortOrder
	if (
		sortOrder &&
		["asc", "desc", "1", "-1"].includes(sortOrder.toLowerCase())
	) {
		order =
			sortOrder.toLowerCase() === "asc" || sortOrder === "1" ? "asc" : "desc";
	}

	return { field, order };
};

/**
 * Create a safe regex for text search
 * Escapes special regex characters to prevent ReDoS attacks
 * @param {String} text - Text to convert to regex
 * @returns {RegExp} Safe regex pattern
 */
const createSafeRegex = (text) => {
	if (typeof text !== "string") return null;

	// Limit length to prevent ReDoS
	if (text.length > 100) {
		text = text.substring(0, 100);
	}

	// Escape special regex characters
	const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	return new RegExp(escaped, "i");
};

/**
 * Escape special regex characters in a string so it can be safely embedded
 * inside a custom RegExp/$regex pattern (e.g. anchored `^...$` matches, or
 * combined with other pattern pieces). Unlike createSafeRegex above, this
 * returns the escaped STRING itself rather than a compiled RegExp, so the
 * caller stays in control of anchoring/flags.
 * @param {*} value - Value to escape (coerced to string)
 * @returns {String} Escaped string safe to embed in a regex pattern
 */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Middleware to sanitize request body, query, and params
 * Use this as additional protection in sensitive routes
 */
const sanitizeRequest = (req, res, next) => {
	// Sanitize body
	if (req.body && typeof req.body === "object") {
		req.body = sanitizeObject(req.body);
	}

	// Sanitize query
	if (req.query && typeof req.query === "object") {
		req.query = sanitizeQuery(req.query);
	}

	// Sanitize params
	if (req.params && typeof req.params === "object") {
		req.params = sanitizeObject(req.params, 1);
	}

	next();
};

module.exports = {
	sanitizeObject,
	isValidObjectId,
	sanitizeString,
	sanitizeEmail,
	sanitizeQuery,
	sanitizePagination,
	sanitizeSort,
	createSafeRegex,
	escapeRegex,
	sanitizeRequest,
};
