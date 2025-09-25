// API Examples for Product Filtering
// Base URL: http://localhost:3001/api

// ==========================================
// CATEGORY FILTERING EXAMPLES
// ==========================================

// 1. Filter products by category name (GET /api/products)
GET /api/products?category=Obst&page=1&limit=10

// 2. Filter products by category name with additional filters
GET /api/products?category=Obst&isActive=true&sortBy=price&sortOrder=asc&page=1&limit=20

// 3. Dedicated category endpoint (GET /api/products/category)
GET /api/products/category?categoryName=Obst&page=1&limit=10

// 4. Category with search and price range
GET /api/products/category?categoryName=Obst&search=apple&priceRange=1-10&page=1&limit=10

// 5. Category with stock level filtering
GET /api/products/category?categoryName=Obst&stockLevel=Available&page=1&limit=10

// ==========================================
// SUBCATEGORY FILTERING EXAMPLES
// ==========================================

// 1. Filter products by subcategory name (GET /api/products)
GET /api/products?subcategory=Äpfel&page=1&limit=10

// 2. Filter products by subcategory name with sorting
GET /api/products?subcategory=Äpfel&sortBy=name&sortOrder=asc&page=1&limit=10

// 3. Dedicated subcategory endpoint (GET /api/products/subcategory)
GET /api/products/subcategory?subcategoryName=Äpfel&page=1&limit=10

// 4. Subcategory with search and stock filtering
GET /api/products/subcategory?subcategoryName=Äpfel&search=red&stockLevel=high&page=1&limit=10

// 5. Subcategory with price range
GET /api/products/subcategory?subcategoryName=Äpfel&priceRange=2-15&page=1&limit=10

// ==========================================
// DISCOUNT FILTERING EXAMPLES
// ==========================================

// 1. Get all products with any discount (GET /api/products)
GET /api/products?discount=true&page=1&limit=10

// 2. Get products without discount
GET /api/products?discount=false&page=1&limit=10

// 3. Get products with minimum discount percentage
GET /api/products?minDiscount=10&page=1&limit=10

// 4. Dedicated discount endpoint (GET /api/products/discount)
GET /api/products/discount?page=1&limit=10

// 5. Discount products with minimum discount and sorting by discount
GET /api/products/discount?minDiscount=15&sortBy=discount&sortOrder=desc&page=1&limit=10

// 6. Discount products with search
GET /api/products/discount?search=apple&minDiscount=5&page=1&limit=10

// 7. Discount products with price range
GET /api/products/discount?priceRange=1-20&minDiscount=10&page=1&limit=10

// ==========================================
// COMBINED FILTERING EXAMPLES
// ==========================================

// 1. Category + Discount
GET /api/products?category=Obst&discount=true&page=1&limit=10

// 2. Subcategory + Discount + Search
GET /api/products?subcategory=Äpfel&discount=true&search=organic&page=1&limit=10

// 3. Category + Price Range + Stock Level
GET /api/products?category=Obst&priceRange=5-25&stockLevel=medium&page=1&limit=10

// 4. Discount + Price Range + Sorting
GET /api/products?discount=true&priceRange=1-15&sortBy=discount&sortOrder=desc&page=1&limit=10

// 5. Category + Subcategory + Discount (Note: subcategory overrides category)
GET /api/products?category=Obst&subcategory=Äpfel&discount=true&page=1&limit=10

// ==========================================
// ADDITIONAL FILTER PARAMETERS
// ==========================================

// isActive: true/false/all (default: true)
// inAds: true/false/all
// sortBy: createdAt, name, price, discount, stock
// sortOrder: asc/desc (default: desc)
// priceRange: "min-max" or "max+" or "-max"
// stockLevel: out, low, medium, high, Available
// search: searches in name, barcode, description
// page: page number (default: 1)
// limit: items per page (default: 10 for /products, 100 for /category)

// ==========================================
// RESPONSE FORMAT
// ==========================================

/*
{
  "success": true,
  "data": [
    {
      "_id": "product_id",
      "name": "Product Name",
      "price": 5.99,
      "discount": 10,
      "stock": 50,
      "category": {
        "_id": "category_id",
        "name": "Obst",
        "color": "#FF0000",
        "icon": "apple"
      },
      "subcategory": {
        "_id": "subcategory_id",
        "name": "Äpfel",
        "slug": "aepfel",
        "parentCategory": {
          "_id": "category_id",
          "name": "Obst",
          "color": "#FF0000",
          "icon": "apple"
        }
      },
      "createdBy": {
        "_id": "user_id",
        "name": "Admin User",
        "email": "admin@example.com"
      },
      "picture": "cloudinary_url",
      "barcode": "123456789",
      "description": "Product description",
      "isActive": true,
      "inAds": false,
      "shelfNumber": "A-01",
      "createdAt": "2025-09-25T10:00:00.000Z",
      "updatedAt": "2025-09-25T10:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalProducts": 50,
    "hasNextPage": true,
    "hasPrevPage": false,
    "limit": 10
  }
}
*/

// ==========================================
// JAVASCRIPT FETCH EXAMPLES
// ==========================================

// Category filtering
fetch('http://localhost:3001/api/products?category=Obst&page=1&limit=10')
  .then(response => response.json())
  .then(data => console.log(data));

// Subcategory filtering
fetch('http://localhost:3001/api/products?subcategory=Äpfel&page=1&limit=10')
  .then(response => response.json())
  .then(data => console.log(data));

// Discount filtering
fetch('http://localhost:3001/api/products/discount?minDiscount=10&page=1&limit=10')
  .then(response => response.json())
  .then(data => console.log(data));

// Combined filtering
fetch('http://localhost:3001/api/products?category=Obst&discount=true&priceRange=1-20&sortBy=discount&sortOrder=desc&page=1&limit=10')
  .then(response => response.json())
  .then(data => console.log(data));