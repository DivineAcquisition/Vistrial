-- ============================================
-- VISTRIAL AUTH SCHEMA
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- BUSINESSES TABLE
-- Core business/company record
-- ============================================
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Owner (links to auth.users)
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Business Info
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  trade VARCHAR(50),
  
  -- Contact
  email VARCHAR(255),
  phone VARCHAR(20),
  website VARCHAR(255),
  
  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  country VARCHAR(2) DEFAULT 'US',
  
  -- Branding
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#7c3aed',
  
  -- Settings (JSON for flexibility)
  settings JSONB DEFAULT '{
    "timezone": "America/New_York",
    "currency": "USD",
    "date_format": "MM/DD/YYYY",
    "time_format": "12h"
  }'::jsonb,
  
  -- Subscription
  subscription_status VARCHAR(20) DEFAULT 'trial',
  subscription_plan VARCHAR(20) DEFAULT 'starter',
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_step INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BUSINESS USERS TABLE
-- Team members belonging to a business
-- ============================================
CREATE TABLE IF NOT EXISTS business_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Links
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role & Permissions
  role VARCHAR(20) NOT NULL DEFAULT 'staff',
  permissions JSONB DEFAULT '[]'::jsonb,
  
  -- Profile
  display_name VARCHAR(100),
  avatar_url TEXT,
  phone VARCHAR(20),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(business_id, user_id)
);

-- ============================================
-- INVITATIONS TABLE
-- Pending team member invites
-- ============================================
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Links
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  
  -- Invite Details
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'staff',
  
  -- Token (for accepting invite)
  token VARCHAR(100) NOT NULL UNIQUE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending',
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(business_id, email)
);

-- ============================================
-- USER PROFILES TABLE
-- Extended user profile data
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Name
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  
  -- Contact
  phone VARCHAR(20),
  
  -- Preferences
  preferences JSONB DEFAULT '{
    "email_notifications": true,
    "sms_notifications": true,
    "theme": "light"
  }'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
CREATE INDEX IF NOT EXISTS idx_business_users_business ON business_users(business_id);
CREATE INDEX IF NOT EXISTS idx_business_users_user ON business_users(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_business ON invitations(business_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Businesses: Users can see businesses they belong to
DROP POLICY IF EXISTS "Users can view their businesses" ON businesses;
CREATE POLICY "Users can view their businesses" ON businesses
  FOR SELECT USING (
    owner_id = auth.uid() OR
    id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())
  );

-- Businesses: Only owners can update their business
DROP POLICY IF EXISTS "Owners can update their business" ON businesses;
CREATE POLICY "Owners can update their business" ON businesses
  FOR UPDATE USING (owner_id = auth.uid());

-- Businesses: Users can insert (for signup)
DROP POLICY IF EXISTS "Users can create businesses" ON businesses;
CREATE POLICY "Users can create businesses" ON businesses
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Business Users: Users can see team members of their businesses
DROP POLICY IF EXISTS "Users can view team members" ON business_users;
CREATE POLICY "Users can view team members" ON business_users
  FOR SELECT USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

-- Business Users: Owners/Admins can manage team members
DROP POLICY IF EXISTS "Owners can manage team members" ON business_users;
CREATE POLICY "Owners can manage team members" ON business_users
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Invitations: Owners/Admins can manage invitations
DROP POLICY IF EXISTS "Owners can manage invitations" ON invitations;
CREATE POLICY "Owners can manage invitations" ON invitations
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- User Profiles: Users can manage their own profile
DROP POLICY IF EXISTS "Users can manage their profile" ON user_profiles;
CREATE POLICY "Users can manage their profile" ON user_profiles
  FOR ALL USING (id = auth.uid());

-- ============================================
-- FUNCTIONS
-- ============================================

-- Generate unique slug from business name
CREATE OR REPLACE FUNCTION generate_unique_slug(business_name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  base_slug := lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  base_slug := substring(base_slug from 1 for 50);
  
  final_slug := base_slug;
  
  WHILE EXISTS (SELECT 1 FROM businesses WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
DROP TRIGGER IF EXISTS update_businesses_updated_at ON businesses;
CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_business_users_updated_at ON business_users;
CREATE TRIGGER update_business_users_updated_at
  BEFORE UPDATE ON business_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
