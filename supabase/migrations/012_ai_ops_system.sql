-- ============================================
-- AI OPS SYSTEM — Complete Data Layer
-- Clients, Projects, Interactions, Invoices,
-- Team Members, Milestones, Health Scoring,
-- Agent Drafts, Actions Log, Priorities,
-- Retention Cases, Organization Audits
-- ============================================

-- ============================================
-- TEAM MEMBERS
-- ============================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  full_name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'csm',
  status TEXT DEFAULT 'active',
  client_capacity INTEGER DEFAULT 15,
  slack_user_id TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  preferred_tone TEXT DEFAULT 'direct',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- CLIENTS (Service Business Clients)
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  industry TEXT,
  client_type TEXT DEFAULT 'retainer',
  status TEXT DEFAULT 'onboarding',
  assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL,
  start_date DATE,
  contract_end_date DATE,
  monthly_value DECIMAL(10,2),
  health_score INTEGER DEFAULT 50 CHECK (health_score BETWEEN 0 AND 100),
  health_trend TEXT DEFAULT 'stable',
  health_last_updated TIMESTAMPTZ,
  warning_level TEXT DEFAULT 'none',
  communication_preference TEXT DEFAULT 'email',
  communication_style TEXT DEFAULT 'direct',
  check_in_cadence TEXT DEFAULT 'bi_weekly',
  next_check_in_date DATE,
  onboarding_complete BOOLEAN DEFAULT false,
  onboarding_completion_date DATE,
  renewal_status TEXT DEFAULT 'not_yet',
  nps_score INTEGER,
  referrals_given INTEGER DEFAULT 0,
  testimonial_status TEXT DEFAULT 'not_asked',
  churn_reason TEXT,
  churn_date DATE,
  win_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- CLIENT CONTACTS
-- ============================================
CREATE TABLE IF NOT EXISTS client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'point_of_contact',
  is_primary BOOLEAN DEFAULT false,
  communication_preference TEXT DEFAULT 'email',
  timezone TEXT,
  last_contacted TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- PROJECTS / DELIVERABLES
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL,
  project_name TEXT NOT NULL,
  status TEXT DEFAULT 'not_started',
  priority TEXT DEFAULT 'medium',
  deliverable_type TEXT,
  start_date DATE,
  due_date DATE,
  completed_date DATE,
  description TEXT,
  completion_notes TEXT,
  client_notified BOOLEAN DEFAULT false,
  client_feedback TEXT,
  feedback_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INTERACTIONS (every client touchpoint)
-- ============================================
CREATE TABLE IF NOT EXISTS interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES client_contacts(id),
  team_member_id UUID REFERENCES team_members(id),
  interaction_date TIMESTAMPTZ DEFAULT now(),
  type TEXT NOT NULL,
  direction TEXT,
  channel TEXT,
  subject TEXT,
  summary TEXT,
  sentiment TEXT,
  sentiment_confidence INTEGER,
  sentiment_key_phrases TEXT[],
  duration_minutes INTEGER,
  outcome TEXT,
  next_action TEXT,
  next_action_date DATE,
  was_automated BOOLEAN DEFAULT false,
  agent_draft_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INVOICES
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  invoice_number TEXT,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'draft',
  issue_date DATE,
  due_date DATE,
  paid_date DATE,
  payment_method TEXT,
  notes TEXT,
  reminder_sent BOOLEAN DEFAULT false,
  reminder_date DATE,
  stripe_invoice_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- MILESTONES
-- ============================================
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL,
  date_achieved DATE DEFAULT CURRENT_DATE,
  revenue_impact DECIMAL(10,2),
  team_member_id UUID REFERENCES team_members(id),
  celebrated BOOLEAN DEFAULT false,
  celebrated_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- HEALTH SCORE HISTORY
-- ============================================
CREATE TABLE IF NOT EXISTS health_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  score_date DATE DEFAULT CURRENT_DATE,
  interaction_recency_score INTEGER,
  sentiment_score INTEGER,
  deliverable_health_score INTEGER,
  billing_status_score INTEGER,
  contract_timeline_score INTEGER,
  engagement_signal_score INTEGER,
  composite_score INTEGER,
  warning_level TEXT,
  trend TEXT,
  factors JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- AGENT DRAFTS
-- ============================================
CREATE TABLE IF NOT EXISTS agent_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id),
  draft_type TEXT NOT NULL,
  channel TEXT DEFAULT 'email',
  subject TEXT,
  body TEXT NOT NULL,
  context JSONB,
  permission_tier INTEGER DEFAULT 2,
  status TEXT DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  dismiss_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- AGENT ACTIONS LOG
-- ============================================
CREATE TABLE IF NOT EXISTS agent_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  action_type TEXT NOT NULL,
  action_detail TEXT,
  permission_tier INTEGER,
  was_overridden BOOLEAN DEFAULT false,
  override_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- DAILY PRIORITIES
-- ============================================
CREATE TABLE IF NOT EXISTS daily_priorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id),
  priority_date DATE DEFAULT CURRENT_DATE,
  priorities JSONB NOT NULL,
  estimated_hours DECIMAL(4,1),
  auto_actions_count INTEGER DEFAULT 0,
  delivered_via TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- RETENTION CASES
-- ============================================
CREATE TABLE IF NOT EXISTS retention_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'open',
  initial_health INTEGER,
  lowest_health INTEGER,
  current_health INTEGER,
  trigger_reason TEXT,
  interventions JSONB DEFAULT '[]',
  outcome TEXT,
  days_to_resolution INTEGER,
  revenue_at_risk DECIMAL(10,2),
  revenue_saved DECIMAL(10,2),
  opened_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ORGANIZATION AUDITS
-- ============================================
CREATE TABLE IF NOT EXISTS organization_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_date TIMESTAMPTZ DEFAULT now(),
  data_centralization_score INTEGER CHECK (data_centralization_score BETWEEN 1 AND 10),
  data_centralization_notes TEXT,
  fulfillment_consistency_score INTEGER CHECK (fulfillment_consistency_score BETWEEN 1 AND 10),
  fulfillment_consistency_notes TEXT,
  client_visibility_score INTEGER CHECK (client_visibility_score BETWEEN 1 AND 10),
  client_visibility_notes TEXT,
  team_capacity_score INTEGER CHECK (team_capacity_score BETWEEN 1 AND 10),
  team_capacity_notes TEXT,
  onboarding_structure_score INTEGER CHECK (onboarding_structure_score BETWEEN 1 AND 10),
  onboarding_structure_notes TEXT,
  retention_infrastructure_score INTEGER CHECK (retention_infrastructure_score BETWEEN 1 AND 10),
  retention_infrastructure_notes TEXT,
  renewal_tracking_score INTEGER CHECK (renewal_tracking_score BETWEEN 1 AND 10),
  renewal_tracking_notes TEXT,
  reporting_score INTEGER CHECK (reporting_score BETWEEN 1 AND 10),
  reporting_notes TEXT,
  priority_fixes JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_clients_org ON clients(org_id);
CREATE INDEX IF NOT EXISTS idx_clients_health ON clients(org_id, health_score);
CREATE INDEX IF NOT EXISTS idx_clients_warning ON clients(org_id, warning_level);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(org_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_renewal ON clients(contract_end_date) WHERE contract_end_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_due ON projects(due_date) WHERE status NOT IN ('complete', 'cancelled');
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(org_id, status);
CREATE INDEX IF NOT EXISTS idx_interactions_client ON interactions(client_id);
CREATE INDEX IF NOT EXISTS idx_interactions_date ON interactions(interaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_sentiment ON interactions(sentiment);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(org_id, status);
CREATE INDEX IF NOT EXISTS idx_milestones_client ON milestones(client_id);
CREATE INDEX IF NOT EXISTS idx_health_history_client ON health_score_history(client_id, score_date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_drafts_client ON agent_drafts(client_id);
CREATE INDEX IF NOT EXISTS idx_agent_drafts_status ON agent_drafts(org_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_log_org ON agent_actions_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_priorities_team ON daily_priorities(team_member_id, priority_date DESC);
CREATE INDEX IF NOT EXISTS idx_retention_cases_client ON retention_cases(client_id);
CREATE INDEX IF NOT EXISTS idx_retention_cases_status ON retention_cases(org_id, status);
CREATE INDEX IF NOT EXISTS idx_team_members_org ON team_members(org_id);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_audits ENABLE ROW LEVEL SECURITY;

-- One policy pattern for all org-scoped tables
DO $$ 
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'team_members', 'clients', 'client_contacts', 'projects', 'interactions',
    'invoices', 'milestones', 'health_score_history', 'agent_drafts',
    'agent_actions_log', 'daily_priorities', 'retention_cases', 'organization_audits'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Users can manage own org %s" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "Users can manage own org %s" ON %I FOR ALL USING (org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))', tbl, tbl);
  END LOOP;
END $$;

-- Auto-update timestamps
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'team_members', 'clients', 'projects', 'invoices'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %I', tbl, tbl);
    EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', tbl, tbl);
  END LOOP;
END $$;
