# Update Order Status API

## Endpoint

`PATCH /api/orders/:id/status`

## Description

Updates the status of a specific order. This endpoint allows authorized users to change the order status with role-based permissions. Riders have special permissions and business logic applied.

## Authentication

- **Required**: Yes
- **Roles**: admin, manager, staff, rider

## Parameters

### Path Parameters

- `id` (string, required) - The MongoDB ObjectId of the order to update

### Request Body

```json
{
	"status": "confirmed"
}
```

- `status` (string, required) - The new status for the order

## Valid Status Values

- `pending` - Order placed but not yet confirmed
- `confirmed` - Order confirmed and being prepared
- `processing` - Order being processed/packed
- `ready for pickup` - Order ready for rider pickup
- `OnTheWay` - Order out for delivery
- `delivered` - Order successfully delivered
- `cancelled` - Order cancelled

## Role-Based Permissions

### Admin, Manager, Staff

- **Can update to**: All status values
- **Restrictions**: Cannot update delivered or cancelled orders

### Rider

- **Can update to**: `ready for pickup`, `OnTheWay`, `delivered`
- **Special Features**:
  - Automatically assigned to order when updating to delivery-related status
  - Must be assigned to the order OR have zone permissions
  - Cannot update orders outside their assigned zones (if not directly assigned)

## Response

### Success Response (200 OK)

```json
{
	"success": true,
	"message": "Order status updated from 'pending' to 'confirmed' successfully",
	"data": {
		"_id": "60f7b3b3b3b3b3b3b3b3b3b3",
		"orderNumber": "ORD-2023-001",
		"status": "confirmed",
		"customer": {
			"name": "John Doe",
			"email": "john@example.com"
		},
		"assignedRider": {
			"_id": "60f7b3b3b3b3b3b3b3b3b3b5",
			"name": "Rider Name",
			"email": "rider@frischly.com",
			"phone": "+1234567890"
		},
		"updatedBy": {
			"_id": "60f7b3b3b3b3b3b3b3b3b3b4",
			"name": "Admin User",
			"email": "admin@frischly.com"
		},
		"updatedAt": "2023-12-07T10:30:00.000Z",
		"deliveredAt": "2023-12-07T12:00:00.000Z" // Only set when status is 'delivered'
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
	"message": "Status is required"
}
```

```json
{
	"success": false,
	"message": "Status must be one of: pending, confirmed, processing, ready for pickup, OnTheWay, delivered, cancelled"
}
```

```json
{
	"success": false,
	"message": "Cannot update status of delivered or cancelled orders"
}
```

#### 403 Forbidden

```json
{
	"success": false,
	"message": "rider role is not permitted to update status to 'cancelled'"
}
```

```json
{
	"success": false,
	"message": "You are not authorized to update this order"
}
```

#### 404 Not Found

```json
{
	"success": false,
	"message": "Order not found"
}
```

## Business Rules

### General Rules

1. Cannot update delivered or cancelled orders
2. Cannot cancel a delivered order
3. Updates are logged with `updatedBy` and `updatedAt` fields
4. When status changes to `delivered`, `deliveredAt` timestamp is set

### Rider-Specific Rules

1. **Auto-Assignment**: When a rider updates an unassigned order to delivery status, they are automatically assigned
2. **Zone Permissions**: Riders can only update orders in their assigned zones (unless directly assigned to the order)
3. **Status Restrictions**: Riders can only update to delivery-related statuses
4. **Assignment Timestamp**: `riderAssignedAt` is set when rider is assigned to order

### Status Flow

```
pending → confirmed → processing → ready for pickup → OnTheWay → delivered
    ↓         ↓           ↓              ↓              ↓
 cancelled  cancelled  cancelled    cancelled     cancelled
```

## Example Usage

### Admin/Manager/Staff updating status

```bash
curl -X PATCH http://localhost:3001/api/orders/60f7b3b3b3b3b3b3b3b3b3b3/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -d '{"status": "confirmed"}'
```

### Rider updating to delivery status

```bash
curl -X PATCH http://localhost:3001/api/orders/60f7b3b3b3b3b3b3b3b3b3b3/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_RIDER_JWT_TOKEN" \
  -d '{"status": "OnTheWay"}'
```

### Using JavaScript/Axios

```javascript
const response = await axios.patch(
	"http://localhost:3001/api/orders/60f7b3b3b3b3b3b3b3b3b3b3/status",
	{ status: "delivered" },
	{
		headers: {
			Authorization: "Bearer YOUR_JWT_TOKEN",
			"Content-Type": "application/json",
		},
	}
);
```

## Test Script

A comprehensive test script is available at `scripts/test-update-order-status.js` to verify all functionality including role permissions and error handling.

## Related Endpoints

- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id` - Update entire order
- `PATCH /api/orders/:id/shelf` - Update order shelf number
- `PATCH /api/orders/:id/cancel` - Cancel an order

## Status Transition Examples

### Typical Flow for Restaurant Orders

1. Customer places order → `pending`
2. Restaurant confirms → `confirmed`
3. Kitchen starts preparing → `processing`
4. Food ready → `ready for pickup`
5. Rider picks up → `OnTheWay`
6. Customer receives → `delivered`

### Rider Workflow

1. Rider sees `ready for pickup` orders in their zone
2. Rider updates to `OnTheWay` (auto-assigned to order)
3. Rider delivers and updates to `delivered`
