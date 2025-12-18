-- MSFS Maneuver Tracker - Supabase Database Setup
-- Run this in your Supabase SQL Editor

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  session_id TEXT UNIQUE NOT NULL,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on session_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_session_id ON user_profiles(session_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Disable Row Level Security (for simpler setup - no security restrictions)
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;

-- Optional: Create a function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, session_id, email)
  VALUES (
    NEW.id,
    'user_' || substring(NEW.id::text from 1 for 8),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Optional: Create table for storing maneuver results (future feature)
CREATE TABLE IF NOT EXISTS maneuver_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  maneuver_type TEXT NOT NULL,
  session_id TEXT,
  result_data JSONB,
  grade TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maneuver_results_user_id ON maneuver_results(user_id);
CREATE INDEX IF NOT EXISTS idx_maneuver_results_created_at ON maneuver_results(created_at DESC);

-- Disable Row Level Security (for simpler setup - no security restrictions)
ALTER TABLE maneuver_results DISABLE ROW LEVEL SECURITY;

-- Create table for instructor/student relationships
CREATE TABLE IF NOT EXISTS instructor_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  instructor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
  invited_by UUID REFERENCES auth.users(id) NOT NULL, -- who sent the invite
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(student_id, instructor_id)
);

CREATE INDEX IF NOT EXISTS idx_instructor_relationships_student ON instructor_relationships(student_id);
CREATE INDEX IF NOT EXISTS idx_instructor_relationships_instructor ON instructor_relationships(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_relationships_status ON instructor_relationships(status);

-- Disable Row Level Security
ALTER TABLE instructor_relationships DISABLE ROW LEVEL SECURITY;

