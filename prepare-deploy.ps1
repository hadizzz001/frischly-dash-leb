# Frontend Deployment Preparation Script for Frischly (PowerShell)

Write-Host "Preparing Frischly frontend for Netlify deployment..." -ForegroundColor Green

# Create deployment directory
Write-Host "Creating deployment directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "deploy-frontend" | Out-Null
Copy-Item -Path "public\*" -Destination "deploy-frontend\" -Recurse -Force

# Check if API URL needs to be updated
Write-Host ""
Write-Host "IMPORTANT: Update API URL in your frontend files" -ForegroundColor Red
Write-Host "   Current: const API_BASE_URL = 'http://localhost:3001/api';"
Write-Host "   Change to: const API_BASE_URL = 'https://your-backend-url.com/api';"
Write-Host ""

# Check for required files
Write-Host "Checking deployment files..." -ForegroundColor Green
if (Test-Path "public\_redirects") {
    Write-Host "   _redirects file exists" -ForegroundColor Green
} else {
    Write-Host "   _redirects file missing" -ForegroundColor Red
}

if (Test-Path "netlify.toml") {
    Write-Host "   netlify.toml exists" -ForegroundColor Green
} else {
    Write-Host "   netlify.toml missing" -ForegroundColor Red
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Deploy your backend to Render/Railway/Vercel"
Write-Host "2. Get your backend URL (e.g., https://your-app.onrender.com)"
Write-Host "3. Update API_BASE_URL in public/dashboard.html, public/signin.html, public/signup.html"
Write-Host "4. Update netlify.toml with your actual backend URL"
Write-Host "5. Deploy the 'public' folder to Netlify"
Write-Host ""
Write-Host "Deploy options:" -ForegroundColor Magenta
Write-Host "   - Drag & drop 'public' folder to Netlify"
Write-Host "   - Or connect GitHub repo to Netlify"
Write-Host ""
Write-Host "Read DEPLOYMENT.md for detailed instructions" -ForegroundColor Yellow

# Open deployment folder
Write-Host ""
Write-Host "Opening deployment folder..." -ForegroundColor Green
Invoke-Item "deploy-frontend"