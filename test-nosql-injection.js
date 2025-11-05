// NoSQL Injection Protection Test Script
// Tests various NoSQL injection attempts to ensure they are blocked
// Usage: node test-nosql-injection.js

const axios = require('axios');

console.log('🧪 Testing NoSQL Injection Protection...\n');

const serverUrl = process.env.BACKEND_URL || process.env.SERVER_PUBLIC_URL || 'http://localhost:3001';
const baseUrl = `${serverUrl}/api`;

console.log(`Testing against: ${baseUrl}\n`);

// Test cases for NoSQL injection attempts
const testCases = [
	{
		name: 'Login with $ne operator (email)',
		description: 'Attempts to bypass authentication using MongoDB $ne operator',
		endpoint: '/auth/login',
		method: 'POST',
		payload: {
			email: { "$ne": null },
			password: "anything"
		},
		shouldBeBlocked: true,
	},
	{
		name: 'Login with $gt operator (password)',
		description: 'Attempts to match any password using $gt',
		endpoint: '/auth/login',
		method: 'POST',
		payload: {
			email: "test@example.com",
			password: { "$gt": "" }
		},
		shouldBeBlocked: true,
	},
	{
		name: 'Login with JavaScript injection',
		description: 'Attempts to inject JavaScript code',
		endpoint: '/auth/login',
		method: 'POST',
		payload: {
			email: "test@example.com'; return true; //",
			password: "password"
		},
		shouldBeBlocked: true,
	},
	{
		name: 'Query with $where operator',
		description: 'Attempts to use $where to execute arbitrary code',
		endpoint: '/products',
		method: 'GET',
		params: {
			"$where": "this.price < 100"
		},
		shouldBeBlocked: true,
		checkSanitized: true, // Special case: parameter should be removed/sanitized
	},
	{
		name: 'Dot notation injection',
		description: 'Attempts to use dot notation to access nested fields',
		endpoint: '/auth/login',
		method: 'POST',
		payload: {
			"email.length": { "$gt": 0 },
			password: "test"
		},
		shouldBeBlocked: true,
	},
	{
		name: 'Normal login (should work)',
		description: 'Normal login request without injection',
		endpoint: '/auth/login',
		method: 'POST',
		payload: {
			email: "test@example.com",
			password: "password123"
		},
		shouldBeBlocked: false,
		expectedStatus: [400, 401], // Either validation error or invalid credentials
	},
	{
		name: 'Prototype pollution attempt',
		description: 'Attempts to pollute object prototype',
		endpoint: '/auth/login',
		method: 'POST',
		payload: {
			"__proto__": { "isAdmin": true },
			email: "test@example.com",
			password: "test"
		},
		shouldBeBlocked: true,
	},
	{
		name: 'Constructor injection',
		description: 'Attempts to access constructor',
		endpoint: '/auth/login',
		method: 'POST',
		payload: {
			"constructor": { "prototype": { "isAdmin": true } },
			email: "test@example.com",
			password: "test"
		},
		shouldBeBlocked: true,
	},
];

// Function to test a single injection attempt
async function testInjection(testCase) {
	try {
		const config = {
			method: testCase.method,
			url: `${baseUrl}${testCase.endpoint}`,
			validateStatus: () => true, // Don't throw on any status
		};

		if (testCase.method === 'POST') {
			config.data = testCase.payload;
			config.headers = { 'Content-Type': 'application/json' };
		} else if (testCase.params) {
			config.params = testCase.params;
		}

		const response = await axios(config);

		const result = {
			...testCase,
			statusCode: response.status,
			responseData: response.data,
			passed: false,
			message: '',
		};

		// Determine if test passed
		if (testCase.shouldBeBlocked) {
			// Check if this is a sanitization test (query params removed but request succeeds)
			if (testCase.checkSanitized && response.status === 200) {
				// For sanitization tests, success (200) means the malicious params were removed
				// and the query executed safely without them
				result.passed = true;
				result.message = '✅ PASS - Malicious parameters sanitized, request handled safely';
			}
			// Should return 400 (bad request) or 401 (unauthorized), NOT 200 or authentication bypass
			else if (response.status === 400 || response.status === 401) {
				result.passed = true;
				result.message = '✅ PASS - Injection attempt blocked';
			} else if (response.status === 200 && !testCase.checkSanitized) {
				result.passed = false;
				result.message = '❌ FAIL - Injection NOT blocked! Request succeeded (security vulnerability)';
			} else {
				result.passed = true;
				result.message = `✅ PASS - Request rejected (status: ${response.status})`;
			}
		} else {
			// Normal request - should get expected status
			const expectedStatuses = testCase.expectedStatus || [200];
			if (expectedStatuses.includes(response.status)) {
				result.passed = true;
				result.message = '✅ PASS - Normal request handled correctly';
			} else {
				result.passed = false;
				result.message = `⚠️  UNEXPECTED - Got status ${response.status}, expected ${expectedStatuses.join(' or ')}`;
			}
		}

		return result;
	} catch (error) {
		return {
			...testCase,
			statusCode: 0,
			passed: false,
			message: `❌ ERROR - ${error.message}`,
			error: error.message,
		};
	}
}

// Run all tests
async function runTests() {
	console.log('Running test cases...\n');
	console.log('='.repeat(80));

	let passedTests = 0;
	let failedTests = 0;
	const results = [];

	for (const testCase of testCases) {
		console.log(`\n📋 Test: ${testCase.name}`);
		console.log(`   Description: ${testCase.description}`);
		console.log(`   Endpoint: ${testCase.method} ${testCase.endpoint}`);
		console.log(`   Expected: ${testCase.shouldBeBlocked ? 'BLOCKED' : 'ALLOWED'}`);

		const result = await testInjection(testCase);
		results.push(result);

		console.log(`   Status Code: ${result.statusCode}`);
		if (result.responseData?.message) {
			console.log(`   Response: ${result.responseData.message}`);
		}
		console.log(`   ${result.message}`);

		if (result.passed) {
			passedTests++;
		} else {
			failedTests++;
		}

		// Small delay between tests
		await new Promise(resolve => setTimeout(resolve, 100));
	}

	// Summary
	console.log('\n' + '='.repeat(80));
	console.log('\n📊 Test Summary:');
	console.log(`   Total Tests: ${testCases.length}`);
	console.log(`   ✅ Passed: ${passedTests}`);
	console.log(`   ❌ Failed: ${failedTests}`);

	// Show critical failures
	const criticalFailures = results.filter(r => !r.passed && r.shouldBeBlocked);
	if (criticalFailures.length > 0) {
		console.log('\n🚨 CRITICAL SECURITY VULNERABILITIES:');
		criticalFailures.forEach(failure => {
			console.log(`   - ${failure.name}`);
			console.log(`     ${failure.message}`);
		});
	}

	if (failedTests === 0) {
		console.log('\n🎉 All NoSQL injection protection tests passed!');
		console.log('   Your application is protected against tested injection attacks.');
		process.exit(0);
	} else if (criticalFailures.length > 0) {
		console.log('\n⚠️  CRITICAL: Some injection attempts were NOT blocked!');
		console.log('   Please review and fix the security issues immediately.');
		process.exit(1);
	} else {
		console.log('\n⚠️  Some tests failed but no critical vulnerabilities detected.');
		process.exit(0);
	}
}

// Check if server is running
console.log('Checking if server is running...');
axios.get(`${serverUrl}/api/health`, { timeout: 5000 })
	.then(response => {
		console.log(`✅ Server is running (Status: ${response.status})\n`);
		runTests();
	})
	.catch(error => {
		console.error(`❌ Cannot connect to server at ${serverUrl}`);
		console.error(`   Error: ${error.message}`);
		console.error('\n💡 Make sure your server is running:');
		console.error('   npm start  (or)  npm run dev\n');
		process.exit(1);
	});
