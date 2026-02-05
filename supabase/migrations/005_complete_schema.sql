-- ============================================
-- VISTRIAL COMPLETE SCHEMA MIGRATION
-- Creates all missing tables for the application
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- ============================================
-- 1. PROFILES TABLE (for lead management system)
-- Extended user profiles for the leads/sequences feature
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255),
  business_name VARCHAR(200),
  business_phone VARCHAR(20),
  
  -- Twilio integration
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_phone_number VARCHAR(20),
  
  -- Settings
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  default_sequence_id UUID,
  
  -- Subscription
  plan VARCHAR(20) DEFAULT 'free', -- free, pro, growth
  leads_used_this_month INTEGER DEFAULT 0,
  leads_limit INTEGER DEFAULT 50,
  billing_cycle_start DATE DEFAULT CURRENT_DATE,
  
  -- Status
  onboarding_completed BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. JOB TYPES TABLE
-- Categories for leads/jobs
-- ============================================
CREATE TABLE IF NOT EXISTS job_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. SEQUENCES TABLE
-- SMS/Email automation sequences
-- ============================================
CREATE TABLE IF NOT EXISTS sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. SEQUENCE STEPS TABLE
-- Individual steps within a sequence
-- ============================================
CREATE TABLE IF NOT EXISTS sequence_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  step_order INTEGER NOT NULL,
  step_type VARCHAR(10) NOT NULL DEFAULT 'sms', -- sms, email, wait
  
  -- Timing
  delay_value INTEGER NOT NULL DEFAULT 1,
  delay_unit VARCHAR(10) NOT NULL DEFAULT 'days', -- minutes, hours, days
  
  -- Content
  message_template TEXT NOT NULL,
  
  -- Send window
  send_time_start TIME DEFAULT '09:00',
  send_time_end TIME DEFAULT '20:00',
  skip_weekends BOOLEAN DEFAULT true,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. SERVICE TYPES TABLE
-- Types of services offered by businesses
-- ============================================
CREATE TABLE IF NOT EXISTS service_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Pricing
  pricing_type VARCHAR(20) DEFAULT 'variable', -- flat, variable, sqft, hourly
  base_price NUMERIC(10,2),
  
  -- Variable pricing (by bedroom)
  price_1bed NUMERIC(10,2),
  price_2bed NUMERIC(10,2),
  price_3bed NUMERIC(10,2),
  price_4bed NUMERIC(10,2),
  price_5bed_plus NUMERIC(10,2),
  price_per_bathroom NUMERIC(10,2),
  
  -- Time estimates
  base_duration_minutes INTEGER DEFAULT 120,
  minutes_per_bedroom INTEGER DEFAULT 30,
  minutes_per_bathroom INTEGER DEFAULT 20,
  
  -- Display
  icon VARCHAR(50),
  color VARCHAR(7) DEFAULT '#7c3aed',
  display_order INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. CONTACTS TABLE
-- Customer/lead contact information
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Name
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  
  -- Contact info
  phone VARCHAR(20),
  email VARCHAR(255),
  
  -- Primary address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  country VARCHAR(2) DEFAULT 'US',
  
  -- Geocoding
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  
  -- Status & Lifecycle
  status VARCHAR(20) DEFAULT 'lead', -- lead, prospect, customer, member, inactive, archived
  lifecycle_stage VARCHAR(20) DEFAULT 'new', -- new, engaged, converted, loyal, at_risk, churned
  source VARCHAR(50), -- booking, quote, manual, import, referral, facebook, google, website
  source_details JSONB,
  
  -- Communication preferences
  email_opted_in BOOLEAN DEFAULT true,
  sms_opted_in BOOLEAN DEFAULT true,
  sms_opted_out_at TIMESTAMPTZ,
  email_opted_out_at TIMESTAMPTZ,
  preferred_contact_method VARCHAR(10) DEFAULT 'sms', -- sms, email, phone
  
  -- Customer portal
  portal_enabled BOOLEAN DEFAULT false,
  portal_token VARCHAR(100),
  portal_token_expires_at TIMESTAMPTZ,
  last_portal_login_at TIMESTAMPTZ,
  
  -- Engagement tracking
  last_booking_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  total_bookings INTEGER DEFAULT 0,
  total_spent NUMERIC(10,2) DEFAULT 0,
  average_booking_value NUMERIC(10,2) DEFAULT 0,
  
  -- Property details (default)
  property_type VARCHAR(20), -- house, apartment, condo, townhouse, office
  property_sqft INTEGER,
  default_bedrooms INTEGER,
  default_bathrooms INTEGER,
  has_pets BOOLEAN DEFAULT false,
  pet_details TEXT,
  parking_instructions TEXT,
  entry_instructions TEXT,
  special_instructions TEXT,
  
  -- Stripe
  stripe_customer_id TEXT,
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. LEADS TABLE
-- Lead/quote follow-up management
-- ============================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Contact info
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  address TEXT,
  
  -- Job details
  job_type_id UUID REFERENCES job_types(id) ON DELETE SET NULL,
  quote_amount NUMERIC(10,2),
  job_description TEXT,
  quote_date DATE DEFAULT CURRENT_DATE,
  
  -- Sequence tracking
  sequence_id UUID REFERENCES sequences(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'new', -- new, in_sequence, responded, booked, not_interested, no_response, paused, cancelled, opted_out
  current_step INTEGER DEFAULT 0,
  next_action_at TIMESTAMPTZ,
  
  -- Response tracking
  last_response_at TIMESTAMPTZ,
  last_response_text TEXT,
  response_sentiment VARCHAR(20), -- positive, neutral, negative
  
  -- Conversion
  booked_at TIMESTAMPTZ,
  booked_amount NUMERIC(10,2),
  lost_reason TEXT,
  
  -- Metadata
  source VARCHAR(50),
  notes TEXT,
  tags TEXT[],
  
  -- TCPA Compliance
  consent_method VARCHAR(20), -- verbal, written, online_form, text_reply
  consent_timestamp TIMESTAMPTZ,
  consent_ip VARCHAR(45),
  consent_language TEXT,
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. OPT OUTS TABLE
-- TCPA compliance - opt-out tracking
-- ============================================
CREATE TABLE IF NOT EXISTS opt_outs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  opted_out_at TIMESTAMPTZ DEFAULT NOW(),
  reason VARCHAR(20), -- STOP, UNSUBSCRIBE, CANCEL, END, QUIT, STOPALL, manual
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, phone)
);

-- ============================================
-- 9. QUOTES TABLE
-- Quote management for services
-- ============================================
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  service_type_id UUID REFERENCES service_types(id) ON DELETE SET NULL,
  
  -- Quote identification
  quote_number VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  
  -- Property info
  address_line1 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  sqft INTEGER,
  bedrooms INTEGER,
  bathrooms NUMERIC(3,1),
  property_type VARCHAR(20), -- house, apartment, condo, townhouse
  property_condition VARCHAR(20) DEFAULT 'average', -- clean, average, dirty, very_dirty
  has_pets BOOLEAN DEFAULT false,
  pet_details TEXT,
  
  -- Pricing
  pricing_method VARCHAR(20) DEFAULT 'variable', -- flat, sqft, variable, hourly
  base_price NUMERIC(10,2),
  adjustments JSONB DEFAULT '[]'::jsonb,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  discount_reason TEXT,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  
  -- Cost & Profit tracking
  estimated_hours NUMERIC(5,2),
  labor_cost NUMERIC(10,2),
  supply_cost NUMERIC(10,2),
  travel_cost NUMERIC(10,2),
  total_cost NUMERIC(10,2),
  profit_amount NUMERIC(10,2),
  profit_margin NUMERIC(5,2),
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft', -- draft, sent, viewed, accepted, declined, expired
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  -- Response
  decline_reason TEXT,
  customer_notes TEXT,
  
  -- Follow-up
  follow_up_enabled BOOLEAN DEFAULT true,
  follow_up_paused BOOLEAN DEFAULT false,
  next_follow_up_at TIMESTAMPTZ,
  follow_up_count INTEGER DEFAULT 0,
  
  -- Conversion
  converted_to_booking_id UUID,
  converted_at TIMESTAMPTZ,
  
  -- Internal
  internal_notes TEXT,
  access_token VARCHAR(100),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. QUOTE LINE ITEMS TABLE
-- Individual line items on quotes
-- ============================================
CREATE TABLE IF NOT EXISTS quote_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  
  -- Cost tracking
  estimated_minutes INTEGER,
  labor_cost NUMERIC(10,2),
  supply_cost NUMERIC(10,2),
  
  -- Options
  is_optional BOOLEAN DEFAULT false,
  is_selected BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 11. QUOTE FOLLOW-UPS TABLE
-- Scheduled follow-up messages for quotes
-- ============================================
CREATE TABLE IF NOT EXISTS quote_follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  
  channel VARCHAR(10) DEFAULT 'sms', -- sms, email, call
  template_key VARCHAR(50),
  message_body TEXT,
  
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed, skipped, cancelled
  failure_reason TEXT,
  
  -- Tracking
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  message_id UUID,
  day_number INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 12. MEMBERSHIPS TABLE
-- Recurring service memberships
-- ============================================
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  service_type_id UUID REFERENCES service_types(id) ON DELETE SET NULL,
  
  -- Membership details
  frequency VARCHAR(20) NOT NULL DEFAULT 'biweekly', -- weekly, biweekly, monthly
  frequency_days INTEGER, -- Custom frequency in days
  
  -- Pricing
  price_per_service NUMERIC(10,2) NOT NULL,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  
  -- Scheduling
  preferred_day_of_week INTEGER, -- 0=Sunday, 6=Saturday
  preferred_time TIME,
  next_service_date DATE,
  last_service_date DATE,
  
  -- Property (for this membership)
  address_line1 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  bedrooms INTEGER,
  bathrooms NUMERIC(3,1),
  has_pets BOOLEAN DEFAULT false,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active', -- active, paused, past_due, canceled
  paused_at TIMESTAMPTZ,
  paused_until DATE,
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  
  -- Stripe
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  
  -- Stats
  total_services INTEGER DEFAULT 0,
  total_revenue NUMERIC(10,2) DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 13. BOOKINGS TABLE
-- Individual service appointments
-- ============================================
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  service_type_id UUID REFERENCES service_types(id) ON DELETE SET NULL,
  membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  
  -- Scheduling
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 120,
  
  -- Property
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(50) NOT NULL,
  zip VARCHAR(20) NOT NULL,
  bedrooms INTEGER,
  bathrooms NUMERIC(3,1),
  sqft INTEGER,
  has_pets BOOLEAN DEFAULT false,
  pet_details TEXT,
  
  -- Access
  entry_instructions TEXT,
  parking_instructions TEXT,
  special_instructions TEXT,
  
  -- Pricing
  subtotal NUMERIC(10,2) DEFAULT 0,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  addon_total NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  
  -- Payment
  payment_status VARCHAR(20) DEFAULT 'pending', -- pending, deposit_paid, paid, failed, refunded
  deposit_amount NUMERIC(10,2),
  deposit_paid BOOLEAN DEFAULT false,
  deposit_paid_at TIMESTAMPTZ,
  
  -- Stripe
  stripe_payment_intent_id TEXT,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, in_progress, completed, canceled, no_show
  confirmed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  
  -- Notifications
  reminder_sent_at TIMESTAMPTZ,
  confirmation_sent_at TIMESTAMPTZ,
  review_requested_at TIMESTAMPTZ,
  
  -- Team assignment
  assigned_team_member_id UUID,
  
  -- Customer feedback
  rating INTEGER,
  review_text TEXT,
  
  -- Internal
  internal_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key for quotes.converted_to_booking_id after bookings exists
ALTER TABLE quotes 
  ADD CONSTRAINT fk_quotes_booking 
  FOREIGN KEY (converted_to_booking_id) 
  REFERENCES bookings(id) ON DELETE SET NULL;

-- ============================================
-- 14. MESSAGES TABLE
-- SMS/Email message log
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
  
  -- Message details
  direction VARCHAR(10) NOT NULL DEFAULT 'outbound', -- inbound, outbound
  channel VARCHAR(10) NOT NULL DEFAULT 'sms', -- sms, email
  
  -- Phone numbers (for SMS)
  to_phone VARCHAR(20),
  from_phone VARCHAR(20),
  
  -- Content
  subject TEXT, -- for email
  body TEXT NOT NULL,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, queued, sent, delivered, failed, received
  message_type VARCHAR(50), -- confirmation, reminder, quote_followup, payment_failed, review_request
  
  -- Sequence info (for leads)
  sequence_id UUID REFERENCES sequences(id) ON DELETE SET NULL,
  sequence_step INTEGER,
  scheduled_at TIMESTAMPTZ,
  
  -- External
  external_id TEXT, -- Twilio SID or other provider ID
  twilio_sid TEXT,
  twilio_status TEXT,
  
  -- Delivery
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  
  -- Cost
  segments INTEGER DEFAULT 1,
  cost NUMERIC(10,4),
  
  -- Error handling
  error_code TEXT,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 15. QUOTE MESSAGE TEMPLATES TABLE
-- Templates for quote-related messages
-- ============================================
CREATE TABLE IF NOT EXISTS quote_message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  name VARCHAR(100) NOT NULL,
  template_key VARCHAR(50) NOT NULL, -- quote_sent, quote_followup_1, etc
  
  trigger_type VARCHAR(50), -- quote_followup, booking_confirmation, etc
  trigger_day INTEGER, -- For follow-ups: day 1, 3, 5, 7
  
  channel VARCHAR(10) DEFAULT 'sms', -- sms, email
  subject TEXT, -- for email
  body TEXT NOT NULL,
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, template_key)
);

-- ============================================
-- 16. PRICING TEMPLATES TABLE
-- Reusable pricing configurations
-- ============================================
CREATE TABLE IF NOT EXISTS pricing_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  name VARCHAR(100) NOT NULL,
  description TEXT,
  service_type VARCHAR(50),
  pricing_method VARCHAR(20) DEFAULT 'variable', -- flat, sqft, variable, hourly
  
  -- Flat rate
  flat_price NUMERIC(10,2),
  
  -- Per sqft
  price_per_sqft NUMERIC(10,4),
  min_sqft INTEGER,
  max_sqft INTEGER,
  
  -- Variable (by bedroom)
  price_1bed NUMERIC(10,2),
  price_2bed NUMERIC(10,2),
  price_3bed NUMERIC(10,2),
  price_4bed NUMERIC(10,2),
  price_5bed_plus NUMERIC(10,2),
  price_per_bathroom NUMERIC(10,2),
  
  -- Time estimates
  base_hours NUMERIC(5,2),
  hours_per_bedroom NUMERIC(5,2),
  hours_per_bathroom NUMERIC(5,2),
  hours_per_1000_sqft NUMERIC(5,2),
  
  -- Cost defaults
  hourly_labor_cost NUMERIC(10,2),
  supply_cost_percent NUMERIC(5,2) DEFAULT 5,
  
  -- Adjustments
  condition_multipliers JSONB DEFAULT '{"clean": 1.0, "average": 1.0, "dirty": 1.25, "very_dirty": 1.5}'::jsonb,
  pet_fee NUMERIC(10,2) DEFAULT 15,
  
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 17. COST SETTINGS TABLE
-- Business cost configuration
-- ============================================
CREATE TABLE IF NOT EXISTS cost_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  
  -- Labor
  hourly_labor_rate NUMERIC(10,2) DEFAULT 25,
  cleaner_count_default INTEGER DEFAULT 1,
  
  -- Supplies
  supply_cost_per_job NUMERIC(10,2),
  supply_cost_percent NUMERIC(5,2) DEFAULT 5,
  
  -- Travel
  travel_cost_per_mile NUMERIC(10,4) DEFAULT 0.655,
  average_travel_miles NUMERIC(10,2) DEFAULT 10,
  flat_travel_fee NUMERIC(10,2),
  
  -- Overhead
  monthly_overhead NUMERIC(10,2),
  overhead_per_job NUMERIC(10,2),
  
  -- Targets
  target_profit_margin NUMERIC(5,2) DEFAULT 30,
  minimum_profit_margin NUMERIC(5,2) DEFAULT 15,
  minimum_job_price NUMERIC(10,2) DEFAULT 100,
  
  -- Productivity
  sqft_per_hour INTEGER DEFAULT 500,
  
  -- Warnings
  warn_below_margin BOOLEAN DEFAULT true,
  warn_margin_threshold NUMERIC(5,2) DEFAULT 20,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 18. BOOKING PAGE SETTINGS TABLE
-- Customization for booking page
-- ============================================
CREATE TABLE IF NOT EXISTS booking_page_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  
  -- Colors
  primary_color VARCHAR(7) DEFAULT '#7c3aed',
  secondary_color VARCHAR(7) DEFAULT '#4f46e5',
  accent_color VARCHAR(7) DEFAULT '#10b981',
  background_color VARCHAR(7) DEFAULT '#f8fafc',
  card_background_color VARCHAR(7) DEFAULT '#ffffff',
  text_color VARCHAR(7) DEFAULT '#1e293b',
  text_muted_color VARCHAR(7) DEFAULT '#64748b',
  
  -- Logo & Images
  logo_url TEXT,
  logo_position VARCHAR(10) DEFAULT 'left',
  logo_size VARCHAR(10) DEFAULT 'medium',
  hero_image_url TEXT,
  favicon_url TEXT,
  
  -- Typography
  font_family VARCHAR(100) DEFAULT 'Inter',
  heading_font_family VARCHAR(100),
  font_size_base VARCHAR(10) DEFAULT '16px',
  
  -- Button Styles
  button_style VARCHAR(10) DEFAULT 'rounded',
  button_size VARCHAR(10) DEFAULT 'large',
  
  -- Layout
  layout_style VARCHAR(20) DEFAULT 'card',
  progress_bar_style VARCHAR(10) DEFAULT 'steps',
  show_sidebar_summary BOOLEAN DEFAULT true,
  sidebar_position VARCHAR(10) DEFAULT 'right',
  max_width VARCHAR(10) DEFAULT '1200px',
  
  -- Header
  header_style VARCHAR(20) DEFAULT 'colored',
  show_business_name BOOLEAN DEFAULT true,
  show_business_phone BOOLEAN DEFAULT true,
  show_business_email BOOLEAN DEFAULT false,
  header_tagline TEXT,
  
  -- Footer
  show_footer BOOLEAN DEFAULT true,
  show_powered_by BOOLEAN DEFAULT true,
  footer_text TEXT,
  
  -- Step headlines (stored as JSON for flexibility)
  step_headlines JSONB DEFAULT '{
    "step1_headline": "Select a Service",
    "step1_subheadline": "Choose the type of cleaning you need",
    "step2_headline": "Property Details",
    "step2_subheadline": "Tell us about your home",
    "step3_headline": "Choose Date & Time",
    "step3_subheadline": "When would you like us to come?",
    "step4_headline": "Contact Information",
    "step4_subheadline": "Where should we come and how can we reach you?",
    "step5_headline": "Review & Book",
    "step5_subheadline": "Please confirm your booking details",
    "confirmation_headline": "You are All Set!",
    "confirmation_subheadline": "Your cleaning has been scheduled"
  }'::jsonb,
  
  -- Behavior
  show_zip_validation BOOLEAN DEFAULT true,
  show_property_step BOOLEAN DEFAULT true,
  show_frequency_selection BOOLEAN DEFAULT true,
  show_sqft_field BOOLEAN DEFAULT false,
  show_pets_field BOOLEAN DEFAULT true,
  show_property_type_field BOOLEAN DEFAULT false,
  show_special_instructions BOOLEAN DEFAULT true,
  require_email BOOLEAN DEFAULT true,
  require_address BOOLEAN DEFAULT true,
  default_bedrooms INTEGER DEFAULT 3,
  default_bathrooms INTEGER DEFAULT 2,
  default_frequency VARCHAR(20) DEFAULT 'biweekly',
  
  -- Scheduling
  min_lead_time_hours INTEGER DEFAULT 24,
  max_booking_days_ahead INTEGER DEFAULT 60,
  time_slot_interval_minutes INTEGER DEFAULT 60,
  show_estimated_duration BOOLEAN DEFAULT true,
  allow_same_day_booking BOOLEAN DEFAULT false,
  same_day_cutoff_hour INTEGER DEFAULT 12,
  
  -- Pricing Display
  show_prices_on_services BOOLEAN DEFAULT true,
  show_price_breakdown BOOLEAN DEFAULT true,
  show_price_during_flow BOOLEAN DEFAULT true,
  price_display_format VARCHAR(10) DEFAULT 'from',
  show_discount_badge BOOLEAN DEFAULT true,
  
  -- Payment
  deposit_percentage INTEGER DEFAULT 25,
  deposit_type VARCHAR(20) DEFAULT 'percentage',
  deposit_fixed_amount NUMERIC(10,2),
  show_deposit_explanation BOOLEAN DEFAULT true,
  accept_payment_at_booking BOOLEAN DEFAULT true,
  payment_methods TEXT[] DEFAULT ARRAY['card'],
  
  -- Membership/Frequency
  enable_recurring BOOLEAN DEFAULT true,
  default_to_recurring BOOLEAN DEFAULT false,
  recurring_discount_weekly INTEGER DEFAULT 15,
  recurring_discount_biweekly INTEGER DEFAULT 10,
  recurring_discount_monthly INTEGER DEFAULT 5,
  show_recurring_savings BOOLEAN DEFAULT true,
  
  -- Add-ons
  enable_addons BOOLEAN DEFAULT true,
  
  -- Custom Fields
  enable_custom_fields BOOLEAN DEFAULT false,
  
  -- Social Proof
  show_reviews BOOLEAN DEFAULT false,
  show_trust_badges BOOLEAN DEFAULT true,
  trust_badges TEXT[] DEFAULT ARRAY['satisfaction', 'insured', 'background_checked'],
  google_reviews_place_id TEXT,
  
  -- SEO & Analytics
  meta_title TEXT,
  meta_description TEXT,
  google_analytics_id TEXT,
  facebook_pixel_id TEXT,
  custom_head_code TEXT,
  
  -- Notifications
  send_confirmation_sms BOOLEAN DEFAULT true,
  send_confirmation_email BOOLEAN DEFAULT true,
  send_reminder_sms BOOLEAN DEFAULT true,
  reminder_hours_before INTEGER DEFAULT 24,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 19. SERVICE ADDONS TABLE
-- Optional add-on services
-- ============================================
CREATE TABLE IF NOT EXISTS service_addons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Pricing
  price_type VARCHAR(20) DEFAULT 'fixed', -- fixed, per_room, per_hour, percentage
  price NUMERIC(10,2) NOT NULL,
  
  -- Display
  icon VARCHAR(50),
  display_order INTEGER DEFAULT 0,
  
  -- Availability
  is_active BOOLEAN DEFAULT true,
  available_for_services UUID[], -- NULL = all services
  
  -- Behavior
  is_popular BOOLEAN DEFAULT false,
  max_quantity INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 20. CUSTOM BOOKING FIELDS TABLE
-- Custom form fields for booking
-- ============================================
CREATE TABLE IF NOT EXISTS custom_booking_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  field_key VARCHAR(50) NOT NULL,
  label VARCHAR(100) NOT NULL,
  placeholder TEXT,
  help_text TEXT,
  
  field_type VARCHAR(20) NOT NULL, -- text, textarea, select, checkbox, radio, number, date, file, phone, email
  options JSONB, -- for select, radio, checkbox
  
  -- Validation
  is_required BOOLEAN DEFAULT false,
  min_length INTEGER,
  max_length INTEGER,
  min_value NUMERIC,
  max_value NUMERIC,
  pattern TEXT, -- regex
  
  -- Display
  display_order INTEGER DEFAULT 0,
  show_on_step INTEGER DEFAULT 4, -- which step (1-5)
  width VARCHAR(10) DEFAULT 'full', -- full, half
  
  -- Conditional display
  show_condition JSONB,
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, field_key)
);

-- ============================================
-- 21. BOOKING ADDONS TABLE
-- Selected add-ons for a booking
-- ============================================
CREATE TABLE IF NOT EXISTS booking_addons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES service_addons(id) ON DELETE CASCADE,
  
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 22. BOOKING CUSTOM FIELD VALUES TABLE
-- Responses to custom fields
-- ============================================
CREATE TABLE IF NOT EXISTS booking_custom_field_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES custom_booking_fields(id) ON DELETE CASCADE,
  
  field_key VARCHAR(50) NOT NULL,
  value TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 23. BLACKOUT DATES TABLE
-- Days when booking is unavailable
-- ============================================
CREATE TABLE IF NOT EXISTS blackout_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  reason TEXT,
  
  all_day BOOLEAN DEFAULT true,
  start_time TIME,
  end_time TIME,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, date)
);

-- ============================================
-- 24. TIME SLOT OVERRIDES TABLE
-- Custom availability for specific dates
-- ============================================
CREATE TABLE IF NOT EXISTS time_slot_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  slots JSONB NOT NULL, -- Array of {time, available, capacity}
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, date)
);

-- ============================================
-- 25. BUSINESS AVAILABILITY TABLE
-- Default weekly availability
-- ============================================
CREATE TABLE IF NOT EXISTS business_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 6=Saturday
  is_available BOOLEAN DEFAULT true,
  start_time TIME DEFAULT '08:00',
  end_time TIME DEFAULT '18:00',
  
  -- Capacity
  capacity INTEGER DEFAULT 3,
  buffer_minutes INTEGER DEFAULT 30,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, day_of_week)
);

-- ============================================
-- 26. SERVICE AREAS TABLE
-- ZIP codes served by business
-- ============================================
CREATE TABLE IF NOT EXISTS service_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  zip_code VARCHAR(10) NOT NULL,
  city VARCHAR(100),
  state VARCHAR(50),
  
  -- Pricing adjustments
  travel_fee NUMERIC(10,2),
  min_price_override NUMERIC(10,2),
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, zip_code)
);

-- ============================================
-- 27. CUSTOMER TAGS TABLE
-- Tags for organizing customers
-- ============================================
CREATE TABLE IF NOT EXISTS customer_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) DEFAULT '#6366f1',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, name)
);

-- ============================================
-- 28. CONTACT TAGS TABLE
-- Many-to-many: contacts <-> tags
-- ============================================
CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES customer_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (contact_id, tag_id)
);

-- ============================================
-- 29. CUSTOMER NOTES TABLE
-- Notes on customers
-- ============================================
CREATE TABLE IF NOT EXISTS customer_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  
  note_type VARCHAR(20) DEFAULT 'general', -- general, call, email, issue, feedback, internal
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 30. CUSTOMER ACTIVITY TABLE
-- Activity log for customers
-- ============================================
CREATE TABLE IF NOT EXISTS customer_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  activity_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB,
  
  -- Related entities
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
  payment_id UUID,
  message_id UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 31. CUSTOMER ADDRESSES TABLE
-- Multiple addresses per customer
-- ============================================
CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  label VARCHAR(50), -- Home, Office, etc.
  is_default BOOLEAN DEFAULT false,
  
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(50) NOT NULL,
  zip VARCHAR(20) NOT NULL,
  country VARCHAR(2) DEFAULT 'US',
  
  -- Property details
  property_type VARCHAR(20),
  bedrooms INTEGER,
  bathrooms NUMERIC(3,1),
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
-- 32. PAYMENTS TABLE
-- Payment records
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
  
  -- Payment details
  amount NUMERIC(10,2) NOT NULL,
  payment_method VARCHAR(20), -- card, cash, check
  payment_type VARCHAR(20), -- deposit, full, refund
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed, refunded
  
  -- Stripe
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  
  -- Metadata
  description TEXT,
  notes TEXT,
  
  -- Timestamps
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Job Types
CREATE INDEX IF NOT EXISTS idx_job_types_user ON job_types(user_id);

-- Sequences
CREATE INDEX IF NOT EXISTS idx_sequences_user ON sequences(user_id);
CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence ON sequence_steps(sequence_id);

-- Service Types
CREATE INDEX IF NOT EXISTS idx_service_types_business ON service_types(business_id);

-- Contacts
CREATE INDEX IF NOT EXISTS idx_contacts_business ON contacts(business_id);
CREATE INDEX IF NOT EXISTS idx_contacts_business_status ON contacts(business_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_portal_token ON contacts(portal_token);
CREATE INDEX IF NOT EXISTS idx_contacts_stripe ON contacts(stripe_customer_id);

-- Leads
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_sequence ON leads(sequence_id);
CREATE INDEX IF NOT EXISTS idx_leads_next_action ON leads(next_action_at);

-- Opt Outs
CREATE INDEX IF NOT EXISTS idx_opt_outs_user_phone ON opt_outs(user_id, phone);

-- Quotes
CREATE INDEX IF NOT EXISTS idx_quotes_business ON quotes(business_id);
CREATE INDEX IF NOT EXISTS idx_quotes_contact ON quotes(contact_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_access_token ON quotes(access_token);
CREATE INDEX IF NOT EXISTS idx_quotes_follow_up ON quotes(next_follow_up_at) WHERE follow_up_enabled = true AND follow_up_paused = false;

-- Quote Line Items
CREATE INDEX IF NOT EXISTS idx_quote_line_items_quote ON quote_line_items(quote_id);

-- Quote Follow-ups
CREATE INDEX IF NOT EXISTS idx_quote_follow_ups_quote ON quote_follow_ups(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_follow_ups_scheduled ON quote_follow_ups(scheduled_for) WHERE status = 'pending';

-- Memberships
CREATE INDEX IF NOT EXISTS idx_memberships_business ON memberships(business_id);
CREATE INDEX IF NOT EXISTS idx_memberships_contact ON memberships(contact_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);
CREATE INDEX IF NOT EXISTS idx_memberships_next_service ON memberships(next_service_date);
CREATE INDEX IF NOT EXISTS idx_memberships_stripe ON memberships(stripe_subscription_id);

-- Bookings
CREATE INDEX IF NOT EXISTS idx_bookings_business ON bookings(business_id);
CREATE INDEX IF NOT EXISTS idx_bookings_contact ON bookings(contact_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_membership ON bookings(membership_id);
CREATE INDEX IF NOT EXISTS idx_bookings_stripe ON bookings(stripe_payment_intent_id);

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_business ON messages(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_booking ON messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_messages_quote ON messages(quote_id);
CREATE INDEX IF NOT EXISTS idx_messages_external ON messages(external_id);

-- Quote Templates
CREATE INDEX IF NOT EXISTS idx_quote_templates_business ON quote_message_templates(business_id);

-- Pricing Templates
CREATE INDEX IF NOT EXISTS idx_pricing_templates_business ON pricing_templates(business_id);

-- Customer Management
CREATE INDEX IF NOT EXISTS idx_customer_notes_contact ON customer_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_customer_activity_contact ON customer_activity(contact_id);
CREATE INDEX IF NOT EXISTS idx_customer_activity_type ON customer_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_contact ON customer_addresses(contact_id);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_business ON payments(business_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_membership ON payments(membership_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE opt_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_page_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_booking_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE blackout_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slot_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - User-owned tables
-- ============================================

-- Profiles
CREATE POLICY "Users can manage own profile" ON profiles
  FOR ALL USING (id = auth.uid());

-- Job Types
CREATE POLICY "Users can manage own job types" ON job_types
  FOR ALL USING (user_id = auth.uid());

-- Sequences
CREATE POLICY "Users can manage own sequences" ON sequences
  FOR ALL USING (user_id = auth.uid());

-- Sequence Steps
CREATE POLICY "Users can manage own sequence steps" ON sequence_steps
  FOR ALL USING (user_id = auth.uid());

-- Leads
CREATE POLICY "Users can manage own leads" ON leads
  FOR ALL USING (user_id = auth.uid());

-- Opt Outs
CREATE POLICY "Users can manage own opt outs" ON opt_outs
  FOR ALL USING (user_id = auth.uid());

-- ============================================
-- RLS POLICIES - Business-owned tables
-- ============================================

-- Helper function to check business access
CREATE OR REPLACE FUNCTION user_has_business_access(p_business_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM businesses WHERE id = p_business_id AND owner_id = auth.uid()
    UNION
    SELECT 1 FROM business_users WHERE business_id = p_business_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Service Types
CREATE POLICY "Users can manage their business service types" ON service_types
  FOR ALL USING (user_has_business_access(business_id));

-- Contacts
CREATE POLICY "Users can manage their business contacts" ON contacts
  FOR ALL USING (user_has_business_access(business_id));

-- Quotes
CREATE POLICY "Users can manage their business quotes" ON quotes
  FOR ALL USING (user_has_business_access(business_id));

-- Quote Line Items (through quotes)
CREATE POLICY "Users can manage quote line items" ON quote_line_items
  FOR ALL USING (
    quote_id IN (SELECT id FROM quotes WHERE user_has_business_access(business_id))
  );

-- Quote Follow-ups (through quotes)
CREATE POLICY "Users can manage quote follow-ups" ON quote_follow_ups
  FOR ALL USING (
    quote_id IN (SELECT id FROM quotes WHERE user_has_business_access(business_id))
  );

-- Memberships
CREATE POLICY "Users can manage their business memberships" ON memberships
  FOR ALL USING (user_has_business_access(business_id));

-- Bookings
CREATE POLICY "Users can manage their business bookings" ON bookings
  FOR ALL USING (user_has_business_access(business_id));

-- Messages
CREATE POLICY "Users can manage their business messages" ON messages
  FOR ALL USING (user_has_business_access(business_id));

-- Quote Message Templates
CREATE POLICY "Users can manage their business quote templates" ON quote_message_templates
  FOR ALL USING (user_has_business_access(business_id));

-- Pricing Templates
CREATE POLICY "Users can manage their business pricing templates" ON pricing_templates
  FOR ALL USING (user_has_business_access(business_id));

-- Cost Settings
CREATE POLICY "Users can manage their business cost settings" ON cost_settings
  FOR ALL USING (user_has_business_access(business_id));

-- Booking Page Settings
CREATE POLICY "Users can manage their business booking settings" ON booking_page_settings
  FOR ALL USING (user_has_business_access(business_id));

-- Service Addons
CREATE POLICY "Users can manage their business service addons" ON service_addons
  FOR ALL USING (user_has_business_access(business_id));

-- Custom Booking Fields
CREATE POLICY "Users can manage their business custom fields" ON custom_booking_fields
  FOR ALL USING (user_has_business_access(business_id));

-- Booking Addons (through bookings)
CREATE POLICY "Users can manage booking addons" ON booking_addons
  FOR ALL USING (
    booking_id IN (SELECT id FROM bookings WHERE user_has_business_access(business_id))
  );

-- Booking Custom Field Values (through bookings)
CREATE POLICY "Users can manage booking field values" ON booking_custom_field_values
  FOR ALL USING (
    booking_id IN (SELECT id FROM bookings WHERE user_has_business_access(business_id))
  );

-- Blackout Dates
CREATE POLICY "Users can manage their business blackout dates" ON blackout_dates
  FOR ALL USING (user_has_business_access(business_id));

-- Time Slot Overrides
CREATE POLICY "Users can manage their business time overrides" ON time_slot_overrides
  FOR ALL USING (user_has_business_access(business_id));

-- Business Availability
CREATE POLICY "Users can manage their business availability" ON business_availability
  FOR ALL USING (user_has_business_access(business_id));

-- Service Areas
CREATE POLICY "Users can manage their business service areas" ON service_areas
  FOR ALL USING (user_has_business_access(business_id));

-- Customer Tags
CREATE POLICY "Users can manage their business tags" ON customer_tags
  FOR ALL USING (user_has_business_access(business_id));

-- Contact Tags (through contacts)
CREATE POLICY "Users can manage contact tags" ON contact_tags
  FOR ALL USING (
    contact_id IN (SELECT id FROM contacts WHERE user_has_business_access(business_id))
  );

-- Customer Notes
CREATE POLICY "Users can manage customer notes" ON customer_notes
  FOR ALL USING (user_has_business_access(business_id));

-- Customer Activity
CREATE POLICY "Users can view customer activity" ON customer_activity
  FOR SELECT USING (user_has_business_access(business_id));

CREATE POLICY "Users can insert customer activity" ON customer_activity
  FOR INSERT WITH CHECK (user_has_business_access(business_id));

-- Customer Addresses (through contacts)
CREATE POLICY "Users can manage customer addresses" ON customer_addresses
  FOR ALL USING (
    contact_id IN (SELECT id FROM contacts WHERE user_has_business_access(business_id))
  );

-- Payments
CREATE POLICY "Users can manage their business payments" ON payments
  FOR ALL USING (user_has_business_access(business_id));

-- ============================================
-- PUBLIC ACCESS POLICIES (for booking page, quote viewing)
-- ============================================

-- Public can view service types for booking
CREATE POLICY "Public can view active service types" ON service_types
  FOR SELECT USING (is_active = true);

-- Public can view service addons for booking
CREATE POLICY "Public can view active service addons" ON service_addons
  FOR SELECT USING (is_active = true);

-- Public can view booking page settings
CREATE POLICY "Public can view booking page settings" ON booking_page_settings
  FOR SELECT USING (true);

-- Public can view business availability
CREATE POLICY "Public can view business availability" ON business_availability
  FOR SELECT USING (true);

-- Public can view service areas
CREATE POLICY "Public can view active service areas" ON service_areas
  FOR SELECT USING (is_active = true);

-- Public can view blackout dates
CREATE POLICY "Public can view blackout dates" ON blackout_dates
  FOR SELECT USING (true);

-- Public can view time slot overrides
CREATE POLICY "Public can view time slot overrides" ON time_slot_overrides
  FOR SELECT USING (true);

-- Public can insert contacts (for booking)
CREATE POLICY "Public can create contacts" ON contacts
  FOR INSERT WITH CHECK (true);

-- Public can insert bookings (for booking)
CREATE POLICY "Public can create bookings" ON bookings
  FOR INSERT WITH CHECK (true);

-- Public can view quotes by access token
CREATE POLICY "Public can view quotes with token" ON quotes
  FOR SELECT USING (access_token IS NOT NULL);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sequences_updated_at BEFORE UPDATE ON sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_types_updated_at BEFORE UPDATE ON service_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quote_templates_updated_at BEFORE UPDATE ON quote_message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pricing_templates_updated_at BEFORE UPDATE ON pricing_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cost_settings_updated_at BEFORE UPDATE ON cost_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_booking_settings_updated_at BEFORE UPDATE ON booking_page_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_addons_updated_at BEFORE UPDATE ON service_addons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_custom_fields_updated_at BEFORE UPDATE ON custom_booking_fields FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_availability_updated_at BEFORE UPDATE ON business_availability FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customer_notes_updated_at BEFORE UPDATE ON customer_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customer_addresses_updated_at BEFORE UPDATE ON customer_addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Generate quote number
CREATE OR REPLACE FUNCTION generate_quote_number(p_business_id UUID)
RETURNS TEXT AS $$
DECLARE
  quote_count INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO quote_count FROM quotes WHERE business_id = p_business_id;
  RETURN 'Q-' || LPAD(quote_count::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Log customer activity helper
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
  
  UPDATE contacts SET last_contact_at = NOW() WHERE id = p_contact_id;
  
  RETURN activity_id;
END;
$$ LANGUAGE plpgsql;

-- Update contact stats trigger
CREATE OR REPLACE FUNCTION update_contact_stats()
RETURNS TRIGGER AS $$
BEGIN
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

CREATE TRIGGER trigger_update_contact_stats
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_contact_stats();

-- Seed default tags for new business
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

-- Seed default availability for new business
CREATE OR REPLACE FUNCTION seed_default_availability(p_business_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO business_availability (business_id, day_of_week, is_available, start_time, end_time) VALUES
    (p_business_id, 0, false, '08:00', '18:00'), -- Sunday
    (p_business_id, 1, true, '08:00', '18:00'),  -- Monday
    (p_business_id, 2, true, '08:00', '18:00'),  -- Tuesday
    (p_business_id, 3, true, '08:00', '18:00'),  -- Wednesday
    (p_business_id, 4, true, '08:00', '18:00'),  -- Thursday
    (p_business_id, 5, true, '08:00', '18:00'),  -- Friday
    (p_business_id, 6, false, '08:00', '18:00')  -- Saturday
  ON CONFLICT (business_id, day_of_week) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DONE!
-- ============================================
