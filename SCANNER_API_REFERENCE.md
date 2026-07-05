# Zebra Scanner API - Complete Reference

## Base URL

```
/api/scanner
```

All endpoints require authentication with a valid JWT token.

## Authentication Header

```
Authorization: Bearer {token}
```

## Response Format

All responses follow this format:

```json
{
  "success": true/false,
  "message": "Optional message",
  "data": {},
  "error": "Optional error message"
}
```

---

## Endpoints

### 1. Scan Product Barcode

**Endpoint:** `POST /api/scanner/scan-product`

Scan a product barcode and retrieve product details.

**Request:**
```json
{
  "barcode": "1234567890"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "product": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Apple Fresh",
      "barcode": "1234567890",
      "sku": "APL-FRESH",
      "price": 2.99,
      "stock": 150,
      "market": {
        "_id": "507f1f77bcf86cd799439010",
        "name": "Fresh Market"
      },
      "shelfNumber": "A-12",
      "picture": "https://...",
      "description": "Fresh organic apples"
    }
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Product not found",
  "error": "No product with barcode 1234567890"
}
```

**Status Codes:**
- `200 OK` - Product found
- `400 Bad Request` - Barcode not provided
- `404 Not Found` - Product not found
- `500 Server Error` - Server error

---

### 2. Scan Order Barcode

**Endpoint:** `POST /api/scanner/scan-order`

Scan an order number/barcode and retrieve order details with pick progress.

**Request:**
```json
{
  "barcode": "ORD-12345"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "507f1f77bcf86cd799439011",
      "orderNumber": "ORD-12345",
      "status": "processing",
      "total": 45.99,
      "subtotal": 40.00,
      "delivery": 3.99,
      "discount": 0,
      "fees": 2.00,
      "customer": {
        "name": "John Doe",
        "email": "john@example.com",
        "phoneNumber": "+1234567890",
        "address": {
          "street": "123 Main St",
          "city": "Beirut"
        }
      },
      "items": [
        {
          "_id": "507f1f77bcf86cd799439012",
          "product": {
            "_id": "507f1f77bcf86cd799439013",
            "name": "Apple Fresh",
            "barcode": "1234567890",
            "price": 2.99,
            "shelfNumber": "A-12"
          },
          "quantity": 5,
          "totalPrice": 14.95
        }
      ],
      "market": {
        "_id": "507f1f77bcf86cd799439010",
        "name": "Fresh Market"
      },
      "notes": "Handle with care",
      "createdAt": "2024-01-15T10:30:00Z",
      "shelfNumber": "SHELF-5"
    },
    "pickProgress": {
      "pickedItems": 2,
      "totalItems": 4,
      "percentage": 50,
      "remaining": 2
    }
  }
}
```

**Status Codes:**
- `200 OK` - Order found
- `400 Bad Request` - Barcode not provided
- `403 Forbidden` - Not assigned to this order (riders only)
- `404 Not Found` - Order not found
- `500 Server Error` - Server error

---

### 3. Pick Item

**Endpoint:** `POST /api/scanner/pick-item`

Mark an item as picked during order fulfillment.

**Request:**
```json
{
  "orderId": "507f1f77bcf86cd799439011",
  "itemId": "507f1f77bcf86cd799439012",
  "quantity": 5,
  "productId": "507f1f77bcf86cd799439013",
  "shelfNumber": "A-12"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Item marked as picked",
  "data": {
    "progress": {
      "pickedItems": 3,
      "totalItems": 4,
      "percentage": 75,
      "remaining": 1
    },
    "pickTracking": {
      "_id": "507f1f77bcf86cd799439014",
      "pickedItems": [
        {
          "itemId": "507f1f77bcf86cd799439012",
          "productId": "507f1f77bcf86cd799439013",
          "quantity": 5,
          "shelfNumber": "A-12",
          "pickedAt": "2024-01-15T10:35:00Z"
        }
      ],
      "skippedItems": []
    }
  }
}
```

**Status Codes:**
- `200 OK` - Item picked successfully
- `400 Bad Request` - Missing required fields or item already picked
- `403 Forbidden` - No permission to access order
- `404 Not Found` - Order not found
- `500 Server Error` - Server error

---

### 4. Skip Item

**Endpoint:** `POST /api/scanner/skip-item`

Mark an item as skipped (out of stock, damaged, etc.).

**Request:**
```json
{
  "orderId": "507f1f77bcf86cd799439011",
  "itemId": "507f1f77bcf86cd799439012",
  "reason": "out_of_stock"
}
```

**Reason values:**
- `out_of_stock` - Item not available
- `damaged` - Item is damaged
- `wrong_item` - Wrong item in inventory
- `customer_request` - Customer requested removal
- `unknown` - Other reason (default)

**Response:**
```json
{
  "success": true,
  "message": "Item marked as skipped",
  "data": {
    "progress": {
      "pickedItems": 2,
      "totalItems": 4,
      "percentage": 50,
      "remaining": 2
    },
    "pickTracking": {
      "_id": "507f1f77bcf86cd799439014",
      "pickedItems": [...],
      "skippedItems": [
        {
          "itemId": "507f1f77bcf86cd799439012",
          "reason": "out_of_stock",
          "skippedAt": "2024-01-15T10:36:00Z"
        }
      ]
    }
  }
}
```

**Status Codes:**
- `200 OK` - Item skipped successfully
- `400 Bad Request` - Missing fields or item already skipped
- `403 Forbidden` - No permission to access order
- `404 Not Found` - Order not found
- `500 Server Error` - Server error

---

### 5. Get Pick Progress

**Endpoint:** `GET /api/scanner/pick-progress/{orderId}`

Get current pick progress for an order.

**Response:**
```json
{
  "success": true,
  "data": {
    "progress": {
      "totalItems": 4,
      "pickedItems": 2,
      "skippedItems": 1,
      "remainingItems": 1,
      "percentage": 50
    },
    "pickTracking": {
      "_id": "507f1f77bcf86cd799439014",
      "orderId": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439015",
      "userName": "John Staff",
      "userRole": "staff",
      "totalItems": 4,
      "pickedItems": [...],
      "skippedItems": [...],
      "createdAt": "2024-01-15T10:30:00Z"
    },
    "order": {
      "_id": "507f1f77bcf86cd799439011",
      "orderNumber": "ORD-12345",
      "status": "processing",
      "items": [...]
    }
  }
}
```

**Status Codes:**
- `200 OK` - Progress retrieved
- `403 Forbidden` - No permission
- `404 Not Found` - Order not found
- `500 Server Error` - Server error

---

### 6. Complete Order

**Endpoint:** `POST /api/scanner/complete-order`

Mark order as completed and update status based on pick results.

**Request:**
```json
{
  "orderId": "507f1f77bcf86cd799439011",
  "notes": "All items verified and packed"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order fulfillment completed",
  "data": {
    "order": {
      "_id": "507f1f77bcf86cd799439011",
      "orderNumber": "ORD-12345",
      "status": "ready for pickup",
      "notes": "[Fulfillment] Picked: 4/4 items. Skipped: 0 items.\n[Scanner] All items verified and packed"
    },
    "fulfillmentSummary": {
      "totalItems": 4,
      "pickedItems": 4,
      "skippedItems": 0
    }
  }
}
```

**Status Codes:**
- `200 OK` - Order completed
- `403 Forbidden` - No permission
- `404 Not Found` - Order not found
- `500 Server Error` - Server error

---

### 7. Get Orders (Warehouse Mode)

**Endpoint:** `GET /api/scanner/orders?status=pending,confirmed,processing&limit=50&page=1`

Get filtered orders for warehouse/picking mode.

**Query Parameters:**
- `status` (optional) - Comma-separated status values. Default: "pending,confirmed,processing"
- `limit` (optional) - Results per page. Default: 50
- `page` (optional) - Page number. Default: 1

**Response:**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "orderNumber": "ORD-12345",
        "status": "processing",
        "total": 45.99,
        "customer": {
          "name": "John Doe",
          "email": "john@example.com"
        },
        "items": [...],
        "market": {
          "_id": "507f1f77bcf86cd799439010",
          "name": "Fresh Market"
        },
        "createdAt": "2024-01-15T10:30:00Z",
        "progress": {
          "pickedItems": 2,
          "totalItems": 4
        }
      }
    ],
    "pagination": {
      "total": 127,
      "page": 1,
      "limit": 50,
      "pages": 3
    }
  }
}
```

**Status Codes:**
- `200 OK` - Orders retrieved
- `500 Server Error` - Server error

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Barcode is required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "You are not assigned to this order"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Product not found",
  "error": "No product with barcode 1234567890"
}
```

### 500 Server Error
```json
{
  "success": false,
  "message": "Error scanning product",
  "error": "Database connection failed"
}
```

---

## Rate Limiting

All endpoints are subject to rate limiting:
- **Development**: 20,000 requests per 5 minutes
- **Production**: 3,000 requests per 20 minutes

Rate limit exceeded response:
```json
{
  "success": false,
  "message": "Too many requests from this IP, please try again later."
}
```

---

## Authentication

### Login to get token

**Endpoint:** `POST /api/auth/login`

```json
{
  "email": "staff@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439015",
    "name": "John Staff",
    "email": "staff@example.com",
    "role": "staff",
    "isActive": true
  }
}
```

Use the `token` in the `Authorization` header for all scanner API calls.

---

## Data Types

### Order
```typescript
{
  _id: ObjectId;
  orderNumber: string;
  status: "pending" | "confirmed" | "processing" | "ready for pickup" | "OnTheWay" | "delivered" | "cancelled";
  total: number;
  subtotal: number;
  delivery: number;
  discount: number;
  fees: number;
  customer: {
    name?: string;
    email?: string;
    phoneNumber?: string;
    address?: {
      street?: string;
      city?: string;
    };
  };
  items: OrderItem[];
  market?: Market;
  notes?: string;
  shelfNumber?: string;
  createdAt: string;
}
```

### OrderItem
```typescript
{
  _id: ObjectId;
  product: Product | ObjectId | string;
  quantity: number;
  totalPrice: number;
}
```

### Product
```typescript
{
  _id: ObjectId;
  name: string;
  barcode?: string;
  sku?: string;
  price?: number;
  stock?: number;
  market?: Market;
  shelfNumber?: string;
  picture?: string;
  description?: string;
}
```

---

## Testing with cURL

```bash
# Set token and base URL
TOKEN="your_jwt_token"
API_URL="http://localhost:5000/api"

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
    "quantity": 5
  }'

# Get orders
curl -X GET "$API_URL/scanner/orders?status=processing&limit=10&page=1" \
  -H "Authorization: Bearer $TOKEN"
```

---

## WebSocket Support (Future)

Real-time order updates coming in v2.0:
```javascript
const socket = io('ws://localhost:5000/scanner');
socket.on('order:updated', (order) => {
  console.log('Order status changed:', order);
});
```
