-- ============================================
-- SETTINGS TABLES & COLUMNS
-- ============================================

-- Users table - add profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "push": true}';

-- Organizations table - add business fields
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'US';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS business_description TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS service_area TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS founded_year INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS employee_count TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{"booking_email": true, "booking_sms": true, "response_email": true, "response_sms": false, "weekly_digest": true, "usage_alerts": true}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS messaging_settings JSONB DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS booking_settings JSONB DEFAULT '{}';

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
