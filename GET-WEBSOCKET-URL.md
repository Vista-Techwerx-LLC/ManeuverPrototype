# How to Get Your WebSocket URL

## Step 1: Find Your Server URL

### If You Used Railway:
1. Go to [railway.app](https://railway.app)
2. Click on your project
3. Click on your deployed service
4. Look for the **"Domains"** or **"Settings"** tab
5. You'll see your URL like: `https://host-bridge-production.up.railway.app`
6. **Copy this URL**

### If You Used Render:
1. Go to [render.com](https://render.com)
2. Click on your service
3. Look at the top - you'll see your URL like: `https://host-bridge.onrender.com`
4. **Copy this URL**

### If You Used Heroku:
1. Go to [heroku.com](https://dashboard.heroku.com)
2. Click on your app
3. Click "Settings"
4. Look for "Domains" - you'll see your URL
5. **Copy this URL**

## Step 2: Convert to WebSocket URL

**Important:** Change `https://` to `wss://`

**Example:**
- Your server URL: `https://host-bridge-production.up.railway.app`
- Your WebSocket URL: `wss://host-bridge-production.up.railway.app`

## Step 3: Test Your Server

Before updating your code, test that it works:

1. Open your browser
2. Go to: `https://your-server-url.com/health`
3. You should see:
   ```json
   {
     "status": "ok",
     "activeSessions": 0,
     "timestamp": "..."
   }
   ```

If this works, your server is running! ✅

## Step 4: Update Your Code

### Update Bridge Code (`msfs-bridge-unified.py`):

Find this line (around line 11):
```python
CLOUD_WS_URL = "wss://your-relay-server.railway.app"  # ⚠️ CHANGE THIS
```

Replace with your actual URL:
```python
CLOUD_WS_URL = "wss://host-bridge-production.up.railway.app"  # Your actual URL here
```

### Update React App (`ReactRoot/.env`):

Open `ReactRoot/.env` and find:
```
VITE_CLOUD_WS_URL=wss://your-relay-server.railway.app
```

Replace with your actual URL:
```
VITE_CLOUD_WS_URL=wss://host-bridge-production.up.railway.app
```

**Important:** 
- Use `wss://` not `https://`
- No trailing slash
- No quotes in the .env file

## Step 5: Rebuild

### For Bridge:
- Rebuild your `.exe` file with the updated `msfs-bridge-unified.py`

### For React App:
- Restart your dev server: `npm run dev`
- Or rebuild for production: `npm run build`

## Quick Checklist

- [ ] Found server URL in Railway/Render/Heroku
- [ ] Changed `https://` to `wss://`
- [ ] Tested `/health` endpoint (works!)
- [ ] Updated `msfs-bridge-unified.py` with WebSocket URL
- [ ] Updated `ReactRoot/.env` with WebSocket URL
- [ ] Rebuilt bridge exe
- [ ] Restarted React app
- [ ] Tested connection!

## Troubleshooting

**"Can't connect"**
- Make sure you're using `wss://` not `https://`
- Check that server is actually running (test /health)
- Verify URL is correct (no typos)

**"Connection refused"**
- Server might be sleeping (free tier)
- Check Railway/Render logs
- Make sure server is deployed and running

**"Invalid URL"**
- Make sure there's no trailing slash
- Use `wss://` not `ws://` (secure WebSocket)
- No quotes around the URL in .env file

