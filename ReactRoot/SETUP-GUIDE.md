# Setup Guide - Getting Your Configuration Values

## 1. Supabase URL and Anon Key

### Step 1: Create a Supabase Account
1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project" or "Sign in"
3. Sign up with GitHub, Google, or email

### Step 2: Create a New Project
1. Click "New Project"
2. Fill in:
   - **Name**: MSFS Maneuver Tracker (or any name)
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free tier is fine
3. Click "Create new project"
4. Wait 2-3 minutes for project to initialize

### Step 3: Get Your API Keys
1. In your project dashboard, click **Settings** (gear icon) in the left sidebar
2. Click **API** in the settings menu
3. You'll see:
   - **Project URL** - This is your `VITE_SUPABASE_URL`
   - **anon public** key - This is your `VITE_SUPABASE_ANON_KEY`

**Example:**
```
Project URL: https://abcdefghijklmnop.supabase.co
anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzODk2NzI4MCwiZXhwIjoxOTU0NTQzMjgwfQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 4: Set Up Database
1. In Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Copy and paste the contents of `supabase-setup.sql` from this folder
4. Click **Run** (or press Ctrl+Enter)
5. You should see "Success. No rows returned"

---

## 2. Cloud WebSocket Relay Server URL

### Option A: Deploy to Railway (Recommended - Free)

1. **Sign up for Railway**
   - Go to [railway.app](https://railway.app)
   - Click "Start a New Project"
   - Sign in with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your ManeuverPrototype repository
   - Or select "Empty Project" if you want to deploy manually

3. **Deploy the Server**
   - If using GitHub: Railway will auto-detect `package.json` and `cloud-relay-server.js`
   - If manual: Click "New" → "GitHub Repo" → Select your repo
   - Railway will detect Node.js and deploy automatically

4. **Get Your URL**
   - Once deployed, Railway will show your app URL
   - It will look like: `https://your-app-name.up.railway.app`
   - **Important**: Change `https://` to `wss://` for WebSocket
   - Example: `wss://your-app-name.up.railway.app`

5. **Set Environment Variables (if needed)**
   - In Railway dashboard, go to your service
   - Click "Variables" tab
   - Add `PORT=3000` (Railway sets this automatically, but you can verify)

### Option B: Deploy to Render (Free tier available)

1. **Sign up for Render**
   - Go to [render.com](https://render.com)
   - Sign up with GitHub

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the `ManeuverPrototype` repo

3. **Configure Service**
   - **Name**: msfs-relay-server (or any name)
   - **Environment**: Node
   - **Build Command**: `npm install` (or leave blank)
   - **Start Command**: `node cloud-relay-server.js`
   - **Plan**: Free (or paid if you prefer)

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (2-3 minutes)

5. **Get Your URL**
   - Once deployed, Render shows your service URL
   - It will look like: `https://msfs-relay-server.onrender.com`
   - Change `https://` to `wss://`
   - Example: `wss://msfs-relay-server.onrender.com`

### Option C: Deploy to Heroku

1. **Install Heroku CLI**
   - Download from [heroku.com/cli](https://devcenter.heroku.com/articles/heroku-cli)

2. **Login and Create App**
   ```bash
   heroku login
   heroku create msfs-relay-server
   ```

3. **Deploy**
   ```bash
   git add cloud-relay-server.js package.json
   git commit -m "Add relay server"
   git push heroku main
   ```

4. **Get URL**
   - Your app will be at: `https://msfs-relay-server.herokuapp.com`
   - Use: `wss://msfs-relay-server.herokuapp.com`

---

## 3. Create Your .env File

1. In the `ReactRoot` folder, create a file named `.env` (no extension)

2. Copy this template and fill in your values:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_CLOUD_WS_URL=wss://your-relay-server.railway.app
```

**Example .env file:**
```env
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzODk2NzI4MCwiZXhwIjoxOTU0NTQzMjgwfQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_CLOUD_WS_URL=wss://msfs-relay.up.railway.app
```

3. **Important**: 
   - Don't commit `.env` to Git (it's already in `.gitignore`)
   - Make sure there are no spaces around the `=` sign
   - No quotes needed around the values

---

## 4. Verify Everything Works

1. **Start the React app:**
   ```bash
   cd ReactRoot
   npm install
   npm run dev
   ```

2. **Test Supabase:**
   - Go to `http://localhost:3000`
   - Try to sign up with a test email
   - If it works, Supabase is configured correctly!

3. **Test WebSocket (after deploying relay server):**
   - Sign in to the app
   - Go to Dashboard - you should see your session ID
   - Update `cloud-bridge-client.py` with your session ID
   - Run the bridge client
   - Go to Telemetry page - you should see "Connected"

---

## Troubleshooting

### Supabase Issues
- **"Invalid API key"**: Double-check you copied the full anon key (it's very long)
- **"Project not found"**: Make sure you're using the correct project URL
- **Can't sign up**: Check that email confirmation is disabled in Supabase Auth settings (or check your email)

### WebSocket Issues
- **Can't connect**: Make sure you're using `wss://` not `https://`
- **Connection refused**: Check that the relay server is actually deployed and running
- **CORS errors**: The relay server should handle CORS automatically

### Railway/Render Issues
- **Build fails**: Make sure `package.json` and `cloud-relay-server.js` are in the root of your repo
- **Service won't start**: Check the logs in Railway/Render dashboard
- **Port issues**: Railway and Render set PORT automatically, don't override it

---

## Quick Checklist

- [ ] Created Supabase account and project
- [ ] Got Supabase URL and anon key
- [ ] Ran SQL setup script in Supabase
- [ ] Deployed relay server to Railway/Render/Heroku
- [ ] Got WebSocket URL (wss://...)
- [ ] Created `.env` file with all three values
- [ ] Tested React app - can sign up/sign in
- [ ] Updated `cloud-bridge-client.py` with session ID from dashboard

Once all checked, you're ready to go! 🚀


