# Railway Domain Setup

## Yes, You Need to Generate a Domain!

### Step 1: Generate Public Domain
1. Click the **"Generate Domain"** button (with lightning bolt icon)
2. Railway will create a public URL for your service
3. It will look like: `https://host-bridge-production.up.railway.app`
4. This is what you'll use for WebSocket connections!

### Step 2: Get Your WebSocket URL
Once the domain is generated:
- Railway will show you the URL
- Copy it
- Change `https://` to `wss://` for WebSocket
- Example: `wss://host-bridge-production.up.railway.app`

### Step 3: Test It
Open in browser: `https://your-domain.railway.app/health`
- Should return: `{"status":"ok",...}`

### Step 4: Update Your Code
1. **Bridge:** `msfs-bridge-unified.py`
   ```python
   CLOUD_WS_URL = "wss://your-domain.railway.app"
   ```

2. **React:** `ReactRoot/.env`
   ```
   VITE_CLOUD_WS_URL=wss://your-domain.railway.app
   ```

## Why You Need This
- Without a public domain, your server isn't accessible from the internet
- The bridge and React app need to connect to it
- Railway's generated domain is free and works immediately

## Custom Domain (Optional)
- You can add a custom domain later if you want
- For now, the generated domain is perfect!

