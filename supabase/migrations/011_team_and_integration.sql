-- ============================================
-- TEAM MANAGEMENT & INTEGRATION TABLES
-- ============================================

-- Update organization_members table
ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invited_by UUID,
ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_org_members_email ON organization_members(organization_id, email);

-- Team invitations table
CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_org ON team_invitations(organization_id);

ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Daily metrics table for analytics
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  metric TEXT NOT NULL,
  value DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, date, metric)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_org_date ON daily_metrics(organization_id, date);

ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;

-- Function to upsert daily metrics
CREATE OR REPLACE FUNCTION upsert_daily_metric(
  p_organization_id UUID,
  p_date DATE,
  p_metric TEXT,
  p_value DECIMAL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO daily_metrics (organization_id, date, metric, value)
  VALUES (p_organization_id, p_date, p_metric, p_value)
  ON CONFLICT (organization_id, date, metric)
  DO UPDATE SET
    value = daily_metrics.value + EXCLUDED.value,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Add tracking columns to contacts
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS lifetime_value DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_response TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS booking_count INTEGER DEFAULT 0;

-- Add tracking columns to messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS workflow_id UUID,
ADD COLUMN IF NOT EXISTS enrollment_id UUID,
ADD COLUMN IF NOT EXISTS is_overage BOOLEAN DEFAULT FALSE;

-- Add tracking columns to workflow_enrollments
ALTER TABLE workflow_enrollments
ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stopped_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stop_reason TEXT;
