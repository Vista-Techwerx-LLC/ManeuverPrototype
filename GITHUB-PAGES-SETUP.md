# GitHub Pages Setup Guide

## Overview

Since you're hosting on GitHub Pages, you need a cloud WebSocket relay server because:
- GitHub Pages can't connect directly to local WebSocket servers
- HTTPS (GitHub Pages) can't connect to HTTP WebSocket (local)
- The bridge runs on your local PC

## Solution: Cloud WebSocket Relay

The solution uses a **cloud WebSocket relay server** that:
1. Receives data from your local bridge
2. Relays it to GitHub Pages clients
3. Supports multiple sessions (so each user can have their own data stream)

## Setup Steps

### 1. Deploy the Cloud Relay Server

Deploy `cloud-relay-server.js` to a hosting service:

**Option A: Railway (Recommended - Free tier available)**
1. Go to [railway.app](https://railway.app)
2. Create a new project
3. Connect your GitHub repo
4. Add a new service → "Empty Service"
5. Set the start command: `npm start`
6. Add `package.json` to your repo
7. Railway will auto-deploy

**Option B: Render**
1. Go to [render.com](https://render.com)
2. Create a new "Web Service"
3. Connect your GitHub repo
4. Build command: `npm install`
5. Start command: `node cloud-relay-server.js`

**Option C: Heroku**
1. Create a `Procfile` with: `web: node cloud-relay-server.js`
2. Deploy via Heroku CLI or GitHub integration

### 2. Update Configuration

**In `ws-connection.js`:**
```javascript
const CLOUD_WS_URL = 'wss://your-relay-server.railway.app'; // Change this!
```

**In `cloud-bridge-client.py`:**
```python
CLOUD_WS_URL = "wss://your-relay-server.railway.app"  # Change this!
SESSION_ID = "default"  # Or use a unique ID per user
```

### 3. Run the Cloud Bridge Client

Instead of (or alongside) the local WebSocket server, run:
```bash
python cloud-bridge-client.py
```

This connects your local MSFS bridge to the cloud server.

### 4. Update GitHub Pages

Your GitHub Pages site will automatically connect to the cloud server. Users can:
- Use the default session (public, anyone can view)
- Or specify a session ID in the URL: `?session=your-unique-id`

## Session Management

### Public Access (Default)
- Session ID: `default`
- Anyone with the GitHub Pages URL can view
- Good for demos or public sharing

### Private Sessions
- Use a unique session ID (e.g., your username or a random string)
- Share the session ID only with people you want to have access
- Example: `https://yourusername.github.io/ManeuverPrototype/?session=my-secret-id`

### User Accounts (Optional)

If you want proper user accounts with saved data, you'd need to add:
1. Authentication (Firebase Auth, Auth0, or custom)
2. Database (Firebase, Supabase, or PostgreSQL)
3. User-specific session management
4. Data persistence

For now, the session-based approach works without accounts - just share session IDs.

## Testing

1. **Deploy the relay server** and note the URL
2. **Update the URLs** in `ws-connection.js` and `cloud-bridge-client.py`
3. **Run the cloud bridge client** on your PC
4. **Open your GitHub Pages site** - it should connect automatically
5. **Check the browser console** for connection status

## Environment Variables (Optional)

For the relay server, you can set:
- `PORT` - Server port (default: 3000)
- `BRIDGE_TOKEN` - Optional authentication token for bridges
- `NODE_ENV` - Environment (production/development)

## Troubleshooting

### Can't Connect from GitHub Pages
- Check that the relay server is deployed and running
- Verify the WebSocket URL uses `wss://` (secure WebSocket)
- Check browser console for errors
- Make sure the session ID matches

### Bridge Can't Connect
- Verify `CLOUD_WS_URL` is correct
- Check that the relay server is accessible
- Try the `/health` endpoint: `https://your-server.com/health`

### Multiple Users
- Each user should use a unique session ID
- Or implement proper authentication (see "User Accounts" above)

## Next Steps

If you want to add user accounts:
1. Add authentication (Firebase Auth is easiest)
2. Store user sessions in a database
3. Add data persistence for maneuver results
4. Add user-specific dashboards

For now, the session-based approach should work for your use case!


