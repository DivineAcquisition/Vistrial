-- ============================================
-- A2P 10DLC MESSAGING REGISTRATIONS
-- Telnyx brand, campaign, and number management
-- ============================================

CREATE TABLE IF NOT EXISTS messaging_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Business info (from onboarding form)
  legal_business_name TEXT NOT NULL,
  ein TEXT NOT NULL,
  business_phone TEXT NOT NULL,
  business_email TEXT NOT NULL,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,

  -- Telnyx IDs (populated by API responses)
  telnyx_brand_id TEXT,
  telnyx_campaign_id TEXT,
  telnyx_phone_number TEXT,
  telnyx_messaging_profile_id TEXT,

  -- Status tracking
  brand_status TEXT NOT NULL DEFAULT 'pending',
  campaign_status TEXT NOT NULL DEFAULT 'not_started',
  number_status TEXT NOT NULL DEFAULT 'not_started',
  overall_status TEXT NOT NULL DEFAULT 'onboarding',

  -- Failure details
  failure_reason TEXT,

  -- Timestamps
  brand_submitted_at TIMESTAMPTZ,
  brand_verified_at TIMESTAMPTZ,
  campaign_submitted_at TIMESTAMPTZ,
  campaign_approved_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(org_id)
);

CREATE TABLE IF NOT EXISTS message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES workflow_enrollments(id) ON DELETE SET NULL,

  direction TEXT NOT NULL DEFAULT 'outbound',
  channel TEXT NOT NULL DEFAULT 'sms',
  from_number TEXT,
  to_number TEXT,
  body TEXT,

  telnyx_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,

  cost_cents INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_msg_reg_org ON messaging_registrations(org_id);
CREATE INDEX IF NOT EXISTS idx_msg_reg_status ON messaging_registrations(overall_status);
CREATE INDEX IF NOT EXISTS idx_msg_log_org ON message_log(org_id);
CREATE INDEX IF NOT EXISTS idx_msg_log_contact ON message_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_msg_log_status ON message_log(status);
CREATE INDEX IF NOT EXISTS idx_msg_log_telnyx ON message_log(telnyx_message_id);
CREATE INDEX IF NOT EXISTS idx_msg_log_created ON message_log(org_id, created_at DESC);

-- RLS
ALTER TABLE messaging_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own org messaging" ON messaging_registrations;
CREATE POLICY "Users can manage own org messaging" ON messaging_registrations FOR ALL
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own org messages" ON message_log;
CREATE POLICY "Users can view own org messages" ON message_log FOR SELECT
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

-- Auto-update timestamps
DROP TRIGGER IF EXISTS update_messaging_registrations_updated_at ON messaging_registrations;
CREATE TRIGGER update_messaging_registrations_updated_at
  BEFORE UPDATE ON messaging_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
