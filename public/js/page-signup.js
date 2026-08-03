
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
			// getProductPageForRole() (config.js) resolves a page the role can
			// actually open, which avoids the redirect loop that occurred when
			// every role was sent to the same admin-only page.
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
						// Stale/invalid token — clear it and show the sign-up form.
						localStorage.removeItem("authToken");
						return;
					}

					const result = await response.json();
					const role = result?.data?.user?.role || result?.data?.role;
					window.location.replace(getProductPageForRole(role));
				} catch (error) {
					console.error("Could not resolve landing page:", error);
				}
			}

			// Sign Up Form Handler
			document
				.getElementById("signup-form")
				.addEventListener("submit", async (e) => {
					e.preventDefault();
					showLoading(true);
					clearMessage();

					const formData = new FormData(e.target);
					const data = {
						name: formData.get("name"),
						phoneNumber: formData.get("phoneNumber"),
						email: formData.get("email"),
						password: formData.get("password"),
						address: {
							street: formData.get("street"),
							city: formData.get("city"),
						},
					};

					// Validate required fields
					const requiredFields = ["name", "phoneNumber", "email", "password"];
					const addressFields = ["street", "city"];

					for (let field of requiredFields) {
						if (!data[field] || data[field].trim() === "") {
							showMessage(`${field} is required`, "error");
							showLoading(false);
							return;
						}
					}

					for (let field of addressFields) {
						if (!data.address[field] || data.address[field].trim() === "") {
							showMessage(`Address ${field} is required`, "error");
							showLoading(false);
							return;
						}
					}
					try {
						const response = await fetch(`${API_BASE_URL}/auth/register`, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify(data),
						});

						const result = await response.json();

						if (response.ok) {
							showMessage(
								"Account created successfully! Redirecting to sign in...",
								"success"
							);

							// Redirect to signin with success message after short delay
							setTimeout(() => {
								window.location.href = "signin.html?signup=success";
							}, 1500);
						} else {
							if (result.errors && Array.isArray(result.errors)) {
								const errorMessages = result.errors
									.map((err) => err.msg)
									.join("<br>");
								showMessage(errorMessages, "error");
							} else {
								showMessage(
									result.message || "Registration failed. Please try again.",
									"error"
								);
							}
						}
					} catch (error) {
						showMessage(
							"Network error. Please check if the server is running.",
							"error"
						);
						console.error("Registration error:", error);
					}

					showLoading(false);
				});
		