# Customer Count API Documentation

## Overview

This API endpoint returns the total number of active customers in the system.

## Endpoint

```
GET /api/auth/customers/count
```

## Authentication

- **Required**: Yes
- **Type**: Bearer Token (JWT)
- **Roles**: Admin or Manager only

## Request

```bash
GET /api/auth/customers/count
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

## Response

### Success Response (200 OK)

```json
{
	"success": true,
	"data": {
		"customerCount": 150,
		"message": "Total active customers: 150"
	}
}
```

### Error Responses

#### 401 Unauthorized

```json
{
	"success": false,
	"message": "Not authorized to access this route"
}
```

#### 403 Forbidden

```json
{
	"success": false,
	"message": "User role customer is not authorized to access this route"
}
```

#### 500 Server Error

```json
{
	"success": false,
	"message": "Server error while fetching customer count"
}
```

## Usage Examples

### JavaScript (Axios)

```javascript
const axios = require("axios");

async function getCustomerCount() {
	try {
		const response = await axios.get(
			"http://localhost:3001/api/auth/customers/count",
			{
				headers: {
					Authorization: `Bearer ${your_jwt_token}`,
					"Content-Type": "application/json",
				},
			}
		);

		console.log("Customer count:", response.data.data.customerCount);
	} catch (error) {
		console.error("Error:", error.response.data.message);
	}
}
```

### cURL

```bash
curl -X GET "http://localhost:3001/api/auth/customers/count" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### PowerShell

```powershell
$headers = @{
    'Authorization' = 'Bearer YOUR_JWT_TOKEN'
    'Content-Type' = 'application/json'
}

Invoke-WebRequest -Uri "http://localhost:3001/api/auth/customers/count" -Method GET -Headers $headers
```

## Notes

- Only counts users with `role: "customer"` and `isActive: true`
- Requires admin or manager privileges to access
- Returns total count, not individual customer details
- Optimized for performance using MongoDB's `countDocuments()` method

## Integration with Dashboard

To use this endpoint in the dashboard, you can update the dashboard statistics section to fetch the customer count:

```javascript
// Example dashboard integration
async function loadCustomerCount() {
	try {
		const response = await fetch(`${API_BASE_URL}/auth/customers/count`, {
			headers: {
				Authorization: `Bearer ${currentToken}`,
				"Content-Type": "application/json",
			},
		});

		if (response.ok) {
			const data = await response.json();
			document.getElementById("customer-count-display").textContent =
				data.data.customerCount;
		}
	} catch (error) {
		console.error("Error loading customer count:", error);
	}
}
```
