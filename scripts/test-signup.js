const axios = require("axios");

// Test the signup process
async function testSignup() {
	const baseURL = "http://localhost:3001/api/auth";

	const testUser = {
		name: "Test User",
		phoneNumber: "+1234567890",
		email: `test${Date.now()}@example.com`, // Unique email
		password: "TestPass123",
		address: {
			street: "123 Test Street",
			city: "Test City",
			state: "Test State",
			zipCode: "12345",
			country: "Test Country",
		},
	};

	console.log("Testing Signup Process...\n");
	console.log("Test Data:", JSON.stringify(testUser, null, 2));

	try {
		const response = await axios.post(`${baseURL}/register`, testUser, {
			headers: {
				"Content-Type": "application/json",
			},
		});

		console.log("\n✅ Signup Successful!");
		console.log("Response:", JSON.stringify(response.data, null, 2));

		if (response.data.success && response.data.data.token) {
			console.log("\n🎉 User registered successfully with token!");
			console.log("Token:", response.data.data.token);
		}
	} catch (error) {
		console.log("\n❌ Signup Failed!");
		if (error.response) {
			console.log("Status:", error.response.status);
			console.log("Error:", JSON.stringify(error.response.data, null, 2));
		} else {
			console.log("Network Error:", error.message);
		}
	}
}

// Run the test
testSignup();
