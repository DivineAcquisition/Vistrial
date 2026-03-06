-- ============================================
-- ADD MISSING TABLES AND COLUMNS
-- Found by scanning entire codebase against live schema
-- ============================================

-- 1. Add missing columns to businesses table
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS credit_balance INTEGER DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS monthly_credits INTEGER DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS auto_refill_enabled BOOLEAN DEFAULT false;

-- 2. Add missing column to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS default_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- 3. Create credit_transactions table (used by credits.service.ts)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  direction TEXT NOT NULL DEFAULT 'debit',
  type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_business ON credit_transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(business_id, type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created ON credit_transactions(business_id, created_at DESC);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own business credit transactions" ON credit_transactions;
CREATE POLICY "Users can view own business credit transactions" ON credit_transactions FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
    OR business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid()));

-- 4. Create credit_reservations table (used by credits.service.ts)
CREATE TABLE IF NOT EXISTS credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  actual_amount INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_business ON credit_reservations(business_id);
CREATE INDEX IF NOT EXISTS idx_credit_reservations_status ON credit_reservations(business_id, status);

ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own business credit reservations" ON credit_reservations;
CREATE POLICY "Users can manage own business credit reservations" ON credit_reservations FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
    OR business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid()));

-- 5. Create message_logs table (used by messaging.service.ts - note: plural, different from message_log)
CREATE TABLE IF NOT EXISTS message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'sms',
  direction TEXT NOT NULL DEFAULT 'outbound',
  content TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  external_id TEXT,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES workflow_enrollments(id) ON DELETE SET NULL,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_logs_business ON message_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_contact ON message_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_external ON message_logs(external_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_created ON message_logs(business_id, created_at DESC);

ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own business message logs" ON message_logs;
CREATE POLICY "Users can view own business message logs" ON message_logs FOR SELECT
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
    OR business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid()));

-- Auto-update timestamp for credit_reservations
DROP TRIGGER IF EXISTS update_credit_reservations_updated_at ON credit_reservations;
CREATE TRIGGER update_credit_reservations_updated_at BEFORE UPDATE ON credit_reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
