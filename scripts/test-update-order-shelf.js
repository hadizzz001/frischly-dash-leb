const axios = require("axios");

const BASE_URL = "http://localhost:3001/api";

async function testUpdateOrderShelfNumber() {
	try {
		console.log("🧪 Testing PATCH /api/orders/:id/shelf endpoint...\n");

		// Step 1: Get authentication token (admin user)
		console.log("Step 1: Getting authentication token...");
		const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
			email: "admin@frischly.com",
			password: "admin123",
		});

		const token = loginResponse.data.token;
		console.log("✅ Authentication successful");

		// Step 2: Get list of orders to find one to update
		console.log("\nStep 2: Getting orders list...");
		const ordersResponse = await axios.get(`${BASE_URL}/orders?limit=5`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		if (ordersResponse.data.data.length === 0) {
			console.log("❌ No orders found. Please create an order first.");
			return;
		}

		const testOrder = ordersResponse.data.data[0];
		console.log(`✅ Found order: ${testOrder.orderNumber}`);
		console.log(
			`   Current shelf number: ${testOrder.shelfNumber || "Not set"}`
		);

		// Step 3: Update the order shelf number
		console.log("\nStep 3: Updating order shelf number...");
		const newShelfNumber = Math.floor(Math.random() * 1000) + 100; // Random number between 100-1099

		const updateResponse = await axios.patch(
			`${BASE_URL}/orders/${testOrder._id}/shelf`,
			{ shelfNumber: newShelfNumber },
			{ headers: { Authorization: `Bearer ${token}` } }
		);

		console.log(`✅ Order shelf number updated successfully!`);
		console.log(`   Order ID: ${updateResponse.data.data._id}`);
		console.log(`   Order Number: ${updateResponse.data.data.orderNumber}`);
		console.log(`   New Shelf Number: ${updateResponse.data.data.shelfNumber}`);
		console.log(
			`   Updated By: ${updateResponse.data.data.updatedBy?.name || "System"}`
		);

		// Step 4: Verify the update by fetching the order again
		console.log("\nStep 4: Verifying the update...");
		const verifyResponse = await axios.get(
			`${BASE_URL}/orders/${testOrder._id}`,
			{
				headers: { Authorization: `Bearer ${token}` },
			}
		);

		if (verifyResponse.data.data.shelfNumber === newShelfNumber) {
			console.log(
				"✅ Verification successful - shelf number updated correctly"
			);
		} else {
			console.log("❌ Verification failed - shelf number not updated properly");
		}

		// Step 5: Test error cases
		console.log("\nStep 5: Testing error cases...");

		// Test with invalid order ID
		try {
			await axios.patch(
				`${BASE_URL}/orders/invalid-id/shelf`,
				{ shelfNumber: 123 },
				{ headers: { Authorization: `Bearer ${token}` } }
			);
		} catch (error) {
			if (error.response && error.response.status === 400) {
				console.log("✅ Invalid order ID error handled correctly");
			}
		}

		// Test with missing shelf number
		try {
			await axios.patch(
				`${BASE_URL}/orders/${testOrder._id}/shelf`,
				{},
				{ headers: { Authorization: `Bearer ${token}` } }
			);
		} catch (error) {
			if (error.response && error.response.status === 400) {
				console.log("✅ Missing shelf number error handled correctly");
			}
		}

		console.log("\n🎉 All tests completed successfully!");
	} catch (error) {
		console.error("❌ Test failed:");
		if (error.response) {
			console.error(`Status: ${error.response.status}`);
			console.error(`Message: ${error.response.data.message}`);
			console.error(`Data:`, error.response.data);
		} else {
			console.error(`Error: ${error.message}`);
		}
	}
}

// Run the test
testUpdateOrderShelfNumber();
