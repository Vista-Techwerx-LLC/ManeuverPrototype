-- Create landing_paths table for storing saved landing approach paths
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS landing_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  runway_id TEXT NOT NULL, -- References runway (either '27' for KJKA or custom runway id)
  path_name TEXT NOT NULL, -- User-friendly name for the path
  path_data JSONB NOT NULL, -- Array of {lat, lon, alt, timestamp, etc.}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landing_paths_user_id ON landing_paths(user_id);
CREATE INDEX IF NOT EXISTS idx_landing_paths_runway_id ON landing_paths(runway_id);
CREATE INDEX IF NOT EXISTS idx_landing_paths_created_at ON landing_paths(created_at DESC);

-- Disable Row Level Security (for simpler setup)
ALTER TABLE landing_paths DISABLE ROW LEVEL SECURITY;

