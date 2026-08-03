
			const API_BASE_URL = window.location.origin;
			const form = document.getElementById("forgot-password-form");
			const formSection = document.getElementById("form-section");
			const successSection = document.getElementById("success-section");
			const errorSection = document.getElementById("error-section");
			const submitBtn = document.getElementById("submit-btn");
			const errorMessage = document.getElementById("error-message");

			// Fetch wrapper that aborts (and rejects) if the request takes too
			// long, so a hung request (e.g. server waking up from idle) doesn't
			// leave the page waiting indefinitely before showing an error.
			async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
				try {
					return await fetch(url, { ...options, signal: controller.signal });
				} finally {
					clearTimeout(timeoutId);
				}
			}

			// Returns a user-friendly message for a failed fetch, distinguishing
			// between a timeout, being offline, and a generic connectivity issue.
			function getFriendlyNetworkErrorMessage(error) {
				if (error && error.name === "AbortError") {
					return "The request timed out. The server may be waking up from idle — please try again in a few seconds.";
				}
				if (typeof navigator !== "undefined" && navigator.onLine === false) {
					return "You appear to be offline. Please check your internet connection and try again.";
				}
				return "Network error. Please check your connection and try again.";
			}

			// Update page language based on URL parameter or localStorage
			function updatePageLanguage() {
				const urlParams = new URLSearchParams(window.location.search);
				const lang =
					urlParams.get("lang") ||
					localStorage.getItem("preferredLanguage") ||
					"bilingual"; // Default to bilingual

				if (lang === "en") {
					// English only
					document.getElementById("form-title").textContent = "Forgot Password";
					document.getElementById("form-subtitle").textContent =
						"Enter your email address and we'll send you a link to reset your password.";
					document.querySelector('label[for="email"]').textContent =
						"Email Address *";
					document.getElementById("email").placeholder =
						"Enter your email address";
					submitBtn.textContent = "Send Reset Link";
					document.querySelector("#success-section h2").textContent =
						"Check Your Email";
					document.querySelector("#success-section p").textContent =
						"We've sent a password reset link to your email address. Please check your inbox and follow the instructions.";
					document.querySelector("#success-section small").textContent =
						"The link will expire in 1 hour.";
					document.querySelector("#success-section .btn").textContent =
						"Back to Sign In";
					document.querySelector("#error-section h2").textContent =
						"Something Went Wrong";
					document.querySelector("#error-section .btn").textContent =
						"Try Again";
				}
				// For "bilingual" or any other value, keep the default bilingual text from HTML
			}

			form.addEventListener("submit", async (e) => {
				e.preventDefault();

				const email = document.getElementById("email").value.trim();

				if (!email) {
					showError("Please enter your email address.");
					return;
				}

				// Show loading state
				submitBtn.disabled = true;
				submitBtn.textContent = "Sending...";

				try {
					const response = await fetchWithTimeout(
						`${API_BASE_URL}/api/auth/forgot-password`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ email }),
						}
					);

					const data = await response.json();

					if (response.ok) {
						showSuccess();
					} else {
						showError(
							data.message || "An error occurred while sending the reset link."
						);
					}
				} catch (error) {
					console.error("Forgot password error:", error);
					showError(getFriendlyNetworkErrorMessage(error));
				} finally {
					submitBtn.disabled = false;
					const urlParams = new URLSearchParams(window.location.search);
					const lang =
						urlParams.get("lang") ||
						localStorage.getItem("preferredLanguage") ||
						"bilingual";
					if (lang === "de") {
						submitBtn.textContent = "Reset-Link senden";
					} else if (lang === "en") {
						submitBtn.textContent = "Send Reset Link";
					} else {
						submitBtn.textContent = "Send Reset Link";
					}
				}
			});

			function showSuccess() {
				formSection.classList.add("hidden");
				successSection.classList.remove("hidden");
				successSection.classList.add("visible-block");
				errorSection.classList.add("hidden");
			}

			function showError(message) {
				errorMessage.textContent = message;
				formSection.classList.add("hidden");
				successSection.classList.add("hidden");
				errorSection.classList.remove("hidden");
				errorSection.classList.add("visible-block");
			}

			function retryForm() {
				formSection.classList.remove("hidden");
				formSection.classList.add("visible-block");
				successSection.classList.add("hidden");
				errorSection.classList.add("hidden");
				document.getElementById("email").focus();
			}

			// Initialize page
			document.addEventListener("DOMContentLoaded", function () {
				updatePageLanguage();
			});
		