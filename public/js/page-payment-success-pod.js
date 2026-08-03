
			// Get order ID from URL parameters
			const urlParams = new URLSearchParams(window.location.search);
			const orderId = urlParams.get("order");

			if (orderId) {
				console.log("Order confirmed (POD) for order:", orderId);
			}
		