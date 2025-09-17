# Database Image Update Scripts

This directory contains scripts to update category and product images in the database to use the app icon.

## 📁 Available Scripts

### Category Image Scripts

#### 1. `updateAllCategoryImages.js` - Simple Category Update Script

Updates all categories to use the 256x256 app icon.

**Usage:**

```bash
node scripts/updateAllCategoryImages.js
```

#### 2. `updateCategoryImages.js` - Advanced Category Update Script

More flexible script with options for different icon sizes and update modes.

**Usage:**

```bash
# Update all categories to 256x256 icon (default)
node scripts/updateCategoryImages.js

# Update all categories to specific size
node scripts/updateCategoryImages.js --size=512x512

# Only update categories without images
node scripts/updateCategoryImages.js --only-empty

# Combine options
node scripts/updateCategoryImages.js --size=128x128 --only-empty

# Show help
node scripts/updateCategoryImages.js --help
```

### Product Image Scripts

#### 3. `updateAllProductImages.js` - Simple Product Update Script

Updates all products to use the 256x256 app icon.

**Usage:**

```bash
node scripts/updateAllProductImages.js
```

#### 4. `updateProductImages.js` - Advanced Product Update Script

More flexible script with options for different icon sizes and update modes.

**Usage:**

```bash
# Update all products to 256x256 icon (default)
node scripts/updateProductImages.js

# Update all products to specific size
node scripts/updateProductImages.js --size=512x512

# Only update products without images
node scripts/updateProductImages.js --only-empty

# Combine options
node scripts/updateProductImages.js --size=128x128 --only-empty

# Show help
node scripts/updateProductImages.js --help
```

### Windows Scripts

#### 5. `update-category-images.bat` / `update-product-images.bat`

Easy Windows batch files for both categories and products

#### 6. `update-category-images.ps1` / `update-product-images.ps1`

PowerShell versions for Windows users

## 🎯 Available Icon Sizes

- 72x72
- 96x96
- 128x128
- 192x192
- 256x256 (default)
- 512x512
- 1024x1024

## 📊 What Gets Updated

### Categories

The scripts update the `image` field in the Category collection to point to:

```
/icons/app_icon_[SIZE].png
```

### Products

The scripts update the `picture` field in the Product collection to point to:

```
/icons/app_icon_[SIZE].png
```

## ✅ Results

After running the scripts, all categories and products will have consistent app icon images that will display properly in:

- Category management dashboard
- Product management dashboard
- Subcategory tables (parent category images)
- Product listings and detail views
- Any other places where images are displayed

## 🔄 Safe to Run Multiple Times

These scripts are safe to run multiple times - they will simply update the image paths again.

## 📝 Example Output

### Category Update:

```
🔄 Updating all category images to app icon...
✅ Successfully updated 29 categories
📍 Image path set to: /icons/app_icon_256x256.png

📋 Sample updated categories:
  - Electronics: /icons/app_icon_256x256.png
  - Obst: /icons/app_icon_256x256.png
  - Gemüse: /icons/app_icon_256x256.png
```

### Product Update:

```
🔄 Updating all product images to app icon...
✅ Successfully updated 1250 products
📍 Image path set to: /icons/app_icon_256x256.png

📋 Sample updated products:
  - Apple: /icons/app_icon_256x256.png
  - Banana: /icons/app_icon_256x256.png
  - Orange: /icons/app_icon_256x256.png
```

## 🚀 Quick Start

For most users, simply run:

```bash
# Update categories
npm run update-category-images

# Update products
npm run update-product-images
```

This will update all categories and products to use the 256x256 app icon.</content>
<parameter name="filePath">c:\Users\alker\frischly server\scripts\README-Image-Updates.md
