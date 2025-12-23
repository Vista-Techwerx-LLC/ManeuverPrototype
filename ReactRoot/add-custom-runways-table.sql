-- Add custom_runways table to existing database
-- Run this in your Supabase SQL Editor if you already have the other tables

CREATE TABLE IF NOT EXISTS custom_runways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  runway_name TEXT NOT NULL,
  runway_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, runway_name)
);

CREATE INDEX IF NOT EXISTS idx_custom_runways_user_id ON custom_runways(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_runways_name ON custom_runways(runway_name);

-- Disable Row Level Security
ALTER TABLE custom_runways DISABLE ROW LEVEL SECURITY;

