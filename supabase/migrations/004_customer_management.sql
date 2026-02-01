-- ============================================
-- ENHANCED CONTACTS (CUSTOMERS) TABLE
-- ============================================

-- Add new columns to contacts if not present
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'lead';
-- lead, prospect, customer, member, inactive, archived

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(20) DEFAULT 'new';
-- new, engaged, converted, loyal, at_risk, churned

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source VARCHAR(50);
-- booking, quote, manual, import, referral, facebook, google, website

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_details JSONB;
-- Additional source info (campaign, referrer, etc.)

-- Communication preferences
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_opted_in BOOLEAN DEFAULT true;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sms_opted_in BOOLEAN DEFAULT true;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sms_opted_out_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_opted_out_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_contact_method VARCHAR(10) DEFAULT 'sms';
-- sms, email, phone

-- Customer portal
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS portal_token VARCHAR(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS portal_token_expires_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_portal_login_at TIMESTAMPTZ;

-- Engagement tracking
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_booking_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_bookings INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_spent NUMERIC(10,2) DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS average_booking_value NUMERIC(10,2) DEFAULT 0;

-- Property details (for cleaning)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS property_type VARCHAR(20);
-- house, apartment, condo, townhouse, office, other

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS property_sqft INTEGER;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS default_bedrooms INTEGER;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS default_bathrooms INTEGER;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS has_pets BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pet_details TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS parking_instructions TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS entry_instructions TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS special_instructions TEXT;

-- Additional addresses
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country VARCHAR(2) DEFAULT 'US';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

-- Timestamps
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- CUSTOMER TAGS
-- ============================================

CREATE TABLE IF NOT EXISTS customer_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) DEFAULT '#6366f1',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, name)
);

CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES customer_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (contact_id, tag_id)
);

-- ============================================
-- CUSTOMER NOTES
-- ============================================

CREATE TABLE IF NOT EXISTS customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  
  note_type VARCHAR(20) DEFAULT 'general',
  -- general, call, email, issue, feedback, internal
  
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CUSTOMER ACTIVITY LOG
-- ============================================

CREATE TABLE IF NOT EXISTS customer_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  activity_type VARCHAR(50) NOT NULL,
  -- booking_created, booking_completed, booking_canceled
  -- quote_sent, quote_accepted, quote_expired
  -- membership_started, membership_paused, membership_canceled
  -- payment_received, payment_failed, refund_issued
  -- message_sent, message_received
  -- portal_login, portal_action
  -- note_added, tag_added, status_changed
  
  title VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB,
  
  -- Related entities
  booking_id UUID REFERENCES bookings(id),
  quote_id UUID REFERENCES quotes(id),
  membership_id UUID REFERENCES memberships(id),
  payment_id UUID,
  message_id UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CUSTOMER ADDRESSES (Multiple per customer)
-- ============================================

CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  label VARCHAR(50), -- Home, Office, Vacation Home, etc.
  is_default BOOLEAN DEFAULT false,
  
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(50) NOT NULL,
  zip VARCHAR(20) NOT NULL,
  country VARCHAR(2) DEFAULT 'US',
  
  -- Property details for this address
  property_type VARCHAR(20),
  bedrooms INTEGER,
  bathrooms INTEGER,
  sqft INTEGER,
  has_pets BOOLEAN DEFAULT false,
  pet_details TEXT,
  
  -- Access
  entry_instructions TEXT,
  parking_instructions TEXT,
  gate_code VARCHAR(20),
  
  -- Geocoding
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_contacts_business_status ON contacts(business_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_portal_token ON contacts(portal_token);
CREATE INDEX IF NOT EXISTS idx_customer_notes_contact ON customer_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_customer_activity_contact ON customer_activity(contact_id);
CREATE INDEX IF NOT EXISTS idx_customer_activity_type ON customer_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_contact ON customer_addresses(contact_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Update contact stats after booking changes
CREATE OR REPLACE FUNCTION update_contact_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update stats for the contact
  UPDATE contacts SET
    total_bookings = (
      SELECT COUNT(*) FROM bookings 
      WHERE contact_id = COALESCE(NEW.contact_id, OLD.contact_id)
      AND status IN ('completed', 'confirmed')
    ),
    total_spent = (
      SELECT COALESCE(SUM(total), 0) FROM bookings 
      WHERE contact_id = COALESCE(NEW.contact_id, OLD.contact_id)
      AND status = 'completed'
    ),
    last_booking_at = (
      SELECT MAX(scheduled_date) FROM bookings 
      WHERE contact_id = COALESCE(NEW.contact_id, OLD.contact_id)
      AND status IN ('completed', 'confirmed')
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.contact_id, OLD.contact_id);
  
  -- Calculate average
  UPDATE contacts SET
    average_booking_value = CASE 
      WHEN total_bookings > 0 THEN total_spent / total_bookings 
      ELSE 0 
    END
  WHERE id = COALESCE(NEW.contact_id, OLD.contact_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for booking changes
DROP TRIGGER IF EXISTS trigger_update_contact_stats ON bookings;
CREATE TRIGGER trigger_update_contact_stats
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_contact_stats();

-- Auto-update lifecycle stage
CREATE OR REPLACE FUNCTION update_lifecycle_stage()
RETURNS TRIGGER AS $$
BEGIN
  -- Update lifecycle based on activity
  UPDATE contacts SET
    lifecycle_stage = CASE
      WHEN total_bookings = 0 THEN 'new'
      WHEN total_bookings = 1 THEN 'engaged'
      WHEN total_bookings >= 2 AND total_bookings < 5 THEN 'converted'
      WHEN total_bookings >= 5 THEN 'loyal'
      ELSE lifecycle_stage
    END,
    status = CASE
      WHEN total_bookings > 0 AND status = 'lead' THEN 'customer'
      ELSE status
    END
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_lifecycle ON contacts;
CREATE TRIGGER trigger_update_lifecycle
  AFTER UPDATE OF total_bookings ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_lifecycle_stage();

-- Log customer activity
CREATE OR REPLACE FUNCTION log_customer_activity(
  p_contact_id UUID,
  p_business_id UUID,
  p_activity_type VARCHAR(50),
  p_title VARCHAR(255),
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_booking_id UUID DEFAULT NULL,
  p_quote_id UUID DEFAULT NULL,
  p_membership_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  activity_id UUID;
BEGIN
  INSERT INTO customer_activity (
    contact_id, business_id, activity_type, title, description,
    metadata, booking_id, quote_id, membership_id
  ) VALUES (
    p_contact_id, p_business_id, p_activity_type, p_title, p_description,
    p_metadata, p_booking_id, p_quote_id, p_membership_id
  ) RETURNING id INTO activity_id;
  
  -- Update last contact timestamp
  UPDATE contacts SET last_contact_at = NOW() WHERE id = p_contact_id;
  
  RETURN activity_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

-- Tags policies
DROP POLICY IF EXISTS "Users can manage their business tags" ON customer_tags;
CREATE POLICY "Users can manage their business tags" ON customer_tags
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage contact tags" ON contact_tags;
CREATE POLICY "Users can manage contact tags" ON contact_tags
  FOR ALL USING (
    contact_id IN (
      SELECT id FROM contacts WHERE business_id IN (
        SELECT id FROM businesses WHERE owner_id = auth.uid()
        UNION
        SELECT business_id FROM business_users WHERE user_id = auth.uid()
      )
    )
  );

-- Notes policies
DROP POLICY IF EXISTS "Users can manage customer notes" ON customer_notes;
CREATE POLICY "Users can manage customer notes" ON customer_notes
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

-- Activity policies
DROP POLICY IF EXISTS "Users can view customer activity" ON customer_activity;
CREATE POLICY "Users can view customer activity" ON customer_activity
  FOR SELECT USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

-- Allow insert for activity logging
DROP POLICY IF EXISTS "Users can insert customer activity" ON customer_activity;
CREATE POLICY "Users can insert customer activity" ON customer_activity
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

-- Addresses policies
DROP POLICY IF EXISTS "Users can manage customer addresses" ON customer_addresses;
CREATE POLICY "Users can manage customer addresses" ON customer_addresses
  FOR ALL USING (
    contact_id IN (
      SELECT id FROM contacts WHERE business_id IN (
        SELECT id FROM businesses WHERE owner_id = auth.uid()
        UNION
        SELECT business_id FROM business_users WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================
-- SEED DEFAULT TAGS FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION seed_default_tags(p_business_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO customer_tags (business_id, name, color, description) VALUES
    (p_business_id, 'VIP', '#eab308', 'High-value customers'),
    (p_business_id, 'New Customer', '#22c55e', 'First-time customers'),
    (p_business_id, 'Recurring', '#3b82f6', 'Has active membership'),
    (p_business_id, 'At Risk', '#ef4444', 'May churn soon'),
    (p_business_id, 'Referral Source', '#8b5cf6', 'Refers other customers'),
    (p_business_id, 'Special Instructions', '#f97316', 'Has specific requirements'),
    (p_business_id, 'Pet Owner', '#ec4899', 'Has pets at property')
  ON CONFLICT (business_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
