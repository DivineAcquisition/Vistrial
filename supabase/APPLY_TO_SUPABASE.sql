-- ============================================
-- VISTRIAL DATABASE SCHEMA
-- Run this in the Supabase SQL Editor
-- https://supabase.com/dashboard/project/trqvwgefpznsbbtkowro/sql/new
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUMS
-- ============================================

DO $$ BEGIN
  CREATE TYPE public.business_type AS ENUM (
    'cleaning_residential', 'cleaning_commercial', 'hvac', 'plumbing', 'electrical',
    'landscaping', 'pest_control', 'roofing', 'painting', 'handyman', 'moving',
    'carpet_cleaning', 'window_cleaning', 'pressure_washing', 'pool_service',
    'garage_door', 'appliance_repair', 'locksmith', 'junk_removal', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM (
    'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contact_status AS ENUM (
    'active', 'unsubscribed', 'bounced', 'invalid', 'do_not_contact'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_status AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_category AS ENUM (
    'reactivation', 'retention', 'seasonal', 'review_request', 'referral', 'win_back'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.enrollment_status AS ENUM (
    'pending', 'active', 'completed', 'paused', 'failed', 'unsubscribed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.message_type AS ENUM ('sms', 'email', 'voice_drop');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.message_status AS ENUM (
    'queued', 'sent', 'delivered', 'failed', 'bounced', 'undelivered'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.transaction_type AS ENUM (
    'subscription_payment', 'credit_purchase', 'credit_refill', 'credit_adjustment', 'refund'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- CORE TABLES
-- ============================================

-- Organizations (Tenants)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  business_type public.business_type NOT NULL DEFAULT 'other',
  email VARCHAR(255),
  phone VARCHAR(20),
  website VARCHAR(255),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(2) DEFAULT 'US',
  logo_url VARCHAR(500),
  primary_color VARCHAR(7) DEFAULT '#000000',
  stripe_customer_id VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  plan_tier public.plan_tier DEFAULT 'starter',
  subscription_status public.subscription_status DEFAULT 'incomplete',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  contact_limit INTEGER NOT NULL DEFAULT 1000,
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Organization Members
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  permissions JSONB DEFAULT '{"contacts": true, "workflows": true, "billing": false, "settings": false}',
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- User Profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  avatar_url VARCHAR(500),
  phone VARCHAR(20),
  default_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  email_notifications BOOLEAN DEFAULT TRUE,
  sms_notifications BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- CREDITS & BILLING
-- ============================================

CREATE TABLE IF NOT EXISTS public.credit_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  auto_refill_enabled BOOLEAN DEFAULT TRUE,
  refill_threshold_cents INTEGER NOT NULL DEFAULT 1500,
  refill_amount_cents INTEGER NOT NULL DEFAULT 5000,
  total_purchased_cents INTEGER NOT NULL DEFAULT 0,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  last_refill_at TIMESTAMPTZ,
  last_refill_amount_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id),
  CONSTRAINT min_refill_amount CHECK (refill_amount_cents >= 1500)
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  amount_cents INTEGER NOT NULL,
  stripe_payment_intent_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- CONTACTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  status public.contact_status NOT NULL DEFAULT 'active',
  source VARCHAR(100),
  source_id VARCHAR(255),
  last_contacted_at TIMESTAMPTZ,
  last_response_at TIMESTAMPTZ,
  last_job_at TIMESTAMPTZ,
  total_jobs INTEGER DEFAULT 0,
  lifetime_value_cents INTEGER DEFAULT 0,
  sms_opted_in BOOLEAN DEFAULT TRUE,
  email_opted_in BOOLEAN DEFAULT TRUE,
  voice_opted_in BOOLEAN DEFAULT TRUE,
  opted_out_at TIMESTAMPTZ,
  custom_fields JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.contact_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(500),
  file_size_bytes INTEGER,
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  successful_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  duplicate_rows INTEGER DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  column_mapping JSONB NOT NULL DEFAULT '{}',
  errors JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- WORKFLOWS
-- ============================================

CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  category public.workflow_category NOT NULL,
  business_types public.business_type[] NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  default_settings JSONB DEFAULT '{}',
  times_used INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  is_premium BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category public.workflow_category NOT NULL,
  status public.workflow_status NOT NULL DEFAULT 'draft',
  steps JSONB NOT NULL DEFAULT '[]',
  settings JSONB DEFAULT '{}',
  enrollment_criteria JSONB DEFAULT '{}',
  total_enrolled INTEGER DEFAULT 0,
  total_completed INTEGER DEFAULT 0,
  total_responses INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  activated_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.workflow_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status public.enrollment_status NOT NULL DEFAULT 'pending',
  current_step_index INTEGER NOT NULL DEFAULT 0,
  next_action_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  conversion_value_cents INTEGER,
  exit_reason VARCHAR(100),
  exited_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workflow_id, contact_id)
);

-- ============================================
-- MESSAGING
-- ============================================

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES public.workflow_enrollments(id) ON DELETE SET NULL,
  step_index INTEGER,
  type public.message_type NOT NULL,
  status public.message_status NOT NULL DEFAULT 'queued',
  to_address VARCHAR(255) NOT NULL,
  from_address VARCHAR(255),
  content TEXT NOT NULL,
  audio_url VARCHAR(500),
  audio_duration_seconds INTEGER,
  provider VARCHAR(50),
  provider_message_id VARCHAR(255),
  provider_status VARCHAR(100),
  provider_error TEXT,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  response_received_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.message_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.workflow_enrollments(id) ON DELETE CASCADE,
  step_index INTEGER,
  type public.message_type NOT NULL,
  to_address VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  audio_url VARCHAR(500),
  scheduled_for TIMESTAMPTZ NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  message_id UUID REFERENCES public.messages(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inbound_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  type public.message_type NOT NULL,
  from_address VARCHAR(255) NOT NULL,
  to_address VARCHAR(255) NOT NULL,
  content TEXT,
  provider VARCHAR(50) NOT NULL,
  provider_message_id VARCHAR(255),
  detected_intent VARCHAR(100),
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  in_reply_to_message_id UUID REFERENCES public.messages(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON public.organizations(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_organizations_subscription_status ON public.organizations(subscription_status);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON public.contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON public.contacts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contacted ON public.contacts(organization_id, last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON public.contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_workflows_org_id ON public.workflows(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON public.workflows(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_workflow ON public.workflow_enrollments(workflow_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_contact ON public.workflow_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.workflow_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_next_action ON public.workflow_enrollments(next_action_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_messages_org_id ON public.messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON public.messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_workflow ON public.messages(workflow_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON public.messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_provider_id ON public.messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_queue_scheduled ON public.message_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_queue_org ON public.message_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_inbound_org ON public.inbound_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_inbound_contact ON public.inbound_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_inbound_from ON public.inbound_messages(from_address);
CREATE INDEX IF NOT EXISTS idx_transactions_org ON public.transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_credit_balances_org ON public.credit_balances(organization_id);

-- ============================================
-- FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.generate_org_slug(name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  base_slug := LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := TRIM(BOTH '-' FROM base_slug);
  base_slug := SUBSTRING(base_slug, 1, 80);
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_organization_id UUID,
  p_amount_cents INTEGER,
  p_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  SELECT balance_cents INTO current_balance
  FROM public.credit_balances
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  
  IF current_balance IS NULL OR current_balance < p_amount_cents THEN
    RETURN FALSE;
  END IF;
  
  UPDATE public.credit_balances
  SET 
    balance_cents = balance_cents - p_amount_cents,
    total_spent_cents = total_spent_cents + p_amount_cents,
    updated_at = NOW()
  WHERE organization_id = p_organization_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

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

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_members_updated_at ON public.organization_members;
CREATE TRIGGER update_organization_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_balances_updated_at ON public.credit_balances;
CREATE TRIGGER update_credit_balances_updated_at
  BEFORE UPDATE ON public.credit_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON public.transactions;
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contact_imports_updated_at ON public.contact_imports;
CREATE TRIGGER update_contact_imports_updated_at
  BEFORE UPDATE ON public.contact_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_templates_updated_at ON public.workflow_templates;
CREATE TRIGGER update_workflow_templates_updated_at
  BEFORE UPDATE ON public.workflow_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflows_updated_at ON public.workflows;
CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_enrollments_updated_at ON public.workflow_enrollments;
CREATE TRIGGER update_workflow_enrollments_updated_at
  BEFORE UPDATE ON public.workflow_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_messages_updated_at ON public.messages;
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_message_queue_updated_at ON public.message_queue;
CREATE TRIGGER update_message_queue_updated_at
  BEFORE UPDATE ON public.message_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-create credit balance when organization is created
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.credit_balances (organization_id, balance_cents)
  VALUES (NEW.id, 0)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;
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

-- User Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Organization Members
DROP POLICY IF EXISTS "Users can view their org memberships" ON public.organization_members;
CREATE POLICY "Users can view their org memberships"
  ON public.organization_members FOR SELECT
  USING (auth.uid() = user_id);

-- Organizations
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
CREATE POLICY "Users can view their organizations"
  ON public.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org owners can update organization" ON public.organizations;
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

DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
CREATE POLICY "Users can create organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Contacts
DROP POLICY IF EXISTS "Users can view org contacts" ON public.contacts;
CREATE POLICY "Users can view org contacts"
  ON public.contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = contacts.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert org contacts" ON public.contacts;
CREATE POLICY "Users can insert org contacts"
  ON public.contacts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = contacts.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update org contacts" ON public.contacts;
CREATE POLICY "Users can update org contacts"
  ON public.contacts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = contacts.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete org contacts" ON public.contacts;
CREATE POLICY "Users can delete org contacts"
  ON public.contacts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = contacts.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Credit Balances
DROP POLICY IF EXISTS "Users can view org credit balance" ON public.credit_balances;
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
DROP POLICY IF EXISTS "Users can view org workflows" ON public.workflows;
CREATE POLICY "Users can view org workflows"
  ON public.workflows FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = workflows.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage org workflows" ON public.workflows;
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
DROP POLICY IF EXISTS "Anyone can view active workflow templates" ON public.workflow_templates;
CREATE POLICY "Anyone can view active workflow templates"
  ON public.workflow_templates FOR SELECT
  USING (is_active = true);

-- Messages
DROP POLICY IF EXISTS "Users can view org messages" ON public.messages;
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
DROP POLICY IF EXISTS "Users can view org transactions" ON public.transactions;
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
DROP POLICY IF EXISTS "Users can manage org imports" ON public.contact_imports;
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
DROP POLICY IF EXISTS "Users can view org enrollments" ON public.workflow_enrollments;
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
DROP POLICY IF EXISTS "Users can view org message queue" ON public.message_queue;
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
DROP POLICY IF EXISTS "Users can view org inbound messages" ON public.inbound_messages;
CREATE POLICY "Users can view org inbound messages"
  ON public.inbound_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = inbound_messages.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- ============================================
-- SEED WORKFLOW TEMPLATES
-- ============================================

INSERT INTO public.workflow_templates (name, slug, description, category, business_types, steps, is_active) VALUES

('Win Back - 90 Day Inactive',
'win-back-90-day',
'Re-engage customers who have not booked in 90+ days with a friendly check-in sequence',
'reactivation',
ARRAY['cleaning_residential', 'cleaning_commercial', 'hvac', 'plumbing', 'electrical', 'landscaping', 'pest_control', 'roofing', 'painting', 'handyman', 'carpet_cleaning', 'window_cleaning', 'pressure_washing', 'pool_service', 'appliance_repair', 'other']::public.business_type[],
'[
  {"id": "step_1", "type": "sms", "delay_days": 0, "delay_hours": 0, "template": "Hi {{first_name}}, it''s {{business_name}}! We noticed it''s been a while since your last service. Everything going okay? We''d love to help if you need us. Reply STOP to opt out."},
  {"id": "step_2", "type": "sms", "delay_days": 3, "delay_hours": 0, "template": "Hey {{first_name}}, just checking in from {{business_name}}. We have some openings this week if you need anything. Let us know!"},
  {"id": "step_3", "type": "voice_drop", "delay_days": 7, "delay_hours": 0, "template": "Hi {{first_name}}, this is {{business_name}} giving you a quick call. We miss having you as a customer and wanted to see if there''s anything we can help with. Give us a call back when you get a chance. Thanks!"}
]'::jsonb,
true),

('We Miss You - Special Offer',
'we-miss-you-offer',
'Win back inactive customers with a special discount offer',
'reactivation',
ARRAY['cleaning_residential', 'hvac', 'landscaping', 'pest_control', 'carpet_cleaning', 'window_cleaning', 'pressure_washing', 'pool_service']::public.business_type[],
'[
  {"id": "step_1", "type": "sms", "delay_days": 0, "delay_hours": 0, "template": "Hi {{first_name}}! {{business_name}} here. We miss you! As a thank you for being a past customer, we''d like to offer you 15% off your next service. Interested? Reply STOP to opt out."},
  {"id": "step_2", "type": "sms", "delay_days": 4, "delay_hours": 0, "template": "Hey {{first_name}}, just a reminder - your 15% off offer from {{business_name}} is still available. Would you like to schedule something this week?"},
  {"id": "step_3", "type": "sms", "delay_days": 10, "delay_hours": 0, "template": "Last chance {{first_name}}! Your 15% discount from {{business_name}} expires soon. Reply YES to book or let us know if you have any questions!"}
]'::jsonb,
true),

('Post-Service Review Request',
'post-service-review',
'Request reviews from customers after completing a service',
'review_request',
ARRAY['cleaning_residential', 'cleaning_commercial', 'hvac', 'plumbing', 'electrical', 'landscaping', 'pest_control', 'roofing', 'painting', 'handyman', 'carpet_cleaning', 'window_cleaning', 'pressure_washing', 'pool_service', 'appliance_repair', 'other']::public.business_type[],
'[
  {"id": "step_1", "type": "sms", "delay_days": 1, "delay_hours": 0, "template": "Hi {{first_name}}, thank you for choosing {{business_name}}! We hope you were happy with our service. If you have a moment, we''d really appreciate a quick review: {{review_link}} - Reply STOP to opt out."},
  {"id": "step_2", "type": "sms", "delay_days": 5, "delay_hours": 0, "template": "Hey {{first_name}}, this is {{business_name}}. If you enjoyed our service, a quick Google review would mean the world to us! {{review_link}} Thank you!"}
]'::jsonb,
true),

('Referral Request',
'referral-request',
'Ask satisfied customers for referrals',
'referral',
ARRAY['cleaning_residential', 'cleaning_commercial', 'hvac', 'plumbing', 'electrical', 'landscaping', 'pest_control', 'roofing', 'painting', 'handyman', 'carpet_cleaning', 'window_cleaning', 'pressure_washing', 'pool_service', 'appliance_repair', 'other']::public.business_type[],
'[
  {"id": "step_1", "type": "sms", "delay_days": 0, "delay_hours": 0, "template": "Hi {{first_name}}! {{business_name}} here. Know anyone who could use our services? We''d love to help your friends and family - and we''ll thank you with a $25 credit for each referral! Reply STOP to opt out."}
]'::jsonb,
true),

('Spring Cleaning Promo',
'spring-cleaning',
'Seasonal promotion for spring cleaning services',
'seasonal',
ARRAY['cleaning_residential', 'carpet_cleaning', 'window_cleaning', 'pressure_washing']::public.business_type[],
'[
  {"id": "step_1", "type": "sms", "delay_days": 0, "delay_hours": 0, "template": "Hi {{first_name}}! Spring is here! {{business_name}} is booking spring cleaning appointments now. Ready to refresh your space? Reply for availability! Reply STOP to opt out."},
  {"id": "step_2", "type": "sms", "delay_days": 5, "delay_hours": 0, "template": "Hey {{first_name}}, spring slots are filling up fast at {{business_name}}! Want us to save you a spot this month?"}
]'::jsonb,
true),

('HVAC Seasonal Tune-Up',
'hvac-seasonal-tuneup',
'Seasonal HVAC maintenance reminders',
'seasonal',
ARRAY['hvac']::public.business_type[],
'[
  {"id": "step_1", "type": "sms", "delay_days": 0, "delay_hours": 0, "template": "Hi {{first_name}}, {{business_name}} here! Time for your seasonal HVAC tune-up. Regular maintenance saves money and prevents breakdowns. Want to schedule? Reply STOP to opt out."},
  {"id": "step_2", "type": "sms", "delay_days": 4, "delay_hours": 0, "template": "Hey {{first_name}}, just following up on your HVAC tune-up. We have openings this week. Reply YES to book or call us at {{business_phone}}!"},
  {"id": "step_3", "type": "voice_drop", "delay_days": 8, "delay_hours": 0, "template": "Hi {{first_name}}, this is {{business_name}}. We wanted to remind you about scheduling your seasonal HVAC maintenance. It''s a great way to keep your system running efficiently and avoid unexpected repairs. Give us a call when you''re ready to schedule. Thanks!"}
]'::jsonb,
true)

ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- STORAGE BUCKET FOR AUDIO
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio',
  'audio',
  true,
  5242880,
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav']
)
ON CONFLICT (id) DO NOTHING;

-- Audio storage policies
DROP POLICY IF EXISTS "Public audio access" ON storage.objects;
CREATE POLICY "Public audio access"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio');

DROP POLICY IF EXISTS "Org members can upload audio" ON storage.objects;
CREATE POLICY "Org members can upload audio"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'audio' AND
  auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Org members can delete audio" ON storage.objects;
CREATE POLICY "Org members can delete audio"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'audio' AND
  auth.role() = 'authenticated'
);

-- ============================================
-- DONE! 
-- ============================================
-- Your Vistrial database is now set up.
-- Tables created: organizations, organization_members, user_profiles,
--                 credit_balances, transactions, contacts, contact_imports,
--                 workflow_templates, workflows, workflow_enrollments,
--                 messages, message_queue, inbound_messages
-- 
-- All RLS policies are enabled for security.
-- Workflow templates have been seeded.
