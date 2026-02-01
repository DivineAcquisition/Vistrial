-- Ensure businesses table exists with correct columns
-- Run this in Supabase SQL Editor if you're having issues

-- First, check if the businesses table exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'businesses') THEN
    CREATE TABLE businesses (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      trade TEXT DEFAULT 'cleaning',
      phone TEXT,
      email TEXT,
      address_line1 TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      primary_color TEXT DEFAULT '#6E47D1',
      settings JSONB DEFAULT '{}',
      onboarding_completed BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    RAISE NOTICE 'Created businesses table';
  END IF;
END $$;

-- Add any missing columns
DO $$
BEGIN
  -- Add owner_id if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'businesses' AND column_name = 'owner_id') THEN
    ALTER TABLE businesses ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added owner_id column';
  END IF;

  -- Add onboarding_completed if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'businesses' AND column_name = 'onboarding_completed') THEN
    ALTER TABLE businesses ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added onboarding_completed column';
  END IF;

  -- Add is_active if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'businesses' AND column_name = 'is_active') THEN
    ALTER TABLE businesses ADD COLUMN is_active BOOLEAN DEFAULT true;
    RAISE NOTICE 'Added is_active column';
  END IF;

  -- Add trade if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'businesses' AND column_name = 'trade') THEN
    ALTER TABLE businesses ADD COLUMN trade TEXT DEFAULT 'cleaning';
    RAISE NOTICE 'Added trade column';
  END IF;

  -- Add settings if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'businesses' AND column_name = 'settings') THEN
    ALTER TABLE businesses ADD COLUMN settings JSONB DEFAULT '{}';
    RAISE NOTICE 'Added settings column';
  END IF;

  -- Add primary_color if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'businesses' AND column_name = 'primary_color') THEN
    ALTER TABLE businesses ADD COLUMN primary_color TEXT DEFAULT '#6E47D1';
    RAISE NOTICE 'Added primary_color column';
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own businesses" ON businesses;
DROP POLICY IF EXISTS "Users can insert their own businesses" ON businesses;
DROP POLICY IF EXISTS "Users can update their own businesses" ON businesses;
DROP POLICY IF EXISTS "Service role has full access" ON businesses;

-- Create policies
CREATE POLICY "Users can view their own businesses" 
  ON businesses FOR SELECT 
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own businesses" 
  ON businesses FOR INSERT 
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own businesses" 
  ON businesses FOR UPDATE 
  USING (auth.uid() = owner_id);

-- Allow service role full access (for admin operations)
CREATE POLICY "Service role has full access" 
  ON businesses FOR ALL 
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS businesses_owner_id_idx ON businesses(owner_id);

-- Ensure user_profiles table exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles') THEN
    CREATE TABLE user_profiles (
      id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    -- Enable RLS
    ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
    
    -- Policies
    CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
    CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
    CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
    CREATE POLICY "Service role has full access to profiles" ON user_profiles FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
    
    RAISE NOTICE 'Created user_profiles table';
  END IF;
END $$;

-- Verify setup
SELECT 'Schema verification:' as info;
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'businesses'
ORDER BY ordinal_position;
