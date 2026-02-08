-- ============================================
-- BILLING TABLES MIGRATION
-- Adds subscription, billing, and usage tracking
-- ============================================

-- Add billing columns to organizations
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
ADD COLUMN IF NOT EXISTS subscription_interval TEXT,
ADD COLUMN IF NOT EXISTS subscription_current_period_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

-- Add SEO column to booking_pages
ALTER TABLE booking_pages
ADD COLUMN IF NOT EXISTS seo JSONB DEFAULT '{}';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_org_stripe_customer ON organizations(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_org_stripe_subscription ON organizations(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_org_subscription_status ON organizations(subscription_status);

-- Billing events table for audit trail
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT,
  amount DECIMAL(10, 2),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_org ON billing_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_events_created ON billing_events(created_at DESC);

-- RLS for billing_events
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own org billing events'
    AND tablename = 'billing_events'
  ) THEN
    CREATE POLICY "Users can view own org billing events"
      ON billing_events FOR SELECT
      USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

-- Usage tracking table for detailed reporting
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  usage_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_org ON usage_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_period ON usage_records(organization_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_usage_type ON usage_records(usage_type);

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own org usage'
    AND tablename = 'usage_records'
  ) THEN
    CREATE POLICY "Users can view own org usage"
      ON usage_records FOR SELECT
      USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      ));
  END IF;
END $$;
