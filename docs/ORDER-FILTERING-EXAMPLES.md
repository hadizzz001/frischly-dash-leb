# Order Filtering Examples

## Quick Reference

Here are practical examples of using the enhanced order filtering API:

### 1. Status Filtering Examples

```bash
# Get pending orders only
curl "http://localhost:3001/api/orders?status=pending" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get multiple statuses (pending, confirmed, processing)
curl "http://localhost:3001/api/orders?status=pending,confirmed,processing" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get all orders except cancelled ones
curl "http://localhost:3001/api/orders?status=!cancelled" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Date Range Examples

```bash
# Get orders from today
curl "http://localhost:3001/api/orders?dateFrom=2023-12-07&dateTo=2023-12-07" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get orders from last 7 days
curl "http://localhost:3001/api/orders?dateFrom=2023-12-01&dateTo=2023-12-07" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get orders from this month (up to today)
curl "http://localhost:3001/api/orders?dateFrom=2023-12-01" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Rider Assignment Examples

```bash
# Get unassigned orders (ready for assignment)
curl "http://localhost:3001/api/orders?assignedRider=unassigned" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get all orders that have been assigned
curl "http://localhost:3001/api/orders?assignedRider=assigned" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get orders assigned to specific rider
curl "http://localhost:3001/api/orders?assignedRider=60f7b3b3b3b3b3b3b3b3b3b5" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Amount Range Examples

```bash
# Get high-value orders (over €50)
curl "http://localhost:3001/api/orders?minTotal=50" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get orders in specific price range (€10-€100)
curl "http://localhost:3001/api/orders?minTotal=10&maxTotal=100" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get small orders (under €20)
curl "http://localhost:3001/api/orders?maxTotal=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 5. Payment Status Examples

```bash
# Get paid orders only
curl "http://localhost:3001/api/orders?paymentStatus=paid" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get orders with payment issues (pending or failed)
curl "http://localhost:3001/api/orders?paymentStatus=pending,failed" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 6. Combined Filtering Examples

```bash
# Active orders ready for delivery assignment
curl "http://localhost:3001/api/orders?status=ready for pickup&assignedRider=unassigned&paymentStatus=paid" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Today's high-value completed orders
curl "http://localhost:3001/api/orders?status=delivered&dateFrom=2023-12-07&dateTo=2023-12-07&minTotal=50&sortBy=total&sortOrder=desc" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Problem orders requiring attention
curl "http://localhost:3001/api/orders?paymentStatus=failed&status=!cancelled&dateFrom=2023-12-01" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 7. Search with Filters

```bash
# Search for customer "John" in pending orders
curl "http://localhost:3001/api/orders?search=john&status=pending" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Search orders by phone number with status filter
curl "http://localhost:3001/api/orders?search=+1234&status=confirmed,processing" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 8. Pagination with Filters

```bash
# Get second page of pending orders (10 per page)
curl "http://localhost:3001/api/orders?status=pending&page=2&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get first 5 highest value orders
curl "http://localhost:3001/api/orders?sortBy=total&sortOrder=desc&limit=5" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## JavaScript/Axios Examples

```javascript
// Get pending orders
const pendingOrders = await axios.get("/api/orders?status=pending", {
	headers: { Authorization: `Bearer ${token}` },
});

// Get today's orders with complex filtering
const todayOrders = await axios.get("/api/orders", {
	params: {
		dateFrom: "2023-12-07",
		dateTo: "2023-12-07",
		status: "confirmed,processing,delivered",
		paymentStatus: "paid",
		sortBy: "createdAt",
		sortOrder: "desc",
	},
	headers: { Authorization: `Bearer ${token}` },
});

// Get unassigned orders ready for pickup
const availableOrders = await axios.get("/api/orders", {
	params: {
		status: "ready for pickup",
		assignedRider: "unassigned",
		paymentStatus: "paid",
	},
	headers: { Authorization: `Bearer ${token}` },
});
```

## Common Use Cases

### Restaurant Dashboard

```bash
# Orders needing attention (confirmed but not yet processing)
GET /api/orders?status=confirmed&sortBy=createdAt&sortOrder=asc

# Orders ready for rider pickup
GET /api/orders?status=ready for pickup&assignedRider=unassigned

# Today's revenue (delivered paid orders)
GET /api/orders?status=delivered&paymentStatus=paid&dateFrom=2023-12-07&dateTo=2023-12-07
```

### Rider App

```bash
# Available orders in my area (handled by zone logic in getOrdersForRiders)
GET /api/orders?status=ready for pickup&assignedRider=unassigned

# My current deliveries
GET /api/orders?assignedRider={riderId}&status=OnTheWay

# My completed deliveries today
GET /api/orders?assignedRider={riderId}&status=delivered&dateFrom=2023-12-07&dateTo=2023-12-07
```

### Admin Reports

```bash
# Monthly sales report
GET /api/orders?paymentStatus=paid&status=delivered&dateFrom=2023-12-01&dateTo=2023-12-31&sortBy=total&sortOrder=desc

# Problem orders requiring follow-up
GET /api/orders?paymentStatus=failed&status=!cancelled

# Customer service issues (old pending orders)
GET /api/orders?status=pending&dateTo=2023-12-06&sortBy=createdAt&sortOrder=asc
```

## Filter Validation

The API validates all parameters and returns appropriate errors:

```json
// Invalid status
{
  "success": false,
  "message": "Invalid status value provided"
}

// Invalid date format
{
  "success": false,
  "message": "Invalid date format. Use YYYY-MM-DD"
}

// Invalid total amount
{
  "success": false,
  "message": "minTotal must be a valid number"
}
```
