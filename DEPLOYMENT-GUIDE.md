# 🚀 Frischly Deployment Guide - Complete Walkthrough

## Overview

Your Frischly project consists of:

- **Frontend**: HTML/CSS/JavaScript files (in `public/` folder)
- **Backend**: Node.js/Express API server with MongoDB
- **Database**: MongoDB (needs to be hosted)

## 🎯 Deployment Strategy: Split Architecture

**Frontend** → Netlify (Static Hosting)
**Backend** → Render/Railway (Node.js Hosting)  
**Database** → MongoDB Atlas (Cloud Database)

---

## 📋 Step-by-Step Deployment Process

### Phase 1: Database Setup (MongoDB Atlas)

1. **Create MongoDB Atlas Account**

   - Go to [MongoDB Atlas](https://mongodb.com/atlas)
   - Sign up for free account
   - Create a new cluster (free tier M0)

2. **Configure Database**
   - Choose cloud provider and region
   - Create database user with username/password
   - Add IP whitelist (0.0.0.0/0 for all IPs or specific IPs)
   - Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/frischly`

### Phase 2: Backend Deployment (Render)

1. **Prepare for Deployment**

   - Push your code to GitHub (if not already)
   - Create [Render](https://render.com) account

2. **Deploy to Render**

   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `frischly-backend`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Plan**: Free

3. **Set Environment Variables in Render**

   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/frischly
   JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
   JWT_EXPIRE=30d
   NODE_ENV=production
   PORT=10000
   CLIENT_URL=https://your-netlify-app.netlify.app
   ```

   **Note:** You'll update `CLIENT_URL` after deploying your frontend to Netlify.

4. **Deploy and Get URL**
   - Render will build and deploy your backend
   - Note your backend URL: `https://frischly-backend.onrender.com`

### Phase 3: Update Frontend for Production

1. **Update API URLs in Frontend Files**

   **File: `public/dashboard.html`**

   ```javascript
   // Find this line:
   const API_BASE_URL = "http://localhost:3001/api";

   // Replace with:
   const API_BASE_URL = "https://frischly-backend.onrender.com/api";
   ```

   **File: `public/signin.html`**

   ```javascript
   // Find and update:
   const API_BASE_URL = "https://frischly-backend.onrender.com/api";
   ```

   **File: `public/signup.html`**

   ```javascript
   // Find and update:
   const API_BASE_URL = "https://frischly-backend.onrender.com/api";
   ```

2. **Update Netlify Configuration**

   **File: `netlify.toml`**

   ```toml
   [build]
     publish = "public"

   [[redirects]]
     from = "/api/*"
     to = "https://frischly-backend.onrender.com/api/:splat"
     status = 200
     force = true

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

### Phase 4: Frontend Deployment (Netlify)

#### Method A: Drag & Drop (Easiest)

1. Go to [Netlify](https://netlify.com)
2. Drag the `public` folder to the deploy area
3. Wait for deployment to complete
4. Get your site URL: `https://amazing-name-123456.netlify.app`

#### Method B: Git Integration (Recommended)

1. Push your updated code to GitHub
2. Go to Netlify → "New site from Git"
3. Connect to GitHub and select your repository
4. Configure build settings:
   - **Publish directory**: `public`
   - **Build command**: (leave empty)
5. Deploy site

### Phase 5: Test Your Deployment

1. **Visit Your Netlify URL**
   - Should see your landing page
2. **Test Authentication**
   - Go to `/signin.html`
   - Try logging in with admin credentials
3. **Test Dashboard**
   - Should load without errors
   - All API calls should work

---

## 🔧 Configuration Files Created

### `netlify.toml` (Netlify Configuration)

- Handles redirects and builds
- Proxies API calls to backend

### `public/_redirects` (Backup Redirect Rules)

- Fallback redirect configuration
- Client-side routing support

### `DEPLOYMENT.md` (This Guide)

- Complete deployment instructions
- Troubleshooting tips

---

## 🚨 Troubleshooting Common Issues

### CORS Errors

**Problem**: API requests blocked by CORS policy
**Solution**: Update your backend CORS configuration:

```javascript
// In your server.js
app.use(
	cors({
		origin: ["https://your-netlify-url.netlify.app", "http://localhost:3000"],
		credentials: true,
	})
);
```

### API Not Found (404)

**Problem**: Frontend can't reach backend
**Solution**:

1. Verify backend URL is correct in frontend files
2. Check backend is running on Render
3. Test backend directly: `https://your-backend.onrender.com/api/health`

### Database Connection Failed

**Problem**: Backend can't connect to MongoDB
**Solution**:

1. Check MongoDB Atlas connection string
2. Verify database user credentials
3. Ensure IP whitelist includes 0.0.0.0/0

### Environment Variables Not Set

**Problem**: Missing configuration in production
**Solution**:

1. Double-check all env vars in Render dashboard
2. Redeploy backend after adding variables

---

## 🔐 Security Checklist

- [ ] Strong JWT secret (32+ characters)
- [ ] MongoDB user has minimal required permissions
- [ ] CORS configured for specific domains only
- [ ] Rate limiting enabled in production
- [ ] HTTPS enforced for all endpoints
- [ ] No sensitive data in frontend code

---

## 📱 Custom Domain (Optional)

### For Netlify (Frontend):

1. Go to Netlify site settings
2. Domain management → Add custom domain
3. Update DNS records as instructed

### For Render (Backend):

1. Go to Render service settings
2. Custom domains → Add domain
3. Update DNS records

---

## 🔄 Continuous Deployment

Both Netlify and Render support automatic deployment:

- **Push to main branch** → Automatic deployment
- **Check deployment status** in respective dashboards
- **View deployment logs** for debugging

---

## 📞 Support Resources

- **Netlify Docs**: https://docs.netlify.com
- **Render Docs**: https://render.com/docs
- **MongoDB Atlas**: https://docs.atlas.mongodb.com

---

## 🎉 You're Done!

Your Frischly application should now be live at:

- **Frontend**: `https://your-site.netlify.app`
- **Backend**: `https://your-backend.onrender.com`
- **Database**: MongoDB Atlas

Test all functionality and enjoy your deployed application! 🚀
