
			const API_BASE_URL = window.location.origin;
			const form = document.getElementById("reset-password-form");
			const formSection = document.getElementById("form-section");
			const successSection = document.getElementById("success-section");
			const errorSection = document.getElementById("error-section");
			const loadingSection = document.getElementById("loading-section");
			const submitBtn = document.getElementById("submit-btn");
			const errorTitle = document.getElementById("error-title");
			const errorMessage = document.getElementById("error-message");
			const resetTokenInput = document.getElementById("reset-token");

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
					document.getElementById("form-title").textContent = "Reset Password";
					document.getElementById("form-subtitle").textContent =
						"Enter your new password below.";
					document.querySelector('label[for="new-password"]').textContent =
						"New Password *";
					document.getElementById("new-password").placeholder =
						"Enter new password";
					document.getElementById("password-help").textContent =
						"Password must be at least 6 characters with uppercase, lowercase, and number.";
					document.querySelector('label[for="confirm-password"]').textContent =
						"Confirm Password *";
					document.getElementById("confirm-password").placeholder =
						"Confirm new password";
					submitBtn.textContent = "Reset Password";
					document.querySelector(".form-footer p:first-child").innerHTML =
						'Remember your password? <a href="signin.html">Sign In</a>';
					document.querySelector(".form-footer p:last-child").innerHTML =
						'Forgot password? <a href="forgot-password.html">Reset Password</a>';
					document.querySelector("#success-section h2").textContent =
						"Password Reset Successful";
					document.querySelector("#success-section p").textContent =
						"Your password has been successfully reset. You can now sign in with your new password.";
					document.querySelector("#success-section .btn").textContent =
						"Close Page";
					document.querySelector("#error-section .btn").textContent =
						"Request New Reset";
					document.querySelector("#loading-section h2").textContent =
						"Verifying Link...";
					document.querySelector("#loading-section p").textContent =
						"Please wait while we verify your reset link.";
				}
				// For "bilingual" or any other value, keep the default bilingual text from HTML
			}

			// Get token from URL and validate it
			function initializePage() {
				const urlParams = new URLSearchParams(window.location.search);
				const token = urlParams.get("token");

				if (!token) {
					showError(
						"Invalid Reset Link",
						"No reset token provided in the URL."
					);
					return;
				}

				resetTokenInput.value = token;

				// Show loading while we could potentially verify the token
				// For now, we'll just proceed since the backend will validate it
				loadingSection.classList.remove("hidden");
				loadingSection.classList.add("visible-block");
				setTimeout(() => {
					loadingSection.classList.add("hidden");
					loadingSection.classList.remove("visible-block");
					formSection.classList.remove("hidden");
					formSection.classList.add("visible-block");
				}, 1000);
			}

			form.addEventListener("submit", async (e) => {
				e.preventDefault();

				const newPassword = document.getElementById("new-password").value;
				const confirmPassword =
					document.getElementById("confirm-password").value;
				const token = resetTokenInput.value;

				// Validate passwords match
				if (newPassword !== confirmPassword) {
					showError(
						"Password Mismatch",
						"Passwords do not match. Please try again."
					);
					return;
				}

				// Validate password strength
				if (newPassword.length < 6) {
					showError(
						"Weak Password",
						"Password must be at least 6 characters long."
					);
					return;
				}

				const hasLower = /[a-z]/.test(newPassword);
				const hasUpper = /[A-Z]/.test(newPassword);
				const hasNumber = /\d/.test(newPassword);

				if (!hasLower || !hasUpper || !hasNumber) {
					showError(
						"Weak Password",
						"Password must contain at least one lowercase letter, one uppercase letter, and one number."
					);
					return;
				}

				// Show loading state
				submitBtn.disabled = true;
				submitBtn.textContent = "Resetting...";

				try {
					const response = await fetchWithTimeout(
						`${API_BASE_URL}/api/auth/reset-password`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								token: token,
								newPassword: newPassword,
							}),
						}
					);

					const data = await response.json();

					if (response.ok) {
						showSuccess();
					} else {
						if (response.status === 400 && data.message.includes("token")) {
							showError(
								"Invalid Reset Link",
								"This password reset link is invalid or has expired. Please request a new password reset."
							);
						} else {
							showError(
								"Reset Failed",
								data.message ||
									"An error occurred while resetting your password."
							);
						}
					}
				} catch (error) {
					console.error("Reset password error:", error);
					showError("Network Error", getFriendlyNetworkErrorMessage(error));
				} finally {
					submitBtn.disabled = false;
					submitBtn.textContent = "Reset Password";
				}
			});

			function showSuccess() {
				formSection.classList.add("hidden");
				formSection.classList.remove("visible-block");
				successSection.classList.remove("hidden");
				successSection.classList.add("visible-block");
				errorSection.classList.add("hidden");
				errorSection.classList.remove("visible-block");
				loadingSection.classList.add("hidden");
				loadingSection.classList.remove("visible-block");
			}

			function showError(title, message) {
				errorTitle.textContent = title;
				errorMessage.textContent = message;
				formSection.classList.add("hidden");
				formSection.classList.remove("visible-block");
				successSection.classList.add("hidden");
				successSection.classList.remove("visible-block");
				errorSection.classList.remove("hidden");
				errorSection.classList.add("visible-block");
				loadingSection.classList.add("hidden");
				loadingSection.classList.remove("visible-block");
			}

			// Initialize page
			document.addEventListener("DOMContentLoaded", function () {
				updatePageLanguage();
				initializePage();
			});
		