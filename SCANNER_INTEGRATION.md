# Zebra Scanner Integration Guide

This document provides complete setup and usage instructions for integrating the Zebra barcode scanner app with the Frischly Node.js server for order fulfillment and inventory management.

## Overview

The Zebra Scanner integration enables warehouse and delivery staff to:
- Scan product barcodes to verify items
- Scan order numbers to view order details
- Pick items for orders using Zebra device trigger
- Track fulfillment progress in real-time
- Mark items as skipped (out of stock, damaged, etc.)
- Complete orders and update status automatically

## System Architecture

### Server Components

#### New API Endpoints (Base: `/api/scanner`)

All scanner endpoints require authentication and are restricted to roles: `staff`, `market`, `rider`, `market_driver`.

##### Product Scanning
- **POST** `/scan-product`
  - Scan a barcode and get product details
  - Request: `{ barcode: string }`
  - Response: `{ success: bool, product: Product }`

##### Order Scanning
- **POST** `/scan-order`
  - Scan an order number/barcode and get order details with pick progress
  - Request: `{ barcode: string }`
  - Response: `{ success: bool, order: Order, pickProgress: PickProgress }`

##### Pick Item
- **POST** `/pick-item`
  - Mark an item as picked during order fulfillment
  - Request:
    ```json
    {
      "orderId": "string",
      "itemId": "string",
      "quantity": number,
      "productId": "string (optional)",
      "shelfNumber": "string (optional)"
    }
    ```
  - Response: `{ success: bool, progress: PickProgress, pickTracking: PickTracking }`

##### Skip Item
- **POST** `/skip-item`
  - Mark an item as skipped (out of stock, damaged, etc.)
  - Request:
    ```json
    {
      "orderId": "string",
      "itemId": "string",
      "reason": "out_of_stock|damaged|wrong_item|customer_request|unknown (optional)"
    }
    ```
  - Response: `{ success: bool, progress: PickProgress, pickTracking: PickTracking }`

##### Get Pick Progress
- **GET** `/pick-progress/:orderId`
  - Get current pick progress for an order
  - Response: `{ success: bool, progress: PickProgress, pickTracking: PickTracking, order: Order }`

##### Complete Order
- **POST** `/complete-order`
  - Mark order as completed and update status
  - Request:
    ```json
    {
      "orderId": "string",
      "notes": "string (optional)"
    }
    ```
  - Response: `{ success: bool, order: Order, fulfillmentSummary: any }`

##### Get Orders (Warehouse Mode)
- **GET** `/orders?status=pending,confirmed,processing&limit=50&page=1`
  - Get filtered orders for scanning
  - Query params:
    - `status` - Comma-separated status values (default: "pending,confirmed,processing")
    - `limit` - Results per page (default: 50)
    - `page` - Page number (default: 1)
  - Response: `{ success: bool, orders: Order[], pagination: Pagination }`

### Database Models

#### PickTracking Model
Tracks which items have been picked by which staff member for each order.

```javascript
{
  _id: ObjectId,
  orderId: ObjectId (ref: Order),
  userId: ObjectId (ref: User),
  userName: String,
  userRole: String,
  totalItems: Number,
  pickedItems: [
    {
      itemId: ObjectId,
      productId: ObjectId (ref: Product),
      quantity: Number,
      shelfNumber: String,
      pickedAt: Date
    }
  ],
  skippedItems: [
    {
      itemId: ObjectId,
      reason: String,
      skippedAt: Date
    }
  ],
  completedAt: Date,
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
```

## Scanner App Setup

### Installation

1. Navigate to the scanner directory:
   ```bash
   cd scanner
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build for Android/Zebra device:
   ```bash
   npm run android
   ```

### Configuration

The scanner app configuration is managed through:

1. **API Base URL** - Configured on first login:
   - User enters server URL (e.g., `https://api.frischlyshop.com`)
   - Stored in AsyncStorage for persistence
   - Used for all API calls

2. **Session Management** - Handled via JWT tokens:
   - User logs in with email/password
   - Token stored in AsyncStorage
   - Sent with every API request in Authorization header

### Key Files

- **`src/config.ts`** - Configuration management
  - `initializeConfig()` - Load saved config on app startup
  - `getApiBaseUrl()` - Get configured API URL
  - `setApiBaseUrl()` - Save new API URL
  - `getSession()` / `setSession()` - Manage authentication

- **`src/api.ts`** - API service layer
  - `api.login()` - Authenticate user
  - `api.scanProduct()` - Scan product barcode
  - `api.scanOrder()` - Scan order number
  - `api.pickItem()` - Record picked item
  - `api.skipItem()` - Record skipped item
  - `api.completeOrder()` - Finish order fulfillment

- **`src/types.ts`** - TypeScript types
  - `Order` - Order with items
  - `Product` - Product details
  - `OrderItem` - Item in order
  - `PickProgress` - Pick status tracking

- **`src/screens/`** - UI screens
  - `LoginScreen.tsx` - API URL and authentication
  - `OrdersScreen.tsx` - Order list and scanning
  - `OrderDetailScreen.tsx` - Item picking interface

## Workflow

### Typical Order Fulfillment Process

1. **Staff Login**
   - Enter server API URL
   - Enter credentials
   - App stores token and session

2. **Order Retrieval**
   - Open "Orders" tab
   - See list of orders in "Processing" or "Pending" status
   - Manually select order or scan order barcode

3. **Item Picking**
   - View order items
   - Scan each item's barcode or manually select
   - Press "Pick" button to mark as picked
   - Or press "Skip" if item is unavailable

4. **Order Completion**
   - When all items are picked/skipped, press "Complete Order"
   - System updates order status to "Ready for Pickup"
   - If some items skipped, creates audit trail

5. **Delivery (for riders)**
   - Assigned riders see "Ready for Pickup" orders
   - Update status to "OnTheWay" when picking up
   - Mark as "Delivered" at destination

## Security Considerations

### Authentication
- All scanner endpoints require valid JWT token
- Token must be obtained via `/api/auth/login`
- Token sent in `Authorization: Bearer {token}` header

### Authorization
- **Staff/Admin**: Access all orders and products
- **Market**: Only access their own market's orders
- **Riders**: Only access orders assigned to them
- **Market Drivers**: Only access orders assigned to them

### Data Validation
- All barcode inputs normalized (uppercase, trimmed)
- Order access validated by role and ownership
- NoSQL injection protection via mongoSanitize
- Rate limiting on all API endpoints

## Error Handling

Common error scenarios and their handling:

| Error | Cause | Solution |
|-------|-------|----------|
| "API base URL not configured" | User hasn't set server URL | Show setup screen |
| "Product not found" | Invalid barcode | Verify barcode, try manual search |
| "Order not found" | Invalid order number | Check order exists and is active |
| "You are not assigned to this order" | Rider trying to access other's order | Verify assignment |
| "Item already marked as picked" | Duplicate pick attempt | Show progress |
| "HTTP 401: Unauthorized" | Token expired | Prompt re-login |
| "HTTP 403: Forbidden" | User lacks permission | Check user role |

## API Integration Examples

### JavaScript/TypeScript (React Native)

```typescript
import { api } from "./api";
import { setSession, setApiBaseUrl } from "./config";

// 1. Setup - User enters API URL
await setApiBaseUrl("https://api.frischlyshop.com");

// 2. Login
const session = await api.login("staff@example.com", "password");
await setSession(session);

// 3. Get orders
const { orders } = await api.getOrders("pending,confirmed,processing", 50, 1);

// 4. Scan order
const { order, pickProgress } = await api.scanOrder("ORD-12345");

// 5. Pick items
for (const item of order.items) {
  const result = await api.pickItem(
    order._id,
    item._id,
    item.quantity,
    item.product._id,
    item.product.shelfNumber
  );
  console.log(`Picked ${result.progress.pickedItems}/${result.progress.totalItems}`);
}

// 6. Complete order
const { completionResult } = await api.completeOrder(order._id, "All items picked");
```

### cURL Examples

```bash
# Set variables
API_URL="https://api.frischlyshop.com/api"
TOKEN="your_jwt_token_here"

# Scan product
curl -X POST "$API_URL/scanner/scan-product" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"barcode": "1234567890"}'

# Scan order
curl -X POST "$API_URL/scanner/scan-order" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"barcode": "ORD-12345"}'

# Pick item
curl -X POST "$API_URL/scanner/pick-item" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "507f1f77bcf86cd799439011",
    "itemId": "507f1f77bcf86cd799439012",
    "quantity": 2,
    "shelfNumber": "A-12"
  }'

# Complete order
curl -X POST "$API_URL/scanner/complete-order" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderId": "507f1f77bcf86cd799439011"}'

# Get orders
curl -X GET "$API_URL/scanner/orders?status=pending,confirmed&limit=50&page=1" \
  -H "Authorization: Bearer $TOKEN"
```

## Deployment

### Development

```bash
# Terminal 1: Start Node.js server
cd frischly-server
npm run dev

# Terminal 2: Start Expo development server
cd scanner
npm start
```

### Production

1. **Build Scanner App**
   ```bash
   cd scanner
   eas build --platform android
   ```

2. **Deploy Server**
   - Push to main branch
   - Server automatically deploys via CI/CD
   - Ensure environment variables are set:
     - `MONGODB_URI`
     - `JWT_SECRET`
     - `STRIPE_SECRET_KEY`
     - etc.

## Troubleshooting

### Scanner can't connect to API
- Verify API URL is correct (should end with `/api`)
- Check network connectivity
- Verify server is running and accessible
- Check CORS configuration in `server.js`

### Authentication fails
- Verify credentials are correct
- Check user role allows scanner access
- Ensure JWT secret matches server config
- Token might be expired (re-login required)

### Barcode scanning not working
- Verify Zebra scanner is configured in app settings
- Test with manual barcode entry
- Check barcode format matches product records
- Ensure products have barcodes in database

### Order status not updating
- Check database connection
- Verify user has permission to access order
- Check order exists and is not deleted
- Review server logs for errors

## Monitoring & Logs

### Server Logs
```bash
# View recent errors
tail -f logs/error.log

# View all API calls
tail -f logs/api.log
```

### Pick Tracking Audit Trail
```javascript
// Query pick history for an order
db.picktrackings.find({ orderId: ObjectId("...") })

// Query staff activity
db.picktrackings.find({ userId: ObjectId("...") }).sort({ createdAt: -1 })
```

## API Rate Limits

- Development: 20,000 requests per 5 minutes
- Production: 3,000 requests per 20 minutes
- Per-user rate limiting recommended for high-volume scenarios

## Future Enhancements

- [ ] Offline mode with sync when connection restored
- [ ] Barcode printer support for receipt/label printing
- [ ] Integration with inventory management system
- [ ] Real-time push notifications for order changes
- [ ] Voice commands for hands-free picking
- [ ] Analytics dashboard for picking efficiency
- [ ] Multi-language support
- [ ] Two-factor authentication for sensitive operations

## Support

For issues or questions:
1. Check this documentation
2. Review server logs: `tail -f server.js output`
3. Check scanner app logs in React Native debugger
4. Contact development team with:
   - Exact error message
   - Steps to reproduce
   - User role and assigned orders
   - Network/device information
