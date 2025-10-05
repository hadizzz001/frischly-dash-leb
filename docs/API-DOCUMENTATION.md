# FRISCHLY API Documentation

## Overview

FRISCHLY is a comprehensive e-commerce platform API for managing products, orders, users, riders, categories, zones, and waste management. This API provides endpoints for customer shopping, staff management, rider operations, and administrative functions.

**Base URL:** `https://your-domain.com/api`  
**Version:** 1.0.0  
**Last Updated:** October 4, 2025

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
# FRISCHLY API Documentation

## Overview

FRISCHLY is a comprehensive e-commerce platform API for managing products, orders, users, riders, categories, zones, and waste management. This API provides endpoints for customer shopping, staff management, rider operations, and administrative functions.

**Base URL:** `https://your-domain.com/api` or `http://localhost:3001/api` (development)
**Version:** 1.0.0
**Last Updated:** October 4, 2025
**Content-Type:** `application/json` (except for file uploads)
**Rate Limit:** 2000 requests per 10 minutes per IP (production only)

## Table of Contents

- [Authentication](#authentication)
- [User Management](#user-management)
- [Products](#products)
- [Categories](#categories)
- [Subcategories](#subcategories)
- [Orders](#orders)
- [Riders](#riders)
- [Zones](#zones)
- [Waste Management](#waste-management)
- [Health Check](#health-check)
- [Error Handling](#error-handling)
- [Data Models](#data-models)
- [File Upload](#file-upload)
- [Rate Limiting](#rate-limiting)
- [Security](#security)
- [Environment Variables](#environment-variables)

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```

Authorization: Bearer <your_jwt_token>

````

### Token Expiration
- **Access Token:** 15 minutes
- **Refresh Token:** 7 days

### User Roles
- `customer`: Regular customers (can place orders, view products)
- `rider`: Delivery personnel (can update location, manage deliveries)
- `staff`: Store staff (can manage products, orders)
- `manager`: Store managers (can manage staff, view analytics)
- `admin`: System administrators (full access)

### Authentication Endpoints

#### POST /auth/register
Register a new user account.

**Access:** Public
**Validation Rules:**
- Name: 2-100 characters, required
- Email: Valid email format, required, unique
- Phone: Valid international format (+country code), required
- Password: 6+ characters, must contain uppercase, lowercase, and number
- Address: All fields required (street, city, state, zipCode, country)

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phoneNumber": "+1234567890",
  "password": "SecurePass123",
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  },
  "role": "customer"
}
````

**Success Response (201):**

```json
{
	"success": true,
	"data": {
		"user": {
			"_id": "64f1a2b3c4d5e6f7g8h9i0j1",
			"name": "John Doe",
			"email": "john@example.com",
			"phoneNumber": "+1234567890",
			"role": "customer",
			"address": {
				"street": "123 Main St",
				"city": "New York",
				"state": "NY",
				"zipCode": "10001",
				"country": "USA"
			},
			"isActive": true,
			"createdAt": "2025-10-04T10:30:00.000Z"
		},
		"accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
		"refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
	},
	"message": "User registered successfully"
}
```

**Error Responses:**

- `400`: Validation errors, duplicate email
- `500`: Server error

#### POST /auth/login

Authenticate user and get tokens.

**Access:** Public  
**Request Body:**

```json
{
	"email": "john@example.com",
	"password": "SecurePass123"
}
```

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"user": {
			"_id": "64f1a2b3c4d5e6f7g8h9i0j1",
			"name": "John Doe",
			"email": "john@example.com",
			"role": "customer"
		},
		"accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
		"refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
	},
	"message": "Login successful"
}
```

#### POST /auth/login-profile

Alternative login endpoint (same as /auth/login).

#### POST /auth/refresh

Refresh access token using refresh token.

**Access:** Public  
**Request Body:**

```json
{
	"refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
		"refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
	},
	"message": "Token refreshed successfully"
}
```

#### GET /auth/me

Get current user profile information.

**Access:** Private (All authenticated users)  
**Headers:** `Authorization: Bearer <token>`

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"user": {
			"_id": "64f1a2b3c4d5e6f7g8h9i0j1",
			"name": "John Doe",
			"email": "john@example.com",
			"phoneNumber": "+1234567890",
			"role": "customer",
			"address": {
				"street": "123 Main St",
				"city": "New York",
				"state": "NY",
				"zipCode": "10001",
				"country": "USA"
			},
			"creditCard": {
				"cardNumber": "****-****-****-1234",
				"expiryMonth": "12",
				"expiryYear": "2026",
				"holderName": "John Doe",
				"cardType": "visa"
			},
			"isActive": true,
			"createdAt": "2025-10-04T10:30:00.000Z",
			"updatedAt": "2025-10-04T10:30:00.000Z"
		}
	},
	"message": "Profile retrieved successfully"
}
```

#### PUT /auth/profile

Update user profile information.

**Access:** Private (All authenticated users)  
**Headers:** `Authorization: Bearer <token>`

**Request Body (all fields optional):**

```json
{
	"name": "John Smith",
	"phoneNumber": "+1987654321",
	"email": "johnsmith@example.com",
	"address": {
		"street": "456 Oak Ave",
		"city": "Los Angeles",
		"state": "CA",
		"zipCode": "90210",
		"country": "USA"
	},
	"creditCard": {
		"cardNumber": "4111111111111111",
		"expiryMonth": "08",
		"expiryYear": "2027",
		"cvv": "123",
		"holderName": "John Smith",
		"cardType": "visa"
	}
}
```

#### PUT /auth/change-password

Change user password.

**Access:** Private (All authenticated users)  
**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
	"currentPassword": "CurrentPass123",
	"newPassword": "NewSecurePass456"
}
```

**Password Requirements:**

- Minimum 6 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

## User Management

### GET /auth/users

Get all users with filtering and pagination.

**Access:** Private (Admin only)  
**Query Parameters:**

- `role`: Filter by role (customer, rider, staff, manager, admin)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)
- `search`: Search in name or email
- `isActive`: Filter by active status (true/false)

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"users": [
			{
				"_id": "64f1a2b3c4d5e6f7g8h9i0j1",
				"name": "John Doe",
				"email": "john@example.com",
				"phoneNumber": "+1234567890",
				"role": "customer",
				"isActive": true,
				"createdAt": "2025-10-04T10:30:00.000Z"
			}
		],
		"pagination": {
			"currentPage": 1,
			"totalPages": 5,
			"totalUsers": 50,
			"hasNext": true,
			"hasPrev": false
		}
	},
	"message": "Users retrieved successfully"
}
```

### GET /auth/users/:id

Get specific user by ID.

**Access:** Private (Admin, Manager, User themselves)

### POST /auth/users

Create new user (Admin only).

**Access:** Private (Admin only)  
**Same validation as /auth/register**

### PUT /auth/users/:id

Update user (Admin only).

**Access:** Private (Admin only)

### DELETE /auth/users/:id

Delete user (Admin only).

**Access:** Private (Admin only)

### GET /auth/customers/count

Get total customer count.

**Access:** Private (Admin, Manager)

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"count": 1250
	},
	"message": "Customer count retrieved successfully"
}
```

## Products

### GET /products

Get all products with advanced filtering and pagination.

**Access:** Public  
**Query Parameters:**

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)
- `search`: Search in product name, description, or barcode
- `category`: Category ID filter
- `subcategory`: Subcategory ID filter
- `shelfNumber`: Shelf number filter
- `isActive`: Active status filter (true/false/all, default: true)
- `inAds`: In advertisements filter (true/false/all)
- `sortBy`: Sort field (createdAt, name, price, stockQuantity, discount, updatedAt)
- `sortOrder`: Sort order (asc/desc, default: desc)
- `priceRange`: Price range (under-10, 10-25, 25-50, 50-100, over-100, all)
- `stockLevel`: Stock level (in-stock, low-stock, out-of-stock, all)
- `discount`: Has discount filter (true/false/all)
- `minDiscount`: Minimum discount percentage (0-100)

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"products": [
			{
				"_id": "64f1a2b3c4d5e6f7g8h9i0j2",
				"name": "Organic Milk",
				"description": "Fresh organic whole milk",
				"barcode": "123456789012",
				"price": 3.99,
				"discount": {
					"percentage": 10,
					"startDate": "2025-10-01T00:00:00.000Z",
					"endDate": "2025-10-31T23:59:59.000Z"
				},
				"stockQuantity": 50,
				"stockAlert": 10,
				"shelfNumber": "D-05",
				"category": {
					"_id": "64f1a2b3c4d5e6f7g8h9i0j3",
					"name": "Dairy"
				},
				"subcategory": {
					"_id": "64f1a2b3c4d5e6f7g8h9i0j4",
					"name": "Milk"
				},
				"images": [
					{
						"url": "/uploads/products/milk-123456.jpg",
						"alt": "Organic Milk"
					}
				],
				"isActive": true,
				"inAds": true,
				"createdAt": "2025-10-04T09:00:00.000Z",
				"updatedAt": "2025-10-04T09:00:00.000Z"
			}
		],
		"pagination": {
			"currentPage": 1,
			"totalPages": 25,
			"totalProducts": 250,
			"hasNext": true,
			"hasPrev": false
		}
	},
	"message": "Products retrieved successfully"
}
```

### GET /products/count

Get total product count with optional filters.

**Access:** Public  
**Same query parameters as GET /products**

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"count": 250
	},
	"message": "Product count retrieved successfully"
}
```

### GET /products/category

Get products by category.

**Access:** Public  
**Query Parameters:** All from GET /products plus:

- `categoryId`: Category ID (required)

### GET /products/subcategory

Get products by subcategory.

**Access:** Public  
**Query Parameters:** All from GET /products plus:

- `subcategoryId`: Subcategory ID (required)

### GET /products/discount

Get products with active discounts.

**Access:** Public  
**Query Parameters:** All from GET /products

### GET /products/shelves

Get all unique shelf numbers.

**Access:** Public

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"shelves": ["A-01", "A-02", "B-01", "C-05", "D-05"]
	},
	"message": "Shelf numbers retrieved successfully"
}
```

### GET /products/barcode/:barcode

Get product by barcode.

**Access:** Public  
**URL Parameters:**

- `barcode`: Product barcode (required)

### GET /products/:id

Get product by ID.

**Access:** Public  
**URL Parameters:**

- `id`: Product ID (required)

### POST /products

Create new product.

**Access:** Private (Admin, Manager)  
**Content-Type:** `multipart/form-data`

**Form Data:**

- `name`: Product name (required, 2-200 chars)
- `description`: Product description (optional, max 1000 chars)
- `barcode`: Product barcode (optional, unique)
- `price`: Product price (required, > 0)
- `stockQuantity`: Stock quantity (required, >= 0)
- `stockAlert`: Stock alert threshold (optional, >= 0)
- `shelfNumber`: Shelf number (optional)
- `category`: Category ID (required)
- `subcategory`: Subcategory ID (optional)
- `isActive`: Active status (optional, default: true)
- `inAds`: In advertisements (optional, default: false)
- `images`: Product images (optional, multiple files allowed)

**Discount fields (optional):**

- `discount.percentage`: Discount percentage (0-100)
- `discount.startDate`: Discount start date
- `discount.endDate`: Discount end date

### PUT /products/:id

Update product.

**Access:** Private (Admin, Manager, Staff)  
**Content-Type:** `multipart/form-data`  
**Same fields as POST /products**

### PATCH /products/:id/stock

Update product stock.

**Access:** Private (Admin, Manager, Staff)  
**Request Body:**

```json
{
	"stockQuantity": 75,
	"stockAlert": 15
}
```

### PATCH /products/:id/shelf

Update product shelf number.

**Access:** Private (Admin, Manager, Staff)  
**Request Body:**

```json
{
	"shelfNumber": "A-01"
}
```

### DELETE /products/:id

Soft delete product (sets isActive to false).

**Access:** Private (Admin)

### DELETE /products/:id/permanent

Permanently delete product.

**Access:** Private (Admin)

## Categories

### GET /categories

Get all categories.

**Access:** Public  
**Query Parameters:**

- `isActive`: Active status filter (true/false, default: true)
- `sortBy`: Sort field (name, createdAt)
- `sortOrder`: Sort order (asc/desc)

### GET /categories/all/product-count

Get all categories with their product counts.

**Access:** Public

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"categories": [
			{
				"_id": "64f1a2b3c4d5e6f7g8h9i0j3",
				"name": "Dairy",
				"description": "Milk, cheese, yogurt products",
				"image": "/uploads/categories/dairy.jpg",
				"isActive": true,
				"sortOrder": 1,
				"productCount": 25,
				"createdAt": "2025-10-01T00:00:00.000Z"
			}
		]
	},
	"message": "Categories with product counts retrieved successfully"
}
```

### GET /categories/:id

Get category by ID.

**Access:** Public

### GET /categories/:id/product-count

Get product count for specific category.

**Access:** Public

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"categoryId": "64f1a2b3c4d5e6f7g8h9i0j3",
		"categoryName": "Dairy",
		"productCount": 25
	},
	"message": "Category product count retrieved successfully"
}
```

### POST /categories

Create new category.

**Access:** Private (Admin, Manager)  
**Content-Type:** `multipart/form-data`

**Form Data:**

- `name`: Category name (required, 2-100 chars, unique)
- `description`: Category description (optional, max 500 chars)
- `sortOrder`: Sort order (optional, number)
- `isActive`: Active status (optional, default: true)
- `image`: Category image (optional)

### PUT /categories/:id

Update category.

**Access:** Private (Admin, Manager)  
**Content-Type:** `multipart/form-data`  
**Same fields as POST**

### DELETE /categories/:id

Soft delete category.

**Access:** Private (Admin)

### DELETE /categories/:id/permanent

Permanently delete category.

**Access:** Private (Admin)

## Subcategories

### GET /subcategories

Get all subcategories.

**Access:** Public  
**Query Parameters:**

- `category`: Filter by category ID
- `isActive`: Active status filter (true/false, default: true)
- `sortBy`: Sort field (name, createdAt)
- `sortOrder`: Sort order (asc/desc)

### GET /subcategories/:id

Get subcategory by ID.

**Access:** Public

### POST /subcategories

Create new subcategory.

**Access:** Private (Admin, Manager, Staff)  
**Request Body:**

```json
{
	"name": "Whole Milk",
	"category": "64f1a2b3c4d5e6f7g8h9i0j3",
	"description": "Fresh whole milk products",
	"isActive": true
}
```

### PUT /subcategories/:id

Update subcategory.

**Access:** Private (Admin, Manager, Staff)  
**Same fields as POST**

### DELETE /subcategories/:id

Delete subcategory.

**Access:** Private (Admin, Manager, Staff)

## Orders

### GET /orders

Get orders with advanced filtering.

**Access:** Private (Admin, Manager, Staff, Customer, Rider)  
**Query Parameters:**

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)
- `status`: Order status filter (comma-separated for multiple)
- `paymentStatus`: Payment status filter (comma-separated)
- `assignedRider`: Rider ID filter
- `customer`: Customer ID filter
- `startDate`: Start date filter (ISO 8601)
- `endDate`: End date filter (ISO 8601)
- `sortBy`: Sort field (createdAt, total, status)
- `sortOrder`: Sort order (asc/desc, default: desc)

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"orders": [
			{
				"_id": "64f1a2b3c4d5e6f7g8h9i0j5",
				"orderNumber": "ORD-2025-001",
				"customer": {
					"_id": "64f1a2b3c4d5e6f7g8h9i0j1",
					"name": "John Doe",
					"phoneNumber": "+1234567890"
				},
				"items": [
					{
						"product": {
							"_id": "64f1a2b3c4d5e6f7g8h9i0j2",
							"name": "Organic Milk",
							"price": 3.99
						},
						"quantity": 2,
						"unitPrice": 3.99,
						"totalPrice": 7.98
					}
				],
				"subtotal": 7.98,
				"tax": 0.64,
				"deliveryFee": 2.99,
				"total": 11.61,
				"status": "confirmed",
				"paymentStatus": "paid",
				"paymentMethod": "card",
				"deliveryAddress": {
					"street": "123 Main St",
					"city": "New York",
					"zipCode": "10001"
				},
				"assignedRider": {
					"_id": "64f1a2b3c4d5e6f7g8h9i0j6",
					"name": "Mike Johnson"
				},
				"createdAt": "2025-10-04T11:00:00.000Z",
				"updatedAt": "2025-10-04T11:05:00.000Z"
			}
		],
		"pagination": {
			"currentPage": 1,
			"totalPages": 10,
			"totalOrders": 100,
			"hasNext": true,
			"hasPrev": false
		}
	},
	"message": "Orders retrieved successfully"
}
```

### GET /orders/runningOrder

Get running orders for riders (orders that need delivery).

**Access:** Private (Admin, Manager, Staff, Customer, Rider)

### GET /orders/stats

Get order statistics.

**Access:** Private (Admin, Manager)  
**Query Parameters:**

- `startDate`: Start date for stats
- `endDate`: End date for stats

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"totalOrders": 150,
		"totalRevenue": 2500.5,
		"averageOrderValue": 16.67,
		"ordersByStatus": {
			"pending": 5,
			"confirmed": 10,
			"processing": 15,
			"ready for pickup": 20,
			"On the way": 25,
			"delivered": 70,
			"cancelled": 5
		},
		"ordersByPaymentStatus": {
			"pending": 10,
			"paid": 135,
			"failed": 3,
			"refunded": 2
		},
		"dailyStats": [
			{
				"date": "2025-10-04",
				"orders": 25,
				"revenue": 425.5
			}
		]
	},
	"message": "Order statistics retrieved successfully"
}
```

### GET /orders/count

Get order count with filters.

**Access:** Private (Admin, Manager, Staff)

### GET /orders/:id

Get order by ID.

**Access:** Private (Admin, Manager, Staff, Customer, Rider - can only view own orders)

### POST /orders

Create new order.

**Access:** Private (Admin, Manager, Staff, Customer)  
**Request Body:**

```json
{
	"customer": "64f1a2b3c4d5e6f7g8h9i0j1",
	"items": [
		{
			"product": "64f1a2b3c4d5e6f7g8h9i0j2",
			"quantity": 2
		}
	],
	"deliveryAddress": {
		"street": "123 Main St",
		"city": "New York",
		"state": "NY",
		"zipCode": "10001",
		"country": "USA"
	},
	"paymentMethod": "card",
	"notes": "Please ring doorbell"
}
```

### PUT /orders/:id

Update order.

**Access:** Private (Admin, Manager, Staff, Rider)

### PATCH /orders/:id/shelf

Update order shelf number.

**Access:** Private (Admin, Manager, Staff)

### PATCH /orders/:id/status

Update order status.

**Access:** Private (Admin, Manager, Staff, Rider)  
**Request Body:**

```json
{
	"status": "On the way",
	"assignedRider": "64f1a2b3c4d5e6f7g8h9i0j6"
}
```

**Available Status Transitions:**

- `pending` → `confirmed`
- `confirmed` → `processing`
- `processing` → `ready for pickup`
- `ready for pickup` → `On the way`
- `On the way` → `delivered`
- Any status → `cancelled`

### PATCH /orders/:id/cancel

Cancel order.

**Access:** Private (Admin, Manager)

### DELETE /orders/:id

Delete order.

**Access:** Private (Admin)

## Riders

### GET /riders

Get all riders with stats.

**Access:** Private (Admin, Manager)  
**Query Parameters:**

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `zone`: Zone filter
- `status`: Status filter (available, busy, offline, on-break)
- `vehicleType`: Vehicle type filter (bike, motorbike, car, bicycle)
- `search`: Search in rider name or email
- `sortBy`: Sort field (createdAt, name, rating, totalEarnings)
- `sortOrder`: Sort order (asc/desc, default: desc)

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"riders": [
			{
				"_id": "64f1a2b3c4d5e6f7g8h9i0j6",
				"user": {
					"_id": "64f1a2b3c4d5e6f7g8h9i0j7",
					"name": "Mike Johnson",
					"email": "mike@example.com",
					"phoneNumber": "+1234567891"
				},
				"zones": ["Manhattan", "Brooklyn"],
				"status": "available",
				"vehicleType": "bike",
				"vehicleNumber": "BK-123",
				"ordersPickedCount": 150,
				"ordersDeliveredCount": 145,
				"activeOrdersCount": 2,
				"completionRate": 96.67,
				"totalEarnings": 1250.5,
				"rating": {
					"average": 4.8,
					"count": 145
				},
				"currentLocation": {
					"latitude": 40.7128,
					"longitude": -74.006,
					"lastUpdated": "2025-10-04T12:00:00.000Z"
				},
				"isVerified": true,
				"lastActiveAt": "2025-10-04T12:00:00.000Z",
				"createdAt": "2025-10-03T00:00:00.000Z"
			}
		],
		"pagination": {
			"currentPage": 1,
			"totalPages": 3,
			"totalRiders": 25,
			"hasNext": true,
			"hasPrev": false
		}
	},
	"message": "Riders retrieved successfully"
}
```

### GET /riders/stats

Get rider statistics.

**Access:** Private (Admin, Manager)

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"overall": {
			"totalRiders": 25,
			"availableRiders": 15,
			"busyRiders": 8,
			"offlineRiders": 2,
			"verifiedRiders": 22,
			"totalOrdersPicked": 1250,
			"totalOrdersDelivered": 1200,
			"totalEarnings": 8750.5,
			"averageRating": 4.6
		},
		"byZone": [
			{
				"_id": "Manhattan",
				"riderCount": 12,
				"availableCount": 8,
				"busyCount": 4
			}
		],
		"byVehicleType": [
			{
				"_id": "bike",
				"count": 15
			},
			{
				"_id": "motorbike",
				"count": 8
			},
			{
				"_id": "car",
				"count": 2
			}
		]
	},
	"message": "Rider statistics retrieved successfully"
}
```

### GET /riders/available/:zone

Get available riders in specific zone.

**Access:** Private (Admin, Manager)

### GET /riders/:id

Get rider by ID.

**Access:** Private (Admin, Manager, Rider themselves)

### POST /riders

Create new rider profile.

**Access:** Private (Admin, Manager)  
**Request Body:**

```json
{
	"userId": "64f1a2b3c4d5e6f7g8h9i0j7",
	"zones": ["Manhattan", "Brooklyn"],
	"vehicleType": "bike",
	"vehicleNumber": "BK-123",
	"workingHours": {
		"start": "09:00",
		"end": "18:00"
	},
	"verificationDocuments": [
		{
			"type": "license",
			"url": "/uploads/riders/license-123.jpg"
		}
	]
}
```

### PUT /riders/:id

Update rider profile.

**Access:** Private (Admin, Manager, Rider themselves)

### PATCH /riders/:id/status

Update rider status.

**Access:** Private (Admin, Manager, Rider themselves)  
**Request Body:**

```json
{
	"status": "available",
	"location": {
		"latitude": 40.7128,
		"longitude": -74.006
	}
}
```

### PATCH /riders/location

Update rider current location.

**Access:** Private (Admin, Manager, Rider)  
**Request Body:**

```json
{
	"latitude": 40.7128,
	"longitude": -74.006
}
```

**Validation:**

- Latitude: -90 to 90
- Longitude: -180 to 180

### DELETE /riders/:id

Delete rider profile.

**Access:** Private (Admin)

## Zones

### GET /zones

Get all zones.

**Access:** Public  
**Query Parameters:**

- `isActive`: Active status filter (true/false, default: true)

### GET /zones/zipcode/:zipCode

Get zone by zip code.

**Access:** Public

### POST /zones/calculate-delivery

Calculate delivery fee for an order.

**Access:** Public  
**Request Body:**

```json
{
	"zipCode": "10001",
	"orderTotal": 25.99
}
```

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"zone": {
			"_id": "64f1a2b3c4d5e6f7g8h9i0j8",
			"name": "Manhattan",
			"zipCodes": ["10001", "10002", "10003"],
			"deliveryFee": 2.99,
			"minimumOrder": 15.0,
			"isActive": true
		},
		"deliveryFee": 2.99,
		"freeDelivery": false,
		"totalWithDelivery": 28.98
	},
	"message": "Delivery fee calculated successfully"
}
```

### GET /zones/:id

Get zone by ID.

**Access:** Public

### GET /zones/admin/stats

Get zone statistics.

**Access:** Private (Admin, Manager)

### POST /zones

Create new zone.

**Access:** Private (Admin, Manager, Staff)  
**Request Body:**

```json
{
	"name": "Queens",
	"zipCodes": ["11301", "11302", "11303"],
	"deliveryFee": 3.99,
	"minimumOrder": 20.0,
	"isActive": true
}
```

### PUT /zones/:id

Update zone.

**Access:** Private (Admin, Manager, Staff)

### PATCH /zones/:id/status

Update zone status.

**Access:** Private (Admin, Manager, Staff)

### DELETE /zones/:id

Soft delete zone.

**Access:** Private (Admin)

### DELETE /zones/:id/permanent

Permanently delete zone.

**Access:** Private (Admin)

## Waste Management

### GET /waste

Get all waste records.

**Access:** Private (Admin, Staff)  
**Query Parameters:**

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `startDate`: Start date filter
- `endDate`: End date filter
- `reason`: Waste reason filter

### GET /waste/stats

Get waste statistics.

**Access:** Private (Admin, Staff)

**Success Response (200):**

```json
{
	"success": true,
	"data": {
		"totalWasteRecords": 50,
		"totalWasteQuantity": 125,
		"totalWasteValue": 450.75,
		"wasteByReason": {
			"expired": 30,
			"damaged": 15,
			"returned": 5
		},
		"wasteByCategory": {
			"Dairy": 25,
			"Fruits": 15,
			"Bakery": 10
		}
	},
	"message": "Waste statistics retrieved successfully"
}
```

### GET /waste/product/:barcode

Get product by barcode for waste management.

**Access:** Private (Admin, Staff)

### GET /waste/:id

Get waste record by ID.

**Access:** Private (Admin, Staff)

### POST /waste

Create waste record.

**Access:** Private (Admin, Staff)  
**Request Body:**

```json
{
	"productBarcode": "123456789012",
	"quantity": 5,
	"reason": "expired",
	"notes": "Product past expiration date",
	"wasteValue": 19.95
}
```

### PUT /waste/:id

Update waste record.

**Access:** Private (Admin)

### DELETE /waste/:id

Delete waste record.

**Access:** Private (Admin)

## Health Check

### GET /api/health

Check server health and status.

**Access:** Public

**Success Response (200):**

```json
{
	"success": true,
	"message": "Server is running",
	"timestamp": "2025-10-04T12:00:00.000Z",
	"environment": "production",
	"version": "1.0.0",
	"uptime": "2 days, 4 hours"
}
```

## Error Handling

All API responses follow a consistent structure. Errors include detailed validation messages.

### Success Response Structure

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response Structure

```json
{
	"success": false,
	"message": "Error description",
	"error": "Detailed error message",
	"errors": ["Validation error 1", "Validation error 2"] // For validation errors
}
```

### HTTP Status Codes

#### 2xx Success

- `200`: OK - Request successful
- `201`: Created - Resource created successfully

#### 4xx Client Errors

- `400`: Bad Request - Invalid request data or validation error
- `401`: Unauthorized - Missing or invalid authentication token
- `403`: Forbidden - Insufficient permissions
- `404`: Not Found - Resource not found
- `409`: Conflict - Resource conflict (duplicate data)
- `422`: Unprocessable Entity - Validation failed
- `429`: Too Many Requests - Rate limit exceeded

#### 5xx Server Errors

- `500`: Internal Server Error - Unexpected server error
- `503`: Service Unavailable - Server temporarily unavailable

### Common Error Messages

#### Authentication Errors

```json
{
	"success": false,
	"message": "Invalid token",
	"error": "The provided authentication token is invalid or expired"
}
```

#### Validation Errors

```json
{
	"success": false,
	"message": "Validation Error",
	"errors": [
		"Name must be between 2 and 100 characters",
		"Email must be a valid email address",
		"Password must contain at least one uppercase letter"
	]
}
```

#### Permission Errors

```json
{
	"success": false,
	"message": "Not authorized to access this resource",
	"error": "Your role does not have permission to perform this action"
}
```

## Data Models

### User Model

```javascript
{
  _id: ObjectId,
  name: String (required, 2-100 chars),
  email: String (required, unique, valid email),
  phoneNumber: String (required, valid international format),
  password: String (required, hashed),
  role: String (enum: customer, rider, staff, manager, admin),
  address: {
    street: String (required),
    city: String (required),
    state: String (required),
    zipCode: String (required),
    country: String (required)
  },
  creditCard: {
    cardNumber: String (encrypted),
    expiryMonth: String,
    expiryYear: String,
    cvv: String (not stored),
    holderName: String,
    cardType: String (visa, mastercard, amex, discover)
  },
  isActive: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}
```

### Product Model

```javascript
{
  _id: ObjectId,
  name: String (required, 2-200 chars),
  description: String (max 1000 chars),
  barcode: String (unique),
  price: Number (required, > 0),
  discount: {
    percentage: Number (0-100),
    startDate: Date,
    endDate: Date
  },
  stockQuantity: Number (required, >= 0),
  stockAlert: Number (>= 0),
  shelfNumber: String,
  category: ObjectId (ref: Category),
  subcategory: ObjectId (ref: Subcategory),
  images: [{
    url: String,
    alt: String
  }],
  isActive: Boolean (default: true),
  inAds: Boolean (default: false),
  createdAt: Date,
  updatedAt: Date
}
```

### Order Model

```javascript
{
  _id: ObjectId,
  orderNumber: String (unique, auto-generated),
  customer: ObjectId (ref: User),
  items: [{
    product: ObjectId (ref: Product),
    quantity: Number (required, > 0),
    unitPrice: Number (required),
    totalPrice: Number (required)
  }],
  subtotal: Number,
  tax: Number,
  deliveryFee: Number,
  total: Number,
  status: String (enum: pending, confirmed, processing, ready for pickup, On the way, delivered, cancelled),
  paymentStatus: String (enum: pending, paid, failed, refunded),
  paymentMethod: String (card, cash),
  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  assignedRider: ObjectId (ref: Rider),
  riderAssignedAt: Date,
  deliveryCompletedAt: Date,
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Rider Model

```javascript
{
  _id: ObjectId,
  user: ObjectId (ref: User, unique),
  zones: [String] (required),
  status: String (enum: available, busy, offline, on-break),
  vehicleType: String (enum: bike, motorbike, car, bicycle),
  vehicleNumber: String,
  workingHours: {
    start: String,
    end: String
  },
  currentLocation: {
    latitude: Number (-90 to 90),
    longitude: Number (-180 to 180),
    lastUpdated: Date
  },
  ordersPickedCount: Number (default: 0),
  ordersDeliveredCount: Number (default: 0),
  totalEarnings: Number (default: 0),
  rating: {
    average: Number (0-5),
    count: Number
  },
  verificationDocuments: [{
    type: String,
    url: String,
    verified: Boolean
  }],
  isVerified: Boolean (default: false),
  lastActiveAt: Date,
  createdAt: Date
}
```

### Category Model

```javascript
{
  _id: ObjectId,
  name: String (required, 2-100 chars, unique),
  description: String (max 500 chars),
  image: String,
  sortOrder: Number,
  isActive: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}
```

### Zone Model

```javascript
{
  _id: ObjectId,
  name: String (required, unique),
  zipCodes: [String] (required),
  deliveryFee: Number (required, >= 0),
  minimumOrder: Number (required, >= 0),
  isActive: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}
```

## File Upload

### Supported File Types

- **Images**: JPEG, PNG, WebP, GIF
- **Maximum File Size**: 10MB per file
- **Multiple Files**: Supported for product images

### Upload Endpoints

- `POST /products` - Product creation/update
- `POST /categories` - Category creation/update
- `POST /products/upload-image` - Additional product images

### File Storage

- Files are stored in `/uploads/` directory
- URLs are returned in API responses
- Files are served statically via `/uploads/` path

### Image Processing

- Automatic resizing for thumbnails
- Format optimization
- Metadata stripping for security

## Rate Limiting

### Production Environment

- **Limit**: 2000 requests per 10 minutes per IP
- **Headers**: Rate limit headers are included in responses
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Time until reset (Unix timestamp)

### Development Environment

- No rate limiting applied

### Rate Limit Exceeded Response

```json
{
	"success": false,
	"message": "Too many requests from this IP, please try again later.",
	"error": "Rate limit exceeded"
}
```

## Security

### Authentication & Authorization

- JWT tokens with expiration
- Role-based access control (RBAC)
- Password hashing with bcrypt
- Secure token storage

### Data Protection

- Input validation and sanitization
- SQL injection prevention (MongoDB)
- XSS protection
- CSRF protection via CORS

### File Security

- File type validation
- Virus scanning (recommended)
- Secure file naming
- Access control for uploads

### HTTPS

- SSL/TLS encryption required in production
- Secure cookie settings
- HSTS headers

## Environment Variables

### Required Variables

```bash
NODE_ENV=production|development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/frischly
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d
CLIENT_URL=https://your-frontend-domain.com
```

### Optional Variables

```bash
CORS_ORIGIN=https://your-frontend-domain.com
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760
RATE_LIMIT_WINDOW=10
RATE_LIMIT_MAX=2000
```

## WebSocket Support

Real-time updates via Socket.IO (planned for future release):

- Order status changes
- Rider location updates
- Inventory changes
- New order notifications

## Testing

### Test Endpoints

- Health check: `GET /api/health`
- Authentication: Login/logout flow
- CRUD operations for all resources

### Test Data

Sample data is available in the `/scripts/` directory for testing purposes.

## Changelog

### Version 1.0.0 (October 4, 2025)

- Initial API release
- Complete CRUD operations for all resources
- JWT authentication and authorization
- File upload support
- Rate limiting and security features
- Comprehensive error handling

## Support

For API support or questions:

- **Email**: support@frischly.com
- **Documentation**: This API documentation
- **Version**: 1.0.0
- **Last Updated**: October 4, 2025

## License

This API documentation is part of the FRISCHLY platform.

````

### Authentication Endpoints

#### POST /auth/register
Register a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phoneNumber": "+1234567890",
  "password": "SecurePass123",
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  }
}
````

**Response:**

```json
{
	"success": true,
	"data": {
		"user": {
			"id": "user_id",
			"name": "John Doe",
			"email": "john@example.com",
			"role": "customer"
		},
		"accessToken": "jwt_token",
		"refreshToken": "refresh_token"
	}
}
```

#### POST /auth/login

Authenticate user and get tokens.

**Request Body:**

```json
{
	"email": "john@example.com",
	"password": "SecurePass123"
}
```

#### POST /auth/refresh

Refresh access token using refresh token.

**Request Body:**

```json
{
	"refreshToken": "refresh_token_here"
}
```

#### GET /auth/me

Get current user profile.

**Headers:** `Authorization: Bearer <token>`

#### PUT /auth/profile

Update user profile.

**Headers:** `Authorization: Bearer <token>`

#### PUT /auth/change-password

Change user password.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
	"currentPassword": "old_password",
	"newPassword": "new_secure_password"
}
```

## User Management

### GET /auth/users

Get all users (Admin only).

**Query Parameters:**

- `role`: Filter by role (customer, rider, staff, manager, admin)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

### GET /auth/users/:id

Get user by ID.

### POST /auth/users

Create new user (Admin only).

### PUT /auth/users/:id

Update user (Admin only).

### DELETE /auth/users/:id

Delete user (Admin only).

### GET /auth/customers/count

Get total customer count (Admin/Manager only).

## Products

### GET /products

Get all products with filtering and pagination.

**Query Parameters:**

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `search`: Search term
- `category`: Category ID
- `subcategory`: Subcategory ID
- `shelfNumber`: Shelf number
- `isActive`: Active status (true/false/all)
- `inAds`: In ads filter (true/false/all)
- `sortBy`: Sort field (createdAt, name, price, etc.)
- `sortOrder`: Sort order (asc/desc)
- `priceRange`: Price range filter
- `stockLevel`: Stock level filter
- `discount`: Discount filter
- `minDiscount`: Minimum discount percentage

### GET /products/count

Get total product count.

### GET /products/category

Get products by category.

### GET /products/subcategory

Get products by subcategory.

### GET /products/discount

Get products with discounts.

### GET /products/shelves

Get all shelf numbers.

### GET /products/barcode/:barcode

Get product by barcode.

### GET /products/:id

Get product by ID.

### POST /products

Create new product (Admin/Manager only).

**Content-Type:** `multipart/form-data`

### PUT /products/:id

Update product (Admin/Manager/Staff).

**Content-Type:** `multipart/form-data`

### PATCH /products/:id/stock

Update product stock (Admin/Manager/Staff).

**Request Body:**

```json
{
	"stockQuantity": 50,
	"stockAlert": 10
}
```

### PATCH /products/:id/shelf

Update product shelf number (Admin/Manager/Staff).

**Request Body:**

```json
{
	"shelfNumber": "A-01"
}
```

### DELETE /products/:id

Soft delete product (Admin only).

### DELETE /products/:id/permanent

Permanently delete product (Admin only).

## Categories

### GET /categories

Get all categories.

### GET /categories/all/product-count

Get all categories with product counts.

### GET /categories/:id

Get category by ID.

### GET /categories/:id/product-count

Get product count for specific category.

### POST /categories

Create new category (Admin/Manager only).

**Content-Type:** `multipart/form-data`

### PUT /categories/:id

Update category (Admin/Manager only).

**Content-Type:** `multipart/form-data`

### DELETE /categories/:id

Soft delete category (Admin only).

### DELETE /categories/:id/permanent

Permanently delete category (Admin only).

## Subcategories

### GET /subcategories

Get all subcategories.

### GET /subcategories/:id

Get subcategory by ID.

### POST /subcategories

Create new subcategory (Admin/Manager/Staff).

**Request Body:**

```json
{
	"name": "Dairy Products",
	"category": "category_id",
	"description": "Milk, cheese, yogurt, etc.",
	"isActive": true
}
```

### PUT /subcategories/:id

Update subcategory (Admin/Manager/Staff).

### DELETE /subcategories/:id

Delete subcategory (Admin/Manager/Staff).

## Orders

### GET /orders

Get orders with filtering.

**Query Parameters:**

- `page`: Page number
- `limit`: Items per page
- `status`: Order status filter
- `paymentStatus`: Payment status filter
- `assignedRider`: Rider ID filter
- `customer`: Customer ID filter
- `startDate`: Start date filter
- `endDate`: End date filter
- `sortBy`: Sort field
- `sortOrder`: Sort order

### GET /orders/runningOrder

Get running orders for riders.

### GET /orders/stats

Get order statistics (Admin/Manager only).

### GET /orders/count

Get order count (Admin/Manager/Staff).

### GET /orders/:id

Get order by ID.

### POST /orders

Create new order.

**Request Body:**

```json
{
	"customer": "customer_id",
	"items": [
		{
			"product": "product_id",
			"quantity": 2,
			"unitPrice": 5.99
		}
	],
	"deliveryAddress": {
		"street": "123 Main St",
		"city": "New York",
		"zipCode": "10001"
	},
	"paymentMethod": "card",
	"notes": "Leave at door"
}
```

### PUT /orders/:id

Update order (Admin/Manager/Staff/Rider).

### PATCH /orders/:id/shelf

Update order shelf number (Admin/Manager/Staff).

### PATCH /orders/:id/status

Update order status (Admin/Manager/Staff/Rider).

**Request Body:**

```json
{
	"status": "confirmed",
	"assignedRider": "rider_id"
}
```

### PATCH /orders/:id/cancel

Cancel order (Admin/Manager only).

### DELETE /orders/:id

Delete order (Admin only).

## Riders

### GET /riders

Get all riders with stats (Admin/Manager only).

**Query Parameters:**

- `page`: Page number
- `limit`: Items per page
- `zone`: Zone filter
- `status`: Status filter (available, busy, offline, on-break)
- `vehicleType`: Vehicle type filter
- `search`: Search term
- `sortBy`: Sort field
- `sortOrder`: Sort order

### GET /riders/stats

Get rider statistics (Admin/Manager only).

### GET /riders/available/:zone

Get available riders in zone (Admin/Manager only).

### GET /riders/:id

Get rider by ID.

### POST /riders

Create new rider profile (Admin/Manager only).

**Request Body:**

```json
{
	"userId": "user_id",
	"zones": ["zone1", "zone2"],
	"vehicleType": "bike",
	"vehicleNumber": "ABC-123",
	"workingHours": {
		"start": "09:00",
		"end": "18:00"
	}
}
```

### PUT /riders/:id

Update rider profile.

### PATCH /riders/:id/status

Update rider status.

**Request Body:**

```json
{
	"status": "available",
	"location": {
		"latitude": 40.7128,
		"longitude": -74.006
	}
}
```

### PATCH /riders/location

Update rider current location.

**Request Body:**

```json
{
	"latitude": 40.7128,
	"longitude": -74.006
}
```

### DELETE /riders/:id

Delete rider profile (Admin only).

## Zones

### GET /zones

Get all zones.

### GET /zones/zipcode/:zipCode

Get zone by zip code.

### POST /zones/calculate-delivery

Calculate delivery fee.

**Request Body:**

```json
{
	"zipCode": "10001",
	"orderTotal": 25.99
}
```

### GET /zones/:id

Get zone by ID.

### GET /zones/admin/stats

Get zone statistics (Admin/Manager only).

### POST /zones

Create new zone (Admin/Manager/Staff).

**Request Body:**

```json
{
	"name": "Manhattan",
	"zipCodes": ["10001", "10002"],
	"deliveryFee": 2.99,
	"minimumOrder": 15.0,
	"isActive": true
}
```

### PUT /zones/:id

Update zone (Admin/Manager/Staff).

### PATCH /zones/:id/status

Update zone status (Admin/Manager/Staff).

### DELETE /zones/:id

Soft delete zone (Admin only).

### DELETE /zones/:id/permanent

Permanently delete zone (Admin only).

## Waste Management

### GET /waste

Get all waste records (Admin/Staff only).

### GET /waste/stats

Get waste statistics (Admin/Staff only).

### GET /waste/product/:barcode

Get product by barcode for waste management (Admin/Staff only).

### GET /waste/:id

Get waste record by ID (Admin/Staff only).

### POST /waste

Create waste record (Admin/Staff only).

**Request Body:**

```json
{
	"productBarcode": "123456789",
	"quantity": 5,
	"reason": "expired",
	"notes": "Product past expiration date"
}
```

### PUT /waste/:id

Update waste record (Admin only).

### DELETE /waste/:id

Delete waste record (Admin only).

## Health Check

### GET /api/health

Check server health status.

**Response:**

```json
{
	"success": true,
	"message": "Server is running",
	"timestamp": "2025-10-04T12:00:00.000Z"
}
```

## Error Handling

All API responses follow this structure:

**Success Response:**

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

**Error Response:**

```json
{
	"success": false,
	"message": "Error description",
	"error": "Detailed error message"
}
```

## Common HTTP Status Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

## Rate Limiting

The API implements rate limiting:

- **Production:** 2000 requests per 10 minutes per IP
- **Development:** No rate limiting

## Data Models

### User Roles

- `customer`: Regular customers
- `rider`: Delivery riders
- `staff`: Store staff
- `manager`: Store managers
- `admin`: System administrators

### Order Statuses

- `pending`: Order placed, awaiting confirmation
- `confirmed`: Order confirmed, awaiting pickup
- `processing`: Order being prepared
- `ready for pickup`: Order ready for rider pickup
- `On the way`: Order with rider, in transit
- `delivered`: Order successfully delivered
- `cancelled`: Order cancelled

### Payment Statuses

- `pending`: Payment not processed
- `paid`: Payment successful
- `failed`: Payment failed
- `refunded`: Payment refunded

### Rider Statuses

- `available`: Rider available for deliveries
- `busy`: Rider currently on delivery
- `offline`: Rider not available
- `on-break`: Rider on break

## File Upload

Endpoints that accept file uploads use `multipart/form-data` encoding. Supported file types:

- Images: JPEG, PNG, WebP
- Maximum file size: 10MB

## Pagination

List endpoints support pagination with these parameters:

- `page`: Page number (starts from 1)
- `limit`: Items per page (default: 10, max: 100)

**Paginated Response:**

```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 50,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

## Filtering and Sorting

Most list endpoints support filtering and sorting:

- Use query parameters for filtering
- `sortBy`: Field to sort by
- `sortOrder`: `asc` or `desc`

## WebSocket Support

The API supports real-time updates via WebSocket for:

- Order status changes
- Rider location updates
- Inventory changes

## Security Features

- JWT authentication
- Password hashing with bcrypt
- Input validation and sanitization
- CORS protection
- Rate limiting
- Helmet security headers
- File upload restrictions

## Environment Variables

Required environment variables:

- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 3001)
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: JWT signing secret
- `JWT_EXPIRE`: JWT expiration time
- `CLIENT_URL`: Allowed client URLs for CORS

## Support

For API support or questions, please contact the development team.
