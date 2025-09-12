# 🔗 Update Client URL After Netlify Deployment

After deploying your frontend to Netlify, you need to update the client URL in your backend configuration to allow CORS requests.

## 📋 Quick Steps

### 1. Get Your Netlify URL

After deploying to Netlify, you'll get a URL like:

- `https://amazing-name-123456.netlify.app`
- `https://your-custom-name.netlify.app`

### 2. Update Local Configuration (Optional)

Run this command and enter your Netlify URL when prompted:

```bash
npm run update-client-url
```

### 3. Update Production Environment Variables

#### On Render:

1. Go to your [Render Dashboard](https://dashboard.render.com)
2. Click on your `frischly-server` service
3. Go to **Environment** tab
4. Add or update the `CLIENT_URL` variable:
   ```
   CLIENT_URL=https://your-netlify-app.netlify.app
   ```
5. Click **Save Changes**
6. Your service will automatically redeploy

#### On Railway:

1. Go to your Railway dashboard
2. Select your project
3. Go to **Variables** tab
4. Add or update:
   ```
   CLIENT_URL=https://your-netlify-app.netlify.app
   ```

#### On Vercel:

1. Go to your Vercel dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add or update:
   ```
   CLIENT_URL=https://your-netlify-app.netlify.app
   ```

## 🔧 CORS Configuration

Your server is already configured to handle multiple origins:

- ✅ Localhost (for development)
- ✅ Any `.netlify.app` subdomain
- ✅ Custom CLIENT_URL from environment

The CORS configuration in `server.js` automatically allows:

- Your specified `CLIENT_URL`
- Any URL ending with `.netlify.app`
- Development URLs (`localhost`)

## 🧪 Testing

After updating the CLIENT_URL:

1. **Test your frontend**: Visit your Netlify URL
2. **Check browser console**: Should see no CORS errors
3. **Test login**: Try signing in through your frontend
4. **Test API calls**: All dashboard features should work

## 🚨 Troubleshooting

### CORS Errors Still Appearing?

1. Check that `CLIENT_URL` is set correctly in your backend environment
2. Ensure your backend service redeployed after adding the variable
3. Clear browser cache and cookies
4. Check browser developer console for exact error messages

### Backend Not Responding?

1. Verify your backend is running on Render/Railway
2. Check backend logs for any startup errors
3. Test backend directly: `https://frischly-server.onrender.com/api/health`

## 💡 Pro Tips

- **Custom Domain**: If you add a custom domain to Netlify, update `CLIENT_URL` accordingly
- **Multiple Environments**: You can set different `CLIENT_URL` values for staging vs production
- **Security**: The CORS configuration only allows specific origins for security

Your frontend and backend should now communicate seamlessly! 🎉
