# Download Product Images Script

This script downloads all product images from the Frischly API and saves them to a local images folder.

## Usage

```bash
# Make sure the server is running
node server.js

# Run the download script
node scripts/download-product-images.js
```

## Output

The script will create a folder called `product-images/` in the `scripts/` directory containing:

- All successfully downloaded product images
- Images are named using the format: `{productId}_{sanitizedProductName}.{extension}`
- An error log file `download-errors.json` with details of failed downloads

## Features

- **Automatic Folder Creation**: Creates the `product-images` folder if it doesn't exist
- **Smart Naming**: Sanitizes product names to create valid filenames
- **Error Handling**: Continues downloading even if some images fail
- **Progress Tracking**: Shows progress for each download
- **Rate Limiting**: Includes delays between downloads to be respectful
- **Error Logging**: Saves detailed error information for failed downloads

## Results Summary

When run on the current dataset:

- **Total products**: 1,405
- **Products with images**: 1,398
- **Successfully downloaded**: 259 images
- **Failed downloads**: 1,139 images

## Common Issues

Many products have invalid image URLs:

- Relative paths like `/icons/app_icon_256x256.png`
- Placeholder URLs like `https://example.com/test-image.jpg`
- Broken or non-existent Cloudinary URLs

## File Structure

```
scripts/
├── download-product-images.js    # Main script
├── product-images/               # Downloaded images folder
│   ├── 68cf1c30c29e7efd991afda5_Knorr_Bouillon_Delikatess_Brühe_7l.webp
│   ├── 68cf1befc29e7efd991afd84_G&G_Nuss_Nougat_Creme_400g.webp
│   ├── download-errors.json      # Error log
│   └── ...
└── all-products.json             # Source data (from export script)
```

## Requirements

- Node.js
- Access to the Frischly API
- Internet connection for downloading images
- Sufficient disk space for images

## Integration

This script works with the `export-all-products.js` script:

1. First run `export-all-products.js` to get the product data
2. Then run `download-product-images.js` to download the images

## Notes

- Images are downloaded from Cloudinary CDN
- The script handles various image formats (webp, jpg, png, etc.)
- Failed downloads are logged but don't stop the process
- Duplicate filenames are avoided by including product IDs
