-- ============================================
-- BOOKING PAGES MIGRATION
-- Pricing matrices, booking pages, and requests
-- ============================================

CREATE TABLE IF NOT EXISTS pricing_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_type TEXT,
  services JSONB NOT NULL DEFAULT '[]',
  global_variables JSONB NOT NULL DEFAULT '[]',
  source_document JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pricing_matrix_id UUID REFERENCES pricing_matrices(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{}',
  customization JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  booking_page_id UUID REFERENCES booking_pages(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  customer_address TEXT,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  selected_options JSONB NOT NULL DEFAULT '{}',
  selected_add_ons JSONB NOT NULL DEFAULT '[]',
  estimated_price DECIMAL(10, 2),
  price_type TEXT NOT NULL DEFAULT 'estimate',
  final_price DECIMAL(10, 2),
  preferred_date DATE,
  preferred_time TEXT,
  flexibility TEXT DEFAULT 'flexible',
  customer_notes TEXT,
  internal_notes TEXT,
  source TEXT NOT NULL DEFAULT 'direct',
  campaign_id UUID,
  workflow_id UUID,
  utm_params JSONB,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pricing_matrices_org ON pricing_matrices(organization_id);
CREATE INDEX IF NOT EXISTS idx_booking_pages_org ON booking_pages(organization_id);
CREATE INDEX IF NOT EXISTS idx_booking_pages_slug ON booking_pages(slug);
CREATE INDEX IF NOT EXISTS idx_booking_requests_org ON booking_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_requests_contact ON booking_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_created ON booking_requests(created_at DESC);

-- RLS
ALTER TABLE pricing_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;

-- Pricing matrices
DROP POLICY IF EXISTS "Users can manage own org pricing matrices" ON pricing_matrices;
CREATE POLICY "Users can manage own org pricing matrices"
  ON pricing_matrices FOR ALL
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

-- Booking pages - org members
DROP POLICY IF EXISTS "Users can manage own org booking pages" ON booking_pages;
CREATE POLICY "Users can manage own org booking pages"
  ON booking_pages FOR ALL
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

-- Booking pages - public can view active
DROP POLICY IF EXISTS "Public can view active booking pages" ON booking_pages;
CREATE POLICY "Public can view active booking pages"
  ON booking_pages FOR SELECT
  USING (active = true);

-- Booking requests - org members
DROP POLICY IF EXISTS "Users can manage own org booking requests" ON booking_requests;
CREATE POLICY "Users can manage own org booking requests"
  ON booking_requests FOR ALL
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

-- Booking requests - public can create
DROP POLICY IF EXISTS "Public can create booking requests" ON booking_requests;
CREATE POLICY "Public can create booking requests"
  ON booking_requests FOR INSERT
  WITH CHECK (true);

-- ============================================
-- BOOKING REQUEST ACTIVITIES TABLE
-- Track activities and notes for booking requests
-- ============================================

CREATE TABLE IF NOT EXISTS booking_request_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_request_id UUID NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_activities_request ON booking_request_activities(booking_request_id);
CREATE INDEX IF NOT EXISTS idx_booking_activities_created ON booking_request_activities(created_at DESC);

ALTER TABLE booking_request_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org activities" ON booking_request_activities;
CREATE POLICY "Users can view own org activities"
  ON booking_request_activities FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create activities for own org" ON booking_request_activities;
CREATE POLICY "Users can create activities for own org"
  ON booking_request_activities FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
