-- ============================================
-- FIX RLS INFINITE RECURSION
-- Run this in Supabase SQL Editor
-- ============================================

-- Drop all existing policies on businesses
DROP POLICY IF EXISTS "Users can view their businesses" ON businesses;
DROP POLICY IF EXISTS "Owners can update their business" ON businesses;
DROP POLICY IF EXISTS "Users can create businesses" ON businesses;
DROP POLICY IF EXISTS "Owners can update business" ON businesses;
DROP POLICY IF EXISTS "Service role has full access" ON businesses;

-- Create simple, non-recursive policies
-- SELECT: Users can see businesses they own
CREATE POLICY "businesses_select_own" ON businesses
  FOR SELECT USING (owner_id = auth.uid());

-- INSERT: Users can create businesses for themselves
CREATE POLICY "businesses_insert_own" ON businesses
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- UPDATE: Users can update their own businesses
CREATE POLICY "businesses_update_own" ON businesses
  FOR UPDATE USING (owner_id = auth.uid());

-- DELETE: Users can delete their own businesses
CREATE POLICY "businesses_delete_own" ON businesses
  FOR DELETE USING (owner_id = auth.uid());

-- ============================================
-- Also fix business_users policies if they exist
-- ============================================
DROP POLICY IF EXISTS "Users can view team members" ON business_users;
DROP POLICY IF EXISTS "Owners can manage team members" ON business_users;

-- Simple policy: users can see their own membership records
CREATE POLICY "business_users_select_own" ON business_users
  FOR SELECT USING (user_id = auth.uid());

-- Users can manage records for businesses they own
CREATE POLICY "business_users_manage_owned" ON business_users
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

-- ============================================
-- Fix user_profiles policies
-- ============================================
DROP POLICY IF EXISTS "Users can manage their profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Service role has full access to profiles" ON user_profiles;

CREATE POLICY "profiles_select_own" ON user_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_insert_own" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- ============================================
-- Fix invitations policies
-- ============================================
DROP POLICY IF EXISTS "Owners can manage invitations" ON invitations;

CREATE POLICY "invitations_manage" ON invitations
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

-- ============================================
-- Verify
-- ============================================
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('businesses', 'business_users', 'user_profiles', 'invitations')
ORDER BY tablename, policyname;
