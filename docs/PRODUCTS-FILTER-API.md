# Products API Documentation - Complete Filter Guide

## GET /api/products - Advanced Product Filtering

Retrieve all products with comprehensive filtering, searching, sorting, and pagination options.

### Core Parameters

| Parameter | Type   | Default | Description                          |
| --------- | ------ | ------- | ------------------------------------ |
| `page`    | number | 1       | Page number for pagination           |
| `limit`   | number | 10      | Number of products per page          |
| `search`  | string | -       | Search in name, barcode, description |

### Filter Parameters

#### Product Identification & Organization

| Parameter     | Type            | Description                      | Example Values                    |
| ------------- | --------------- | -------------------------------- | --------------------------------- |
| `category`    | string/ObjectId | Filter by category ID or name    | `?category=beverages` or ObjectId |
| `subcategory` | string/ObjectId | Filter by subcategory ID or name | `?subcategory=coffee` or ObjectId |
| `shelfNumber` | string          | Filter by shelf number           | `?shelfNumber=A1-B2`              |

#### Product Status & Visibility

| Parameter  | Type    | Default | Description                    | Example Values   |
| ---------- | ------- | ------- | ------------------------------ | ---------------- |
| `isActive` | boolean | true    | Filter by active status        | `?isActive=true` |
| `inAds`    | boolean | -       | Filter by advertisement status | `?inAds=true`    |

#### Pricing & Discounts

| Parameter     | Type           | Description                                      | Example Values                |
| ------------- | -------------- | ------------------------------------------------ | ----------------------------- |
| `priceRange`  | string         | Price range filtering                            | `?priceRange=10-50` or `100+` |
| `discount`    | boolean/string | Filter products by discount status               | `?discount=true`              |
| `minDiscount` | number         | Filter products with minimum discount percentage | `?minDiscount=15`             |

#### Inventory Management

| Parameter    | Type   | Description                         | Example Values    |
| ------------ | ------ | ----------------------------------- | ----------------- |
| `stockLevel` | string | Filter by stock availability levels | `?stockLevel=low` |

### Detailed Filter Options

#### Price Range Filtering (`priceRange`)

| Value      | Description                    |
| ---------- | ------------------------------ |
| `"0-10"`   | Products priced €0 to €10      |
| `"10-25"`  | Products priced €10 to €25     |
| `"25-50"`  | Products priced €25 to €50     |
| `"50-100"` | Products priced €50 to €100    |
| `"100+"`   | Products priced €100 and above |

#### Stock Level Filtering (`stockLevel`)

| Value         | Description         | Stock Range |
| ------------- | ------------------- | ----------- |
| `"out"`       | Out of stock        | 0           |
| `"low"`       | Low stock           | 1-10        |
| `"medium"`    | Medium stock        | 11-50       |
| `"high"`      | High stock          | 51+         |
| `"Available"` | Any available stock | 1+          |

#### Discount Filtering (`discount` & `minDiscount`)

| Parameter        | Usage                             | Example                                  |
| ---------------- | --------------------------------- | ---------------------------------------- |
| `discount=true`  | Products with any discount (> 0%) | `?discount=true`                         |
| `discount=false` | Products without discount (= 0%)  | `?discount=false`                        |
| `minDiscount`    | Products with minimum discount %  | `?minDiscount=20` (20% or more discount) |

### Sorting & Ordering

| Parameter   | Type   | Default   | Description           |
| ----------- | ------ | --------- | --------------------- |
| `sortBy`    | string | createdAt | Sort field            |
| `sortOrder` | string | desc      | Sort order (asc/desc) |

#### Available Sort Fields (`sortBy`)

| Field       | Description                 |
| ----------- | --------------------------- |
| `name`      | Product name (alphabetical) |
| `price`     | Product price               |
| `stock`     | Stock quantity              |
| `discount`  | Discount percentage         |
| `createdAt` | Creation date               |
| `updatedAt` | Last update date            |

### Filter Usage Examples

#### Basic Filtering

```bash
# Get products with any discount
GET /api/products?discount=true

# Get products without discount
GET /api/products?discount=false

# Get products with at least 15% discount
GET /api/products?minDiscount=15

# Get products in specific price range
GET /api/products?priceRange=10-50

# Get low stock products
GET /api/products?stockLevel=low

# Get products from specific category
GET /api/products?category=beverages

# Search products by name/barcode/description
GET /api/products?search=coffee
```

#### Advanced Combined Filtering

```bash
# High discount products in beverages category, sorted by discount
GET /api/products?category=beverages&minDiscount=20&sortBy=discount&sortOrder=desc

# Available products under €25 with any discount
GET /api/products?priceRange=0-25&discount=true&stockLevel=Available

# Search coffee products with medium stock, sorted by price
GET /api/products?search=coffee&stockLevel=medium&sortBy=price&sortOrder=asc

# Active products in ads with high discount
GET /api/products?isActive=true&inAds=true&minDiscount=25
```

### Response Format

```json
{
	"success": true,
	"data": [
		{
			"_id": "product_id",
			"name": "Product Name",
			"barcode": "1234567890",
			"shelfNumber": "A1-B2",
			"description": "Product description",
			"picture": "https://cloudinary-url",
			"imagePublicId": "products/image_id",
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
			"price": 29.99,
			"tax": 19,
			"bottlerefund": 0.25,
			"discount": 15,
			"stock": 50,
			"isActive": true,
			"inAds": false,
			"tags": ["organic", "premium"],
			"dimensions": {
				"length": 10,
				"width": 5,
				"height": 15,
				"unit": "cm"
			},
			"weight": {
				"value": 250,
				"unit": "g"
			},
			"supplier": {
				"name": "Supplier Name",
				"contact": "+49 123 456789",
				"email": "supplier@example.com"
			},
			"lastRestocked": "2024-01-15T10:30:00.000Z",
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

### cURL Examples

#### Basic Filtering

```bash
# Get top 10 discounted products
curl "http://localhost:3001/api/products?discount=true&sortBy=discount&sortOrder=desc&limit=10"

# Get products with 20%+ discount in beverages category
curl "http://localhost:3001/api/products?minDiscount=20&category=beverages&limit=5"

# Search discounted coffee products
curl "http://localhost:3001/api/products?discount=true&search=coffee&sortBy=discount&sortOrder=desc"

# Get low stock products under €25
curl "http://localhost:3001/api/products?stockLevel=low&priceRange=0-25"

# Get active products in advertisements
curl "http://localhost:3001/api/products?isActive=true&inAds=true"
```

#### Advanced Filtering

```bash
# Products on shelf A1 with medium stock and any discount
curl "http://localhost:3001/api/products?shelfNumber=A1&stockLevel=medium&discount=true"

# High-value products (€100+) with high stock, sorted by price
curl "http://localhost:3001/api/products?priceRange=100+&stockLevel=high&sortBy=price&sortOrder=asc"

# Recently added products with discount, sorted by creation date
curl "http://localhost:3001/api/products?discount=true&sortBy=createdAt&sortOrder=desc&limit=20"
```

### JavaScript/Axios Examples

```javascript
const axios = require("axios");

// Get discounted products in specific category
const getDiscountedProducts = async () => {
	const response = await axios.get("http://localhost:3001/api/products", {
		params: {
			category: "beverages",
			discount: true,
			minDiscount: 10,
			sortBy: "discount",
			sortOrder: "desc",
			limit: 20,
		},
	});
	return response.data;
};

// Search products with advanced filters
const searchProducts = async (searchTerm) => {
	const response = await axios.get("http://localhost:3001/api/products", {
		params: {
			search: searchTerm,
			isActive: true,
			stockLevel: "Available",
			sortBy: "name",
			sortOrder: "asc",
		},
	});
	return response.data;
};
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

#### 404 Not Found

```json
{
	"success": false,
	"message": "No products found matching the criteria"
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

### Additional Product Fields

The response includes all product fields from the database schema:

#### Core Product Information

- `name`, `barcode`, `shelfNumber`, `description`
- `picture` (Cloudinary URL), `imagePublicId`
- `category` (populated), `subcategory` (populated with parent category)

#### Pricing & Financial

- `price`, `tax` (%), `discount` (%), `bottlerefund`

#### Inventory & Status

- `stock`, `isActive`, `inAds`, `lastRestocked`

#### Additional Metadata

- `tags` (array), `dimensions` (object), `weight` (object)
- `supplier` (object with name, contact, email)
- `createdBy` (populated user), `createdAt`, `updatedAt`

### Performance Notes

- **Pagination**: Use `page` and `limit` parameters for large datasets
- **Indexing**: Database indexes exist on `barcode`, `shelfNumber`, `name`, `subcategory`, `isActive`, `inAds`
- **Population**: Category and subcategory data is automatically populated
- **Sorting**: All sort fields are optimized for performance
- **Search**: Text search uses regex matching on name, barcode, and description

### Filter Combination Rules

- All filters can be combined (AND logic)
- `discount=true` with `minDiscount` - `minDiscount` takes precedence
- `isActive` defaults to `true` unless explicitly set to `false` or `"all"`
- Price ranges support both bounded (10-50) and unbounded (100+) formats
- Stock level filtering is mutually exclusive (choose one level)
- Category/subcategory can be filtered by ID (ObjectId) or name (string)
