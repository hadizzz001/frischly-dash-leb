// Standardized API response helper
// Ensures every endpoint returns a consistent JSON envelope:
// { success, message, data, timestamp }
//
// Usage:
//   const { sendResponse, sendError } = require("../utils/apiResponse");
//   sendResponse(res, 200, true, "User queried successfully", userData);
//   sendError(res, 404, "User not found");

/**
 * Send a standardized success/response payload.
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {boolean} success
 * @param {string} message
 * @param {*} [data]
 * @param {object} [meta] optional extra fields (e.g. pagination)
 */
const sendResponse = (res, statusCode, success, message, data = null, meta = {}) => {
	return res.status(statusCode).json({
		success,
		message,
		data,
		timestamp: new Date().toISOString(),
		...meta,
	});
};

/**
 * Convenience helper for error responses.
 * @param {import('express').Response} res
 * @param {number} [statusCode=500]
 * @param {string} [message="Internal server error"]
 * @param {*} [errors] optional validation errors / error details
 */
const sendError = (res, statusCode = 500, message = "Internal server error", errors = null) => {
	return res.status(statusCode).json({
		success: false,
		message,
		errors,
		timestamp: new Date().toISOString(),
	});
};

/**
 * Convenience helper for success responses.
 * @param {import('express').Response} res
 * @param {*} [data]
 * @param {string} [message="Success"]
 * @param {number} [statusCode=200]
 */
const sendSuccess = (res, data = null, message = "Success", statusCode = 200) => {
	return sendResponse(res, statusCode, true, message, data);
};

/**
 * Send an express-validator failure as a precise, field-by-field error.
 *
 * Every entry in `errors` names the field, the message and the value that was
 * actually received, so the UI can point at the exact input that failed
 * instead of showing one vague sentence.
 *
 * @param {import('express').Response} res
 * @param {import('express-validator').Result} result  validationResult(req)
 * @param {number} [statusCode=400]
 * @param {import('express').Request} [req] used to echo the pre-sanitized value
 */
const sendValidationError = (res, result, statusCode = 400, req = null) => {
	const raw = typeof result?.array === "function" ? result.array() : [];

	// Resolve a dotted path like "address.city" against the untouched body.
	const original = (path) => {
		if (!req || !req.rawBody || !path) return undefined;
		return String(path)
			.split(".")
			.reduce((acc, key) => (acc == null ? undefined : acc[key]), req.rawBody);
	};

	const errors = raw.map((e) => {
		const field = e.path || e.param || "unknown";
		// Prefer what the user actually typed over the sanitized value.
		const before = original(field);
		const value = before === undefined ? e.value : before;

		return {
			field,
			message: e.msg,
			// Never echo secrets back to the client.
			received: /password|token|secret/i.test(field)
				? "[hidden]"
				: value === undefined
					? null
					: value,
			location: e.location || "body",
		};
	});

	const message = errors.length
		? `Validation failed: ${errors.map((e) => `${e.field}: ${e.message}`).join(" | ")}`
		: "Validation failed";

	return sendError(res, statusCode, message, errors);
};

/**
 * Send a 500 for an unexpected exception.
 *
 * Controllers call this from their catch blocks. It MUST exist and MUST always
 * produce a response: if it is missing (or throws), the catch block itself
 * throws, no reply is ever written, and the request hangs until the client
 * times out — the browser shows a spinner forever rather than an error.
 *
 * Not every exception that reaches a catch block is a *server* fault. A catch
 * block sees Mongoose validation failures, bad ObjectIds and duplicate-key
 * errors too, and reporting those as 500 "Server Error" hides the one thing
 * the user needs to know: which field is wrong. So they are classified here,
 * once, rather than in all 141 call sites.
 *
 * The raw error text is logged server-side but never sent to the client, since
 * driver/stack messages can leak schema and connection details.
 *
 * @param {import('express').Response} res
 * @param {Error} [error] the caught exception (logged, not returned)
 * @param {string} [message="Internal server error"] safe, user-facing text
 * @param {number} [statusCode=500]
 */
const sendServerError = (
	res,
	error = null,
	message = "Internal server error",
	statusCode = 500
) => {
	if (error) {
		console.error(`[sendServerError] ${message}:`, error && error.stack ? error.stack : error);
	}

	// Never write twice — the handler may already have responded before throwing.
	if (res.headersSent) return res;

	// ── Mongoose schema validation: the user's input, not a server fault ──
	if (error && error.name === "ValidationError" && error.errors) {
		const errors = Object.keys(error.errors).map((field) => {
			const e = error.errors[field];
			return {
				field,
				message: e.message,
				received: /password|token|secret/i.test(field)
					? "[hidden]"
					: e.value === undefined
						? null
						: e.value,
				location: "body",
			};
		});
		return sendError(
			res,
			400,
			`Validation failed: ${errors.map((e) => `${e.field}: ${e.message}`).join(" | ")}`,
			errors
		);
	}

	// ── Bad ObjectId in the URL: a 404, not a crash ──
	if (error && error.name === "CastError" && error.kind === "ObjectId") {
		return sendError(res, 404, "Record not found (invalid id)");
	}

	// ── Unique-index violation: 409 naming the conflicting field ──
	if (error && (error.code === 11000 || error.code === 11001)) {
		const keys = Object.keys(error.keyPattern || error.keyValue || {});
		const field = keys[0] || "field";
		const value = error.keyValue ? error.keyValue[field] : undefined;
		return sendError(
			res,
			409,
			`That ${field} is already in use${value ? `: "${value}"` : ""}`,
			[
				{
					field,
					message: "Already in use",
					received: value === undefined ? null : value,
					location: "body",
				},
			]
		);
	}

	return sendError(res, statusCode, message);
};

module.exports = {
	sendResponse,
	sendError,
	sendSuccess,
	sendServerError,
	sendValidationError,
};
