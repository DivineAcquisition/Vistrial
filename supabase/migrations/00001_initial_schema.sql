-- ============================================
-- VISTRIAL DATABASE SCHEMA
-- Version: 1.0.0
-- Description: Complete schema for home service reactivation platform
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE public.business_type AS ENUM (
  'cleaning_residential',
  'cleaning_commercial',
  'hvac',
  'plumbing',
  'electrical',
  'landscaping',
  'pest_control',
  'roofing',
  'painting',
  'handyman',
  'moving',
  'carpet_cleaning',
  'window_cleaning',
  'pressure_washing',
  'pool_service',
  'garage_door',
  'appliance_repair',
  'locksmith',
  'junk_removal',
  'other'
);

CREATE TYPE public.subscription_status AS ENUM (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete'
);

CREATE TYPE public.plan_tier AS ENUM (
  'starter',    -- $99/mo, up to 1K contacts
  'growth'      -- $199/mo, up to 5K contacts
);

CREATE TYPE public.contact_status AS ENUM (
  'active',
  'unsubscribed',
  'bounced',
  'invalid',
  'do_not_contact'
);

CREATE TYPE public.workflow_status AS ENUM (
  'draft',
  'active',
  'paused',
  'archived'
);

CREATE TYPE public.workflow_category AS ENUM (
  'reactivation',
  'retention',
  'seasonal',
  'review_request',
  'referral',
  'win_back'
);

CREATE TYPE public.enrollment_status AS ENUM (
  'pending',
  'active',
  'completed',
  'paused',
  'failed',
  'unsubscribed'
);

CREATE TYPE public.message_type AS ENUM (
  'sms',
  'email',
  'voice_drop'
);

CREATE TYPE public.message_status AS ENUM (
  'queued',
  'sent',
  'delivered',
  'failed',
  'bounced',
  'undelivered'
);

CREATE TYPE public.transaction_type AS ENUM (
  'subscription_payment',
  'credit_purchase',
  'credit_refill',
  'credit_adjustment',
  'refund'
);

-- ============================================
-- CORE TABLES
-- ============================================

-- Organizations (Tenants)
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  business_type public.business_type NOT NULL DEFAULT 'other',
  
  -- Contact info
  email VARCHAR(255),
  phone VARCHAR(20),
  website VARCHAR(255),
  
  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(2) DEFAULT 'US',
  
  -- Branding (for personalized messages)
  logo_url VARCHAR(500),
  primary_color VARCHAR(7) DEFAULT '#000000',
  
  -- Stripe
  stripe_customer_id VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  
  -- Subscription
  plan_tier public.plan_tier DEFAULT 'starter',
  subscription_status public.subscription_status DEFAULT 'incomplete',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  
  -- Limits based on plan
  contact_limit INTEGER NOT NULL DEFAULT 1000,
  
  -- Settings
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  settings JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Organization Members (Users belonging to orgs)
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  role VARCHAR(50) NOT NULL DEFAULT 'member', -- owner, admin, member
  
  -- Permissions (can be extended)
  permissions JSONB DEFAULT '{"contacts": true, "workflows": true, "billing": false, "settings": false}',
  
  -- Invitation tracking
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(organization_id, user_id)
);

-- User Profiles (extends Supabase auth.users)
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  avatar_url VARCHAR(500),
  phone VARCHAR(20),
  
  -- Default org (for users in multiple orgs)
  default_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  
  -- Preferences
  email_notifications BOOLEAN DEFAULT TRUE,
  sms_notifications BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- CREDITS & BILLING
-- ============================================

-- Credit Balances
CREATE TABLE public.credit_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Current balance in cents (e.g., 5000 = $50.00)
  balance_cents INTEGER NOT NULL DEFAULT 0,
  
  -- Auto-refill settings
  auto_refill_enabled BOOLEAN DEFAULT TRUE,
  refill_threshold_cents INTEGER NOT NULL DEFAULT 1500, -- $15.00 minimum
  refill_amount_cents INTEGER NOT NULL DEFAULT 5000,    -- User selected, minimum $15
  
  -- Lifetime stats
  total_purchased_cents INTEGER NOT NULL DEFAULT 0,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  
  -- Last refill tracking
  last_refill_at TIMESTAMPTZ,
  last_refill_amount_cents INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(organization_id),
  
  -- Ensure refill amount is at least $15
  CONSTRAINT min_refill_amount CHECK (refill_amount_cents >= 1500)
);

-- Transactions (all money movement)
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  type public.transaction_type NOT NULL,
  
  -- Amounts in cents
  amount_cents INTEGER NOT NULL,
  
  -- Stripe references
  stripe_payment_intent_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
  
  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- CONTACTS
-- ============================================

-- Contacts
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Identity
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20), -- E.164 format preferred
  
  -- Address (for service area matching)
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  
  -- Status
  status public.contact_status NOT NULL DEFAULT 'active',
  
  -- Source tracking
  source VARCHAR(100), -- csv_import, manual, api, thumbtack, angi, etc.
  source_id VARCHAR(255), -- External ID from source system
  
  -- Engagement tracking
  last_contacted_at TIMESTAMPTZ,
  last_response_at TIMESTAMPTZ,
  last_job_at TIMESTAMPTZ,
  total_jobs INTEGER DEFAULT 0,
  lifetime_value_cents INTEGER DEFAULT 0,
  
  -- Communication preferences
  sms_opted_in BOOLEAN DEFAULT TRUE,
  email_opted_in BOOLEAN DEFAULT TRUE,
  voice_opted_in BOOLEAN DEFAULT TRUE,
  opted_out_at TIMESTAMPTZ,
  
  -- Custom fields (flexible per-business data)
  custom_fields JSONB DEFAULT '{}',
  
  -- Tags for segmentation
  tags TEXT[] DEFAULT '{}',
  
  -- Notes
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Indexes for common queries
  CONSTRAINT valid_email CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Contact Import Jobs
CREATE TABLE public.contact_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- File info
  file_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(500),
  file_size_bytes INTEGER,
  
  -- Import stats
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  successful_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  duplicate_rows INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  error_message TEXT,
  
  -- Column mapping (how CSV columns map to contact fields)
  column_mapping JSONB NOT NULL DEFAULT '{}',
  
  -- Errors log
  errors JSONB DEFAULT '[]',
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- WORKFLOWS
-- ============================================

-- Workflow Templates (hardcoded but stored for flexibility)
CREATE TABLE public.workflow_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identity
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  
  -- Categorization
  category public.workflow_category NOT NULL,
  business_types public.business_type[] NOT NULL, -- Which business types can use this
  
  -- The actual workflow definition
  steps JSONB NOT NULL DEFAULT '[]',
  /*
    Steps structure:
    [
      {
        "id": "step_1",
        "type": "sms",
        "delay_days": 0,
        "delay_hours": 0,
        "template": "Hi {{first_name}}, this is {{business_name}}...",
        "conditions": {}
      },
      {
        "id": "step_2", 
        "type": "voice_drop",
        "delay_days": 2,
        "delay_hours": 0,
        "template": "voice_script_here",
        "voice_id": "elevenlabs_voice_id",
        "conditions": {"previous_step_no_response": true}
      }
    ]
  */
  
  -- Settings
  default_settings JSONB DEFAULT '{}',
  
  -- Stats
  times_used INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_premium BOOLEAN DEFAULT FALSE, -- For future upsell
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organization Workflows (instances of templates)
CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  
  -- Identity
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Category (copied from template for easier querying)
  category public.workflow_category NOT NULL,
  
  -- Status
  status public.workflow_status NOT NULL DEFAULT 'draft',
  
  -- Customized steps (overrides template if present)
  steps JSONB NOT NULL DEFAULT '[]',
  
  -- Settings
  settings JSONB DEFAULT '{}',
  /*
    Settings structure:
    {
      "send_window_start": "09:00",
      "send_window_end": "20:00",
      "send_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "respect_timezone": true,
      "stop_on_response": true,
      "stop_on_booking": true
    }
  */
  
  -- Enrollment criteria (which contacts to enroll)
  enrollment_criteria JSONB DEFAULT '{}',
  /*
    Criteria structure:
    {
      "status": ["active"],
      "tags_include": [],
      "tags_exclude": ["vip", "do_not_contact"],
      "last_contacted_before_days": 90,
      "last_job_before_days": 180
    }
  */
  
  -- Stats
  total_enrolled INTEGER DEFAULT 0,
  total_completed INTEGER DEFAULT 0,
  total_responses INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  
  -- Activation tracking
  activated_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Workflow Enrollments (contacts in workflows)
CREATE TABLE public.workflow_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Progress tracking
  status public.enrollment_status NOT NULL DEFAULT 'pending',
  current_step_index INTEGER NOT NULL DEFAULT 0,
  
  -- Timing
  next_action_at TIMESTAMPTZ,
  
  -- Outcomes
  responded_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  conversion_value_cents INTEGER,
  
  -- Exit tracking
  exit_reason VARCHAR(100), -- completed, unsubscribed, responded, converted, manual, error
  exited_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate enrollments
  UNIQUE(workflow_id, contact_id)
);

-- ============================================
-- MESSAGING
-- ============================================

-- Messages (all outbound communications)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Workflow context (optional - could be manual send)
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES public.workflow_enrollments(id) ON DELETE SET NULL,
  step_index INTEGER,
  
  -- Message details
  type public.message_type NOT NULL,
  status public.message_status NOT NULL DEFAULT 'queued',
  
  -- Content
  to_address VARCHAR(255) NOT NULL, -- Phone or email
  from_address VARCHAR(255),
  content TEXT NOT NULL,
  
  -- For voice drops
  audio_url VARCHAR(500),
  audio_duration_seconds INTEGER,
  
  -- Provider tracking
  provider VARCHAR(50), -- telnyx, elevenlabs
  provider_message_id VARCHAR(255),
  provider_status VARCHAR(100),
  provider_error TEXT,
  
  -- Cost tracking (in cents, e.g., 15 = $0.15)
  cost_cents INTEGER NOT NULL DEFAULT 0,
  
  -- Delivery tracking
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  -- Response tracking
  response_received_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Message Queue (for scheduled sends)
CREATE TABLE public.message_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- References
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.workflow_enrollments(id) ON DELETE CASCADE,
  step_index INTEGER,
  
  -- Message to send
  type public.message_type NOT NULL,
  to_address VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  audio_url VARCHAR(500),
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  
  -- Processing
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, canceled
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Result
  message_id UUID REFERENCES public.messages(id),
  processed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inbound Messages (responses from contacts)
CREATE TABLE public.inbound_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Message details
  type public.message_type NOT NULL,
  from_address VARCHAR(255) NOT NULL,
  to_address VARCHAR(255) NOT NULL,
  content TEXT,
  
  -- Provider info
  provider VARCHAR(50) NOT NULL,
  provider_message_id VARCHAR(255),
  
  -- Keyword detection
  detected_intent VARCHAR(100), -- stop, help, yes, no, interested, etc.
  
  -- Processing
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  
  -- Link to original outbound message if we can match it
  in_reply_to_message_id UUID REFERENCES public.messages(id),
  
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Organizations
CREATE INDEX idx_organizations_stripe_customer ON public.organizations(stripe_customer_id);
CREATE INDEX idx_organizations_subscription_status ON public.organizations(subscription_status);
CREATE INDEX idx_organizations_deleted_at ON public.organizations(deleted_at) WHERE deleted_at IS NULL;

-- Organization Members
CREATE INDEX idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org_id ON public.organization_members(organization_id);

-- Contacts
CREATE INDEX idx_contacts_org_id ON public.contacts(organization_id);
CREATE INDEX idx_contacts_status ON public.contacts(organization_id, status);
CREATE INDEX idx_contacts_phone ON public.contacts(phone);
CREATE INDEX idx_contacts_email ON public.contacts(email);
CREATE INDEX idx_contacts_last_contacted ON public.contacts(organization_id, last_contacted_at);
CREATE INDEX idx_contacts_tags ON public.contacts USING GIN(tags);
CREATE INDEX idx_contacts_deleted_at ON public.contacts(deleted_at) WHERE deleted_at IS NULL;

-- Workflows
CREATE INDEX idx_workflows_org_id ON public.workflows(organization_id);
CREATE INDEX idx_workflows_status ON public.workflows(organization_id, status);
CREATE INDEX idx_workflows_category ON public.workflows(organization_id, category);

-- Workflow Enrollments
CREATE INDEX idx_enrollments_workflow ON public.workflow_enrollments(workflow_id);
CREATE INDEX idx_enrollments_contact ON public.workflow_enrollments(contact_id);
CREATE INDEX idx_enrollments_status ON public.workflow_enrollments(status);
CREATE INDEX idx_enrollments_next_action ON public.workflow_enrollments(next_action_at) WHERE status = 'active';

-- Messages
CREATE INDEX idx_messages_org_id ON public.messages(organization_id);
CREATE INDEX idx_messages_contact ON public.messages(contact_id);
CREATE INDEX idx_messages_workflow ON public.messages(workflow_id);
CREATE INDEX idx_messages_status ON public.messages(status);
CREATE INDEX idx_messages_created ON public.messages(organization_id, created_at DESC);
CREATE INDEX idx_messages_provider_id ON public.messages(provider_message_id);

-- Message Queue
CREATE INDEX idx_queue_scheduled ON public.message_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_queue_org ON public.message_queue(organization_id);
CREATE INDEX idx_queue_status ON public.message_queue(status);

-- Inbound Messages
CREATE INDEX idx_inbound_org ON public.inbound_messages(organization_id);
CREATE INDEX idx_inbound_contact ON public.inbound_messages(contact_id);
CREATE INDEX idx_inbound_from ON public.inbound_messages(from_address);
CREATE INDEX idx_inbound_provider_id ON public.inbound_messages(provider_message_id);

-- Transactions
CREATE INDEX idx_transactions_org ON public.transactions(organization_id);
CREATE INDEX idx_transactions_type ON public.transactions(organization_id, type);
CREATE INDEX idx_transactions_stripe ON public.transactions(stripe_payment_intent_id);

-- Credit Balances
CREATE INDEX idx_credit_balances_org ON public.credit_balances(organization_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate organization slug from name
CREATE OR REPLACE FUNCTION public.generate_org_slug(name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Create base slug from name
  base_slug := LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := TRIM(BOTH '-' FROM base_slug);
  base_slug := SUBSTRING(base_slug, 1, 80);
  
  final_slug := base_slug;
  
  -- Check for uniqueness and append number if needed
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Deduct credits and return success/failure
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_organization_id UUID,
  p_amount_cents INTEGER,
  p_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  -- Get current balance with row lock
  SELECT balance_cents INTO current_balance
  FROM public.credit_balances
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  
  -- Check if sufficient balance
  IF current_balance IS NULL OR current_balance < p_amount_cents THEN
    RETURN FALSE;
  END IF;
  
  -- Deduct credits
  UPDATE public.credit_balances
  SET 
    balance_cents = balance_cents - p_amount_cents,
    total_spent_cents = total_spent_cents + p_amount_cents,
    updated_at = NOW()
  WHERE organization_id = p_organization_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add credits to organization
CREATE OR REPLACE FUNCTION public.add_credits(
  p_organization_id UUID,
  p_amount_cents INTEGER,
  p_is_purchase BOOLEAN DEFAULT TRUE
)
RETURNS INTEGER AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  UPDATE public.credit_balances
  SET 
    balance_cents = balance_cents + p_amount_cents,
    total_purchased_cents = CASE WHEN p_is_purchase THEN total_purchased_cents + p_amount_cents ELSE total_purchased_cents END,
    last_refill_at = CASE WHEN p_is_purchase THEN NOW() ELSE last_refill_at END,
    last_refill_amount_cents = CASE WHEN p_is_purchase THEN p_amount_cents ELSE last_refill_amount_cents END,
    updated_at = NOW()
  WHERE organization_id = p_organization_id
  RETURNING balance_cents INTO new_balance;
  
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

-- Get organization contact count
CREATE OR REPLACE FUNCTION public.get_contact_count(p_organization_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.contacts
    WHERE organization_id = p_organization_id
      AND deleted_at IS NULL
      AND status != 'invalid'
  );
END;
$$ LANGUAGE plpgsql;

-- Check if organization can add more contacts
CREATE OR REPLACE FUNCTION public.can_add_contacts(
  p_organization_id UUID,
  p_count INTEGER DEFAULT 1
)
RETURNS BOOLEAN AS $$
DECLARE
  current_count INTEGER;
  contact_limit INTEGER;
BEGIN
  SELECT 
    public.get_contact_count(p_organization_id),
    o.contact_limit
  INTO current_count, contact_limit
  FROM public.organizations o
  WHERE o.id = p_organization_id;
  
  RETURN (current_count + p_count) <= contact_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organization_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credit_balances_updated_at
  BEFORE UPDATE ON public.credit_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contact_imports_updated_at
  BEFORE UPDATE ON public.contact_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workflow_templates_updated_at
  BEFORE UPDATE ON public.workflow_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workflow_enrollments_updated_at
  BEFORE UPDATE ON public.workflow_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_message_queue_updated_at
  BEFORE UPDATE ON public.message_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create user profile on signup (with first/last name from metadata)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-create credit balance when organization is created
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.credit_balances (organization_id, balance_cents)
  VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_messages ENABLE ROW LEVEL SECURITY;

-- User Profiles: Users can only see/edit their own profile
CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Organization Members: Users can see orgs they belong to
CREATE POLICY "Users can view their org memberships"
  ON public.organization_members FOR SELECT
  USING (auth.uid() = user_id);

-- Organization Members: Users can insert their own membership
CREATE POLICY "Users can insert their own membership"
  ON public.organization_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Organizations: Users can see orgs they're members of
CREATE POLICY "Users can view their organizations"
  ON public.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Org owners can update organization"
  ON public.organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'owner'
    )
  );

-- Organizations: Authenticated users can create organizations
CREATE POLICY "Users can create organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Contacts: Users can manage contacts in their orgs
CREATE POLICY "Users can view org contacts"
  ON public.contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = contacts.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert org contacts"
  ON public.contacts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = contacts.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update org contacts"
  ON public.contacts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = contacts.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete org contacts"
  ON public.contacts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = contacts.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Similar policies for other tables...
-- Credit Balances
CREATE POLICY "Users can view org credit balance"
  ON public.credit_balances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = credit_balances.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Workflows
CREATE POLICY "Users can view org workflows"
  ON public.workflows FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = workflows.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage org workflows"
  ON public.workflows FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = workflows.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Workflow Templates (public read)
CREATE POLICY "Anyone can view active workflow templates"
  ON public.workflow_templates FOR SELECT
  USING (is_active = true);

-- Messages
CREATE POLICY "Users can view org messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = messages.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Transactions
CREATE POLICY "Users can view org transactions"
  ON public.transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = transactions.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Contact Imports
CREATE POLICY "Users can manage org imports"
  ON public.contact_imports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = contact_imports.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Workflow Enrollments
CREATE POLICY "Users can view org enrollments"
  ON public.workflow_enrollments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = workflow_enrollments.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Message Queue
CREATE POLICY "Users can view org message queue"
  ON public.message_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = message_queue.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Inbound Messages
CREATE POLICY "Users can view org inbound messages"
  ON public.inbound_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = inbound_messages.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );
