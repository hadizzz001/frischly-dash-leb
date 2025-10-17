const PayoneAuth = require("./payoneAuth");

class PayoneService {
	constructor(
		merchantId,
		accountId,
		portalId,
		portalKey,
		baseUrl = "https://onelink.pay1.de/api"
	) {
		if (!portalKey) {
			console.error(
				"❌ CRITICAL ERROR: PORTAL_KEY is not set in environment variables"
			);
			throw new Error(
				"PORTAL_KEY environment variable is required for PAYONE authentication"
			);
		}
		this.merchantId = merchantId;
		this.accountId = accountId;
		this.portalId = portalId;
		this.baseUrl = baseUrl;
		this.auth = new PayoneAuth(portalKey);
	}

	/**
	 * Calculate total amount from shopping cart items
	 * @param {Array} shoppingCart - Array of cart items
	 * @returns {number} Total amount in lowest denomination
	 */
	calculateTotalAmount(shoppingCart) {
		return shoppingCart.reduce((total, item) => {
			return total + item.price * item.quantity;
		}, 0);
	}

	/**
	 * Create a payment link
	 * @param {Object} linkData - Payment link data
	 * @returns {Promise<Object>} Created payment link response
	 */
	async createPaymentLink(linkData) {
		try {
			console.log("=== STEP 1: Starting Payment Link Creation ===");
			console.log("Input data received:", JSON.stringify(linkData, null, 2));

			// Validate minimum required fields
			console.log("=== STEP 2: Validating Minimum Requirements ===");

			// Validate reference
			if (!linkData.reference) {
				console.error("❌ Validation failed: Missing reference");
				throw new Error("Reference is required");
			}
			console.log("✓ Reference validated:", linkData.reference);

			// Validate paymentMethods
			if (
				!linkData.paymentMethods ||
				!Array.isArray(linkData.paymentMethods) ||
				linkData.paymentMethods.length === 0
			) {
				console.error(
					"❌ Validation failed: Missing or invalid paymentMethods"
				);
				throw new Error(
					"PaymentMethods is required and must be a non-empty array"
				);
			}
			console.log("✓ PaymentMethods validated:", linkData.paymentMethods);

			// Validate billing address with country and lastName
			if (!linkData.billing && !linkData.billingAddress) {
				console.error("❌ Validation failed: Missing billing address");
				throw new Error("Billing address is required");
			}

			const billing = linkData.billing || linkData.billingAddress;
			if (!billing.country) {
				console.error("❌ Validation failed: Missing billing.country");
				throw new Error("Billing country is required");
			}
			if (!billing.lastName) {
				console.error("❌ Validation failed: Missing billing.lastName");
				throw new Error("Billing lastName is required");
			}
			console.log("✓ Billing address validated:", {
				country: billing.country,
				lastName: billing.lastName,
			});

			console.log("✓ All minimum requirements validated successfully");

			// Calculate total amount from shopping cart
			console.log("=== STEP 3: Calculating Total Amount ===");
			const totalAmount = this.calculateTotalAmount(linkData.shoppingCart);
			console.log(
				`✓ Total amount calculated: ${totalAmount} (${(
					totalAmount / 100
				).toFixed(2)} ${linkData.currency || "EUR"})`
			);

			// Prepare the request body with required fields
			console.log("=== STEP 4: Preparing Request Body ===");
			const requestBody = {
				merchantId: this.merchantId,
				accountId: this.accountId,
				portalId: this.portalId,
				mode: linkData.mode || "test",
				currency: linkData.currency || "EUR",
				reference: linkData.reference,
				paymentMethods: linkData.paymentMethods,
				billing: billing,
				shoppingCart: linkData.shoppingCart,
				language: linkData.language || "en_US",
				active: linkData.active !== undefined ? linkData.active : true,
				...(linkData.intent && { intent: linkData.intent }),
				...(linkData.userId && { userId: linkData.userId }),
				...(linkData.customerId && { customerId: linkData.customerId }),
				...(linkData.expiration && { expiration: linkData.expiration }),
				...(linkData.description && { description: linkData.description }),
				...(linkData.shipping && { shipping: linkData.shipping }),
				...(linkData.logo && { logo: linkData.logo }),
				...(linkData.backgroundImage && {
					backgroundImage: linkData.backgroundImage,
				}),
				...(linkData.successUrl && { successUrl: linkData.successUrl }),
				...(linkData.errorUrl && { errorUrl: linkData.errorUrl }),
				...(linkData.backUrl && { backUrl: linkData.backUrl }),
				...(linkData.notifyUrl && { notifyUrl: linkData.notifyUrl }),
				...(linkData.email && { email: linkData.email }),
				...(linkData.invoiceInformation && {
					invoiceInformation: linkData.invoiceInformation,
				}),
				...(linkData.recurrence && { recurrence: linkData.recurrence }),
				...(linkData.termsAndConditionsUrl && {
					termsAndConditionsUrl: linkData.termsAndConditionsUrl,
				}),
			};
			console.log(
				"Request body prepared:",
				JSON.stringify(requestBody, null, 2)
			);

			// Generate authentication header
			console.log("=== STEP 5: Generating Authentication Header ===");
			const authHeader = this.auth.generateCreateAuth(
				this.merchantId,
				this.accountId,
				this.portalId,
				requestBody.mode,
				requestBody.reference,
				totalAmount,
				requestBody.currency
			);
			console.log("✓ Authentication header generated");

			// Make the API request
			console.log("=== STEP 6: Making API Request to PAYONE ===");
			console.log(`URL: ${this.baseUrl}/v1/payment-links`);
			const response = await fetch(`${this.baseUrl}/v1/payment-links`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: authHeader,
				},
				body: JSON.stringify(requestBody),
			});

			console.log(`Response status: ${response.status} ${response.statusText}`);

			if (!response.ok) {
				const errorData = await response.text();
				console.error("❌ API Error Response:", errorData);
				throw new Error(`PAYONE API Error: ${response.status} - ${errorData}`);
			}

			const result = await response.json();
			console.log("=== STEP 7: Payment Link Created Successfully ===");
			console.log("Response data:", JSON.stringify(result, null, 2));

			return {
				success: true,
				data: result,
				totalAmount: totalAmount,
			};
		} catch (error) {
			console.error("=== ❌ ERROR in Payment Link Creation ===");
			console.error("Error type:", error.name);
			console.error("Error message:", error.message);
			console.error("Error stack:", error.stack);
			return {
				success: false,
				error: error.message,
				details: error.stack,
			};
		}
	}

	/**
	 * Get all payment links
	 * @param {Object} params - Query parameters
	 * @returns {Promise<Object>} List of payment links
	 */
	async getPaymentLinks(params = {}) {
		try {
			const queryParams = new URLSearchParams({
				merchantId: this.merchantId,
				accountId: this.accountId,
				portalId: this.portalId,
				mode: params.mode || "test",
				page: params.page || 0,
				limit: params.limit || 25,
				...params,
			});

			// Generate authentication header
			const authHeader = this.auth.generateGetMultipleAuth(
				this.merchantId,
				this.accountId,
				this.portalId,
				params.mode || "test"
			);

			const response = await fetch(
				`${this.baseUrl}/v1/payment-links?${queryParams}`,
				{
					method: "GET",
					headers: {
						Authorization: authHeader,
					},
				}
			);

			if (!response.ok) {
				const errorData = await response.text();
				throw new Error(`PAYONE API Error: ${response.status} - ${errorData}`);
			}

			const result = await response.json();
			return {
				success: true,
				data: result,
			};
		} catch (error) {
			console.error("Error getting payment links:", error);
			return {
				success: false,
				error: error.message,
			};
		}
	}

	/**
	 * Get a specific payment link by ID
	 * @param {string} linkId - Payment link ID
	 * @returns {Promise<Object>} Payment link details
	 */
	async getPaymentLink(linkId) {
		try {
			// Generate authentication header
			const authHeader = this.auth.generateGetSingleAuth(linkId);

			const response = await fetch(
				`${this.baseUrl}/v1/payment-links/${linkId}`,
				{
					method: "GET",
					headers: {
						Authorization: authHeader,
					},
				}
			);

			if (!response.ok) {
				const errorData = await response.text();
				throw new Error(`PAYONE API Error: ${response.status} - ${errorData}`);
			}

			const result = await response.json();
			return {
				success: true,
				data: result,
			};
		} catch (error) {
			console.error("Error getting payment link:", error);
			return {
				success: false,
				error: error.message,
			};
		}
	}

	/**
	 * Update a payment link
	 * @param {string} linkId - Payment link ID
	 * @param {Object} linkData - Updated payment link data
	 * @returns {Promise<Object>} Updated payment link response
	 */
	async updatePaymentLink(linkId, linkData) {
		try {
			// Calculate total amount from shopping cart
			const totalAmount = this.calculateTotalAmount(linkData.shoppingCart);

			// Prepare the request body
			const requestBody = {
				merchantId: this.merchantId,
				accountId: this.accountId,
				portalId: this.portalId,
				mode: linkData.mode || "test",
				currency: linkData.currency || "EUR",
				reference: linkData.reference,
				shoppingCart: linkData.shoppingCart,
				...linkData,
			};

			// Generate authentication header (same as create)
			const authHeader = this.auth.generateCreateAuth(
				this.merchantId,
				this.accountId,
				this.portalId,
				requestBody.mode,
				requestBody.reference,
				totalAmount,
				requestBody.currency
			);

			const response = await fetch(
				`${this.baseUrl}/v1/payment-links/${linkId}`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: authHeader,
					},
					body: JSON.stringify(requestBody),
				}
			);

			if (!response.ok) {
				const errorData = await response.text();
				throw new Error(`PAYONE API Error: ${response.status} - ${errorData}`);
			}

			const result = await response.json();
			return {
				success: true,
				data: result,
				totalAmount: totalAmount,
			};
		} catch (error) {
			console.error("Error updating payment link:", error);
			return {
				success: false,
				error: error.message,
			};
		}
	}
}

module.exports = PayoneService;
