# Enhanced Order Filtering API

## Endpoint

`GET /api/orders`

## Description

Retrieves a paginated list of orders with comprehensive filtering options. This endpoint supports multiple filter types including status, payment status, date ranges, rider assignments, amount ranges, and text search.

## Authentication

- **Required**: Yes
- **Roles**: admin, manager, staff, customer, rider

## Query Parameters

### Pagination

- `page` (number, optional) - Page number (default: 1)
- `limit` (number, optional) - Number of orders per page (default: 20)

### Sorting

- `sortBy` (string, optional) - Field to sort by (default: "createdAt")
  - Options: createdAt, total, status, orderNumber, etc.
- `sortOrder` (string, optional) - Sort direction (default: "desc")
  - Options: asc, desc

### Status Filtering

- `status` (string, optional) - Filter by order status
  - **Single status**: `status=pending`
  - **Multiple statuses**: `status=pending,confirmed,processing`
  - **Exclude status**: `status=!cancelled` (excludes cancelled orders)
  - Valid values: pending, confirmed, processing, ready for pickup, OnTheWay, delivered, cancelled

### Payment Status Filtering

- `paymentStatus` (string, optional) - Filter by payment status
  - **Single status**: `paymentStatus=paid`
  - **Multiple statuses**: `paymentStatus=pending,paid`
  - Valid values: pending, paid, failed, refunded

### Date Range Filtering

- `dateFrom` (string, optional) - Start date (ISO format: YYYY-MM-DD)
- `dateTo` (string, optional) - End date (ISO format: YYYY-MM-DD)
- Note: dateTo includes the entire day (until 23:59:59)

### Rider Assignment Filtering

- `assignedRider` (string, optional) - Filter by rider assignment
  - `unassigned` - Orders without assigned rider
  - `assigned` - Orders with any assigned rider
  - `{riderId}` - Orders assigned to specific rider ID

### Amount Range Filtering

- `minTotal` (number, optional) - Minimum order total
- `maxTotal` (number, optional) - Maximum order total

### Text Search

- `search` (string, optional) - Search across multiple fields
  - Searches in: orderNumber, customer.name, customer.email, customer.phone
  - Case-insensitive partial matching

### General Filters

- `isActive` (string, optional) - Filter by active status (default: "true")
  - Options: true, false, all

## Example Requests

### Basic Status Filtering

```bash
# Get pending orders
GET /api/orders?status=pending

# Get multiple statuses
GET /api/orders?status=pending,confirmed,processing

# Exclude cancelled orders
GET /api/orders?status=!cancelled
```

### Date Range Filtering

```bash
# Orders from last week
GET /api/orders?dateFrom=2023-12-01&dateTo=2023-12-07

# Orders from today
GET /api/orders?dateFrom=2023-12-07&dateTo=2023-12-07
```

### Rider Assignment Filtering

```bash
# Unassigned orders
GET /api/orders?assignedRider=unassigned

# All assigned orders
GET /api/orders?assignedRider=assigned

# Orders assigned to specific rider
GET /api/orders?assignedRider=60f7b3b3b3b3b3b3b3b3b3b5
```

### Amount Range Filtering

```bash
# Orders between €10-€100
GET /api/orders?minTotal=10&maxTotal=100

# Orders over €50
GET /api/orders?minTotal=50

# Orders under €20
GET /api/orders?maxTotal=20
```

### Combined Filtering

```bash
# Complex filter example
GET /api/orders?status=confirmed,processing&paymentStatus=paid&assignedRider=unassigned&minTotal=10&dateFrom=2023-12-01&search=john&limit=10&sortBy=total&sortOrder=desc
```

## Response Format

### Success Response (200 OK)

```json
{
	"success": true,
	"data": [
		{
			"_id": "60f7b3b3b3b3b3b3b3b3b3b3",
			"orderNumber": "ORD-2023-001",
			"status": "confirmed",
			"paymentStatus": "paid",
			"total": 45.5,
			"customer": {
				"name": "John Doe",
				"email": "john@example.com",
				"phone": "+1234567890"
			},
			"assignedRider": {
				"_id": "60f7b3b3b3b3b3b3b3b3b3b5",
				"name": "Rider Name",
				"email": "rider@frischly.com"
			},
			"createdAt": "2023-12-07T10:30:00.000Z",
			"updatedAt": "2023-12-07T11:00:00.000Z"
			// ... other order fields
		}
	],
	"pagination": {
		"currentPage": 1,
		"totalPages": 5,
		"totalOrders": 98,
		"hasNextPage": true,
		"hasPrevPage": false
	}
}
```

## Role-Based Filtering

### Customer Role

- Automatically filtered to show only their own orders
- All other filters still apply to their orders

### Admin/Manager/Staff/Rider Roles

- Can see all orders (subject to applied filters)
- Riders may have additional zone-based restrictions in some contexts

## Filter Examples by Use Case

### Restaurant Management

```bash
# Orders ready for pickup
GET /api/orders?status=ready for pickup&assignedRider=unassigned

# Today's completed orders
GET /api/orders?status=delivered&dateFrom=2023-12-07&dateTo=2023-12-07

# High-value pending orders
GET /api/orders?status=pending&minTotal=50&sortBy=total&sortOrder=desc
```

### Rider Dashboard

```bash
# Available orders for pickup
GET /api/orders?status=ready for pickup&assignedRider=unassigned

# My current deliveries
GET /api/orders?status=OnTheWay&assignedRider={myRiderId}

# Orders in my area (handled by zone logic)
GET /api/orders?status=ready for pickup,OnTheWay
```

### Financial Reports

```bash
# This month's paid orders
GET /api/orders?paymentStatus=paid&dateFrom=2023-12-01&dateTo=2023-12-31

# Revenue by date range
GET /api/orders?paymentStatus=paid&dateFrom=2023-12-01&dateTo=2023-12-07&sortBy=total&sortOrder=desc

# Failed payments requiring attention
GET /api/orders?paymentStatus=failed&status=!cancelled
```

## Performance Notes

1. **Indexing**: The following fields are indexed for optimal query performance:

   - status
   - paymentStatus
   - createdAt
   - assignedRider
   - customer.email

2. **Pagination**: Always use pagination for large datasets to maintain performance

3. **Date Queries**: Date range queries are optimized with proper indexing

4. **Text Search**: Search queries use regex matching which may be slower on large datasets

## Error Handling

### Invalid Parameters

```json
{
	"success": false,
	"message": "Invalid date format for dateFrom parameter"
}
```

### Access Restrictions

```json
{
	"success": false,
	"message": "Not authorized to access this route"
}
```

## Test Script

A comprehensive test script is available at `scripts/test-order-filtering.js` to verify all filtering functionality.

## Related Endpoints

- `GET /api/orders/:id` - Get single order
- `GET /api/orders/runningOrder` - Get orders for riders (excluding early statuses)
- `GET /api/orders/stats` - Get order statistics
- `GET /api/orders/count` - Get total order count
