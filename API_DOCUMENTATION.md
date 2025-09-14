# API Documentation

## Overview

This document provides a comprehensive description of the API endpoints available in the Frischly server application. The API is built with Express.js and follows RESTful principles with proper authentication and authorization mechanisms.

### Base URL

```
http://localhost:3000/api
```

### Authentication

Most endpoints require authentication using Bearer tokens. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Content Type

All POST and PUT requests should include the Content-Type header:

```
Content-Type: application/json
```

### Response Format

All API responses follow a consistent format:

**Success Response:**

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

**Error Response:**

```json
{
	"success": false,
	"error": "Error message",
	"details": "Optional detailed error information"
}
```

### Pagination

Endpoints that return lists support pagination with the following query parameters:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

Paginated responses include pagination metadata:

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "current": 1,
    "pages": 10,
    "total": 200,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Rate Limiting

The API implements rate limiting to prevent abuse:

- 100 requests per 15-minute window per IP address
- Authenticated users get higher limits based on their role

### User Roles

The system supports the following user roles with different permission levels:

- **Admin**: Full system access
- **Manager**: Can manage products, categories, orders, and riders
- **Staff**: Can manage orders and view products/categories
- **Customer**: Can view products and place orders
- **Rider**: Can view assigned orders and update delivery status

## Endpoints

### 1. Products

#### a. Get Product Count

- **Method**: GET
- **URL**: `/api/products/count`
- **Description**: Retrieves the total count of products.
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"count": 100
    }
    ```

#### b. Get All Products

- **Method**: GET
- **URL**: `/api/products`
- **Description**: Retrieves a list of all products with filtering and pagination.
- **Authentication**: Not required
- **Query Parameters**:
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 20)
  - `category` (optional): Filter by category ID
  - `search` (optional): Search by product name or description
  - `minPrice` (optional): Minimum price filter
  - `maxPrice` (optional): Maximum price filter
  - `inStock` (optional): Filter by stock availability (true/false)
  - `sortBy` (optional): Sort field (name, price, createdAt)
  - `sortOrder` (optional): Sort order (asc, desc)
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": [
    		{
    			"id": "60d0fe4f5311236168a109d0",
    			"name": "Organic Apples",
    			"description": "Fresh organic red apples",
    			"price": 4.99,
    			"category": {
    				"id": "60d0fe4f5311236168a109d1",
    				"name": "Fruits"
    			},
    			"stock": 50,
    			"barcode": "123456789012",
    			"shelfNumber": "A1",
    			"imageUrl": "https://example.com/images/apples.jpg",
    			"isActive": true,
    			"createdAt": "2021-06-21T07:26:55.000Z"
    		}
    	],
    	"pagination": {
    		"current": 1,
    		"pages": 10,
    		"total": 200
    	}
    }
    ```

#### c. Get Product by ID

- **Method**: GET
- **URL**: `/api/products/:id`
- **Description**: Get specific product details by ID.
- **Authentication**: Not required
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109d0",
    		"name": "Organic Apples",
    		"description": "Fresh organic red apples from local farms",
    		"price": 4.99,
    		"category": {
    			"id": "60d0fe4f5311236168a109d1",
    			"name": "Fruits"
    		},
    		"stock": 50,
    		"barcode": "123456789012",
    		"shelfNumber": "A1",
    		"imageUrl": "https://example.com/images/apples.jpg",
    		"nutritionalInfo": {
    			"calories": 52,
    			"protein": "0.3g",
    			"carbs": "14g",
    			"fat": "0.2g"
    		},
    		"isActive": true,
    		"createdAt": "2021-06-21T07:26:55.000Z",
    		"updatedAt": "2021-06-21T07:26:55.000Z"
    	}
    }
    ```

#### d. Get Product by Barcode

- **Method**: GET
- **URL**: `/api/products/barcode/:barcode`
- **Description**: Get product details by barcode.
- **Authentication**: Not required
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109d0",
    		"name": "Organic Apples",
    		"price": 4.99,
    		"barcode": "123456789012",
    		"stock": 50
    	}
    }
    ```

#### e. Get Products by Shelf Number

- **Method**: GET
- **URL**: `/api/products/shelf/:shelfNumber`
- **Description**: Get all products located on a specific shelf.
- **Authentication**: Not required
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": [
    		{
    			"id": "60d0fe4f5311236168a109d0",
    			"name": "Organic Apples",
    			"price": 4.99,
    			"shelfNumber": "A1",
    			"stock": 50
    		}
    	]
    }
    ```

#### f. Get Shelf Numbers

- **Method**: GET
- **URL**: `/api/products/shelves`
- **Description**: Get list of all shelf numbers in use.
- **Authentication**: Not required
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": ["A1", "A2", "B1", "B2", "C1"]
    }
    ```

#### g. Create Product

- **Method**: POST
- **URL**: `/api/products`
- **Description**: Create a new product.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Request Body**:
  ```json
  {
  	"name": "Organic Bananas",
  	"description": "Fresh organic yellow bananas",
  	"price": 2.99,
  	"category": "60d0fe4f5311236168a109d1",
  	"stock": 100,
  	"barcode": "123456789013",
  	"shelfNumber": "A2",
  	"nutritionalInfo": {
  		"calories": 89,
  		"protein": "1.1g",
  		"carbs": "23g",
  		"fat": "0.3g"
  	}
  }
  ```
- **Response**:
  - **Status Code**: 201 Created
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109d2",
    		"name": "Organic Bananas",
    		"price": 2.99,
    		"barcode": "123456789013",
    		"stock": 100
    	}
    }
    ```

#### h. Update Product

- **Method**: PUT
- **URL**: `/api/products/:id`
- **Description**: Update product information.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Request Body**:
  ```json
  {
  	"name": "Premium Organic Bananas",
  	"price": 3.99,
  	"stock": 80,
  	"description": "Premium quality organic bananas"
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109d2",
    		"name": "Premium Organic Bananas",
    		"price": 3.99,
    		"stock": 80
    	}
    }
    ```

#### i. Update Product Stock

- **Method**: PATCH
- **URL**: `/api/products/:id/stock`
- **Description**: Update product stock quantity.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Request Body**:
  ```json
  {
  	"stock": 75,
  	"operation": "set"
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109d2",
    		"stock": 75
    	}
    }
    ```

#### j. Upload Product Image

- **Method**: POST
- **URL**: `/api/products/upload-image`
- **Description**: Upload an image for a product.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Request**: Multipart form data with image file
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"imageUrl": "https://example.com/images/product-123.jpg"
    	}
    }
    ```

#### k. Delete Product (Soft Delete)

- **Method**: DELETE
- **URL**: `/api/products/:id`
- **Description**: Soft delete a product (marks as inactive).
- **Authentication**: Required (Bearer token) - Admin role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"message": "Product deleted successfully"
    }
    ```

#### l. Permanently Delete Product

- **Method**: DELETE
- **URL**: `/api/products/:id/permanent`
- **Description**: Permanently delete a product from database.
- **Authentication**: Required (Bearer token) - Admin role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"message": "Product permanently deleted"
    }
    ```

### 2. Categories

#### a. Get All Categories

- **Method**: GET
- **URL**: `/api/categories/all`
- **Description**: Retrieves a list of all categories.
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    [
    	{
    		"id": 1,
    		"name": "Category 1"
    	},
    	{
    		"id": 2,
    		"name": "Category 2"
    	}
    ]
    ```

#### b. Get Category by ID

- **Method**: GET
- **URL**: `/api/categories/:id`
- **Description**: Get specific category details by ID.
- **Authentication**: Not required
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109d1",
    		"name": "Fruits",
    		"description": "Fresh fruits and berries",
    		"imageUrl": "https://example.com/images/fruits.jpg",
    		"displayOrder": 1,
    		"isActive": true,
    		"productCount": 25,
    		"createdAt": "2021-06-21T07:26:55.000Z"
    	}
    }
    ```

#### c. Get Category by Name

- **Method**: GET
- **URL**: `/api/categories/name/:name`
- **Description**: Get category details by name.
- **Authentication**: Not required
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109d1",
    		"name": "Fruits",
    		"description": "Fresh fruits and berries",
    		"productCount": 25
    	}
    }
    ```

#### d. Get Product Count by Category

- **Method**: GET
- **URL**: `/api/categories/:id/product-count`
- **Description**: Get product count for a specific category.
- **Authentication**: Not required
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"categoryId": "60d0fe4f5311236168a109d1",
    		"categoryName": "Fruits",
    		"productCount": 25
    	}
    }
    ```

#### e. Get All Categories Product Count

- **Method**: GET
- **URL**: `/api/categories/all/product-count`
- **Description**: Retrieves the count of products in each category.
- **Authentication**: Not required
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": [
    		{
    			"categoryId": "60d0fe4f5311236168a109d1",
    			"categoryName": "Fruits",
    			"count": 25
    		},
    		{
    			"categoryId": "60d0fe4f5311236168a109d2",
    			"categoryName": "Vegetables",
    			"count": 30
    		}
    	]
    }
    ```

#### f. Get Category Statistics

- **Method**: GET
- **URL**: `/api/categories/stats`
- **Description**: Get category statistics and analytics.
- **Authentication**: Not required
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"totalCategories": 10,
    		"activeCategories": 8,
    		"totalProducts": 500,
    		"averageProductsPerCategory": 50
    	}
    }
    ```

#### g. Create Category

- **Method**: POST
- **URL**: `/api/categories`
- **Description**: Create a new category.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Request Body**:
  ```json
  {
  	"name": "Dairy Products",
  	"description": "Milk, cheese, yogurt and other dairy items",
  	"displayOrder": 3
  }
  ```
- **Response**:
  - **Status Code**: 201 Created
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109d3",
    		"name": "Dairy Products",
    		"description": "Milk, cheese, yogurt and other dairy items",
    		"displayOrder": 3,
    		"isActive": true
    	}
    }
    ```

#### h. Update Category

- **Method**: PUT
- **URL**: `/api/categories/:id`
- **Description**: Update category information.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Request Body**:
  ```json
  {
  	"name": "Dairy & Eggs",
  	"description": "Milk, cheese, yogurt, eggs and other dairy items",
  	"displayOrder": 2
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109d3",
    		"name": "Dairy & Eggs",
    		"description": "Milk, cheese, yogurt, eggs and other dairy items",
    		"displayOrder": 2
    	}
    }
    ```

#### i. Reorder Categories

- **Method**: PATCH
- **URL**: `/api/categories/reorder`
- **Description**: Update the display order of multiple categories.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Request Body**:
  ```json
  {
  	"categories": [
  		{
  			"id": "60d0fe4f5311236168a109d1",
  			"displayOrder": 1
  		},
  		{
  			"id": "60d0fe4f5311236168a109d2",
  			"displayOrder": 2
  		}
  	]
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"message": "Categories reordered successfully"
    }
    ```

#### j. Upload Category Image

- **Method**: POST
- **URL**: `/api/categories/upload-image`
- **Description**: Upload an image for a category.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Request**: Multipart form data with image file
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"imageUrl": "https://example.com/images/category-123.jpg"
    	}
    }
    ```

#### k. Delete Category (Soft Delete)

- **Method**: DELETE
- **URL**: `/api/categories/:id`
- **Description**: Soft delete a category (marks as inactive).
- **Authentication**: Required (Bearer token) - Admin role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"message": "Category deleted successfully"
    }
    ```

#### l. Permanently Delete Category

- **Method**: DELETE
- **URL**: `/api/categories/:id/permanent`
- **Description**: Permanently delete a category from database.
- **Authentication**: Required (Bearer token) - Admin role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"message": "Category permanently deleted"
    }
    ```

### 3. Authentication & User Management

#### a. Register User

- **Method**: POST
- **URL**: `/api/auth/register`
- **Description**: Register a new user account.
- **Authentication**: Not required
- **Request Body**:
  ```json
  {
  	"name": "John Doe",
  	"phoneNumber": "+1234567890",
  	"email": "john@example.com",
  	"password": "Password123",
  	"address": {
  		"street": "123 Main St",
  		"city": "New York",
  		"state": "NY",
  		"zipCode": "10001",
  		"country": "USA"
  	}
  }
  ```
- **Response**:
  - **Status Code**: 201 Created
  - **Body**:
    ```json
    {
    	"success": true,
    	"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    	"user": {
    		"id": "60d0fe4f5311236168a109ca",
    		"name": "John Doe",
    		"email": "john@example.com",
    		"role": "customer"
    	}
    }
    ```

#### b. Login

- **Method**: POST
- **URL**: `/api/auth/login`
- **Description**: Authenticate user and receive access token.
- **Authentication**: Not required
- **Request Body**:
  ```json
  {
  	"email": "john@example.com",
  	"password": "Password123"
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    	"user": {
    		"id": "60d0fe4f5311236168a109ca",
    		"name": "John Doe",
    		"email": "john@example.com",
    		"role": "customer"
    	}
    }
    ```

#### c. Login Profile

- **Method**: POST
- **URL**: `/api/auth/login-profile`
- **Description**: Alternative login endpoint with profile information.
- **Authentication**: Not required
- **Request Body**:
  ```json
  {
  	"email": "john@example.com",
  	"password": "Password123"
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    	"user": {
    		"id": "60d0fe4f5311236168a109ca",
    		"name": "John Doe",
    		"email": "john@example.com",
    		"role": "customer",
    		"address": {
    			"street": "123 Main St",
    			"city": "New York",
    			"state": "NY",
    			"zipCode": "10001"
    		}
    	}
    }
    ```

#### d. Get Current User

- **Method**: GET
- **URL**: `/api/auth/me`
- **Description**: Get current authenticated user information.
- **Authentication**: Required (Bearer token)
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109ca",
    		"name": "John Doe",
    		"email": "john@example.com",
    		"role": "customer",
    		"phoneNumber": "+1234567890",
    		"address": {
    			"street": "123 Main St",
    			"city": "New York",
    			"state": "NY",
    			"zipCode": "10001"
    		}
    	}
    }
    ```

#### e. Update Profile

- **Method**: PUT
- **URL**: `/api/auth/profile`
- **Description**: Update current user's profile information.
- **Authentication**: Required (Bearer token)
- **Request Body**:
  ```json
  {
  	"name": "John Smith",
  	"phoneNumber": "+1234567891",
  	"address": {
  		"street": "456 Oak Ave",
  		"city": "Los Angeles",
  		"state": "CA",
  		"zipCode": "90210"
  	}
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109ca",
    		"name": "John Smith",
    		"email": "john@example.com",
    		"phoneNumber": "+1234567891"
    	}
    }
    ```

#### f. Change Password

- **Method**: PUT
- **URL**: `/api/auth/change-password`
- **Description**: Change current user's password.
- **Authentication**: Required (Bearer token)
- **Request Body**:
  ```json
  {
  	"currentPassword": "OldPassword123",
  	"newPassword": "NewPassword456"
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"message": "Password updated successfully"
    }
    ```

#### g. Get All Users (Admin/Manager)

- **Method**: GET
- **URL**: `/api/auth/users`
- **Description**: Get list of all users (admin/manager only).
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Query Parameters**:
  - `role` (optional): Filter by user role
  - `page` (optional): Page number for pagination
  - `limit` (optional): Number of results per page
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": [
    		{
    			"id": "60d0fe4f5311236168a109ca",
    			"name": "John Doe",
    			"email": "john@example.com",
    			"role": "customer",
    			"createdAt": "2021-06-21T07:26:55.000Z"
    		}
    	],
    	"pagination": {
    		"current": 1,
    		"pages": 5,
    		"total": 50
    	}
    }
    ```

#### h. Get User by ID (Admin/Manager)

- **Method**: GET
- **URL**: `/api/auth/users/:id`
- **Description**: Get specific user details by ID.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109ca",
    		"name": "John Doe",
    		"email": "john@example.com",
    		"role": "customer",
    		"phoneNumber": "+1234567890",
    		"address": {
    			"street": "123 Main St",
    			"city": "New York",
    			"state": "NY",
    			"zipCode": "10001"
    		},
    		"createdAt": "2021-06-21T07:26:55.000Z"
    	}
    }
    ```

#### i. Create User (Admin/Manager)

- **Method**: POST
- **URL**: `/api/auth/users`
- **Description**: Create a new user account (admin/manager only).
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Request Body**:
  ```json
  {
  	"name": "Jane Smith",
  	"phoneNumber": "+1234567892",
  	"email": "jane@example.com",
  	"password": "Password123",
  	"role": "staff",
  	"address": {
  		"street": "789 Pine St",
  		"city": "Chicago",
  		"state": "IL",
  		"zipCode": "60601"
  	}
  }
  ```
- **Response**:
  - **Status Code**: 201 Created
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109cb",
    		"name": "Jane Smith",
    		"email": "jane@example.com",
    		"role": "staff"
    	}
    }
    ```

#### j. Update User (Admin/Manager)

- **Method**: PUT
- **URL**: `/api/auth/users/:id`
- **Description**: Update user information (admin/manager only).
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Request Body**:
  ```json
  {
  	"name": "Jane Doe",
  	"role": "manager",
  	"phoneNumber": "+1234567893"
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109cb",
    		"name": "Jane Doe",
    		"email": "jane@example.com",
    		"role": "manager"
    	}
    }
    ```

#### k. Delete User (Admin)

- **Method**: DELETE
- **URL**: `/api/auth/users/:id`
- **Description**: Delete a user account (admin only).
- **Authentication**: Required (Bearer token) - Admin role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"message": "User deleted successfully"
    }
    ```

#### l. Get Customer Count (Admin/Manager)

- **Method**: GET
- **URL**: `/api/auth/customers/count`
- **Description**: Get total count of customers.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"count": 150
    }
    ```

### 4. Order Management

#### a. Get All Orders

- **Method**: GET
- **URL**: `/api/orders`
- **Description**: Retrieve all orders with filtering and pagination.
- **Authentication**: Required (Bearer token) - Admin/Manager/Staff role
- **Query Parameters**:
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 20)
  - `status` (optional): Filter by order status (pending, processing, completed, cancelled)
  - `paymentStatus` (optional): Filter by payment status (pending, paid, failed)
  - `isActive` (optional): Filter by active status (true, false, all)
  - `sortBy` (optional): Sort field (default: createdAt)
  - `sortOrder` (optional): Sort order (asc, desc - default: desc)
  - `search` (optional): Search by order number or customer details
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": [
    		{
    			"id": "60d0fe4f5311236168a109cc",
    			"orderNumber": "ORD-2021-001",
    			"status": "pending",
    			"paymentStatus": "pending",
    			"customer": {
    				"name": "John Doe",
    				"email": "john@example.com",
    				"phone": "+1234567890"
    			},
    			"items": [
    				{
    					"product": "60d0fe4f5311236168a109cd",
    					"name": "Product 1",
    					"quantity": 2,
    					"price": 29.99
    				}
    			],
    			"totalAmount": 59.98,
    			"createdAt": "2021-06-21T07:26:55.000Z"
    		}
    	],
    	"pagination": {
    		"current": 1,
    		"pages": 10,
    		"total": 200
    	}
    }
    ```

#### b. Get Order by ID

- **Method**: GET
- **URL**: `/api/orders/:id`
- **Description**: Get specific order details by ID.
- **Authentication**: Required (Bearer token) - Admin/Manager/Staff role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109cc",
    		"orderNumber": "ORD-2021-001",
    		"status": "pending",
    		"paymentStatus": "pending",
    		"customer": {
    			"name": "John Doe",
    			"email": "john@example.com",
    			"phone": "+1234567890",
    			"address": {
    				"street": "123 Main St",
    				"city": "New York",
    				"state": "NY",
    				"zipCode": "10001"
    			}
    		},
    		"items": [
    			{
    				"product": "60d0fe4f5311236168a109cd",
    				"name": "Product 1",
    				"quantity": 2,
    				"price": 29.99,
    				"subtotal": 59.98
    			}
    		],
    		"totalAmount": 59.98,
    		"createdAt": "2021-06-21T07:26:55.000Z",
    		"updatedAt": "2021-06-21T07:26:55.000Z"
    	}
    }
    ```

#### c. Create Order

- **Method**: POST
- **URL**: `/api/orders`
- **Description**: Create a new order.
- **Authentication**: Required (Bearer token) - Admin/Manager/Staff role
- **Request Body**:
  ```json
  {
  	"customer": {
  		"name": "John Doe",
  		"email": "john@example.com",
  		"phone": "+1234567890",
  		"address": {
  			"street": "123 Main St",
  			"city": "New York",
  			"state": "NY",
  			"zipCode": "10001"
  		}
  	},
  	"items": [
  		{
  			"product": "60d0fe4f5311236168a109cd",
  			"quantity": 2
  		}
  	],
  	"paymentMethod": "credit_card"
  }
  ```
- **Response**:
  - **Status Code**: 201 Created
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109cc",
    		"orderNumber": "ORD-2021-001",
    		"status": "pending",
    		"paymentStatus": "pending",
    		"totalAmount": 59.98
    	}
    }
    ```

#### d. Update Order

- **Method**: PUT
- **URL**: `/api/orders/:id`
- **Description**: Update order details (admin/manager only).
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Request Body**:
  ```json
  {
  	"status": "processing",
  	"items": [
  		{
  			"product": "60d0fe4f5311236168a109cd",
  			"quantity": 3
  		}
  	]
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109cc",
    		"orderNumber": "ORD-2021-001",
    		"status": "processing",
    		"totalAmount": 89.97
    	}
    }
    ```

#### e. Update Order Status

- **Method**: PATCH
- **URL**: `/api/orders/:id/status`
- **Description**: Update order status.
- **Authentication**: Required (Bearer token) - Admin/Manager/Staff role
- **Request Body**:
  ```json
  {
  	"status": "completed"
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109cc",
    		"status": "completed"
    	}
    }
    ```

#### f. Delete Order

- **Method**: DELETE
- **URL**: `/api/orders/:id`
- **Description**: Delete an order (admin only).
- **Authentication**: Required (Bearer token) - Admin role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"message": "Order deleted successfully"
    }
    ```

#### g. Get Order Statistics

- **Method**: GET
- **URL**: `/api/orders/stats`
- **Description**: Get order statistics and analytics.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"totalOrders": 1250,
    		"pendingOrders": 45,
    		"completedOrders": 1100,
    		"cancelledOrders": 105,
    		"totalRevenue": 125000.5,
    		"averageOrderValue": 100.0
    	}
    }
    ```

### 5. Rider Management

#### a. Get All Riders

- **Method**: GET
- **URL**: `/api/riders`
- **Description**: Retrieve all riders with filtering and pagination.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Query Parameters**:
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 20)
  - `status` (optional): Filter by rider status (available, busy, offline)
  - `zone` (optional): Filter by delivery zone
  - `isActive` (optional): Filter by active status
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": [
    		{
    			"id": "60d0fe4f5311236168a109ce",
    			"name": "Mike Johnson",
    			"email": "mike@example.com",
    			"phoneNumber": "+1234567894",
    			"status": "available",
    			"zone": "downtown",
    			"vehicleType": "motorcycle",
    			"isActive": true,
    			"createdAt": "2021-06-21T07:26:55.000Z"
    		}
    	],
    	"pagination": {
    		"current": 1,
    		"pages": 5,
    		"total": 25
    	}
    }
    ```

#### b. Get Rider by ID

- **Method**: GET
- **URL**: `/api/riders/:id`
- **Description**: Get specific rider details by ID.
- **Authentication**: Required (Bearer token) - Admin/Manager/Rider role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109ce",
    		"name": "Mike Johnson",
    		"email": "mike@example.com",
    		"phoneNumber": "+1234567894",
    		"status": "available",
    		"zone": "downtown",
    		"vehicleType": "motorcycle",
    		"licenseNumber": "ABC123",
    		"address": {
    			"street": "456 Elm St",
    			"city": "New York",
    			"state": "NY",
    			"zipCode": "10002"
    		},
    		"isActive": true,
    		"completedDeliveries": 125,
    		"rating": 4.8,
    		"createdAt": "2021-06-21T07:26:55.000Z"
    	}
    }
    ```

#### c. Create Rider

- **Method**: POST
- **URL**: `/api/riders`
- **Description**: Create a new rider account.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Request Body**:
  ```json
  {
  	"name": "Sarah Wilson",
  	"email": "sarah@example.com",
  	"phoneNumber": "+1234567895",
  	"vehicleType": "bicycle",
  	"licenseNumber": "DEF456",
  	"zone": "uptown",
  	"address": {
  		"street": "789 Oak Ave",
  		"city": "New York",
  		"state": "NY",
  		"zipCode": "10003"
  	}
  }
  ```
- **Response**:
  - **Status Code**: 201 Created
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109cf",
    		"name": "Sarah Wilson",
    		"email": "sarah@example.com",
    		"status": "offline",
    		"zone": "uptown",
    		"vehicleType": "bicycle"
    	}
    }
    ```

#### d. Update Rider

- **Method**: PUT
- **URL**: `/api/riders/:id`
- **Description**: Update rider information.
- **Authentication**: Required (Bearer token) - Admin/Manager/Rider role
- **Request Body**:
  ```json
  {
  	"name": "Sarah Johnson",
  	"phoneNumber": "+1234567896",
  	"vehicleType": "motorcycle",
  	"zone": "downtown"
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109cf",
    		"name": "Sarah Johnson",
    		"phoneNumber": "+1234567896",
    		"vehicleType": "motorcycle",
    		"zone": "downtown"
    	}
    }
    ```

#### e. Update Rider Status

- **Method**: PATCH
- **URL**: `/api/riders/:id/status`
- **Description**: Update rider availability status.
- **Authentication**: Required (Bearer token) - Admin/Manager/Rider role
- **Request Body**:
  ```json
  {
  	"status": "busy"
  }
  ```
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"id": "60d0fe4f5311236168a109cf",
    		"status": "busy"
    	}
    }
    ```

#### f. Get Available Riders by Zone

- **Method**: GET
- **URL**: `/api/riders/available/:zone`
- **Description**: Get available riders in a specific zone.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": [
    		{
    			"id": "60d0fe4f5311236168a109ce",
    			"name": "Mike Johnson",
    			"vehicleType": "motorcycle",
    			"status": "available",
    			"zone": "downtown",
    			"rating": 4.8
    		}
    	]
    }
    ```

#### g. Get Rider Statistics

- **Method**: GET
- **URL**: `/api/riders/stats`
- **Description**: Get rider statistics and analytics.
- **Authentication**: Required (Bearer token) - Admin/Manager role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"data": {
    		"totalRiders": 25,
    		"availableRiders": 15,
    		"busyRiders": 8,
    		"offlineRiders": 2,
    		"totalDeliveries": 2500,
    		"averageRating": 4.6
    	}
    }
    ```

#### h. Delete Rider

- **Method**: DELETE
- **URL**: `/api/riders/:id`
- **Description**: Delete a rider account (admin only).
- **Authentication**: Required (Bearer token) - Admin role
- **Response**:
  - **Status Code**: 200 OK
  - **Body**:
    ```json
    {
    	"success": true,
    	"message": "Rider deleted successfully"
    }
    ```

## Error Handling

The API uses standard HTTP status codes to indicate the success or failure of requests.

### HTTP Status Codes

| Code | Description                                                      |
| ---- | ---------------------------------------------------------------- |
| 200  | OK - Request successful                                          |
| 201  | Created - Resource created successfully                          |
| 400  | Bad Request - Invalid request data or validation errors          |
| 401  | Unauthorized - Missing or invalid authentication token           |
| 403  | Forbidden - Insufficient permissions for the requested operation |
| 404  | Not Found - The requested resource could not be found            |
| 422  | Unprocessable Entity - Validation errors in request data         |
| 429  | Too Many Requests - Rate limit exceeded                          |
| 500  | Internal Server Error - An error occurred on the server          |

### Error Response Examples

**Validation Error (400):**

```json
{
	"success": false,
	"error": "Validation failed",
	"details": [
		{
			"field": "email",
			"message": "Please provide a valid email"
		},
		{
			"field": "password",
			"message": "Password must be at least 6 characters long"
		}
	]
}
```

**Authentication Error (401):**

```json
{
	"success": false,
	"error": "Not authorized, no token provided"
}
```

**Permission Error (403):**

```json
{
	"success": false,
	"error": "Not authorized to access this resource"
}
```

**Resource Not Found (404):**

```json
{
	"success": false,
	"error": "Product not found"
}
```

**Rate Limit Error (429):**

```json
{
	"success": false,
	"error": "Too many requests, please try again later",
	"retryAfter": 900
}
```

## API Testing

### Example cURL Commands

**Register a new user:**

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "Password123",
    "phoneNumber": "+1234567890",
    "address": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001"
    }
  }'
```

**Login:**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "Password123"
  }'
```

**Get products (with authentication):**

```bash
curl -X GET http://localhost:3000/api/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Create a product:**

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Organic Apples",
    "description": "Fresh organic red apples",
    "price": 4.99,
    "category": "60d0fe4f5311236168a109d1",
    "stock": 50,
    "barcode": "123456789012",
    "shelfNumber": "A1"
  }'
```

## WebSocket Events (If Applicable)

The API may support real-time features through WebSocket connections for:

- Order status updates
- Rider location tracking
- Inventory updates
- Live notifications

## Changelog

### Version 1.0.0

- Initial API implementation
- User authentication and authorization
- Product and category management
- Order processing
- Rider management system

## Support

For API support and questions, please contact the development team or refer to the source code documentation.

## Conclusion

This API provides a robust interface for managing products and categories in the Frischly server application. For further information, please refer to the source code or contact the development team.
