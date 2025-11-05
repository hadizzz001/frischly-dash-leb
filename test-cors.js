// CORS Configuration Test Script
// This script tests the CORS configuration to ensure it's working correctly
// Usage: node test-cors.js

const http = require('http');
const https = require('https');
require('dotenv').config(); // Load environment variables

console.log('🧪 Testing CORS Configuration...\n');

// Always test against local server
const serverUrl = "http://localhost:3001";
const testEndpoint = `${serverUrl}/api/health`;

console.log(`Testing against: ${testEndpoint}\n`);

// Get allowed origins from environment
const allowedOrigins = (process.env.CLIENT_URL || process.env.ALLOWED_ORIGINS || '')
	.split(',')
	.map(o => o.trim())
	.filter(Boolean);

console.log(`Configured allowed origins: ${allowedOrigins.join(', ') || '(none)'}\n`);

// Test cases with different origins
const testCases = [
	{
		name: 'Allowed Origin (localhost:3000)',
		origin: 'http://localhost:3000',
		shouldPass: allowedOrigins.includes('http://localhost:3000'), // Dynamic based on config
	},
	{
		name: 'Allowed Origin (localhost:3001)',
		origin: 'http://localhost:3001',
		shouldPass: allowedOrigins.includes('http://localhost:3001'), // Dynamic based on config
	},
	{
		name: "Unauthorized Origin (evil.com)",
		origin: "https://evil.com",
		shouldPass: false,
	},
	{
		name: "Unauthorized Origin (attacker.net)",
		origin: "http://attacker.net",
		shouldPass: false,
	},
	{
		name: "No Origin (like curl/Postman)",
		origin: null,
		shouldPass: true, // Should be allowed
	},
];

// Function to test CORS with a specific origin
function testCorsWithOrigin(testCase) {
	return new Promise((resolve) => {
		const url = new URL(testEndpoint);
		const protocol = url.protocol === "https:" ? https : http;

		const options = {
			hostname: url.hostname,
			port: url.port || (url.protocol === "https:" ? 443 : 80),
			path: url.pathname,
			method: "GET",
			headers: testCase.origin
				? {
						Origin: testCase.origin,
						"User-Agent": "CORS-Test-Script",
				  }
				: {
						"User-Agent": "CORS-Test-Script",
				  },
		};

		const req = protocol.request(options, (res) => {
			const corsHeader = res.headers["access-control-allow-origin"];
			const hasCredentials = res.headers["access-control-allow-credentials"];

			const result = {
				...testCase,
				statusCode: res.statusCode,
				corsHeader: corsHeader || "Not Present",
				allowsCredentials: hasCredentials === "true",
				passed: false,
				message: "",
			};

			// Determine if test passed
			if (testCase.shouldPass) {
				if (
					res.statusCode === 200 &&
					(corsHeader === testCase.origin || !testCase.origin)
				) {
					result.passed = true;
					result.message = "✅ PASS - Origin allowed as expected";
				} else {
					result.message = `❌ FAIL - Expected origin to be allowed (status: ${res.statusCode}, CORS header: ${corsHeader})`;
				}
			} else {
				// Should be blocked
				if (!corsHeader || corsHeader !== testCase.origin) {
					result.passed = true;
					result.message = "✅ PASS - Origin blocked as expected";
				} else {
					result.message = `❌ FAIL - Origin should be blocked but was allowed`;
				}
			}

			resolve(result);

			// Consume response to free up memory
			res.on("data", () => {});
		});

		req.on("error", (error) => {
			resolve({
				...testCase,
				statusCode: 0,
				passed: false,
				message: `❌ ERROR - ${error.message}`,
			});
		});

		req.end();
	});
}

// Run all test cases
async function runTests() {
	console.log("Running test cases...\n");
	console.log("=".repeat(80));

	let passedTests = 0;
	let failedTests = 0;

	for (const testCase of testCases) {
		console.log(`\n📋 Test: ${testCase.name}`);
		console.log(`   Origin: ${testCase.origin || "(none)"}`);
		console.log(`   Expected: ${testCase.shouldPass ? "ALLOWED" : "BLOCKED"}`);

		const result = await testCorsWithOrigin(testCase);

		console.log(`   Status Code: ${result.statusCode}`);
		console.log(`   CORS Header: ${result.corsHeader}`);
		console.log(`   Allows Credentials: ${result.allowsCredentials}`);
		console.log(`   ${result.message}`);

		if (result.passed) {
			passedTests++;
		} else {
			failedTests++;
		}
	}

	// Summary
	console.log("\n" + "=".repeat(80));
	console.log("\n📊 Test Summary:");
	console.log(`   Total Tests: ${testCases.length}`);
	console.log(`   ✅ Passed: ${passedTests}`);
	console.log(`   ❌ Failed: ${failedTests}`);

	if (failedTests === 0) {
		console.log("\n🎉 All CORS tests passed! Configuration is secure.");
		process.exit(0);
	} else {
		console.log(
			"\n⚠️  Some CORS tests failed. Please review the configuration."
		);
		console.log(
			"   Check your CLIENT_URL or ALLOWED_ORIGINS environment variable."
		);
		process.exit(1);
	}
}

// Check if server is running
console.log("Checking if server is running...");
const url = new URL(testEndpoint);
const protocol = url.protocol === "https:" ? https : http;

const checkOptions = {
	hostname: url.hostname,
	port: url.port || (url.protocol === "https:" ? 443 : 80),
	path: url.pathname,
	method: "GET",
	timeout: 5000,
};

const checkReq = protocol.request(checkOptions, (res) => {
	console.log(`✅ Server is running (Status: ${res.statusCode})\n`);
	res.on("data", () => {});
	runTests();
});

checkReq.on("error", (error) => {
	console.error(`❌ Cannot connect to server at ${serverUrl}`);
	console.error(`   Error: ${error.message}`);
	console.error("\n💡 Make sure your server is running:");
	console.error("   npm start  (or)  npm run dev\n");
	process.exit(1);
});

checkReq.on("timeout", () => {
	console.error(`❌ Connection timeout to ${serverUrl}`);
	console.error("   Server might be down or unreachable.\n");
	checkReq.destroy();
	process.exit(1);
});

checkReq.end();
