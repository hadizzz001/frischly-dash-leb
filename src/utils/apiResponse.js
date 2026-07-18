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

module.exports = { sendResponse, sendError, sendSuccess };
