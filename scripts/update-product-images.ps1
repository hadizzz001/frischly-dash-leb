# Product Image Update Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🚀 Product Image Update Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory and move to parent directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$parentDir = Split-Path -Parent $scriptDir
Set-Location $parentDir

Write-Host "🔄 Updating all product images to app icon..." -ForegroundColor Yellow
Write-Host ""

try {
    & node scripts\updateAllProductImages.js

    Write-Host ""
    Write-Host "✅ Script completed successfully!" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "❌ Script failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Read-Host "Press Enter to exit"