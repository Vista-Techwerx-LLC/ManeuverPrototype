# Finding Your Railway WebSocket URL

## You're in Project Settings - Here's How to Get the URL:

### Step 1: Go to Your Service
1. Click the **"X"** in the top right to close Settings
2. Or click **"Architecture"** tab at the top
3. You'll see your deployed service(s)

### Step 2: Find the Domain
1. Click on your service (the one running `server.js`)
2. Look for a **"Settings"** tab or **"Networking"** section
3. You'll see a **"Domain"** or **"Public URL"**
4. It will look like: `https://empathetic-benevolence-production.up.railway.app`

### Step 3: Alternative - Check Service Overview
1. Click on your service
2. Look at the top of the page
3. Railway shows the public URL there
4. Or check the **"Networking"** tab

### Step 4: Convert to WebSocket URL
Once you have the URL:
- If it's: `https://empathetic-benevolence-production.up.railway.app`
- Change to: `wss://empathetic-benevolence-production.up.railway.app`

## Quick Test
Test your server works:
- Open: `https://your-url.railway.app/health`
- Should return: `{"status":"ok",...}`

## Then Update:
1. **Bridge:** `msfs-bridge-unified.py` → `CLOUD_WS_URL = "wss://your-url.railway.app"`
2. **React:** `ReactRoot/.env` → `VITE_CLOUD_WS_URL=wss://your-url.railway.app`

