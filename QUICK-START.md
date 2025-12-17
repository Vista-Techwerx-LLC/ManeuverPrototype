# Quick Start Guide

## Get Your Three Configuration Values

### 1. Supabase URL & Key (5 minutes)

1. Go to [supabase.com](https://app.supabase.com) → Sign up/Login
2. Click **"New Project"**
3. Fill in project name, set a database password, choose region
4. Wait for project to initialize (~2 minutes)
5. Go to **Settings** → **API**
6. Copy:
   - **Project URL** → This is `VITE_SUPABASE_URL`
   - **anon public** key → This is `VITE_SUPABASE_ANON_KEY`

**Then run the SQL setup:**
- Go to **SQL Editor** in Supabase
- Copy/paste contents of `ReactRoot/supabase-setup.sql`
- Click **Run**

---

### 2. Cloud WebSocket URL (10 minutes)

**Easiest: Railway (Recommended)**

1. Go to [railway.app](https://railway.app) → Sign up with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `ManeuverPrototype` repository
4. Railway will auto-detect and deploy
5. Once deployed, copy the URL (looks like `https://xxx.up.railway.app`)
6. Change `https://` to `wss://` → This is `VITE_CLOUD_WS_URL`

**Alternative: Render**
- Go to [render.com](https://render.com)
- New → Web Service → Connect GitHub repo
- Build: `npm install`, Start: `node cloud-relay-server.js`
- Get URL, change to `wss://`

---

### 3. Create .env File

In `ReactRoot/` folder, create `.env`:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_CLOUD_WS_URL=wss://xxx.up.railway.app
```

**No spaces, no quotes!**

---

### 4. Run the App

```bash
cd ReactRoot
npm install
npm run dev
```

Open `http://localhost:3000` → Sign up → Get your session ID from Dashboard!

---

## Full Details

See `ReactRoot/SETUP-GUIDE.md` for detailed step-by-step instructions with troubleshooting.


