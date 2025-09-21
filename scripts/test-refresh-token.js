// Use built-in fetch or http module
const http = require("http");
const https = require("https");

function makeRequest(url, options) {
	return new Promise((resolve, reject) => {
		const lib = url.startsWith("https") ? https : http;
		const req = lib.request(url, options, (res) => {
			let data = "";
			res.on("data", (chunk) => (data += chunk));
			res.on("end", () => {
				try {
					const parsed = JSON.parse(data);
					resolve({
						ok: res.statusCode >= 200 && res.statusCode < 300,
						status: res.statusCode,
						json: () => parsed,
					});
				} catch (e) {
					resolve({
						ok: res.statusCode >= 200 && res.statusCode < 300,
						status: res.statusCode,
						text: () => data,
					});
				}
			});
		});
		req.on("error", reject);
		if (options.body) {
			req.write(options.body);
		}
		req.end();
	});
}

async function testRefreshToken() {
	try {
		// First, let's try to login to get tokens
		console.log("🔐 Testing login to get tokens...");
		const loginResponse = await makeRequest(
			"http://localhost:3001/api/auth/login",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email: "admin@frischly.com",
					password: "Admin123!",
				}),
			}
		);

		if (!loginResponse.ok) {
			console.error(
				"❌ Login failed:",
				loginResponse.text ? loginResponse.text() : loginResponse.status
			);
			return;
		}

		const loginData = loginResponse.json();
		console.log("✅ Login successful");
		console.log(
			"📝 Access Token:",
			loginData.data.token.substring(0, 20) + "..."
		);
		console.log(
			"🔄 Refresh Token:",
			loginData.data.refreshToken.substring(0, 20) + "..."
		);

		// Now test the refresh endpoint
		console.log("\n🔄 Testing refresh token endpoint...");
		const refreshResponse = await makeRequest(
			"http://localhost:3001/api/auth/refresh",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					refreshToken: loginData.data.refreshToken,
				}),
			}
		);

		if (!refreshResponse.ok) {
			console.error("❌ Refresh failed:", refreshResponse.error);
			return;
		}

		const refreshData = refreshResponse.json();
		console.log("✅ Token refresh successful");
		console.log(
			"📝 New Access Token:",
			refreshData.data.token.substring(0, 20) + "..."
		);
		console.log(
			"🔄 New Refresh Token:",
			refreshData.data.refreshToken.substring(0, 20) + "..."
		);

		// Test using the new token
		console.log("\n🧪 Testing new token with protected endpoint...");
		const testResponse = await makeRequest(
			"http://localhost:3001/api/auth/me",
			{
				headers: {
					Authorization: `Bearer ${refreshData.data.token}`,
				},
			}
		);

		if (testResponse.ok) {
			const userData = testResponse.json();
			console.log("✅ New token works! User:", userData.data.user.name);
		} else {
			console.error("❌ New token failed:", testResponse.error);
		}
	} catch (error) {
		console.error("💥 Test error:", error.message);
	}
}

// Run the test
testRefreshToken();
