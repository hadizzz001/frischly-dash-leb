// Script to test the enhanced Zone API endpoints
// Usage: node scripts/testEnhancedZoneAPI.js

const axios = require("axios");
require("dotenv").config();

const API_BASE_URL = "http://localhost:3000/api";

async function testEnhancedZoneAPI() {
	try {
		console.log("🧪 Testing Enhanced Zone API Endpoints\n");

		// Test 1: Get all zones (should show our German zones)
		console.log("📍 Test 1: Getting all zones...");
		const zonesResponse = await axios.get(`${API_BASE_URL}/zones`);
		console.log(`✅ Found ${zonesResponse.data.data.zones.length} zones`);

		const testZone = zonesResponse.data.data.zones.find(
			(z) => z.zoneName === "Weyhe"
		);
		const testZoneId = testZone
			? testZone._id
			: zonesResponse.data.data.zones[0]._id;
		console.log(
			`Using test zone: ${
				testZone ? testZone.zoneName : zonesResponse.data.data.zones[0].zoneName
			} (ID: ${testZoneId})`
		);

		// Test 2: Calculate dynamic delivery fee
		console.log("\n💰 Test 2: Calculating dynamic delivery fee...");
		try {
			const dynamicFeeResponse = await axios.post(
				`${API_BASE_URL}/zones/${testZoneId}/calculate-dynamic-fee`,
				{
					orderTime: "2025-09-16T19:30:00Z", // Peak time
					baseRate: 3.0,
				}
			);
			console.log("✅ Dynamic fee calculation successful:");
			console.log(`   Fee: €${dynamicFeeResponse.data.data.deliveryFee}`);
			console.log(
				`   Estimated time: ${dynamicFeeResponse.data.data.estimatedDeliveryTime} minutes`
			);
			console.log(
				`   Dynamic pricing: ${
					dynamicFeeResponse.data.data.isDynamicPricing ? "Enabled" : "Disabled"
				}`
			);
			console.log(
				`   Available: ${
					dynamicFeeResponse.data.data.isDeliveryAvailable ? "Yes" : "No"
				}`
			);
		} catch (error) {
			console.log(
				"❌ Dynamic fee calculation failed:",
				error.response?.data?.error || error.message
			);
		}

		// Test 3: Find suitable zones for order
		console.log("\n🛒 Test 3: Finding suitable zones for order...");
		try {
			const suitableZonesResponse = await axios.post(
				`${API_BASE_URL}/zones/find-suitable`,
				{
					zipCode: "28844",
					orderValue: 25.5,
					orderWeight: 3.2,
					orderTime: "2025-09-16T15:00:00Z",
				}
			);
			console.log("✅ Suitable zones search successful:");
			console.log(
				`   Found ${suitableZonesResponse.data.data.count} suitable zones`
			);
			suitableZonesResponse.data.data.zones.forEach((zone) => {
				console.log(
					`   - ${zone.zoneName}: €${zone.deliveryFee}, ${zone.estimatedDeliveryTime}min`
				);
			});
		} catch (error) {
			console.log(
				"❌ Suitable zones search failed:",
				error.response?.data?.error || error.message
			);
		}

		// Test 4: Get zone delivery schedule
		console.log("\n📅 Test 4: Getting zone delivery schedule...");
		try {
			const scheduleResponse = await axios.get(
				`${API_BASE_URL}/zones/${testZoneId}/delivery-schedule`,
				{
					params: { date: "2025-09-16" },
				}
			);
			console.log("✅ Delivery schedule retrieved:");
			console.log(
				`   Available: ${
					scheduleResponse.data.data.schedule.isAvailable ? "Yes" : "No"
				}`
			);
			console.log(`   Day: ${scheduleResponse.data.data.schedule.dayName}`);
			console.log(
				`   Morning delivery: ${scheduleResponse.data.data.schedule.deliveryTimeRanges.morning.estimatedTime}min`
			);
			console.log(
				`   Afternoon delivery: ${scheduleResponse.data.data.schedule.deliveryTimeRanges.afternoon.estimatedTime}min`
			);
			console.log(
				`   Evening delivery: ${scheduleResponse.data.data.schedule.deliveryTimeRanges.evening.estimatedTime}min`
			);
		} catch (error) {
			console.log(
				"❌ Delivery schedule failed:",
				error.response?.data?.error || error.message
			);
		}

		// Test 5: Find zone by zip code (including additional zip codes)
		console.log("\n📍 Test 5: Finding zone by zip code...");
		try {
			const zipResponse = await axios.get(
				`${API_BASE_URL}/zones/zipcode/28844`
			);
			console.log("✅ Zone found by zip code:");
			console.log(`   Zone: ${zipResponse.data.data.zoneName}`);
			console.log(`   Primary zip: ${zipResponse.data.data.zipCode}`);
			console.log(
				`   Additional zips: ${
					zipResponse.data.data.additionalZipCodes
						? zipResponse.data.data.additionalZipCodes.join(", ")
						: "None"
				}`
			);
		} catch (error) {
			console.log(
				"❌ Zone by zip code failed:",
				error.response?.data?.error || error.message
			);
		}

		// Test 6: Calculate basic delivery fee (existing endpoint)
		console.log("\n💵 Test 6: Calculating basic delivery fee...");
		try {
			const basicFeeResponse = await axios.post(
				`${API_BASE_URL}/zones/calculate-delivery`,
				{
					zoneId: testZoneId,
					baseRate: 2.5,
				}
			);
			console.log("✅ Basic fee calculation successful:");
			console.log(`   Fee: €${basicFeeResponse.data.data.deliveryFee}`);
			console.log(
				`   Time: ${basicFeeResponse.data.data.formattedDeliveryTime}`
			);
		} catch (error) {
			console.log(
				"❌ Basic fee calculation failed:",
				error.response?.data?.error || error.message
			);
		}

		console.log("\n🎉 Enhanced Zone API testing completed!");
	} catch (error) {
		console.error("❌ Error testing enhanced Zone API:", error.message);
		if (error.code === "ECONNREFUSED") {
			console.log("💡 Make sure the server is running on port 3000");
		}
	}
}

// Check if axios is available
if (typeof axios === "undefined") {
	console.log("❌ axios is not installed. Installing...");
	console.log("Run: npm install axios");
	process.exit(1);
}

testEnhancedZoneAPI();
