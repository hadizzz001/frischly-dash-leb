
			// Check API status
			async function checkApiStatus() {
				try {
					const response = await fetch(`${API_BASE_URL}/health`);
					const data = await response.json();

					if (data.success) {
						document.getElementById("api-status").innerHTML =
							'<span class="status-online">✅ API Server Online</span>';
					} else {
						throw new Error("API returned error");
					}
				} catch (error) {
					document.getElementById("api-status").innerHTML =
						'<span class="status-offline">❌ API Server Offline</span>';
				}
			}

			// If the user is already signed in, skip the landing page and go
			// straight to the product table page for their role.
			//
			// The destination MUST match the role's access rights. Sending every
			// role to the same page caused a redirect loop: a "market" user was
			// sent to /market-products (admin-only), which forwarded to
			// /dashboard, which rejected "market" and forwarded to signin, which
			// saw the token and started over. getProductPageForRole() (config.js)
			// resolves the page each role can actually open.
			//
			// `replace` keeps this page out of history so Back doesn't re-trigger
			// the redirect.
			const currentToken = localStorage.getItem("authToken");
			if (currentToken) {
				redirectSignedInUser();
			}

			async function redirectSignedInUser() {
				try {
					const response = await fetch(`${API_BASE_URL}/auth/me`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					if (!response.ok) {
						// Token is stale/invalid — drop it and stay on the landing page
						// so the user can sign in again (never bounce in a loop).
						localStorage.removeItem("authToken");
						return;
					}

					const result = await response.json();
					const role = result?.data?.user?.role || result?.data?.role;
					window.location.replace(getProductPageForRole(role));
				} catch (error) {
					// Network/API problem: stay put rather than redirect blindly.
					console.error("Could not resolve landing page:", error);
				}
			}

			// Check API status when page loads
			document.addEventListener("DOMContentLoaded", checkApiStatus);
		