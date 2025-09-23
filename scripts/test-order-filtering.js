const axios = require("axios");

const BASE_URL = "http://localhost:3001/api";

async function testOrderFiltering() {
	try {
		console.log("🧪 Testing enhanced order filtering options...\n");

		// Step 1: Get authentication token
		console.log("Step 1: Getting authentication token...");
		const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
			email: "staff1@frischly.com",
			password: "Staff123!",
		});

		let token = loginResponse.data.data.token;
		console.log("✅ Authentication successful", token);

		// Step 2: Test basic status filtering
		console.log("\nStep 2: Testing single status filter...");
		const singleStatusResponse = await axios.get(
			`${BASE_URL}/orders?status=pending&limit=5`,
			{
				headers: { Authorization: `Bearer ${token}` },
			}
		);
		console.log(
			`✅ Found ${singleStatusResponse.data.pagination.totalOrders} pending orders`
		);

		// Step 3: Test multiple status filtering
		console.log("\nStep 3: Testing multiple status filter...");
		const multiStatusResponse = await axios.get(
			`${BASE_URL}/orders?status=pending,confirmed,processing&limit=10`,
			{
				headers: { Authorization: `Bearer ${token}` },
			}
		);
		console.log(
			`✅ Found ${multiStatusResponse.data.pagination.totalOrders} orders with status: pending, confirmed, or processing`
		);

		if (multiStatusResponse.data.data.length > 0) {
			console.log("📋 Sample statuses found:");
			const statuses = [
				...new Set(multiStatusResponse.data.data.map((order) => order.status)),
			];
			statuses.forEach((status) => console.log(`   - ${status}`));
		}

		// Step 4: Test exclude status filtering
		console.log("\nStep 4: Testing exclude status filter...");
		const excludeStatusResponse = await axios.get(
			`${BASE_URL}/orders?status=!cancelled&limit=5`,
			{
				headers: { Authorization: `Bearer ${token}` },
			}
		);
		console.log(
			`✅ Found ${excludeStatusResponse.data.pagination.totalOrders} orders (excluding cancelled)`
		);

		// Step 5: Test payment status filtering
		console.log("\nStep 5: Testing payment status filter...");
		const paymentStatusResponse = await axios.get(
			`${BASE_URL}/orders?paymentStatus=pending,paid&limit=5`,
			{
				headers: { Authorization: `Bearer ${token}` },
			}
		);
		console.log(
			`✅ Found ${paymentStatusResponse.data.pagination.totalOrders} orders with payment status: pending or paid`
		);

		// Step 6: Test date range filtering
		console.log("\nStep 6: Testing date range filter...");
		const today = new Date();
		const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

		const dateRangeResponse = await axios.get(
			`${BASE_URL}/orders?dateFrom=${
				weekAgo.toISOString().split("T")[0]
			}&dateTo=${today.toISOString().split("T")[0]}&limit=10`,
			{ headers: { Authorization: `Bearer ${token}` } }
		);
		console.log(
			`✅ Found ${dateRangeResponse.data.pagination.totalOrders} orders from last 7 days`
		);

		// Step 7: Test assigned rider filtering
		console.log("\nStep 7: Testing assigned rider filter...");
		const unassignedResponse = await axios.get(
			`${BASE_URL}/orders?assignedRider=unassigned&limit=5`,
			{
				headers: { Authorization: `Bearer ${token}` },
			}
		);
		console.log(
			`✅ Found ${unassignedResponse.data.pagination.totalOrders} unassigned orders`
		);

		const assignedResponse = await axios.get(
			`${BASE_URL}/orders?assignedRider=assigned&limit=5`,
			{
				headers: { Authorization: `Bearer ${token}` },
			}
		);
		console.log(
			`✅ Found ${assignedResponse.data.pagination.totalOrders} assigned orders`
		);

		// Step 8: Test total amount filtering
		console.log("\nStep 8: Testing total amount filter...");
		const amountRangeResponse = await axios.get(
			`${BASE_URL}/orders?minTotal=10&maxTotal=100&limit=5`,
			{
				headers: { Authorization: `Bearer ${token}` },
			}
		);
		console.log(
			`✅ Found ${amountRangeResponse.data.pagination.totalOrders} orders between €10-€100`
		);

		// Step 9: Test combined filters
		console.log("\nStep 9: Testing combined filters...");
		const combinedResponse = await axios.get(
			`${BASE_URL}/orders?status=confirmed,processing&paymentStatus=paid&assignedRider=unassigned&minTotal=5&limit=3`,
			{ headers: { Authorization: `Bearer ${token}` } }
		);
		console.log(
			`✅ Found ${combinedResponse.data.pagination.totalOrders} orders with combined filters:`
		);
		console.log("   - Status: confirmed or processing");
		console.log("   - Payment: paid");
		console.log("   - Rider: unassigned");
		console.log("   - Minimum total: €5");

		// Step 10: Test search with filters
		console.log("\nStep 10: Testing search with status filter...");
		const searchWithFilterResponse = await axios.get(
			`${BASE_URL}/orders?search=test&status=pending,confirmed&limit=5`,
			{ headers: { Authorization: `Bearer ${token}` } }
		);
		console.log(
			`✅ Found ${searchWithFilterResponse.data.pagination.totalOrders} orders matching search with status filter`
		);

		// Step 11: Display available filter options
		console.log("\n📚 Available Filter Options:");
		console.log(
			"   🔹 status: single value, multiple (comma-separated), or exclude (!status)"
		);
		console.log(
			"     Examples: status=pending, status=pending,confirmed, status=!cancelled"
		);
		console.log("   🔹 paymentStatus: single or multiple values");
		console.log(
			"     Examples: paymentStatus=paid, paymentStatus=pending,paid"
		);
		console.log("   🔹 dateFrom & dateTo: date range filtering");
		console.log("     Examples: dateFrom=2023-12-01&dateTo=2023-12-07");
		console.log(
			"   🔹 assignedRider: unassigned, assigned, or specific rider ID"
		);
		console.log(
			"     Examples: assignedRider=unassigned, assignedRider=assigned"
		);
		console.log("   🔹 minTotal & maxTotal: amount range filtering");
		console.log("     Examples: minTotal=10&maxTotal=100");
		console.log(
			"   🔹 search: search in order number, customer name, email, phone"
		);
		console.log("   🔹 isActive: true, false, or all");
		console.log("   🔹 sortBy: createdAt, total, status, etc.");
		console.log("   🔹 sortOrder: asc or desc");
		console.log("   🔹 page & limit: pagination");

		console.log("\n🎉 All filtering tests completed successfully!");
	} catch (error) {
		console.error("❌ Test failed:");
		if (error.response) {
			console.error(`Status: ${error.response.status}`);
			console.error(`Message: ${error.response.data.message}`);
		} else {
			console.error(`Error: ${error.message}`);
		}
	}
}

// Run the test
testOrderFiltering();
