@echo off
echo ========================================
echo 🚀 Product Image Update Script
echo ========================================
echo.

cd /d "%~dp0.."

echo 🔄 Updating all product images to app icon...
echo.

node scripts\updateAllProductImages.js

echo.
echo ✅ Script completed!
echo.
pause