
			// Get order ID from URL parameters
			const urlParams = new URLSearchParams(window.location.search);
			const orderId = urlParams.get("order");

			if (orderId) {
				console.log("Payment cancelled for order:", orderId);
				// You can add additional logic here, like tracking or API calls
			}
		