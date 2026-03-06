-- ============================================
-- CONVERSION ENGINE + A2P 10DLC TABLES
-- Adds all tables needed for the one-time to
-- recurring conversion engine and Telnyx A2P messaging
-- ============================================

-- 1. Add missing columns to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS industry TEXT DEFAULT 'residential_cleaning';

-- 2. Add conversion-engine columns to existing service_types
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS min_price_cents INTEGER DEFAULT 12000;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS max_price_cents INTEGER DEFAULT 18000;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS avg_duration_minutes INTEGER DEFAULT 120;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add unique constraint for org-level service types (if both org_id and slug are populated)
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_types_org_slug ON service_types(org_id, slug) WHERE org_id IS NOT NULL AND slug IS NOT NULL;

-- 3. Conversion offers (recurring service packages presented to one-time clients)
CREATE TABLE IF NOT EXISTS conversion_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_type_id UUID REFERENCES service_types(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  trigger_service_slug TEXT,
  frequency TEXT NOT NULL DEFAULT 'biweekly',
  price_per_visit_cents INTEGER NOT NULL DEFAULT 13900,
  discount_percent INTEGER DEFAULT 15,
  discount_duration_months INTEGER DEFAULT 3,
  priority_scheduling BOOLEAN DEFAULT true,
  bonus_description TEXT,
  sms_preview TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversion_offers_org ON conversion_offers(org_id);
CREATE INDEX IF NOT EXISTS idx_conversion_offers_service ON conversion_offers(service_type_id);

-- 4. Sequence templates (conversion message templates per stage)
CREATE TABLE IF NOT EXISTS sequence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  step_index INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'sms',
  delay_hours INTEGER DEFAULT 0,
  delay_days INTEGER DEFAULT 0,
  subject TEXT,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sequence_templates_org ON sequence_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_sequence_templates_stage ON sequence_templates(org_id, stage);

-- 5. Messaging registrations (Telnyx A2P 10DLC brand/campaign/number tracking)
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

CREATE INDEX IF NOT EXISTS idx_msg_reg_org ON messaging_registrations(org_id);
CREATE INDEX IF NOT EXISTS idx_msg_reg_status ON messaging_registrations(overall_status);

-- 6. Message log (tracks every SMS sent/received through the platform)
CREATE TABLE IF NOT EXISTS message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES workflow_enrollments(id) ON DELETE SET NULL,
  pipeline_entry_id UUID,

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

CREATE INDEX IF NOT EXISTS idx_msg_log_org ON message_log(org_id);
CREATE INDEX IF NOT EXISTS idx_msg_log_contact ON message_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_msg_log_status ON message_log(status);
CREATE INDEX IF NOT EXISTS idx_msg_log_telnyx ON message_log(telnyx_message_id);
CREATE INDEX IF NOT EXISTS idx_msg_log_created ON message_log(org_id, created_at DESC);

-- 7. Conversion pipeline (tracks each one-time client through conversion stages)
CREATE TABLE IF NOT EXISTS conversion_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  service_type_id UUID REFERENCES service_types(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES conversion_offers(id) ON DELETE SET NULL,

  -- Job that triggered the pipeline entry
  source TEXT DEFAULT 'manual',
  source_job_id TEXT,
  job_completed_at TIMESTAMPTZ,
  job_service_name TEXT,
  job_price_cents INTEGER,

  -- Pipeline stage tracking
  current_stage TEXT NOT NULL DEFAULT 'post_service_glow',
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Sequence progress
  sequence_active BOOLEAN DEFAULT true,
  current_step_index INTEGER DEFAULT 0,
  next_message_at TIMESTAMPTZ,
  messages_sent INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,

  -- Client responses
  client_responded BOOLEAN DEFAULT false,
  last_response_at TIMESTAMPTZ,
  last_response_text TEXT,
  response_sentiment TEXT,

  -- Satisfaction check
  satisfaction_checked BOOLEAN DEFAULT false,
  satisfaction_score INTEGER,
  satisfaction_response TEXT,

  -- Conversion outcome
  status TEXT NOT NULL DEFAULT 'active',
  converted BOOLEAN DEFAULT false,
  converted_at TIMESTAMPTZ,
  conversion_offer_id UUID REFERENCES conversion_offers(id),
  conversion_frequency TEXT,
  conversion_price_cents INTEGER,
  lost_reason TEXT,

  -- Opt-out tracking
  opted_out BOOLEAN DEFAULT false,
  opted_out_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_org ON conversion_pipeline(org_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_contact ON conversion_pipeline(contact_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stage ON conversion_pipeline(org_id, current_stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_status ON conversion_pipeline(org_id, status);
CREATE INDEX IF NOT EXISTS idx_pipeline_next_msg ON conversion_pipeline(next_message_at) WHERE sequence_active = true AND status = 'active';

-- FK from message_log to conversion_pipeline
ALTER TABLE message_log ADD CONSTRAINT fk_message_log_pipeline
  FOREIGN KEY (pipeline_entry_id) REFERENCES conversion_pipeline(id) ON DELETE SET NULL;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE conversion_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_pipeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own org offers" ON conversion_offers;
CREATE POLICY "Users can manage own org offers" ON conversion_offers FOR ALL
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own org templates" ON sequence_templates;
CREATE POLICY "Users can manage own org templates" ON sequence_templates FOR ALL
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own org messaging" ON messaging_registrations;
CREATE POLICY "Users can manage own org messaging" ON messaging_registrations FOR ALL
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own org messages" ON message_log;
CREATE POLICY "Users can view own org messages" ON message_log FOR SELECT
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own org pipeline" ON conversion_pipeline;
CREATE POLICY "Users can manage own org pipeline" ON conversion_pipeline FOR ALL
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversion_offers_updated_at ON conversion_offers;
CREATE TRIGGER update_conversion_offers_updated_at BEFORE UPDATE ON conversion_offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sequence_templates_updated_at ON sequence_templates;
CREATE TRIGGER update_sequence_templates_updated_at BEFORE UPDATE ON sequence_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_messaging_registrations_updated_at ON messaging_registrations;
CREATE TRIGGER update_messaging_registrations_updated_at BEFORE UPDATE ON messaging_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversion_pipeline_updated_at ON conversion_pipeline;
CREATE TRIGGER update_conversion_pipeline_updated_at BEFORE UPDATE ON conversion_pipeline
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
