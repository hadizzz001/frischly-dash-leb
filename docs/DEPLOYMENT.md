# Frischly - Frontend Deployment Guide

## Deploy to Netlify (Frontend Only)

### Prerequisites

1. Create accounts on:
   - [Netlify](https://netlify.com) (for frontend)
   - [Render](https://render.com) or [Railway](https://railway.app) (for backend)
   - [MongoDB Atlas](https://mongodb.com/atlas) (for database)

### Step 1: Deploy Backend First

#### Option A: Deploy to Render

1. Go to [Render](https://render.com)
2. Connect your GitHub repository
3. Create a new "Web Service"
4. Set:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Port**: `3001`

#### Option B: Deploy to Railway

1. Go to [Railway](https://railway.app)
2. Click "Deploy from GitHub repo"
3. Select your repository
4. Railway will auto-detect Node.js and deploy

### Step 2: Set Environment Variables

Add these environment variables in your backend deployment platform:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/frischly
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRE=30d
NODE_ENV=production
PORT=3001
```

### Step 3: Update Frontend API URL

After backend is deployed, update the API URL in your frontend files:

1. Open `public/dashboard.html`
2. Find: `const API_BASE_URL = "http://localhost:3001/api";`
3. Replace with: `const API_BASE_URL = "https://your-backend-url.onrender.com/api";`

### Step 4: Deploy Frontend to Netlify

#### Method 1: Drag & Drop

1. Go to [Netlify](https://netlify.com)
2. Drag the `public` folder to the deploy area

#### Method 2: Git Integration

1. Push your code to GitHub
2. Connect Netlify to your GitHub repo
3. Set build settings:
   - **Publish directory**: `public`
   - **Build command**: (leave empty)

### Step 5: Update Netlify Configuration

1. After deployment, go to Netlify dashboard
2. Go to Site Settings > Build & Deploy > Redirects
3. Update the `_redirects` file with your actual backend URL

### Environment Variables for Production

Make sure your backend has these variables set properly for production deployment.

## Alternative: Deploy Everything to Render

If you prefer to keep frontend and backend together:

1. Create a build script in package.json:

```json
{
	"scripts": {
		"build": "echo 'Frontend is ready'",
		"start": "node server.js"
	}
}
```

2. Deploy to Render as a Web Service
3. Set static file serving in your Express server
4. Access your app at the Render URL

## Troubleshooting

### Common Issues:

1. **CORS Errors**: Make sure your backend allows requests from your Netlify domain
2. **API Not Found**: Verify the API URL in your frontend matches your backend deployment
3. **Database Connection**: Ensure MongoDB Atlas is properly configured and accessible

### Security Checklist:

- [ ] Environment variables are set correctly
- [ ] JWT secret is strong and secure
- [ ] Database has proper authentication
- [ ] CORS is configured for your domains only
- [ ] API rate limiting is enabled
