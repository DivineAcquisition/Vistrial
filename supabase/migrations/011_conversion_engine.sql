-- ============================================
-- CONVERSION ENGINE TABLES
-- Service types, recurring offers, sequence templates
-- ============================================

-- Service types offered by each organization
CREATE TABLE IF NOT EXISTS service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  min_price_cents INTEGER NOT NULL DEFAULT 12000,
  max_price_cents INTEGER NOT NULL DEFAULT 18000,
  avg_duration_minutes INTEGER DEFAULT 120,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

-- Conversion offers (recurring service packages)
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

-- Sequence templates (conversion message templates)
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

-- Add onboarding tracking columns to organizations (if not present)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS industry TEXT DEFAULT 'residential_cleaning';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_types_org ON service_types(org_id);
CREATE INDEX IF NOT EXISTS idx_conversion_offers_org ON conversion_offers(org_id);
CREATE INDEX IF NOT EXISTS idx_conversion_offers_service ON conversion_offers(service_type_id);
CREATE INDEX IF NOT EXISTS idx_sequence_templates_org ON sequence_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_sequence_templates_stage ON sequence_templates(org_id, stage);

-- RLS
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own org service types" ON service_types;
CREATE POLICY "Users can manage own org service types" ON service_types FOR ALL
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own org offers" ON conversion_offers;
CREATE POLICY "Users can manage own org offers" ON conversion_offers FOR ALL
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own org templates" ON sequence_templates;
CREATE POLICY "Users can manage own org templates" ON sequence_templates FOR ALL
  USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

-- Auto-update timestamps
DROP TRIGGER IF EXISTS update_service_types_updated_at ON service_types;
CREATE TRIGGER update_service_types_updated_at BEFORE UPDATE ON service_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversion_offers_updated_at ON conversion_offers;
CREATE TRIGGER update_conversion_offers_updated_at BEFORE UPDATE ON conversion_offers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sequence_templates_updated_at ON sequence_templates;
CREATE TRIGGER update_sequence_templates_updated_at BEFORE UPDATE ON sequence_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
