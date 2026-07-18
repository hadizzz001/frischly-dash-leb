/** Jest configuration for the Frischly backend. */
module.exports = {
	testEnvironment: "node",
	roots: ["<rootDir>/tests"],
	testMatch: ["**/*.test.js"],
	collectCoverageFrom: [
		"src/utils/**/*.js",
		"!src/utils/sendEmail.js",
		"!src/utils/sendSms.js",
	],
	coverageDirectory: "coverage",
	verbose: true,
	clearMocks: true,
};
