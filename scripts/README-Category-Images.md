# Category Image Update Scripts

This directory contains scripts to update category images in the database to use the app icon.

## 📁 Available Scripts

### 1. `updateAllCategoryImages.js` - Simple Update Script

Updates all categories to use the 256x256 app icon.

**Usage:**

```bash
node scripts/updateAllCategoryImages.js
```

### 2. `updateCategoryImages.js` - Advanced Update Script

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

### 3. Windows Batch Script

`update-category-images.bat` - Easy Windows batch file

### 4. Windows PowerShell Script

`update-category-images.ps1` - PowerShell version for Windows

## 🎯 Available Icon Sizes

- 72x72
- 96x96
- 128x128
- 192x192
- 256x256 (default)
- 512x512
- 1024x1024

## 📊 What Gets Updated

The scripts update the `image` field in the Category collection to point to:

```
/icons/app_icon_[SIZE].png
```

## ✅ Results

After running the script, all categories will have consistent app icon images that will display properly in:

- Category management dashboard
- Subcategory tables (parent category images)
- Any other places where category images are displayed

## 🔄 Safe to Run Multiple Times

These scripts are safe to run multiple times - they will simply update the image paths again.

## 📝 Example Output

```
🔄 Updating all category images to app icon...
✅ Successfully updated 29 categories
📍 Image path set to: /icons/app_icon_256x256.png

📋 Sample updated categories:
  - Electronics: /icons/app_icon_256x256.png
  - Obst: /icons/app_icon_256x256.png
  - Gemüse: /icons/app_icon_256x256.png
```

## 🚀 Quick Start

For most users, simply run:

```bash
node scripts/updateAllCategoryImages.js
```

This will update all categories to use the 256x256 app icon.</content>
<parameter name="filePath">c:\Users\alker\frischly server\scripts\README-Category-Images.md
