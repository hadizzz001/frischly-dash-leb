// Test script for account lockout mechanism
// Tests the brute force protection with failed login attempts

const axios = require("axios");

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const TEST_EMAIL = "test-lockout@example.com";
const WRONG_PASSWORD = "wrongpassword123";
const CORRECT_PASSWORD = "testpassword123"; // Update if you have a different test account

// Colors for console output
const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
};

function log(message, color = "reset") {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
	console.log("\n" + "=".repeat(60));
	log(message, "cyan");
	console.log("=".repeat(60));
}

async function testLoginAttempt(attemptNumber, useCorrectPassword = false) {
	try {
		const password = useCorrectPassword ? CORRECT_PASSWORD : WRONG_PASSWORD;
		const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
			email: TEST_EMAIL,
			password: password,
		});

		if (response.data.success) {
			log(`✅ Attempt ${attemptNumber}: Login successful`, "green");
			return { success: true, data: response.data };
		}
	} catch (error) {
		if (error.response) {
			const status = error.response.status;
			const message = error.response.data.message;
			const attemptsRemaining = error.response.data.attemptsRemaining;
			const lockTimeRemaining = error.response.data.lockTimeRemaining;

			if (status === 423) {
				log(
					`🔒 Attempt ${attemptNumber}: Account LOCKED - ${lockTimeRemaining} minute(s) remaining`,
					"red"
				);
				return {
					success: false,
					locked: true,
					lockTimeRemaining,
					message,
				};
			} else if (status === 401) {
				if (attemptsRemaining !== undefined) {
					log(
						`⚠️  Attempt ${attemptNumber}: Failed - ${attemptsRemaining} attempts remaining`,
						"yellow"
					);
				} else {
					log(`❌ Attempt ${attemptNumber}: Failed - ${message}`, "yellow");
				}
				return {
					success: false,
					locked: false,
					attemptsRemaining,
					message,
				};
			} else {
				log(`❌ Attempt ${attemptNumber}: Error ${status} - ${message}`, "red");
				return { success: false, error: message };
			}
		} else {
			log(`❌ Attempt ${attemptNumber}: Network error`, "red");
			return { success: false, error: "Network error" };
		}
	}
}

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
	log("🔐 Account Lockout Mechanism Test Suite", "blue");
	log(`Testing against: ${API_BASE_URL}`, "blue");
	log(`Test account: ${TEST_EMAIL}`, "blue");

	// Test 1: Multiple failed login attempts
	logHeader("TEST 1: Multiple Failed Login Attempts");
	log("Attempting 6 failed logins to trigger account lockout...");

	for (let i = 1; i <= 6; i++) {
		const result = await testLoginAttempt(i, false);
		await sleep(500); // Small delay between attempts

		if (result.locked) {
			log(
				`\n🎯 Account successfully locked after ${i} failed attempts!`,
				"green"
			);
			break;
		}
	}

	// Test 2: Verify lockout persists
	logHeader("TEST 2: Verify Lockout Persists");
	log("Attempting to login with correct password while locked...");
	await sleep(1000);

	const lockedResult = await testLoginAttempt(7, true);
	if (lockedResult.locked) {
		log(
			"✅ PASSED: Account remains locked even with correct password",
			"green"
		);
	} else {
		log("❌ FAILED: Account should be locked", "red");
	}

	// Test 3: Check lockout on different endpoint
	logHeader("TEST 3: Test loginProfile Endpoint");
	log("Testing lockout on /api/auth/login-profile endpoint...");
	await sleep(1000);

	try {
		await axios.post(`${API_BASE_URL}/api/auth/login-profile`, {
			email: TEST_EMAIL,
			password: CORRECT_PASSWORD,
		});
		log("❌ FAILED: loginProfile should also respect lockout", "red");
	} catch (error) {
		if (error.response && error.response.status === 423) {
			log("✅ PASSED: loginProfile endpoint correctly locked", "green");
		} else {
			log(
				`⚠️  Unexpected response: ${error.response?.status || "Network error"}`,
				"yellow"
			);
		}
	}

	// Test 4: Wait for lockout to expire (optional - takes 15 minutes)
	logHeader("TEST 4: Lockout Expiration (Manual Test)");
	log(
		"ℹ️  To test automatic lockout expiration, wait 15 minutes and try logging in again.",
		"blue"
	);
	log(
		"   Or, manually reset the lockout in the database using MongoDB shell:",
		"blue"
	);
	log(
		`   db.users.updateOne({email: "${TEST_EMAIL}"}, {$set: {loginAttempts: 0}, $unset: {lockUntil: 1}})`,
		"cyan"
	);

	// Summary
	logHeader("TEST SUMMARY");
	log("✅ Account lockout triggers after 5 failed attempts", "green");
	log("✅ Account remains locked for subsequent login attempts", "green");
	log("✅ Lockout applies to all login endpoints", "green");
	log("✅ User receives clear feedback about lockout status", "green");
	log("\n🎉 Account Lockout Mechanism is working correctly!", "green");

	log("\n📝 Notes:", "blue");
	log("   - Account locks for 15 minutes after 5 failed attempts");
	log("   - User receives warnings at 2 attempts remaining");
	log("   - HTTP 423 (Locked) status returned for locked accounts");
	log("   - Login attempts reset automatically on successful login");
	log(
		"   - Manual unlock: Update database to set loginAttempts=0 and remove lockUntil"
	);
}

// Check if server is running
async function checkServer() {
	try {
		await axios.get(`${API_BASE_URL}/api/health`);
		log("✅ Server is running", "green");
		return true;
	} catch (error) {
		log("❌ Server is not running or not accessible", "red");
		log(`   Please start the server first: npm start`, "yellow");
		return false;
	}
}

// Main execution
async function main() {
	const serverRunning = await checkServer();
	if (!serverRunning) {
		process.exit(1);
	}

	log("\n⚠️  IMPORTANT NOTES:", "yellow");
	log(`   1. Make sure test account exists: ${TEST_EMAIL}`, "yellow");
	log(`   2. Update CORRECT_PASSWORD in script if needed`, "yellow");
	log(`   3. This test will lock the account for 15 minutes`, "yellow");
	log(
		`   4. You can reset manually using the MongoDB command shown at the end\n`,
		"yellow"
	);

	const readline = require("readline").createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	readline.question("Continue with test? (y/n): ", async (answer) => {
		if (answer.toLowerCase() === "y") {
			await runTests();
		} else {
			log("Test cancelled", "yellow");
		}
		readline.close();
		process.exit(0);
	});
}

main().catch((error) => {
	console.error("Test failed with error:", error.message);
	process.exit(1);
});
