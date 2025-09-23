# Update Order Shelf Number API

## Endpoint

`PATCH /api/orders/:id/shelf`

## Description

Updates the shelf number for a specific order. This endpoint allows authorized users (admin, manager, staff) to modify the shelf number where an order is stored or should be placed.

## Authentication

- **Required**: Yes
- **Roles**: admin, manager, staff

## Parameters

### Path Parameters

- `id` (string, required) - The MongoDB ObjectId of the order to update

### Request Body

```json
{
	"shelfNumber": 123
}
```

- `shelfNumber` (number, required) - The new shelf number (must be a non-negative number)

## Response

### Success Response (200 OK)

```json
{
	"success": true,
	"message": "Order shelf number updated successfully",
	"data": {
		"_id": "60f7b3b3b3b3b3b3b3b3b3b3",
		"orderNumber": "ORD-2023-001",
		"shelfNumber": 123,
		"status": "confirmed",
		"customer": {
			"name": "John Doe",
			"email": "john@example.com"
		},
		"updatedBy": {
			"_id": "60f7b3b3b3b3b3b3b3b3b3b4",
			"name": "Admin User",
			"email": "admin@frischly.com"
		},
		"updatedAt": "2023-12-07T10:30:00.000Z"
		// ... other order fields
	}
}
```

### Error Responses

#### 400 Bad Request

```json
{
	"success": false,
	"message": "Invalid order ID"
}
```

```json
{
	"success": false,
	"message": "Shelf number is required"
}
```

```json
{
	"success": false,
	"message": "Shelf number must be a valid non-negative number"
}
```

```json
{
	"success": false,
	"message": "Cannot modify shelf number for cancelled or delivered orders"
}
```

#### 404 Not Found

```json
{
	"success": false,
	"message": "Order not found"
}
```

#### 401 Unauthorized

```json
{
	"success": false,
	"message": "Not authorized to access this route"
}
```

## Business Rules

1. Only active orders can have their shelf number updated
2. Cancelled and delivered orders cannot be modified
3. The shelf number must be a non-negative number
4. The update operation records who made the change (updatedBy field)
5. The updatedAt timestamp is automatically set to the current time

## Example Usage

### Using curl

```bash
curl -X PATCH http://localhost:3001/api/orders/60f7b3b3b3b3b3b3b3b3b3b3/shelf \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"shelfNumber": 456}'
```

### Using JavaScript/Axios

```javascript
const response = await axios.patch(
	"http://localhost:3001/api/orders/60f7b3b3b3b3b3b3b3b3b3b3/shelf",
	{ shelfNumber: 456 },
	{
		headers: {
			Authorization: "Bearer YOUR_JWT_TOKEN",
			"Content-Type": "application/json",
		},
	}
);
```

## Test Script

A test script is available at `scripts/test-update-order-shelf.js` to verify the functionality of this endpoint.

## Related Endpoints

- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id` - Update entire order (includes shelf number)
- `PATCH /api/orders/:id/cancel` - Cancel an order
