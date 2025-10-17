# PAYONE Payment Integration - Setup & Usage Guide

## Overview

This document provides complete setup and usage instructions for the PAYONE Payment Link integration in the Frischly Server project.

## What Has Been Integrated

The PAYONE payment system from `public/demopay/` has been successfully integrated into the main server:

### Files Created/Copied:

1. **`src/services/payoneAuth.js`** - Authentication service for PAYONE API

   - Generates HMAC-SHA256 signatures for API requests
   - Handles authentication headers

2. **`src/services/payoneService.js`** - Main PAYONE service

   - `createPaymentLink()` - Create payment links
   - `getPaymentLinks()` - Retrieve all payment links
   - `getPaymentLink()` - Get specific payment link by ID
   - `updatePaymentLink()` - Update existing payment link

3. **`src/controllers/paymentController.js`** - API controllers

   - `createPaymentLink()` - Full payment link creation
   - `createSimplePaymentLink()` - Simplified payment link creation (recommended)
   - `getPaymentLinks()` - Get all links
   - `getPaymentLink()` - Get specific link
   - `updatePaymentLink()` - Update link

4. **`src/routes/payments.js`** - Payment API routes

   - `POST /api/payments/payment-links` - Create full payment link
   - `POST /api/payments/create-simple-link` - Create simple payment link
   - `GET /api/payments/payment-links` - Get all payment links
   - `GET /api/payments/payment-links/:linkId` - Get specific link
   - `PUT /api/payments/payment-links/:linkId` - Update link

5. **`scripts/testPayment.js`** - Comprehensive test suite
   - Test basic payment link creation
   - Test multiple items in shopping cart
   - Test different countries and payment methods
   - Test retrieval of payment links

### Main Server Updates:

- **`server.js`** - Added payment routes integration

## Setup Instructions

### 1. Environment Variables (.env)

Create a `.env` file in the root directory with the following variables:

```bash
# PAYONE Configuration
MERCHANT_ID=your_merchant_id
ACCOUNT_ID=your_account_id
PORTAL_ID=your_portal_id
PORTAL_KEY=your_portal_key

# Optional
PAYONE_API_BASE_URL=https://onelink.pay1.de/api

# Other existing variables...
```

### 2. Required Environment Variables

| Variable              | Required | Description                                  | Example                       |
| --------------------- | -------- | -------------------------------------------- | ----------------------------- |
| `MERCHANT_ID`         | Yes      | Your PAYONE merchant ID                      | `999999`                      |
| `ACCOUNT_ID`          | Yes      | Your PAYONE account ID                       | `123456`                      |
| `PORTAL_ID`           | Yes      | Your PAYONE portal ID                        | `654321`                      |
| `PORTAL_KEY`          | **YES**  | Your PAYONE portal key (secret)              | `p1234567890abcdef`           |
| `PAYONE_API_BASE_URL` | No       | PAYONE API base URL (defaults to production) | `https://onelink.pay1.de/api` |

**Important**: The `PORTAL_KEY` is critical for authentication and must be kept secret.

## API Endpoints

### 1. Create Simple Payment Link (Recommended)

**Endpoint:** `POST /api/payments/create-simple-link`

**Purpose:** Create a payment link with minimal required fields

**Request Body Example:**

```json
{
	"reference": "order_12345",
	"description": "Online Payment",
	"currency": "EUR",
	"mode": "test",
	"lastName": "Doe",
	"country": "DE",
	"paymentMethods": ["visa", "mastercard", "paypal"],
	"shoppingCart": [
		{
			"type": "goods",
			"number": "ITEM001",
			"price": 1999,
			"quantity": 1,
			"description": "Product"
		}
	]
}
```

**Response Example (Success):**

```json
{
	"success": true,
	"data": {
		"id": "NX20NNLRSHGLRW2D5VV7Q8BAGVWJLLM8",
		"reference": "order_12345",
		"status": "created",
		"link": "https://onelink.pay1.de/NX20NNLRSHGLRW2D5VV7Q8BAGVWJLLM8",
		"mode": "test",
		"currency": "EUR",
		"billing": {
			"lastName": "Doe",
			"country": "DE"
		},
		"paymentMethods": ["visa", "mastercard", "paypal"]
	},
	"totalAmount": 1999
}
```

### 2. Create Full Payment Link

**Endpoint:** `POST /api/payments/payment-links`

**Purpose:** Create payment link with all available options

**Supports all fields from the demo including:**

- Advanced billing address fields
- Shipping information
- Invoice information
- Webhook URLs (successUrl, errorUrl, backUrl, notifyUrl)
- Custom logos and styling
- Recurrence settings
- Terms and conditions URLs

### 3. Get All Payment Links

**Endpoint:** `GET /api/payments/payment-links`

**Query Parameters:**

- `mode` - "test" or "live" (default: "test")
- `page` - Page number (default: 0)
- `limit` - Results per page (default: 25, max: 100)

**Example:** `GET /api/payments/payment-links?mode=test&limit=10`

### 4. Get Specific Payment Link

**Endpoint:** `GET /api/payments/payment-links/:linkId`

**Example:** `GET /api/payments/payment-links/NX20NNLRSHGLRW2D5VV7Q8BAGVWJLLM8`

### 5. Update Payment Link

**Endpoint:** `PUT /api/payments/payment-links/:linkId`

**Request Body:** Same structure as create endpoint

## Request Field Reference

### Shopping Cart Item

```json
{
	"type": "goods|shipment|handling|voucher",
	"number": "ITEM001",
	"price": 1999,
	"quantity": 1,
	"description": "Product description (optional)"
}
```

**Field Constraints:**

- `type` - Required, one of: `goods`, `shipment`, `handling`, `voucher`
- `number` - Required, 1-32 characters
- `price` - Required, integer from -1999999999 to 1999999999
- `quantity` - Required, integer from 1 to 999999
- `description` - Optional, string

### Billing Address

```json
{
	"lastName": "Doe",
	"country": "DE",
	"firstName": "John",
	"company": "ACME Corp",
	"street": "Main Street 1",
	"zip": "12345",
	"city": "Berlin",
	"phone": "+49301234567"
}
```

**Required Fields:**

- `lastName` - Last name (string)
- `country` - Country code ISO 3166-1 alpha-2 (e.g., "DE", "US", "FR")

### Payment Methods

Supported payment methods:

- `visa` - Visa credit card
- `mastercard` - Mastercard
- `paypal` - PayPal
- `sofort` - Sofort/Klarna
- `giropay` - Giropay
- `sepa` - SEPA direct debit

## Testing the Integration

### Running the Test Suite

```bash
# Start the server (if not already running)
npm run dev

# In another terminal, run the tests
node scripts/testPayment.js
```

### Test Cases Included

1. **Basic Payment Link Creation** - Simple single item
2. **Multiple Items** - Multiple cart items with different types
3. **Different Country** - Non-German country and different currency
4. **Retrieve Payment Link** - Fetch created link details
5. **Get All Links** - List all payment links

### Expected Output

```
╔════════════════════════════════════════════════════════╗
║      PAYONE PAYMENT LINK - INTEGRATION TEST SUITE      ║
║              Testing Against Main Server               ║
╚════════════════════════════════════════════════════════╝

📍 Server URL: http://localhost:3001
📍 API Base URL: http://localhost:3001/api/payments
🔧 Test Mode: test
⏰ Test Started: 2025-10-17T09:19:03.109Z

🔍 Checking server connectivity...
✅ Server is running: Server is running

✅ TEST 1: Basic Payment Link Creation - PASSED
✅ TEST 2: Multiple Items Payment Link - PASSED
✅ TEST 3: Different Country Payment Link - PASSED
✅ TEST 4: Retrieve Payment Link - PASSED
✅ TEST 5: Get All Payment Links - PASSED

📊 Results: 5/5 tests passed
```

## Integration with Existing Features

The payment system integrates cleanly with the existing Frischly server without modifying any core functionality:

- All payment endpoints are under `/api/payments`
- Uses the same middleware (CORS, helmet, rate limiting)
- Follows the same error handling patterns
- Respects the same authentication/authorization (if needed)

## Amount Format

All monetary amounts are in the **lowest denomination** (cents):

- EUR: 1999 = €19.99
- USD: 4999 = $49.99
- GBP: 1999 = £19.99

The total amount is calculated automatically from the shopping cart:

```
totalAmount = sum(item.price * item.quantity for all items)
```

## Common Issues & Troubleshooting

### Issue: "PORTAL_KEY is not set in environment variables"

**Solution:** Make sure your `.env` file has `PORTAL_KEY` set and the server was restarted after adding it.

```bash
# Add to .env
PORTAL_KEY=your_actual_portal_key

# Restart server
npm run dev
```

### Issue: "Cannot connect to PAYONE API"

**Possible Causes:**

1. Network connectivity issue
2. Invalid API credentials (MERCHANT_ID, ACCOUNT_ID, PORTAL_ID, PORTAL_KEY)
3. API base URL is incorrect
4. PAYONE service is temporarily unavailable

**Solution:**

- Verify all credentials are correct
- Check network connectivity
- Use test mode for development
- Check PAYONE status page

### Issue: "Invalid request" from PAYONE

**Check:**

1. Shopping cart has at least 1 item
2. Billing address has required fields (lastName, country)
3. Payment methods array is not empty
4. Reference ID is unique or matches correct ID format
5. All monetary values are integers (no decimals)

## Demo HTML Reference

The original demo implementation is available at:

- `public/demopay/demo.html` - Full UI with form
- `public/demopay/payoneService.js` - Original service
- `public/demopay/payoneAuth.js` - Original auth
- `public/demopay/server.js` - Original demo server

The integrated versions in `src/` have the same functionality but are adapted for the main server architecture.

## Next Steps

1. **Set up environment variables** - Add PAYONE credentials to `.env`
2. **Test the integration** - Run `node scripts/testPayment.js`
3. **Integrate with orders** - Connect payment links to your order creation flow
4. **Add webhook handling** - Set up endpoints to handle PAYONE notifications
5. **Deploy to production** - Use live credentials when ready

## Support & Documentation

For PAYONE API documentation and support:

- Official API Documentation: https://docs.payone.com/
- Test Mode Credentials: Available in your PAYONE merchant account
- Support: contact@payone.com

---

**Integration Date:** October 17, 2025
**Status:** ✅ Ready for testing
**Last Updated:** October 17, 2025
