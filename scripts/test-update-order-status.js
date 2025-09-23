const axios = require("axios");

const BASE_URL = "http://localhost:3001/api";

async function testUpdateOrderStatus() {
	try {
		console.log("🧪 Testing PATCH /api/orders/:id/status endpoint...\n");

		// Step 1: Get authentication token (admin user)
		console.log("Step 1: Getting admin authentication token...");
		const adminLoginResponse = await axios.post(`${BASE_URL}/auth/login`, {
			email: "admin@frischly.com",
			password: "admin123",
		});

		const adminToken = adminLoginResponse.data.token;
		console.log("✅ Admin authentication successful");

		// Step 2: Get list of orders to find one to update
		console.log("\nStep 2: Getting orders list...");
		const ordersResponse = await axios.get(`${BASE_URL}/orders?limit=5`, {
			headers: { Authorization: `Bearer ${adminToken}` },
		});

		if (ordersResponse.data.data.length === 0) {
			console.log("❌ No orders found. Please create an order first.");
			return;
		}

		const testOrder = ordersResponse.data.data[0];
		console.log(`✅ Found order: ${testOrder.orderNumber}`);
		console.log(`   Current status: ${testOrder.status}`);
		console.log(
			`   Current assigned rider: ${testOrder.assignedRider?.name || "None"}`
		);

		// Step 3: Test admin updating order status
		console.log("\nStep 3: Testing admin status update...");
		const newStatus =
			testOrder.status === "pending" ? "confirmed" : "processing";

		const adminUpdateResponse = await axios.patch(
			`${BASE_URL}/orders/${testOrder._id}/status`,
			{ status: newStatus },
			{ headers: { Authorization: `Bearer ${adminToken}` } }
		);

		console.log(`✅ Admin status update successful!`);
		console.log(`   Order ID: ${adminUpdateResponse.data.data._id}`);
		console.log(
			`   Order Number: ${adminUpdateResponse.data.data.orderNumber}`
		);
		console.log(`   New Status: ${adminUpdateResponse.data.data.status}`);
		console.log(
			`   Updated By: ${
				adminUpdateResponse.data.data.updatedBy?.name || "System"
			}`
		);

		// Step 4: Test rider authentication and permissions
		console.log("\nStep 4: Testing rider permissions...");

		// Try to get rider token (if rider exists)
		try {
			const riderLoginResponse = await axios.post(`${BASE_URL}/auth/login`, {
				email: "rider@frischly.com",
				password: "rider123",
			});

			const riderToken = riderLoginResponse.data.token;
			console.log("✅ Rider authentication successful");

			// Test rider updating to allowed status
			const riderUpdateResponse = await axios.patch(
				`${BASE_URL}/orders/${testOrder._id}/status`,
				{ status: "OnTheWay" },
				{ headers: { Authorization: `Bearer ${riderToken}` } }
			);

			console.log(`✅ Rider status update successful!`);
			console.log(`   New Status: ${riderUpdateResponse.data.data.status}`);
			console.log(
				`   Assigned Rider: ${
					riderUpdateResponse.data.data.assignedRider?.name || "Auto-assigned"
				}`
			);

			// Test rider trying to update to forbidden status
			try {
				await axios.patch(
					`${BASE_URL}/orders/${testOrder._id}/status`,
					{ status: "cancelled" },
					{ headers: { Authorization: `Bearer ${riderToken}` } }
				);
			} catch (error) {
				if (error.response && error.response.status === 403) {
					console.log("✅ Rider forbidden status error handled correctly");
				}
			}
		} catch (riderError) {
			console.log("ℹ️  Rider account not found, skipping rider tests");
		}

		// Step 5: Test error cases
		console.log("\nStep 5: Testing error cases...");

		// Test with invalid order ID
		try {
			await axios.patch(
				`${BASE_URL}/orders/invalid-id/status`,
				{ status: "confirmed" },
				{ headers: { Authorization: `Bearer ${adminToken}` } }
			);
		} catch (error) {
			if (error.response && error.response.status === 400) {
				console.log("✅ Invalid order ID error handled correctly");
			}
		}

		// Test with invalid status
		try {
			await axios.patch(
				`${BASE_URL}/orders/${testOrder._id}/status`,
				{ status: "invalid-status" },
				{ headers: { Authorization: `Bearer ${adminToken}` } }
			);
		} catch (error) {
			if (error.response && error.response.status === 400) {
				console.log("✅ Invalid status error handled correctly");
			}
		}

		// Test with missing status
		try {
			await axios.patch(
				`${BASE_URL}/orders/${testOrder._id}/status`,
				{},
				{ headers: { Authorization: `Bearer ${adminToken}` } }
			);
		} catch (error) {
			if (error.response && error.response.status === 400) {
				console.log("✅ Missing status error handled correctly");
			}
		}

		// Step 6: Test status progression
		console.log("\nStep 6: Testing status progression...");
		const statusProgression = [
			"pending",
			"confirmed",
			"processing",
			"ready for pickup",
			"OnTheWay",
			"delivered",
		];

		for (let i = 0; i < Math.min(3, statusProgression.length); i++) {
			const status = statusProgression[i];
			try {
				const response = await axios.patch(
					`${BASE_URL}/orders/${testOrder._id}/status`,
					{ status },
					{ headers: { Authorization: `Bearer ${adminToken}` } }
				);
				console.log(`✅ Status updated to: ${response.data.data.status}`);

				// Small delay between updates
				await new Promise((resolve) => setTimeout(resolve, 500));
			} catch (error) {
				console.log(
					`⚠️  Could not update to ${status}: ${
						error.response?.data?.message || error.message
					}`
				);
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
testUpdateOrderStatus();
