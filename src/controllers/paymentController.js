const PayoneService = require("../services/payoneService");
const Order = require("../models/Order");

// Initialize PAYONE Service
const payoneService = new PayoneService(
	process.env.MERCHANT_ID,
	process.env.ACCOUNT_ID,
	process.env.PORTAL_ID,
	process.env.PORTAL_KEY,
	process.env.PAYONE_API_BASE_URL || "https://onelink.pay1.de/api"
);

/**
 * Update order payment status based on payment link ID
 * @param {string} paymentLinkId - PAYONE payment link ID
 * @param {string} paymentStatus - New payment status ('pending', 'paid', 'failed')
 */
async function updateOrderPaymentStatus(paymentLinkId, paymentStatus) {
	try {
		console.log(`🔄 Updating order payment status for link ${paymentLinkId} to ${paymentStatus}`);

		// Find order by payment link ID
		const order = await Order.findOne({ paymentLinkId });

		if (!order) {
			console.error(`❌ Order not found for payment link ID: ${paymentLinkId}`);
			return;
		}

		// Update payment status
		order.paymentStatus = paymentStatus;
		await order.save();

		console.log(`✅ Updated order ${order._id} payment status to ${paymentStatus}`);

		// Additional actions based on payment status
		if (paymentStatus === 'paid') {
			// Could send payment confirmation email, update order status, etc.
			console.log(`💰 Payment completed for order ${order._id}`);
		} else if (paymentStatus === 'failed') {
			// Could notify user of payment failure
			console.log(`❌ Payment failed for order ${order._id}`);
		}

	} catch (error) {
		console.error(`❌ Error updating order payment status:`, error);
	}
}

// Export the function for testing
module.exports.updateOrderPaymentStatus = updateOrderPaymentStatus;

/**
 * Create a payment link
 * @route POST /api/payments/payment-links
 * @param {Object} req.body - Payment link data
 * @returns {JSON} Payment link response
 */
exports.createPaymentLink = async (req, res) => {
	try {
		console.log(
			"Creating payment link with data:",
			JSON.stringify(req.body, null, 2)
		);

		const result = await payoneService.createPaymentLink(req.body);

		if (result.success) {
			res.status(201).json(result);
		} else {
			res.status(400).json(result);
		}
	} catch (error) {
		console.error("Error in createPaymentLink:", error);
		res.status(500).json({
			success: false,
			error: "Internal server error",
			message: error.message,
		});
	}
};

/**
 * Create a simple payment link with minimal required fields
 * @route POST /api/payments/create-simple-link
 * @param {Object} req.body - Payment link data (reference, shoppingCart, currency, etc.)
 * @returns {JSON} Payment link response
 */
exports.createSimplePaymentLink = async (req, res) => {
	try {
		console.log(
			"\n╔═══════════════════════════════════════════════════════════╗"
		);
		console.log("║     API ENDPOINT: Create Simple Payment Link             ║");
		console.log(
			"╚═══════════════════════════════════════════════════════════╝"
		);
		console.log("Request body received:", JSON.stringify(req.body, null, 2));

		const {
			reference,
			shoppingCart,
			currency = "EUR",
			description = "Payment",
			mode = "test",
			lastName = "Doe",
			country = "DE",
			paymentMethods = ["visa", "mastercard", "paypal"],
		} = req.body;

		console.log("→ Validating required fields...");
		if (!reference) {
			console.error("❌ Validation failed: Missing reference");
			return res.status(400).json({
				success: false,
				error: "Missing required field: reference",
			});
		}

		if (
			!shoppingCart ||
			!Array.isArray(shoppingCart) ||
			shoppingCart.length === 0
		) {
			console.error("❌ Validation failed: Missing or invalid shoppingCart");
			return res.status(400).json({
				success: false,
				error:
					"ShoppingCart is required and must be a non-empty array (1-400 items)",
			});
		}

		if (shoppingCart.length > 400) {
			console.error("❌ Validation failed: Too many items in shoppingCart");
			return res.status(400).json({
				success: false,
				error: "ShoppingCart cannot have more than 400 items",
			});
		}

		// Validate each cart item
		for (let i = 0; i < shoppingCart.length; i++) {
			const item = shoppingCart[i];
			if (
				!item.type ||
				!["goods", "shipment", "handling", "voucher"].includes(item.type)
			) {
				console.error(`❌ Validation failed: Invalid type for item ${i + 1}`);
				return res.status(400).json({
					success: false,
					error: `Item ${
						i + 1
					}: type must be one of: goods, shipment, handling, voucher`,
				});
			}
			if (
				!item.number ||
				typeof item.number !== "string" ||
				item.number.length < 1 ||
				item.number.length > 32
			) {
				console.error(`❌ Validation failed: Invalid number for item ${i + 1}`);
				return res.status(400).json({
					success: false,
					error: `Item ${
						i + 1
					}: number is required and must be 1-32 characters`,
				});
			}
			if (
				typeof item.price !== "number" ||
				item.price < -1999999999 ||
				item.price > 1999999999
			) {
				console.error(`❌ Validation failed: Invalid price for item ${i + 1}`);
				return res.status(400).json({
					success: false,
					error: `Item ${
						i + 1
					}: price must be between -1999999999 and 1999999999`,
				});
			}
			if (
				typeof item.quantity !== "number" ||
				item.quantity < 1 ||
				item.quantity > 999999
			) {
				console.error(
					`❌ Validation failed: Invalid quantity for item ${i + 1}`
				);
				return res.status(400).json({
					success: false,
					error: `Item ${i + 1}: quantity must be between 1 and 999999`,
				});
			}
		}

		console.log("✓ Required fields validation passed");

		// Create link data
		console.log("→ Preparing link data with minimum requirements...");
		const linkData = {
			reference,
			currency,
			mode,
			description,
			paymentMethods: Array.isArray(paymentMethods)
				? paymentMethods
				: ["visa", "mastercard", "paypal"],
			billing: {
				lastName: lastName,
				country: country,
			},
			shoppingCart: shoppingCart,
			language: "en_US",
			active: true,
		};
		console.log("Link data prepared:", JSON.stringify(linkData, null, 2));
		console.log("→ Calling payoneService.createPaymentLink()...");
		const result = await payoneService.createPaymentLink(linkData);

		console.log("→ Service call completed");
		if (result.success) {
			console.log("✓ Payment link created successfully");
			console.log("Link ID:", result.data.id);
			res.status(201).json(result);
		} else {
			console.error("❌ Payment link creation failed");
			console.error("Error:", result.error);
			res.status(400).json(result);
		}
	} catch (error) {
		console.error(
			"\n╔═══════════════════════════════════════════════════════════╗"
		);
		console.error(
			"║     ❌ CRITICAL ERROR in Simple Payment Link             ║"
		);
		console.error(
			"╚═══════════════════════════════════════════════════════════╝"
		);
		console.error("Error type:", error.name);
		console.error("Error message:", error.message);
		console.error("Error stack:", error.stack);
		res.status(500).json({
			success: false,
			error: "Internal server error",
			message: error.message,
		});
	}
};

/**
 * Get all payment links
 * @route GET /api/payments/payment-links
 * @param {Object} req.query - Query parameters (mode, page, limit)
 * @returns {JSON} List of payment links
 */
exports.getPaymentLinks = async (req, res) => {
	try {
		console.log("Getting payment links with params:", req.query);

		const result = await payoneService.getPaymentLinks(req.query);

		if (result.success) {
			res.json(result);
		} else {
			res.status(400).json(result);
		}
	} catch (error) {
		console.error("Error in getPaymentLinks:", error);
		res.status(500).json({
			success: false,
			error: "Internal server error",
			message: error.message,
		});
	}
};

/**
 * Get a specific payment link by ID
 * @route GET /api/payments/payment-links/:linkId
 * @param {string} req.params.linkId - Payment link ID
 * @returns {JSON} Payment link details
 */
exports.getPaymentLink = async (req, res) => {
	try {
		const { linkId } = req.params;
		console.log("Getting payment link:", linkId);

		const result = await payoneService.getPaymentLink(linkId);

		if (result.success) {
			res.json(result);
		} else {
			res.status(400).json(result);
		}
	} catch (error) {
		console.error("Error in getPaymentLink:", error);
		res.status(500).json({
			success: false,
			error: "Internal server error",
			message: error.message,
		});
	}
};

/**
 * Update a payment link
 * @route PUT /api/payments/payment-links/:linkId
 * @param {string} req.params.linkId - Payment link ID
 * @param {Object} req.body - Updated payment link data
 * @returns {JSON} Updated payment link response
 */
exports.updatePaymentLink = async (req, res) => {
	try {
		const { linkId } = req.params;
		console.log(
			"Updating payment link:",
			linkId,
			"with data:",
			JSON.stringify(req.body, null, 2)
		);

		const result = await payoneService.updatePaymentLink(linkId, req.body);

		if (result.success) {
			res.json(result);
		} else {
			res.status(400).json(result);
		}
	} catch (error) {
		console.error("Error in updatePaymentLink:", error);
		res.status(500).json({
			success: false,
			error: "Internal server error",
			message: error.message,
		});
	}
};

/**
 * Handle PAYONE Link Execution Notifications
 * @route POST /api/payments/linkExecutionNotification
 * @param {Object} req.body - PAYONE notification data following OpenAPI spec
 * @returns {String} "OK" for successful processing
 */
exports.handlePaymentNotification = async (req, res) => {
	try {
		console.log("=== PAYONE Link Execution Notification Received ===");
		console.log("Headers:", JSON.stringify(req.headers, null, 2));
		console.log("Body:", JSON.stringify(req.body, null, 2));

		// Extract notification data according to OpenAPI spec
		const { header, linkExecutionData } = req.body;

		if (!header || !linkExecutionData) {
			console.error("❌ Invalid notification format: missing header or linkExecutionData");
			return res.status(400).send("INVALID_FORMAT");
		}

		// Validate header
		if (!header.notificationType || header.notificationType.type !== 'PAYONE_LINK_EXECUTION') {
			console.error("❌ Invalid notification type");
			return res.status(400).send("INVALID_TYPE");
		}

		// Extract relevant data
		const {
			linkId,
			paymentProcess,
			executionStatus,
			paymentMethod,
			executionTime
		} = linkExecutionData;

		const { merchantId, portalId, mode } = header;

		console.log(`📧 Notification Details:`);
		console.log(`   - Link ID: ${linkId}`);
		console.log(`   - Payment Process: ${paymentProcess}`);
		console.log(`   - Execution Status: ${executionStatus}`);
		console.log(`   - Payment Method: ${paymentMethod}`);
		console.log(`   - Execution Time: ${executionTime}`);
		console.log(`   - Mode: ${mode}`);

		// Handle different execution statuses
		switch (executionStatus) {
			case 'APPROVED':
				console.log("✅ Payment APPROVED - Processing successful payment");
				// Update order status to paid
				await updateOrderPaymentStatus(linkId, 'paid');
				break;

			case 'REDIRECTED':
				console.log("🔄 Payment REDIRECTED - User was redirected to payment provider");
				// TODO: Handle redirect status if needed
				break;

			case 'PENDING':
				console.log("⏳ Payment PENDING - Payment is being processed");
				// Update order status to pending if needed
				await updateOrderPaymentStatus(linkId, 'pending');
				break;

			case 'ERROR':
				console.log("❌ Payment ERROR - Payment failed");
				// Update order status to failed
				await updateOrderPaymentStatus(linkId, 'failed');
				break;

			default:
				console.log(`⚠️ Unknown execution status: ${executionStatus}`);
		}

		// Validate X-Auth-Code header if provided (for additional security)
		const authCode = req.headers['x-auth-code'];
		if (authCode) {
			console.log("🔐 Auth code received - validating...");
			// TODO: Implement auth code validation if needed
		}

		// Always respond with "OK" for successful notification processing
		console.log("✅ Notification processed successfully");
		res.status(200).send("OK");

	} catch (error) {
		console.error("❌ Error processing payment notification:", error);
		// Still respond with OK to acknowledge receipt even if processing failed
		res.status(200).send("OK");
	}
};
