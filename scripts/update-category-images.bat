@echo off
echo ========================================
echo 🚀 Category Image Update Script
echo ========================================
echo.

cd /d "%~dp0.."

echo 🔄 Updating all category images to app icon...
echo.

node scripts\updateAllCategoryImages.js

echo.
echo ✅ Script completed!
echo.
pause