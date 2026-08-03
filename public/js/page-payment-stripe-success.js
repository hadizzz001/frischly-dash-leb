
			document.addEventListener("DOMContentLoaded", async () => {
				const urlParams = new URLSearchParams(window.location.search);
				const sessionId = urlParams.get("session_id");
				const orderId = urlParams.get("order");

				if (!sessionId || !orderId) {
					showError("Invalid payment details.");
					return;
				}

				try {
					const response = await fetch(`/api/orders/verify-payment`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ sessionId, orderId }),
					});

					const data = await response.json();

					if (data.success) {
						showSuccess();
					} else {
						showError(data.message || "Payment verification failed.");
					}
				} catch (error) {
					console.error("Error verifying payment:", error);
					showError("An error occurred while verifying payment.");
				}
			});

			function showSuccess() {
				document.getElementById("loader").classList.add("hidden");
				document.getElementById("successIcon").classList.remove("hidden");
				document.getElementById("successIcon").classList.add("visible-block");
				document.getElementById("title").innerText = "Payment Successful!";
				document.getElementById("title").classList.add("title-success");
				document.getElementById("message").innerHTML = `
					Thank you for your payment. Your order has been confirmed.
				`;
				document.getElementById("closeBtn").classList.remove("hidden");
				document.getElementById("closeBtn").classList.add("visible-inline-block");
			}

			function showError(msg) {
				document.getElementById("loader").classList.add("hidden");
				document.getElementById("errorIcon").classList.remove("hidden");
				document.getElementById("errorIcon").classList.add("visible-block");
				document.getElementById("title").innerText = "Payment Failed";
				document.getElementById("title").classList.add("title-error");
				document.getElementById("message").innerText = msg;
				document.getElementById("closeBtn").innerText = "Close";
				document.getElementById("closeBtn").classList.remove("hidden");
				document.getElementById("closeBtn").classList.add("visible-inline-block");
			}
		