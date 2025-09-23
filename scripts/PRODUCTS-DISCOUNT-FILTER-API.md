# Products Discount Filter API Documentation

## GET /api/products - Enhanced with Discount Filtering

Retrieve all products with advanced filtering options including discount-based filtering.

### New Discount Filter Parameters

| Parameter     | Type           | Description                                      | Example           |
| ------------- | -------------- | ------------------------------------------------ | ----------------- |
| `discount`    | boolean/string | Filter products by discount status               | `?discount=true`  |
| `minDiscount` | number         | Filter products with minimum discount percentage | `?minDiscount=10` |

### Discount Filter Usage

#### 1. Products with Any Discount

```
GET /api/products?discount=true
```

Returns products that have any discount (discount > 0%).

#### 2. Products Without Discount

```
GET /api/products?discount=false
```

Returns products that have no discount (discount = 0%).

#### 3. Products with Minimum Discount

```
GET /api/products?minDiscount=15
```

Returns products with at least 15% discount.

#### 4. Combined Discount Filters

```
GET /api/products?discount=true&minDiscount=10&sortBy=discount&sortOrder=desc
```

Returns products with at least 10% discount, sorted by discount percentage (highest first).

### Complete Parameter List

| Parameter     | Type            | Default   | Description                                          |
| ------------- | --------------- | --------- | ---------------------------------------------------- |
| `page`        | number          | 1         | Page number for pagination                           |
| `limit`       | number          | 10        | Number of products per page                          |
| `search`      | string          | -         | Search in name, barcode, description                 |
| `category`    | string/ObjectId | -         | Filter by category ID or name                        |
| `subcategory` | string/ObjectId | -         | Filter by subcategory ID or name                     |
| `shelfNumber` | string          | -         | Filter by shelf number                               |
| `isActive`    | boolean         | true      | Filter by active status                              |
| `inAds`       | boolean         | -         | Filter by advertisement status                       |
| `sortBy`      | string          | createdAt | Sort field (name, price, stock, createdAt, discount) |
| `sortOrder`   | string          | desc      | Sort order (asc/desc)                                |
| `priceRange`  | string          | -         | Price range (e.g., "10-50", "100+")                  |
| `stockLevel`  | string          | -         | Stock level (out, low, medium, high, Available)      |
| `discount`    | boolean/string  | -         | **NEW** Filter by discount status                    |
| `minDiscount` | number          | -         | **NEW** Minimum discount percentage                  |

### Response Format

```json
{
	"success": true,
	"data": [
		{
			"_id": "product_id",
			"name": "Product Name",
			"price": 29.99,
			"discount": 15,
			"stock": 50,
			"category": {
				"_id": "category_id",
				"name": "Category Name",
				"color": "#FF5733",
				"icon": "category-icon"
			},
			"subcategory": {
				"_id": "subcategory_id",
				"name": "Subcategory Name",
				"slug": "subcategory-slug",
				"parentCategory": {
					"_id": "category_id",
					"name": "Category Name",
					"color": "#FF5733",
					"icon": "category-icon"
				}
			},
			"picture": "https://cloudinary-url",
			"barcode": "1234567890",
			"description": "Product description",
			"shelfNumber": "A1-B2",
			"isActive": true,
			"inAds": false,
			"createdAt": "2024-01-01T00:00:00.000Z",
			"updatedAt": "2024-01-01T00:00:00.000Z",
			"createdBy": {
				"_id": "user_id",
				"name": "User Name",
				"email": "user@example.com"
			}
		}
	],
	"pagination": {
		"currentPage": 1,
		"totalPages": 10,
		"totalProducts": 95,
		"hasNextPage": true,
		"hasPrevPage": false,
		"limit": 10
	}
}
```

### Example Requests

#### Get Top 10 Discounted Products

```bash
curl "http://localhost:3001/api/products?discount=true&sortBy=discount&sortOrder=desc&limit=10"
```

#### Get Products with 20%+ Discount in Specific Category

```bash
curl "http://localhost:3001/api/products?minDiscount=20&category=beverages&limit=5"
```

#### Search Discounted Products

```bash
curl "http://localhost:3001/api/products?discount=true&search=coffee&sortBy=discount&sortOrder=desc"
```

### Error Responses

#### 400 Bad Request

```json
{
	"success": false,
	"message": "Error retrieving products",
	"error": "Invalid parameter values"
}
```

#### 500 Internal Server Error

```json
{
	"success": false,
	"message": "Error retrieving products",
	"error": "Database connection error"
}
```

### Notes

- The `discount` parameter accepts boolean values or string representations ("true"/"false")
- The `minDiscount` parameter accepts numeric values (e.g., 10, 15.5, 25)
- Discount filters can be combined with all other existing filters
- When using both `discount=true` and `minDiscount`, the `minDiscount` value takes precedence
- Products are returned with populated category and subcategory information
- All discount values are returned as percentages (e.g., 15 for 15% discount)
