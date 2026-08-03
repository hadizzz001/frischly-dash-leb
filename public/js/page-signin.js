
			// Define helper functions first
			function showMessage(message, type) {
				const messageDiv = document.getElementById("message");
				if (messageDiv) {
					messageDiv.innerHTML = `<div class="message ${type}">${message}</div>`;
				}
			}

			// Show/hide the password field when the eye icon is clicked.
			function togglePassword(btn) {
				const wrap = btn.closest(".password-wrap");
				const input = wrap && wrap.querySelector("input");
				if (!input) return;
				const willShow = input.type === "password";
				input.type = willShow ? "text" : "password";
				btn.classList.toggle("is-visible", willShow);
				btn.setAttribute("aria-pressed", String(willShow));
				btn.setAttribute(
					"aria-label",
					willShow ? "Hide password" : "Show password"
				);
				input.focus();
			}

			function clearMessage() {
				const messageDiv = document.getElementById("message");
				if (messageDiv) {
					messageDiv.innerHTML = "";
				}
			}

			function showLoading(show) {
				const loadingDiv = document.getElementById("loading");
				if (loadingDiv) {
					loadingDiv.style.display = show ? "block" : "none";
				}
				const btn = document.querySelector(".btn");
				if (btn) {
					btn.disabled = show;
				}
			}

			// If the user is already signed in, go straight to the product table
			// page for their role instead of showing a chooser screen.
			//
			// The destination MUST match the role's access rights. Sending every
			// role to one page caused a redirect loop: a "market" user went to
			// /market-products (admin-only), which forwarded to /dashboard, which
			// rejected "market" and forwarded back here, which saw the token and
			// started over. getProductPageForRole() (config.js) resolves a page the
			// role can actually open.
			const currentToken = localStorage.getItem("authToken");

			// Loop-breaker. If we bounce back here shortly after auto-redirecting,
			// the destination rejected the user and sent them straight back. Rather
			// than ping-pong forever, drop the credentials and show the sign-in
			// form. This is a safety net: it makes ANY future gate mismatch
			// degrade into "please sign in again" instead of a frozen browser.
			const BOUNCE_KEY = "signinRedirectAt";
			const BOUNCE_WINDOW_MS = 5000;

			function clearAllTokens() {
				[
					"authToken",
					"refreshToken",
					"token",
					"marketToken",
					"marketData",
				].forEach((k) => localStorage.removeItem(k));
			}

			if (currentToken) {
				const lastRedirectAt = Number(sessionStorage.getItem(BOUNCE_KEY) || 0);
				if (lastRedirectAt && Date.now() - lastRedirectAt < BOUNCE_WINDOW_MS) {
					sessionStorage.removeItem(BOUNCE_KEY);
					clearAllTokens();
					showMessage(
						"Your session isn't valid for that page. Please sign in again.",
						"error"
					);
				} else {
					redirectSignedInUser();
				}
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
						// Stale/invalid token — clear everything and show the sign-in
						// form rather than bouncing the user around in a loop.
						clearAllTokens();
						return;
					}

					const result = await response.json();
					const role = result?.data?.user?.role || result?.data?.role;

					// Record the redirect so that, if the destination sends the user
					// back here, the loop-breaker above catches it.
					sessionStorage.setItem(BOUNCE_KEY, String(Date.now()));
					window.location.replace(getProductPageForRole(role));
				} catch (error) {
					// Network/API problem: stay on the sign-in form.
					console.error("Could not resolve landing page:", error);
				}
			}

			// Check for signup success message from URL parameters
			document.addEventListener("DOMContentLoaded", function () {
				const urlParams = new URLSearchParams(window.location.search);
				if (urlParams.get("signup") === "success") {
					showMessage(
						"Account created successfully! Please sign in with your credentials.",
						"success"
					);
					// Clean up the URL without refreshing the page
					window.history.replaceState(
						{},
						document.title,
						window.location.pathname
					);
				}
			});

			// Sign In Form Handler
			document
				.getElementById("signin-form")
				.addEventListener("submit", async (e) => {
					e.preventDefault();
					showLoading(true);
					clearMessage();

					const formData = new FormData(e.target);
					const data = {
						email: formData.get("email"),
						password: formData.get("password"),
					};

					try {
						const response = await fetch(`${API_BASE_URL}/auth/login-profile`, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify(data),
						});

						const result = await response.json();

						if (response.ok) {
							console.log("Login successful:", result);
							showMessage("Login successful! Redirecting...", "success");
							// Fresh credentials — reset the bounce guard so a later
							// legitimate visit isn't mistaken for a redirect loop.
							sessionStorage.removeItem(BOUNCE_KEY);
							localStorage.setItem("authToken", result.data.token);
							localStorage.setItem("refreshToken", result.data.refreshToken);
							if (result.data.user && result.data.user.role === "market") {
								localStorage.setItem("marketToken", result.data.token);
								localStorage.setItem(
									"marketData",
									JSON.stringify(result.data.market || result.data.user)
								);
							} else if (
								result.data.user &&
								["market_staff", "market_manager"].includes(
									result.data.user.role
								)
							) {
								// Market-scoped staff/manager accounts also need a
								// `marketToken` so ordermanagement.html (and any other
								// page that keys off marketToken) recognizes them as
								// operating in a market context.
								localStorage.setItem("marketToken", result.data.token);
							}

							// Role-based redirect. Every role signs in here, then lands on
							// its own dashboard. getProductPageForRole() (config.js) is the
							// single source of truth shared with the already-signed-in
							// redirect, so the two can never disagree and cause a loop.
							const role = result.data.user && result.data.user.role;
							let redirectUrl;

							if (role === "customer") {
								redirectUrl = SHOP_URL;
							} else if (role === "rider" || role === "market_driver") {
								redirectUrl = "/profile";
							} else if (role === "staff") {
								redirectUrl = "/ordermanagement";
							} else if (["market_staff", "market_manager"].includes(role)) {
								redirectUrl = "/ordermanagement?ctx=market";
							} else {
								// market -> /market-dashboard, admin/manager -> /dashboard,
								// anything else -> /profile
								redirectUrl = getProductPageForRole(role);
							}

							setTimeout(() => {
								window.location.replace(redirectUrl);
							}, 500);
						} else {
							showMessage(
								result.message ||
									"Login failed. Please check your credentials.",
								"error"
							);
						}
					} catch (error) {
						showMessage(
							"Network error. Please check if the server is running.",
							"error"
						);
						console.error("Login error:", error);
					}

					showLoading(false);
				});
		