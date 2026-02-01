-- ============================================
-- STRIPE + TWILIO FIELDS MIGRATION
-- ============================================

-- Add Stripe fields to businesses
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS google_review_link TEXT;

-- Add Twilio fields to businesses (for per-business Twilio accounts)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS twilio_auth_token TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS twilio_phone_number TEXT;

-- Add Stripe fields to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Add Stripe fields to memberships
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS frequency_days INTEGER;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS bedrooms INTEGER;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS bathrooms NUMERIC(3,1);
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS has_pets BOOLEAN DEFAULT false;

-- Add payment fields to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;

-- Messages table for SMS logging (if not exists)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
  
  direction VARCHAR(10) NOT NULL DEFAULT 'outbound', -- inbound, outbound
  channel VARCHAR(10) NOT NULL DEFAULT 'sms', -- sms, email
  body TEXT NOT NULL,
  
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, delivered, failed
  message_type VARCHAR(50), -- confirmation, reminder, quote_followup, payment_failed, review_request
  external_id TEXT, -- Twilio SID or other provider ID
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quote message templates
CREATE TABLE IF NOT EXISTS quote_message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  name VARCHAR(100) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL, -- quote_followup, booking_confirmation, etc
  trigger_day INTEGER, -- For follow-ups: day 1, 3, 5, 7
  body TEXT NOT NULL,
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_businesses_stripe ON businesses(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_stripe ON contacts(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_memberships_stripe ON memberships(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_messages_business ON messages(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_booking ON messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_quote_templates_business ON quote_message_templates(business_id);

-- RLS for messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their business messages" ON messages;
CREATE POLICY "Users can view their business messages" ON messages
  FOR SELECT USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert messages for their business" ON messages;
CREATE POLICY "Users can insert messages for their business" ON messages
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

-- RLS for quote_message_templates
ALTER TABLE quote_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their business templates" ON quote_message_templates;
CREATE POLICY "Users can manage their business templates" ON quote_message_templates
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );
