# Deploy Cloud Relay Server - Quick Guide

## Why You Need This

The cloud relay server is what connects your local MSFS Bridge to the React web app (GitHub Pages). Without it, the bridge can't send data to users' dashboards.

## Quick Deploy to Railway (Easiest - 5 minutes)

### Step 1: Sign Up
1. Go to [railway.app](https://railway.app)
2. Click "Start a New Project"
3. Sign in with GitHub

### Step 2: Deploy
1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your `ManeuverPrototype` repository
4. Railway will auto-detect it's a Node.js project
5. It will automatically:
   - Find `package.json`
   - Find `cloud-relay-server.js`
   - Install dependencies
   - Deploy the server

### Step 3: Get Your URL
1. Once deployed, Railway shows your app URL
2. It will look like: `https://msfs-relay-production.up.railway.app`
3. **Important:** Change `https://` to `wss://` for WebSocket
4. Your WebSocket URL: `wss://msfs-relay-production.up.railway.app`

### Step 4: Update Bridge Code
1. Open `msfs-bridge-unified.py`
2. Find this line:
   ```python
   CLOUD_WS_URL = "wss://your-relay-server.railway.app"
   ```
3. Replace with your actual URL:
   ```python
   CLOUD_WS_URL = "wss://msfs-relay-production.up.railway.app"
   ```
4. Save and rebuild your exe

### Step 5: Update React App
1. Open `ReactRoot/.env`
2. Find:
   ```
   VITE_CLOUD_WS_URL=wss://your-relay-server.railway.app
   ```
3. Replace with your actual URL
4. Rebuild your React app

## Alternative: Deploy to Render (Free tier)

### Step 1: Sign Up
1. Go to [render.com](https://render.com)
2. Sign up with GitHub

### Step 2: Create Web Service
1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Select `ManeuverPrototype`

### Step 3: Configure
- **Name:** msfs-relay-server (or any name)
- **Environment:** Node
- **Build Command:** `npm install`
- **Start Command:** `node cloud-relay-server.js`
- **Plan:** Free (or paid)

### Step 4: Deploy
1. Click **"Create Web Service"**
2. Wait 2-3 minutes for deployment
3. Get your URL (e.g., `https://msfs-relay-server.onrender.com`)
4. Change to `wss://msfs-relay-server.onrender.com`

## Test Your Server

Once deployed, test it:
1. Open: `https://your-server-url.com/health`
2. You should see:
   ```json
   {
     "status": "ok",
     "activeSessions": 0,
     "timestamp": "..."
   }
   ```

## What the Server Does

The cloud relay server:
- Receives data from users' MSFS Bridge clients
- Relays it to their React dashboard (via WebSocket)
- Manages user sessions (so each user gets their own data)
- Handles multiple users simultaneously

## Important Notes

- **Free tier limits:** Railway and Render have free tiers, but may sleep after inactivity
- **Upgrade needed?** If you get lots of users, you might need a paid plan
- **Custom domain:** You can add a custom domain later if needed

## Troubleshooting

**Server won't start:**
- Check Railway/Render logs
- Make sure `package.json` and `cloud-relay-server.js` are in repo root
- Verify Node.js version (needs 16+)

**Can't connect from bridge:**
- Make sure you're using `wss://` not `https://`
- Check server is actually running (test /health endpoint)
- Verify URL is correct in bridge code

**CORS errors:**
- The server handles CORS automatically
- If you see CORS errors, check server logs

## Next Steps

1. ✅ Deploy server to Railway/Render
2. ✅ Get your WebSocket URL
3. ✅ Update `msfs-bridge-unified.py` with the URL
4. ✅ Update `ReactRoot/.env` with the URL
5. ✅ Rebuild bridge exe
6. ✅ Rebuild React app
7. ✅ Test everything!

Once deployed, your server will run 24/7 and handle all user connections! 🚀


