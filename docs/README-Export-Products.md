# Export All Products Script

This script fetches all products from the Frischly API and saves them to a JSON file.

## Usage

```bash
# Make sure the server is running
node server.js

# Run the export script
node scripts/export-all-products.js
```

## Output

The script will create a file called `all-products.json` in the `scripts/` directory containing:

- All products with complete details
- Category and subcategory information
- Pagination metadata
- Timestamp of when the data was fetched

## Configuration

The script uses the following configuration:

- **API Base URL**: `http://localhost:3001` (configurable via `API_BASE_URL` environment variable)
- **Output File**: `scripts/all-products.json`
- **Page Size**: 100 products per request

## JSON Structure

```json
{
	"success": true,
	"totalProducts": 1405,
	"products": [
		{
			"_id": "...",
			"name": "...",
			"barcode": "...",
			"category": {
				"name": "..."
			},
			"subcategory": {
				"name": "...",
				"parentCategory": {
					"name": "..."
				}
			}
			// ... other product fields
		}
	],
	"fetchedAt": "2025-09-21T08:45:58.381Z"
}
```

## Requirements

- Node.js
- Running Frischly server
- Internet connection (for API calls)
