-- ============================================
-- AUTONOMOUS AGENT ENGINE
-- Client assignments, dedup, scan queue, health overrides, channel routing
-- ============================================

-- Client → team member assignments with roles
CREATE TABLE IF NOT EXISTS client_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'account_manager' CHECK (role IN ('account_manager', 'secondary', 'executive_sponsor')),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, team_member_id)
);

-- Deduplication log (prevents double-sends)
CREATE TABLE IF NOT EXISTS agent_dedup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  dedup_key TEXT NOT NULL UNIQUE,
  dispatched_at TIMESTAMPTZ DEFAULT now(),
  channels_used TEXT[] DEFAULT '{}'
);

-- Queue-based scan tracking
CREATE TABLE IF NOT EXISTS agent_scan_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_type TEXT NOT NULL DEFAULT 'daily_scan',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  queued_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  results JSONB DEFAULT '{}'
);

-- Scheduled run log
CREATE TABLE IF NOT EXISTS agent_scheduled_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL,
  status TEXT DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  results JSONB DEFAULT '{}',
  notifications_sent INTEGER DEFAULT 0
);

-- Add columns to team_members for platform IDs
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS discord_user_id TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS notification_phone TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS notification_email TEXT;

-- Add columns to clients for health overrides + per-client channel routing
ALTER TABLE clients ADD COLUMN IF NOT EXISTS health_score_override INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS health_override_reason TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS health_override_expires_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS slack_channel_webhook TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS discord_channel_webhook TEXT;

-- Add slack_webhook_url to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_client_assignments_client ON client_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_assignments_member ON client_assignments(team_member_id);
CREATE INDEX IF NOT EXISTS idx_dedup_key ON agent_dedup_log(dedup_key);
CREATE INDEX IF NOT EXISTS idx_dedup_org_date ON agent_dedup_log(organization_id, dispatched_at);
CREATE INDEX IF NOT EXISTS idx_scan_queue_status ON agent_scan_queue(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_runs_org ON agent_scheduled_runs(organization_id, started_at DESC);

-- RLS
ALTER TABLE client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_dedup_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_scan_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_scheduled_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['client_assignments', 'agent_dedup_log', 'agent_scan_queue', 'agent_scheduled_runs']) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "org_access_%s" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "org_access_%s" ON %I FOR ALL USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))', tbl, tbl);
  END LOOP;
END $$;
