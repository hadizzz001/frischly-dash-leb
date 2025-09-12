#!/bin/bash

# Frontend Deployment Preparation Script for Frischly

echo "🚀 Preparing Frischly frontend for Netlify deployment..."

# Create deployment directory
echo "📁 Creating deployment directory..."
mkdir -p deploy-frontend
cp -r public/* deploy-frontend/

# Check if API URL needs to be updated
echo "⚠️  IMPORTANT: Update API URL in your frontend files"
echo "   Current: const API_BASE_URL = \"http://localhost:3001/api\";"
echo "   Change to: const API_BASE_URL = \"https://your-backend-url.com/api\";"
echo ""

# Check for required files
echo "✅ Checking deployment files..."
if [ -f "public/_redirects" ]; then
    echo "   ✓ _redirects file exists"
else
    echo "   ❌ _redirects file missing"
fi

if [ -f "netlify.toml" ]; then
    echo "   ✓ netlify.toml exists"
else
    echo "   ❌ netlify.toml missing"
fi

echo ""
echo "📋 Next steps:"
echo "1. Deploy your backend to Render/Railway/Vercel"
echo "2. Get your backend URL (e.g., https://your-app.onrender.com)"
echo "3. Update API_BASE_URL in public/dashboard.html, public/signin.html, public/signup.html"
echo "4. Update netlify.toml with your actual backend URL"
echo "5. Deploy the 'public' folder to Netlify"
echo ""
echo "🌐 Deploy options:"
echo "   - Drag & drop 'public' folder to Netlify"
echo "   - Or connect GitHub repo to Netlify"
echo ""
echo "📖 Read DEPLOYMENT.md for detailed instructions"