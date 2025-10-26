const crypto = require("crypto");

class PayoneAuth {
	constructor(portalKey) {
		this.portalKey = portalKey;
		this.portalKeyMD5 = crypto
			.createHash("md5")
			.update(portalKey)
			.digest("hex");
	}

	/**
	 * Generate HMAC-SHA256 signature for PAYONE Link API
	 * @param {string} data - Data to be signed
	 * @returns {string} Base64 encoded signature
	 */
	generateSignature(data) {
		const hmac = crypto.createHmac("sha256", this.portalKey);
		hmac.update(data);
		return hmac.digest("base64");
	}

	/**
	 * Generate authentication header for creating payment links
	 * According to the OpenAPI spec: Base64 encoded (merchantId + accountId + portalId + mode + reference + totalAmount + currency) signed with Portalkey in HmacSHA256
	 */
	generateCreateAuth(
		merchantId,
		accountId,
		portalId,
		mode,
		reference,
		totalAmount,
		currency
	) {
		const data = `${merchantId}${accountId}${portalId}${mode}${reference}${totalAmount}${currency}`;
		const signature = this.generateSignature(data);
		return `payone-hmac-sha256 ${signature}`;
	}

	/**
	 * Generate authentication header for getting multiple payment links
	 * According to the OpenAPI spec: Base64 encoded (merchantId + accountId + portalId + mode) signed with Portalkey in HmacSHA256
	 */
	generateGetMultipleAuth(merchantId, accountId, portalId, mode) {
		const data = `${merchantId}${accountId}${portalId}${mode}`;
		const signature = this.generateSignature(data);
		return `payone-hmac-sha256 ${signature}`;
	}

	/**
	 * Generate authentication header for getting single payment link
	 * According to the OpenAPI spec: Base64 encoded linkId signed with Portalkey in HmacSHA256
	 */
	generateGetSingleAuth(linkId) {
		const signature = this.generateSignature(linkId);
		return `payone-hmac-sha256 ${signature}`;
	}
}

module.exports = PayoneAuth;
