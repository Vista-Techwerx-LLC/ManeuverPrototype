# Next Steps - You're Almost There! 🚀

## ✅ What You've Done
- [x] Created Supabase project
- [x] Got Supabase URL and key
- [x] Created .env file

## 🔄 What's Left

### 1. Verify Supabase Key (2 minutes)
The key you provided is a "Publishable Key" - we need to make sure it's the right one:

1. Go to your Supabase project: https://app.supabase.com/project/gtxpddflqovdsutboirn
2. Click **Settings** (gear icon) → **API**
3. Look for **"anon public"** key (not "Publishable Key" or "Secret Key")
4. If you see "anon public", copy that instead
5. Update `.env` file with the correct key

**Note:** If Supabase only shows "Publishable Key" (newer UI), that might be correct. We'll test it!

### 2. Set Up Database (5 minutes)
1. In Supabase, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Open `ReactRoot/supabase-setup.sql` and copy all the SQL
4. Paste into Supabase SQL Editor
5. Click **Run** (or press Ctrl+Enter)
6. You should see "Success. No rows returned"

### 3. Deploy Cloud Relay Server (10 minutes)
You need to deploy `cloud-relay-server.js` to get your WebSocket URL:

**Option A: Railway (Easiest)**
1. Go to [railway.app](https://railway.app) → Sign up with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `ManeuverPrototype` repository
4. Railway will auto-detect and deploy
5. Once deployed, copy the URL (e.g., `https://msfs-relay.up.railway.app`)
6. Change `https://` to `wss://` → `wss://msfs-relay.up.railway.app`
7. Update `.env` file: `VITE_CLOUD_WS_URL=wss://your-actual-url.railway.app`

**Option B: Render**
- Go to [render.com](https://render.com)
- New → Web Service → Connect GitHub repo
- Build: `npm install`, Start: `node cloud-relay-server.js`
- Get URL, change to `wss://`

### 4. Test the App (5 minutes)
```bash
cd ReactRoot
npm install
npm run dev
```

Then:
1. Open http://localhost:3000
2. Try to **Sign Up** with a test email
3. If it works → Supabase is configured correctly! ✅
4. If you get an error → Check the browser console and Supabase key

### 5. Get Your Session ID
1. After signing up, you'll be redirected to Dashboard
2. You'll see your **Session ID** (e.g., `user_abc12345`)
3. Copy this Session ID
4. Update `cloud-bridge-client.py`:
   ```python
   SESSION_ID = "your-session-id-from-dashboard"
   ```

### 6. Connect Everything
1. Deploy relay server (step 3) → Get WebSocket URL
2. Update `.env` with WebSocket URL
3. Run bridge client: `python cloud-bridge-client.py`
4. Start MSFS
5. Open Telemetry page → Should see "Connected"!

---

## Quick Checklist

- [ ] Verified Supabase key (anon public or publishable)
- [ ] Ran SQL setup script in Supabase
- [ ] Deployed relay server to Railway/Render
- [ ] Updated `.env` with WebSocket URL (wss://...)
- [ ] Tested React app - can sign up
- [ ] Got session ID from dashboard
- [ ] Updated `cloud-bridge-client.py` with session ID

---

## Troubleshooting

**"Invalid API key" error:**
- Make sure you're using the "anon public" key (starts with `eyJ`)
- Or if Supabase only shows "Publishable Key", try that
- Check there are no extra spaces in `.env` file

**Can't sign up:**
- Check Supabase Auth settings → Email confirmation might be enabled
- Disable it or check your email for confirmation link

**WebSocket won't connect:**
- Make sure you're using `wss://` not `https://`
- Check that relay server is actually deployed and running
- Look at Railway/Render logs for errors

---

## Current Status

✅ Supabase project created  
✅ .env file created with your credentials  
⏳ Need to: Verify key, run SQL, deploy relay server

You're doing great! 🎉


