# MSFS Maneuver Tracker - React App

A React web application for tracking flight maneuvers with user authentication via Supabase.

## Setup

### 1. Install Dependencies

```bash
cd ReactRoot
npm install
```

### 2. Configure Supabase

1. Go to [Supabase](https://app.supabase.com) and create a new project
2. Get your project URL and anon key from Project Settings → API
3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Fill in your Supabase credentials in `.env`

### 3. Set Up Supabase Database

Run this SQL in your Supabase SQL Editor:

```sql
-- Create user profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  session_id TEXT UNIQUE NOT NULL,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = user_id);
```

### 4. Configure Cloud WebSocket Server

1. Deploy `cloud-relay-server.js` (see `../GITHUB-PAGES-SETUP.md`)
2. Update `VITE_CLOUD_WS_URL` in `.env` with your deployed server URL

### 5. Run Development Server

```bash
npm run dev
```

The app will open at `http://localhost:3000`

## Features

- ✅ User authentication (sign up / sign in)
- ✅ User-specific session IDs
- ✅ Protected routes
- ✅ Dashboard with session management
- ✅ Live telemetry viewer
- ✅ Steep turn tracker (coming soon)

## Project Structure

```
ReactRoot/
├── src/
│   ├── components/      # React components
│   │   ├── Auth.jsx     # Sign up/sign in
│   │   ├── Dashboard.jsx # User dashboard
│   │   ├── Telemetry.jsx # Live telemetry
│   │   └── Navbar.jsx    # Navigation bar
│   ├── hooks/
│   │   └── useWebSocket.js # WebSocket connection hook
│   ├── lib/
│   │   └── supabase.js  # Supabase client
│   ├── App.jsx          # Main app component
│   └── main.jsx         # Entry point
├── .env                 # Environment variables (create from .env.example)
└── package.json
```

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory, ready to deploy to GitHub Pages or any static hosting.

## Connecting to MSFS Bridge

1. Get your session ID from the Dashboard
2. Update `cloud-bridge-client.py` with your session ID:
   ```python
   SESSION_ID = "your-session-id-from-dashboard"
   ```
3. Run the cloud bridge client on your PC
4. Start Microsoft Flight Simulator
5. Open the Telemetry or Steep Turn page to see live data

## Environment Variables

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
- `VITE_CLOUD_WS_URL` - Your cloud WebSocket relay server URL


