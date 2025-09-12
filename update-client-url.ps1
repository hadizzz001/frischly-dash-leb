# Update Client URL Script

Write-Host "🔧 Frischly - Update Client URL Configuration" -ForegroundColor Green
Write-Host ""

# Get Netlify URL from user
$netlifyUrl = Read-Host "Enter your Netlify app URL (e.g., https://amazing-name-123456.netlify.app)"

if (-not $netlifyUrl) {
    Write-Host "❌ No URL provided. Exiting..." -ForegroundColor Red
    exit 1
}

# Validate URL format
if (-not $netlifyUrl.StartsWith("https://") -or -not $netlifyUrl.Contains(".netlify.app")) {
    Write-Host "⚠️  Warning: URL should be in format https://your-app.netlify.app" -ForegroundColor Yellow
    $confirm = Read-Host "Continue anyway? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "❌ Cancelled by user" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "🔄 Updating client URL configuration..." -ForegroundColor Yellow
Write-Host "   Frontend URL: $netlifyUrl" -ForegroundColor Cyan
Write-Host ""

# Update .env file if it exists
if (Test-Path ".env") {
    Write-Host "📝 Updating .env file..." -ForegroundColor Green
    
    $envContent = Get-Content ".env"
    $updated = $false
    
    $newEnvContent = @()
    foreach ($line in $envContent) {
        if ($line -match "^CLIENT_URL=") {
            $newEnvContent += "CLIENT_URL=$netlifyUrl"
            $updated = $true
            Write-Host "   ✓ Updated CLIENT_URL in .env" -ForegroundColor Green
        } else {
            $newEnvContent += $line
        }
    }
    
    if (-not $updated) {
        $newEnvContent += "CLIENT_URL=$netlifyUrl"
        Write-Host "   ✓ Added CLIENT_URL to .env" -ForegroundColor Green
    }
    
    $newEnvContent | Set-Content ".env"
} else {
    Write-Host "📝 Creating .env file..." -ForegroundColor Green
    @"
# Frischly Environment Configuration
NODE_ENV=development
PORT=3001
CLIENT_URL=$netlifyUrl

# Add your other environment variables here:
# MONGODB_URI=your-mongodb-connection-string
# JWT_SECRET=your-jwt-secret
"@ | Set-Content ".env"
    Write-Host "   ✓ Created .env with CLIENT_URL" -ForegroundColor Green
}

Write-Host ""
Write-Host "🎯 Next Steps for Production:" -ForegroundColor Magenta
Write-Host "1. Update CLIENT_URL environment variable on Render:" -ForegroundColor White
Write-Host "   • Go to your Render dashboard" -ForegroundColor Gray
Write-Host "   • Navigate to your service" -ForegroundColor Gray
Write-Host "   • Go to Environment tab" -ForegroundColor Gray
Write-Host "   • Set CLIENT_URL=$netlifyUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Redeploy your backend service on Render" -ForegroundColor White
Write-Host ""
Write-Host "3. Test your application:" -ForegroundColor White
Write-Host "   • Frontend: $netlifyUrl" -ForegroundColor Cyan
Write-Host "   • Backend: https://frischly-server.onrender.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Local configuration updated successfully!" -ForegroundColor Green