-- Prompt 10: the client onboarding flow.
--
-- One onboarding record per workspace, read by every screen: the customer's
-- guided setup and progress card, the staff queue and workbench, the roster
-- and overview. Sixteen ordered stages whose definitions live in one table
-- (Platform Admins edit wording, dependencies and time estimates). Each stage
-- is worked out from the real state of the workspace where it can be, so a
-- stage that stops being true (a connection that fails) moves back and tells
-- the right people.
--
-- Also here:
--   * go-live checks (the Prompt 2 configuration check plus the onboarding ones),
--     warnings a Platform Admin may accept with a reason, failures nobody can;
--   * go-live approval and staged agent activation (Scribe, Sentry watch-only,
--     Relay drafts-only, Compass placeholder), each step confirmed and recorded;
--   * lead import from the CRM: paced, resumable, repeat-safe, with historic
--     leads protected from alerts, clocks and drafts at the database;
--   * messaging registration details (stored encrypted by the app, staff-only,
--     no tax ID ever), email domain records, escalation contacts;
--   * the sample lead test, which never sends and is cleaned up and verified;
--   * first-week check-ins, the customer's "How is it going?", reminders.
--
-- Rollback: supabase/rollbacks/20261012010000_onboarding_flow.sql.

-- ---------------------------------------------------------------------------
-- 0. Small additions to existing tables
-- ---------------------------------------------------------------------------

-- The business address the Owner gives during setup. Shown with the other
-- business contact details in Settings.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS business_address text;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_business_address_len;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_business_address_len
  CHECK (business_address IS NULL OR char_length(business_address) <= 300);

-- Service Team may create workspaces only when a Platform Admin grants it.
ALTER TABLE public.platform_staff ADD COLUMN IF NOT EXISTS can_create_workspaces boolean NOT NULL DEFAULT false;

-- A case file built from CRM fields only (no AI) says so.
ALTER TABLE public.case_files ADD COLUMN IF NOT EXISTS depth text NOT NULL DEFAULT 'full';
ALTER TABLE public.case_files DROP CONSTRAINT IF EXISTS case_files_depth;
ALTER TABLE public.case_files ADD CONSTRAINT case_files_depth CHECK (depth IN ('basic', 'full'));

-- Relay may draft for the sample lead during a sample test.
ALTER TABLE public.relay_jobs DROP CONSTRAINT IF EXISTS relay_jobs_trigger_check;
ALTER TABLE public.relay_jobs ADD CONSTRAINT relay_jobs_trigger_check
  CHECK (trigger IN ('after_call', 'missed_window', 'sample'));

-- Onboarding timings and pacing, edited by Platform Admins in support settings.
ALTER TABLE public.staff_support_settings
  ADD COLUMN IF NOT EXISTS onboarding_invite_reminder_days integer[] NOT NULL DEFAULT ARRAY[3, 7],
  ADD COLUMN IF NOT EXISTS onboarding_nudge_every_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS onboarding_nudge_max_per_step integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS onboarding_stuck_customer_days integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS onboarding_checkin_days integer[] NOT NULL DEFAULT ARRAY[1, 3, 7],
  ADD COLUMN IF NOT EXISTS onboarding_ai_case_file_limit integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS onboarding_ai_rate_per_hour integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS onboarding_ai_active_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS onboarding_max_lookback_days integer NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS onboarding_carrier_slow_days integer NOT NULL DEFAULT 7;
ALTER TABLE public.staff_support_settings DROP CONSTRAINT IF EXISTS staff_support_settings_onboarding;
ALTER TABLE public.staff_support_settings ADD CONSTRAINT staff_support_settings_onboarding CHECK (
  onboarding_nudge_every_days BETWEEN 1 AND 30
  AND onboarding_nudge_max_per_step BETWEEN 0 AND 10
  AND onboarding_stuck_customer_days BETWEEN 1 AND 60
  AND onboarding_ai_case_file_limit BETWEEN 0 AND 100000
  AND onboarding_ai_rate_per_hour BETWEEN 1 AND 2000
  AND onboarding_ai_active_days BETWEEN 1 AND 365
  AND onboarding_max_lookback_days BETWEEN 30 AND 730
  AND onboarding_carrier_slow_days BETWEEN 1 AND 60
  AND cardinality(onboarding_invite_reminder_days) BETWEEN 0 AND 5
  AND cardinality(onboarding_checkin_days) BETWEEN 1 AND 5
);

-- Onboarding notifications for customers (to the Owner) use the existing queue.
-- (The enum value is added at the end of this file.)

-- ---------------------------------------------------------------------------
-- 1. Stage definitions: the one ordered list every screen reads
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.onboarding_stage_definitions (
  key text PRIMARY KEY CHECK (key ~ '^[a-z_]{2,40}$'),
  position smallint NOT NULL UNIQUE,
  customer_label text NOT NULL CHECK (char_length(customer_label) BETWEEN 2 AND 80),
  staff_label text NOT NULL CHECK (char_length(staff_label) BETWEEN 2 AND 120),
  why text NOT NULL CHECK (char_length(why) BETWEEN 2 AND 240),
  owner text NOT NULL CHECK (owner IN ('customer', 'staff', 'both')),
  completion text NOT NULL CHECK (completion IN ('automatic', 'manual')),
  depends_on text[] NOT NULL DEFAULT '{}',
  time_estimate text NOT NULL CHECK (char_length(time_estimate) BETWEEN 2 AND 160),
  customer_visible boolean NOT NULL DEFAULT true,
  required_for_go_live boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.onboarding_stage_definitions
  (key, position, customer_label, staff_label, why, owner, completion, depends_on, time_estimate, customer_visible, required_for_go_live)
VALUES
  ('workspace_created', 1, 'Your workspace', 'Workspace created and Owner invited',
    'Your team set up a private workspace for your business and invited you.', 'staff', 'automatic', '{}',
    'Done by your team', true, true),
  ('owner_account', 2, 'Your account', 'Owner account set up (first sign-in)',
    'Signing in once confirms the right person is in charge of this workspace.', 'customer', 'automatic', '{workspace_created}',
    'About 2 minutes of your time', true, true),
  ('approach', 3, 'Choose your approach', 'Industry template confirmed',
    'Vistrial starts from a setup made for businesses like yours.', 'both', 'manual', '{owner_account}',
    'About 3 minutes of your time', true, true),
  ('business_details', 4, 'Business details and hours', 'Business details and hours',
    'Alerts and follow-ups respect your hours and use your business details.', 'customer', 'automatic', '{owner_account}',
    'About 5 minutes of your time', true, true),
  ('crm', 5, 'Connect your CRM', 'CRM connected and syncing',
    'Your leads, contacts, stages, and users come from your CRM, so you never type them twice.', 'customer', 'automatic', '{owner_account}',
    'About 5 minutes of your time', true, true),
  ('messaging', 6, 'Connect messaging', 'Sender number and carrier registration',
    'Business texting needs a registered number and carrier approval before any text can go out.', 'both', 'automatic', '{owner_account}',
    'About 10 minutes of your time, then 1 to 3 business days for carrier approval', true, true),
  ('email', 7, 'Email sending', 'Email domain verification',
    'Verifying your email domain helps your emails reach inboxes instead of spam.', 'both', 'automatic', '{owner_account}',
    'About 10 minutes of your time, or ask your team to do it', true, true),
  ('approvers', 8, 'Choose who approves messages', 'Approvers chosen',
    'Nothing Vistrial drafts is sent until one of these people approves it.', 'customer', 'automatic', '{owner_account}',
    'About 2 minutes of your time', true, true),
  ('escalation', 9, 'Set escalation contacts', 'Escalation contacts set and tested',
    'When a lead waits too long, Vistrial needs to know who to tell, and in what order.', 'customer', 'automatic', '{owner_account}',
    'About 3 minutes of your time', true, true),
  ('team', 10, 'Invite your team', 'Members and Operators invited',
    'Your setters, closers, and managers each see what they need.', 'customer', 'manual', '{owner_account}',
    'About 2 minutes of your time. You can do this later.', true, false),
  ('lead_import', 11, 'Bring in your existing leads', 'Lead import and first case files',
    'Your existing leads arrive with a starting case file, without any alerts or messages.', 'both', 'automatic', '{crm}',
    'A few minutes of your time. The import runs in the background.', true, true),
  ('config_review', 12, 'Team review', 'Staff configuration review signed off',
    'Your team checks every setting before anything is switched on.', 'staff', 'manual', '{approach,business_details}',
    'Usually within 1 business day', true, true),
  ('sample_test', 13, 'Test with a sample lead', 'Sample lead test passed and cleaned up',
    'A practice lead shows the whole path before a real lead depends on it. Nothing is sent.', 'both', 'automatic', '{approach}',
    'About 5 minutes of your time', true, true),
  ('go_live_checks', 14, 'Final checks', 'Go-live checks passed',
    'Your team confirms every connection and setting is ready.', 'staff', 'automatic', '{}',
    'Done by your team', true, true),
  ('go_live', 15, 'Go live', 'Go-live approval and staged agent activation',
    'Your agents are switched on one at a time, so you see each one working before the next starts.', 'both', 'automatic', '{approvers,escalation,sample_test}',
    'Your team reviews within 1 business day, then switches agents on over about a day', true, true),
  ('first_week', 16, 'First-week check-in', 'First-week check-in',
    'Your team checks in on days 1, 3, and 7 to make sure everything is working.', 'staff', 'manual', '{go_live}',
    'Days 1, 3, and 7 after going live', true, false)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.onboarding_stage_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onboarding_stage_definitions_select ON public.onboarding_stage_definitions;
CREATE POLICY onboarding_stage_definitions_select ON public.onboarding_stage_definitions FOR SELECT TO authenticated
  USING (public.is_platform_staff());
GRANT SELECT ON public.onboarding_stage_definitions TO authenticated;
GRANT ALL ON public.onboarding_stage_definitions TO service_role;

-- Per-template defaults the onboarding flow reads (look-back for the import,
-- how long Sentry watches before alerting).
CREATE TABLE IF NOT EXISTS public.onboarding_template_defaults (
  template_id uuid PRIMARY KEY REFERENCES public.config_templates (id) ON DELETE CASCADE,
  import_lookback_days integer NOT NULL DEFAULT 90 CHECK (import_lookback_days BETWEEN 7 AND 365),
  sentry_watch_days integer NOT NULL DEFAULT 1 CHECK (sentry_watch_days BETWEEN 0 AND 14),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.onboarding_template_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onboarding_template_defaults_select ON public.onboarding_template_defaults;
CREATE POLICY onboarding_template_defaults_select ON public.onboarding_template_defaults FOR SELECT TO authenticated
  USING (public.is_platform_staff());
GRANT SELECT ON public.onboarding_template_defaults TO authenticated;
GRANT ALL ON public.onboarding_template_defaults TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The record: a header per workspace plus one row per stage
-- ---------------------------------------------------------------------------

ALTER TABLE public.workspace_onboarding_status
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'setup',
  ADD COLUMN IF NOT EXISTS current_stage text,
  ADD COLUMN IF NOT EXISTS waiting_on text NOT NULL DEFAULT 'nobody',
  ADD COLUMN IF NOT EXISTS waiting_since timestamptz,
  ADD COLUMN IF NOT EXISTS stuck boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stuck_reason text,
  ADD COLUMN IF NOT EXISTS approach_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS approach_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS approach_adjust_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approach_adjust_note text,
  ADD COLUMN IF NOT EXISTS texting_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS texting_off_reason text,
  ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_off_reason text,
  ADD COLUMN IF NOT EXISTS crm_help_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS team_step_state text,
  ADD COLUMN IF NOT EXISTS config_review_signed_off_at timestamptz,
  ADD COLUMN IF NOT EXISTS config_review_signed_off_by uuid,
  ADD COLUMN IF NOT EXISTS config_review_version text,
  ADD COLUMN IF NOT EXISTS owner_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS go_live_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS go_live_approved_by uuid,
  ADD COLUMN IF NOT EXISTS go_live_approved_by_label text,
  ADD COLUMN IF NOT EXISTS activation_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_paused_reason text,
  ADD COLUMN IF NOT EXISTS sentry_watch_until timestamptz,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checks_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.workspace_onboarding_status DROP CONSTRAINT IF EXISTS workspace_onboarding_status_phase;
ALTER TABLE public.workspace_onboarding_status ADD CONSTRAINT workspace_onboarding_status_phase
  CHECK (phase IN ('setup', 'ready_for_review', 'activating', 'live', 'settled', 'paused', 'cancelled'));
ALTER TABLE public.workspace_onboarding_status DROP CONSTRAINT IF EXISTS workspace_onboarding_status_waiting_on;
ALTER TABLE public.workspace_onboarding_status ADD CONSTRAINT workspace_onboarding_status_waiting_on
  CHECK (waiting_on IN ('customer', 'team', 'both', 'nobody'));
ALTER TABLE public.workspace_onboarding_status DROP CONSTRAINT IF EXISTS workspace_onboarding_status_text_len;
ALTER TABLE public.workspace_onboarding_status ADD CONSTRAINT workspace_onboarding_status_text_len CHECK (
  (approach_adjust_note IS NULL OR char_length(approach_adjust_note) <= 1000)
  AND (texting_off_reason IS NULL OR char_length(texting_off_reason) <= 300)
  AND (email_off_reason IS NULL OR char_length(email_off_reason) <= 300)
  AND (activation_paused_reason IS NULL OR char_length(activation_paused_reason) <= 300)
  AND (paused_reason IS NULL OR char_length(paused_reason) <= 300)
  AND (team_step_state IS NULL OR team_step_state IN ('done', 'later'))
);
CREATE INDEX IF NOT EXISTS workspace_onboarding_status_phase_idx ON public.workspace_onboarding_status (phase, updated_at DESC);

-- Customers (Owners and Members) read the header; Operators never do. Staff
-- read it for the workspaces they may enter.
DROP POLICY IF EXISTS workspace_onboarding_status_select ON public.workspace_onboarding_status;
CREATE POLICY workspace_onboarding_status_select ON public.workspace_onboarding_status FOR SELECT TO authenticated
  USING (public.ws_access(org_id) IN ('platform_admin', 'service_team', 'owner', 'member'));

CREATE TABLE IF NOT EXISTS public.workspace_onboarding_stages (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  stage_key text NOT NULL REFERENCES public.onboarding_stage_definitions (key) ON UPDATE CASCADE,
  status text NOT NULL DEFAULT 'not_started',
  detail text,
  staff_detail text,
  note text,
  staff_note text,
  eta text,
  manual_state text,
  skip_reason text,
  started_at timestamptz,
  finished_at timestamptz,
  completed_by uuid,
  completed_by_label text,
  waiting_since timestamptz,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (org_id, stage_key),
  CONSTRAINT workspace_onboarding_stages_status CHECK (status IN (
    'not_started', 'in_progress', 'waiting_on_customer', 'waiting_on_team', 'blocked', 'done', 'skipped')),
  CONSTRAINT workspace_onboarding_stages_manual CHECK (manual_state IS NULL OR manual_state = 'skipped'),
  CONSTRAINT workspace_onboarding_stages_skip_reason CHECK (manual_state IS NULL OR NULLIF(btrim(COALESCE(skip_reason, '')), '') IS NOT NULL),
  CONSTRAINT workspace_onboarding_stages_text_len CHECK (
    (detail IS NULL OR char_length(detail) <= 300)
    AND (staff_detail IS NULL OR char_length(staff_detail) <= 300)
    AND (note IS NULL OR char_length(note) <= 300)
    AND (staff_note IS NULL OR char_length(staff_note) <= 1000)
    AND (eta IS NULL OR char_length(eta) <= 80)
    AND (skip_reason IS NULL OR char_length(skip_reason) <= 300))
);
CREATE INDEX IF NOT EXISTS workspace_onboarding_stages_status_idx ON public.workspace_onboarding_stages (status, waiting_since);

-- Staff-only details: internal note, intended plan, per-workspace pacing.
CREATE TABLE IF NOT EXISTS public.onboarding_staff_details (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  internal_note text CHECK (internal_note IS NULL OR char_length(internal_note) <= 2000),
  intended_price_id text CHECK (intended_price_id IS NULL OR intended_price_id ~ '^price_[A-Za-z0-9]{6,}$'),
  intended_plan_label text CHECK (intended_plan_label IS NULL OR char_length(intended_plan_label) <= 120),
  created_by uuid,
  created_by_role text,
  ai_case_file_limit integer CHECK (ai_case_file_limit IS NULL OR ai_case_file_limit BETWEEN 0 AND 100000),
  ai_rate_per_hour integer CHECK (ai_rate_per_hour IS NULL OR ai_rate_per_hour BETWEEN 1 AND 2000),
  ai_paused boolean NOT NULL DEFAULT false,
  owner_invite_reminded_days integer[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Warnings a Platform Admin accepted, with the reason.
CREATE TABLE IF NOT EXISTS public.onboarding_check_acceptances (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  check_key text NOT NULL CHECK (check_key ~ '^[a-z_]{2,40}$'),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  accepted_by uuid NOT NULL,
  accepted_by_label text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, check_key)
);

-- Notifications waiting to go out about onboarding. The scheduled job groups
-- them per workspace and audience, so nobody gets a stream of emails.
CREATE TABLE IF NOT EXISTS public.onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('owner', 'staff')),
  kind text NOT NULL CHECK (kind ~ '^[a-z_]{2,40}$'),
  stage_key text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS onboarding_events_pending_idx ON public.onboarding_events (created_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS onboarding_events_org_idx ON public.onboarding_events (org_id, created_at DESC);

-- Reminders already sent, so limits hold (Owner: one grouped nudge every few
-- days, a few per step; staff: invitation reminders on set days).
CREATE TABLE IF NOT EXISTS public.onboarding_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('owner', 'staff')),
  kind text NOT NULL CHECK (kind ~ '^[a-z_]{2,40}$'),
  stage_keys text[] NOT NULL DEFAULT '{}',
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid
);
CREATE INDEX IF NOT EXISTS onboarding_reminders_org_idx ON public.onboarding_reminders (org_id, audience, sent_at DESC);

-- Per person: the first-sign-in welcome, the day-7 prompt.
CREATE TABLE IF NOT EXISTS public.onboarding_member_flags (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE CASCADE,
  welcome_seen_at timestamptz,
  feedback_seen_at timestamptz,
  PRIMARY KEY (org_id, member_id)
);

-- ---------------------------------------------------------------------------
-- 3. Agent activation: which agents are switched on, and in what mode
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_agent_activation (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agent_id text NOT NULL CHECK (agent_id IN ('scribe', 'sentry', 'relay', 'compass')),
  stage text NOT NULL DEFAULT 'off' CHECK (stage IN ('off', 'watch', 'on', 'drafts_only', 'coming_soon')),
  step_order smallint NOT NULL,
  activated_at timestamptz,
  activated_by uuid,
  activated_by_label text,
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, agent_id)
);

-- ---------------------------------------------------------------------------
-- 4. Lead import
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.onboarding_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'paused', 'done', 'failed', 'cancelled')),
  lookback_days integer NOT NULL CHECK (lookback_days BETWEEN 1 AND 730),
  window_start timestamptz NOT NULL,
  requested_by uuid,
  requested_by_label text,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  found integer NOT NULL DEFAULT 0,
  imported integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skip_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  do_not_contact integer NOT NULL DEFAULT 0,
  basic_case_files integer NOT NULL DEFAULT 0,
  ai_eligible integer NOT NULL DEFAULT 0,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 300),
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  paused_at timestamptz,
  paused_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_import_runs_one_open ON public.onboarding_import_runs (org_id)
  WHERE status IN ('queued', 'running', 'paused');
CREATE INDEX IF NOT EXISTS onboarding_import_runs_org_idx ON public.onboarding_import_runs (org_id, created_at DESC);

-- Which leads came in from the CRM's history. Agents leave these alone:
-- no clocks, alerts, or drafts, until a person brings one back (reactivation).
CREATE TABLE IF NOT EXISTS public.lead_import_marks (
  lead_id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.onboarding_import_runs (id) ON DELETE SET NULL,
  crm_created_at timestamptz,
  crm_last_activity_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  reactivated_at timestamptz,
  reactivated_by uuid,
  reactivation_reason text CHECK (reactivation_reason IS NULL OR char_length(reactivation_reason) <= 300),
  ai_state text NOT NULL DEFAULT 'none' CHECK (ai_state IN ('none', 'eligible', 'queued', 'running', 'done', 'failed', 'over_limit')),
  ai_updated_at timestamptz,
  CONSTRAINT lead_import_marks_lead_fkey FOREIGN KEY (lead_id, org_id) REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lead_import_marks_org_idx ON public.lead_import_marks (org_id) WHERE reactivated_at IS NULL;
CREATE INDEX IF NOT EXISTS lead_import_marks_ai_idx ON public.lead_import_marks (org_id, ai_state, crm_last_activity_at DESC NULLS LAST);

-- Data problems found while importing, in plain language, for a person to decide.
CREATE TABLE IF NOT EXISTS public.onboarding_import_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.onboarding_import_runs (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('no_contact_details', 'invalid_phone', 'invalid_email', 'possible_duplicate', 'could_not_read')),
  crm_ref text NOT NULL CHECK (char_length(crm_ref) <= 120),
  display_label text NOT NULL CHECK (char_length(display_label) <= 120),
  lead_id uuid,
  decision text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'keep', 'skip')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind, crm_ref)
);
CREATE INDEX IF NOT EXISTS onboarding_import_problems_org_idx ON public.onboarding_import_problems (org_id, decision, kind);

-- ---------------------------------------------------------------------------
-- 5. Messaging registration, email domain, escalation contacts
-- ---------------------------------------------------------------------------

-- Registration details are encrypted by the app (AES-256-GCM, the same key as
-- connection credentials) before they reach this table, and only assigned
-- staff and Platform Admins can read the row. Vistrial never stores the tax ID
-- (EIN): staff collect it outside Vistrial and only record that it was handled.
-- provider and external_reference let a direct registration integration be
-- added later without changing the shape.
CREATE TABLE IF NOT EXISTS public.messaging_registration_details (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'crm_phone_registration' CHECK (provider IN ('crm_phone_registration', 'telnyx')),
  details_ciphertext text CHECK (details_ciphertext IS NULL OR details_ciphertext ~ '^v1\.'),
  field_names text[] NOT NULL DEFAULT '{}',
  fields_complete boolean NOT NULL DEFAULT false,
  saved_at timestamptz,
  saved_by uuid,
  saved_by_label text,
  submitted_at timestamptz,
  submitted_by uuid,
  external_reference text CHECK (external_reference IS NULL OR char_length(external_reference) <= 120),
  ein_handled_at timestamptz,
  ein_handled_by uuid,
  rejection_code text CHECK (rejection_code IS NULL OR rejection_code IN (
    'business_details_mismatch', 'website_problem', 'opt_in_unclear', 'sample_messages', 'use_case_not_allowed', 'other')),
  rejection_note text CHECK (rejection_note IS NULL OR char_length(rejection_note) <= 500),
  rejected_at timestamptz,
  status_changed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_domain_setup (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  domain text CHECK (domain IS NULL OR domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  records jsonb NOT NULL DEFAULT '[]'::jsonb,
  prepared_at timestamptz,
  prepared_by uuid,
  team_asked_at timestamptz,
  last_checked_at timestamptz,
  last_result jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_domain_setup_records CHECK (jsonb_typeof(records) = 'array' AND jsonb_array_length(records) <= 10)
);

CREATE TABLE IF NOT EXISTS public.workspace_escalation_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
  member_id uuid REFERENCES public.org_members (id) ON DELETE CASCADE,
  invite_id uuid REFERENCES public.org_invites (id) ON DELETE SET NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  channel text NOT NULL CHECK (channel IN ('push', 'email', 'sms')),
  test_sent_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (org_id, position),
  CONSTRAINT workspace_escalation_contacts_who CHECK (member_id IS NOT NULL OR invite_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS workspace_escalation_contacts_member_idx ON public.workspace_escalation_contacts (member_id);

-- ---------------------------------------------------------------------------
-- 6. Sample lead test, first-week check-ins, customer feedback
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.onboarding_sample_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'passed', 'failed', 'problem_reported')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  failed_step text,
  started_by uuid,
  started_by_label text,
  started_from text NOT NULL DEFAULT 'customer' CHECK (started_from IN ('customer', 'staff')),
  confirmed_at timestamptz,
  confirmed_by uuid,
  problem_request_id uuid,
  cleaned_at timestamptz,
  cleanup_verified boolean NOT NULL DEFAULT false,
  cleanup_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS onboarding_sample_runs_org_idx ON public.onboarding_sample_runs (org_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_sample_runs_one_running ON public.onboarding_sample_runs (org_id) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.onboarding_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  day integer NOT NULL CHECK (day BETWEEN 1 AND 60),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done')),
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  staff_note text CHECK (staff_note IS NULL OR char_length(staff_note) <= 2000),
  follow_up_at timestamptz,
  completed_by uuid,
  completed_by_label text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, day)
);
CREATE INDEX IF NOT EXISTS onboarding_checkins_due_idx ON public.onboarding_checkins (status, due_at);

CREATE TABLE IF NOT EXISTS public.onboarding_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 2000),
  help_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. Row-level security on every new table
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  staff_only text[] := ARRAY[
    'workspace_onboarding_stages', 'onboarding_staff_details', 'onboarding_check_acceptances',
    'onboarding_events', 'onboarding_reminders', 'onboarding_import_runs', 'onboarding_import_problems',
    'messaging_registration_details', 'email_domain_setup', 'onboarding_checkins', 'onboarding_feedback',
    'onboarding_sample_runs'
  ];
  all_tables text[] := staff_only || ARRAY[
    'workspace_agent_activation', 'lead_import_marks', 'workspace_escalation_contacts', 'onboarding_member_flags'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_open_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_open_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_open_delete ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY ws_open_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (org_id IS NULL OR org_id NOT IN (SELECT public.closed_org_ids()))', t);
    EXECUTE format(
      'CREATE POLICY ws_open_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (org_id IS NULL OR org_id NOT IN (SELECT public.closed_org_ids()))
         WITH CHECK (org_id IS NULL OR org_id NOT IN (SELECT public.closed_org_ids()))', t);
    EXECUTE format(
      'CREATE POLICY ws_open_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (org_id IS NULL OR org_id NOT IN (SELECT public.closed_org_ids()))', t);
  END LOOP;
  FOREACH t IN ARRAY staff_only LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (org_id IN (SELECT public.user_staff_org_ids()))',
      t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_staff_only ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY ws_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING (org_id IN (SELECT public.user_staff_org_ids()))
         WITH CHECK (org_id IN (SELECT public.user_staff_org_ids()))', t);
  END LOOP;
END $$;

-- Owners and Members see which agents are on (the plan is shown to them).
DROP POLICY IF EXISTS workspace_agent_activation_select ON public.workspace_agent_activation;
CREATE POLICY workspace_agent_activation_select ON public.workspace_agent_activation FOR SELECT TO authenticated
  USING (public.ws_access(org_id) IN ('platform_admin', 'service_team', 'owner', 'member'));

-- Anyone who can see the lead can see that it came from the CRM's history.
DROP POLICY IF EXISTS lead_import_marks_select ON public.lead_import_marks;
CREATE POLICY lead_import_marks_select ON public.lead_import_marks FOR SELECT TO authenticated
  USING (public.ws_lead_visible(org_id, lead_id));

-- Owners and staff see the escalation list; the people on it see their own row.
DROP POLICY IF EXISTS workspace_escalation_contacts_select ON public.workspace_escalation_contacts;
CREATE POLICY workspace_escalation_contacts_select ON public.workspace_escalation_contacts FOR SELECT TO authenticated
  USING (
    public.ws_access(org_id) IN ('platform_admin', 'service_team', 'owner')
    OR member_id = public.user_member_id(org_id)
  );

DROP POLICY IF EXISTS onboarding_member_flags_select ON public.onboarding_member_flags;
CREATE POLICY onboarding_member_flags_select ON public.onboarding_member_flags FOR SELECT TO authenticated
  USING (member_id = public.user_member_id(org_id) OR org_id IN (SELECT public.user_staff_org_ids()));

-- ---------------------------------------------------------------------------
-- 8. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.onboarding_actor_label(p_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT label FROM public.ws_actor(p_org_id, auth.uid());
$$;

/** Staff of the workspace, or a scheduled job. Everyone else gets the neutral not-found. */
CREATE OR REPLACE FUNCTION public.onboarding_require_staff(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Scheduled jobs (the service role) and database maintenance have no user.
  IF auth.uid() IS NULL AND COALESCE(auth.role(), 'service_role') = 'service_role' THEN
    RETURN;
  END IF;
  IF p_org_id IS NULL OR NOT public.ws_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
END;
$$;

/** Staff, or an Owner of this workspace. */
CREATE OR REPLACE FUNCTION public.onboarding_require_owner_or_staff(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
BEGIN
  IF v_access IS NULL OR v_access NOT IN ('platform_admin', 'service_team', 'owner') THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF p_org_id IN (SELECT public.closed_org_ids()) THEN
    RAISE EXCEPTION 'This workspace is closed.' USING ERRCODE = '42501';
  END IF;
  RETURN v_access;
END;
$$;

/** Support settings with the onboarding timings. */
CREATE OR REPLACE FUNCTION public.onboarding_settings()
RETURNS public.staff_support_settings
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.staff_support_settings WHERE id;
$$;

/** True for a lead that came in from the CRM's history and nobody has brought back. */
CREATE OR REPLACE FUNCTION public.lead_is_historic(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.lead_import_marks m WHERE m.lead_id = p_lead_id AND m.reactivated_at IS NULL);
$$;

/** The historic leads of one workspace, for jobs that scan many leads. */
CREATE OR REPLACE FUNCTION public.historic_lead_ids(p_org_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.lead_id FROM public.lead_import_marks m WHERE m.org_id = p_org_id AND m.reactivated_at IS NULL;
$$;

/** May this agent act in this workspace? Read by every agent before it works. */
CREATE OR REPLACE FUNCTION public.agent_activation_allows(p_org_id uuid, p_agent_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT a.stage IN ('on', 'watch', 'drafts_only')
    FROM public.workspace_agent_activation a
    WHERE a.org_id = p_org_id AND a.agent_id = p_agent_id
  ), true);
$$;

-- ---------------------------------------------------------------------------
-- 9. Working out each stage from the real state of the workspace
-- ---------------------------------------------------------------------------

/**
 * One entry per stage: status, a customer-facing detail, a staff detail, and
 * when the state began where the data says so. No dependencies or manual
 * skips here; onboarding_refresh applies those.
 */
CREATE OR REPLACE FUNCTION public.onboarding_compute(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  h public.workspace_onboarding_status%ROWTYPE;
  mr public.messaging_readiness%ROWTYPE;
  reg public.messaging_registration_details%ROWTYPE;
  em public.email_domain_setup%ROWTYPE;
  imp public.onboarding_import_runs%ROWTYPE;
  smp public.onboarding_sample_runs%ROWTYPE;
  cr public.config_readiness%ROWTYPE;
  s public.staff_support_settings%ROWTYPE := public.onboarding_settings();
  v_values jsonb;
  v_crm text;
  v_crm_error text;
  v_owner_signed_in timestamptz;
  v_owner_member boolean;
  v_invite record;
  v_approvers integer;
  v_contacts integer;
  v_contacts_verified integer;
  v_team_accepted integer;
  v_team_pending integer;
  v_missing text[] := '{}';
  v_checks jsonb;
  v_fails integer;
  v_out jsonb := '{}'::jsonb;
  v_version text;
BEGIN
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  SELECT * INTO h FROM public.workspace_onboarding_status WHERE org_id = p_org_id;
  SELECT * INTO mr FROM public.messaging_readiness WHERE org_id = p_org_id;
  SELECT * INTO reg FROM public.messaging_registration_details WHERE org_id = p_org_id;
  SELECT * INTO em FROM public.email_domain_setup WHERE org_id = p_org_id;
  SELECT * INTO imp FROM public.onboarding_import_runs WHERE org_id = p_org_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO smp FROM public.onboarding_sample_runs WHERE org_id = p_org_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO cr FROM public.config_readiness WHERE org_id = p_org_id;
  BEGIN
    v_values := public.config_effective_at(p_org_id) -> 'values';
    v_version := public.config_version_stamp(p_org_id);
  EXCEPTION WHEN OTHERS THEN
    v_values := '{}'::jsonb;
    v_version := NULL;
  END;

  SELECT
    CASE WHEN bool_or(c.status = 'active') THEN 'active' WHEN bool_or(c.status = 'broken') THEN 'broken' WHEN count(*) > 0 THEN 'inactive' END,
    max(c.last_refresh_error)
  INTO v_crm, v_crm_error
  FROM public.ghl_connections c WHERE c.org_id = p_org_id;

  SELECT EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = p_org_id AND m.active AND m.seat = 'customer' AND m.role = 'owner'),
         (SELECT min(m.last_seen_at) FROM public.org_members m WHERE m.org_id = p_org_id AND m.active AND m.seat = 'customer' AND m.role = 'owner')
  INTO v_owner_member, v_owner_signed_in;
  SELECT i.id, i.created_at, i.expires_at, i.expires_at <= now() AS expired INTO v_invite
  FROM public.org_invites i
  WHERE i.org_id = p_org_id AND i.role = 'owner' AND i.accepted_at IS NULL
  ORDER BY i.created_at DESC LIMIT 1;

  SELECT count(*) INTO v_approvers FROM public.org_members m
  WHERE m.org_id = p_org_id AND m.active AND m.seat = 'customer' AND m.last_seen_at IS NOT NULL
    AND (m.role = 'owner' OR (m.role = 'member' AND m.can_approve));
  SELECT count(*), count(*) FILTER (WHERE c.verified_at IS NOT NULL AND m.active)
  INTO v_contacts, v_contacts_verified
  FROM public.workspace_escalation_contacts c
  LEFT JOIN public.org_members m ON m.id = c.member_id
  WHERE c.org_id = p_org_id;
  SELECT count(*) INTO v_team_accepted FROM public.org_members m
  WHERE m.org_id = p_org_id AND m.active AND m.seat = 'customer' AND m.role IN ('member', 'operator', 'setter', 'closer');
  SELECT count(*) INTO v_team_pending FROM public.org_invites i
  WHERE i.org_id = p_org_id AND i.accepted_at IS NULL AND i.expires_at > now() AND i.role <> 'owner';

  -- 1. Workspace created and Owner invited
  v_out := v_out || jsonb_build_object('workspace_created',
    CASE WHEN v_owner_member OR v_invite.id IS NOT NULL
      THEN jsonb_build_object('status', 'done', 'since', o.created_at)
      ELSE jsonb_build_object('status', 'waiting_on_team', 'detail', 'Your team is sending your invitation.',
        'staff_detail', 'No Owner invitation yet. Invite the Owner from the workbench.', 'since', o.created_at) END);

  -- 2. Owner account
  v_out := v_out || jsonb_build_object('owner_account',
    CASE
      WHEN v_owner_signed_in IS NOT NULL THEN jsonb_build_object('status', 'done', 'since', v_owner_signed_in)
      WHEN v_owner_member THEN jsonb_build_object('status', 'in_progress', 'detail', 'Sign in once to finish setting up your account.',
        'staff_detail', 'The Owner accepted but has not signed in yet.')
      WHEN v_invite.id IS NOT NULL AND v_invite.expired THEN jsonb_build_object('status', 'blocked',
        'detail', 'Your invitation expired. Your team will send a new one.',
        'staff_detail', 'The Owner invitation expired. Resend it.', 'since', v_invite.expires_at)
      WHEN v_invite.id IS NOT NULL THEN jsonb_build_object('status', 'waiting_on_customer',
        'detail', 'Accept the invitation in your email to sign in.',
        'staff_detail', 'Waiting for the Owner to accept the invitation.', 'since', v_invite.created_at)
      ELSE jsonb_build_object('status', 'waiting_on_team', 'detail', 'Your team is sending your invitation.',
        'staff_detail', 'No Owner invitation yet.')
    END);

  -- 3. Choose your approach
  v_out := v_out || jsonb_build_object('approach',
    CASE
      WHEN o.industry_template_id IS NULL THEN jsonb_build_object('status', 'waiting_on_team',
        'detail', 'Your team is choosing a starting setup for your business.', 'staff_detail', 'No template is set. Choose one in Configuration.')
      WHEN h.approach_adjust_requested_at IS NOT NULL AND (h.approach_confirmed_at IS NULL OR h.approach_adjust_requested_at > h.approach_confirmed_at)
        THEN jsonb_build_object('status', 'waiting_on_team', 'detail', 'You asked your team to adjust it. They will let you know when it is ready.',
          'staff_detail', 'The Owner asked for changes to the approach.', 'since', h.approach_adjust_requested_at)
      WHEN h.approach_confirmed_at IS NOT NULL THEN jsonb_build_object('status', 'done', 'since', h.approach_confirmed_at)
      ELSE jsonb_build_object('status', 'waiting_on_customer', 'detail', 'Look over the approach and confirm it, or ask for changes.',
        'staff_detail', 'Waiting for the Owner to confirm the approach.')
    END);

  -- 4. Business details and hours
  IF NULLIF(btrim(COALESCE(o.owner_contact_name, '')), '') IS NULL THEN v_missing := array_append(v_missing, 'a contact name'); END IF;
  IF NULLIF(btrim(COALESCE(o.owner_contact_phone, '')), '') IS NULL AND NULLIF(btrim(COALESCE(o.owner_contact_email, '')), '') IS NULL THEN
    v_missing := array_append(v_missing, 'a phone number or email');
  END IF;
  IF NULLIF(btrim(COALESCE(o.business_address, '')), '') IS NULL THEN v_missing := array_append(v_missing, 'the business address'); END IF;
  IF v_values -> 'identity.business_hours' IS NULL OR jsonb_typeof(v_values -> 'identity.business_hours') <> 'object' THEN
    v_missing := array_append(v_missing, 'business hours');
  END IF;
  v_out := v_out || jsonb_build_object('business_details',
    CASE WHEN cardinality(v_missing) = 0 THEN jsonb_build_object('status', 'done')
      ELSE jsonb_build_object('status', 'waiting_on_customer', 'detail', 'Still needed: ' || array_to_string(v_missing, ', ') || '.',
        'staff_detail', 'Missing: ' || array_to_string(v_missing, ', ') || '.') END);

  -- 5. CRM
  v_out := v_out || jsonb_build_object('crm',
    CASE v_crm
      WHEN 'active' THEN jsonb_build_object('status', 'done')
      WHEN 'broken' THEN jsonb_build_object('status', 'blocked',
        'detail', 'The connection to your CRM stopped working. Reconnect it, or ask your team for help.',
        'staff_detail', 'CRM connection is broken' || COALESCE(': ' || left(v_crm_error, 120), '.'))
      ELSE CASE WHEN h.crm_help_requested_at IS NOT NULL
        THEN jsonb_build_object('status', 'waiting_on_team', 'detail', 'Your team is looking into connecting your CRM.',
          'staff_detail', 'The Owner asked for help connecting their CRM (it may not be supported yet).', 'since', h.crm_help_requested_at)
        ELSE jsonb_build_object('status', 'waiting_on_customer', 'detail', 'Connect your CRM so Vistrial can read your leads.',
          'staff_detail', 'CRM not connected.') END
    END);

  -- 6. Messaging (sender number and carrier registration)
  v_out := v_out || jsonb_build_object('messaging',
    CASE
      WHEN NOT COALESCE(h.texting_enabled, true) THEN jsonb_build_object('status', 'skipped',
        'detail', 'Going live without texting.' || COALESCE(' ' || h.texting_off_reason, ''),
        'staff_detail', 'Texting is off for this workspace: ' || COALESCE(h.texting_off_reason, 'no reason given'))
      WHEN mr.carrier_status = 'approved' AND mr.sender_number_confirmed_at IS NOT NULL THEN
        jsonb_build_object('status', 'done', 'since', GREATEST(mr.carrier_updated_at, mr.sender_number_confirmed_at))
      WHEN mr.carrier_status = 'approved' THEN jsonb_build_object('status', 'waiting_on_team',
        'detail', 'Approved by the carriers. Your team is confirming your sending number.',
        'staff_detail', 'Carrier approved. Confirm the sender number.', 'since', mr.carrier_updated_at)
      WHEN mr.carrier_status = 'rejected' THEN jsonb_build_object('status', 'blocked',
        'detail', 'The carriers did not approve the registration yet. See what to fix.',
        'staff_detail', 'Carrier registration rejected' || COALESCE(' (' || reg.rejection_code || ')', '') || '.', 'since', mr.carrier_updated_at)
      WHEN mr.carrier_status = 'pending' THEN jsonb_build_object('status', 'waiting_on_team',
        'detail', CASE WHEN mr.carrier_updated_at < now() - make_interval(days => s.onboarding_carrier_slow_days)
          THEN 'Carrier approval is taking longer than usual. Your team is following up. Everything else can carry on.'
          ELSE 'Waiting for carrier approval. This usually takes 1 to 3 business days. Everything else can carry on.' END,
        'staff_detail', CASE WHEN mr.carrier_updated_at < now() - make_interval(days => s.onboarding_carrier_slow_days)
          THEN 'Carrier approval pending for more than ' || s.onboarding_carrier_slow_days || ' days. Follow up.'
          ELSE 'Submitted. Waiting for carrier approval.' END,
        'since', mr.carrier_updated_at)
      WHEN reg.fields_complete THEN jsonb_build_object('status', 'waiting_on_team',
        'detail', 'Your team is submitting your registration.',
        'staff_detail', CASE WHEN reg.ein_handled_at IS NULL THEN 'Details received. Get the tax ID from the Owner directly, then submit in the CRM.'
          ELSE 'Details received and tax ID handled. Submit in the CRM and set the status to pending.' END,
        'since', reg.saved_at)
      ELSE jsonb_build_object('status', 'waiting_on_customer', 'detail', 'Add your business details for the carrier registration.',
        'staff_detail', 'Waiting for the Owner''s registration details.')
    END);

  -- 7. Email sending
  v_out := v_out || jsonb_build_object('email',
    CASE
      WHEN NOT COALESCE(h.email_enabled, true) THEN jsonb_build_object('status', 'skipped',
        'detail', 'Going live without email.' || COALESCE(' ' || h.email_off_reason, ''),
        'staff_detail', 'Email is off for this workspace: ' || COALESCE(h.email_off_reason, 'no reason given'))
      WHEN em.verified_at IS NOT NULL OR mr.sending_domain_confirmed_at IS NOT NULL THEN
        jsonb_build_object('status', 'done', 'since', COALESCE(em.verified_at, mr.sending_domain_confirmed_at))
      WHEN em.team_asked_at IS NOT NULL AND (em.last_checked_at IS NULL OR em.team_asked_at > em.last_checked_at) THEN
        jsonb_build_object('status', 'waiting_on_team', 'detail', 'Your team is setting this up for you.',
          'staff_detail', 'The Owner asked the team to set up the email domain.', 'since', em.team_asked_at)
      WHEN jsonb_array_length(COALESCE(em.records, '[]'::jsonb)) = 0 THEN
        jsonb_build_object('status', 'waiting_on_team', 'detail', 'Your team is preparing the records you will add. Expected within 1 business day.',
          'staff_detail', 'Add the domain and the records from the CRM''s email settings.')
      WHEN em.last_checked_at IS NOT NULL THEN jsonb_build_object('status', 'waiting_on_customer',
        'detail', 'Some records were not found yet. They can take a few hours to appear after you add them.',
        'staff_detail', 'Records prepared; last check did not find all of them.', 'since', em.last_checked_at)
      ELSE jsonb_build_object('status', 'waiting_on_customer', 'detail', 'Add the records to your domain, then check again.',
        'staff_detail', 'Records prepared; waiting for the Owner to add them.', 'since', em.prepared_at)
    END);

  -- 8. Approvers
  v_out := v_out || jsonb_build_object('approvers',
    CASE WHEN v_approvers > 0 THEN jsonb_build_object('status', 'done')
      ELSE jsonb_build_object('status', 'waiting_on_customer', 'detail', 'Choose at least one person who approves messages. It can be you.',
        'staff_detail', 'No approver who has signed in yet.') END);

  -- 9. Escalation contacts
  v_out := v_out || jsonb_build_object('escalation',
    CASE
      WHEN v_contacts_verified > 0 THEN jsonb_build_object('status', 'done')
      WHEN v_contacts > 0 THEN jsonb_build_object('status', 'in_progress',
        'detail', 'Send a test to your contacts and ask them to confirm they got it.',
        'staff_detail', v_contacts || ' contact(s), none confirmed yet.')
      ELSE jsonb_build_object('status', 'waiting_on_customer', 'detail', 'Choose who gets told when a lead waits too long. It can be you.',
        'staff_detail', 'No escalation contacts yet.')
    END);

  -- 10. Invite your team
  v_out := v_out || jsonb_build_object('team',
    CASE
      WHEN v_team_accepted > 0 OR h.team_step_state = 'done' THEN jsonb_build_object('status', 'done')
      WHEN v_team_pending > 0 THEN jsonb_build_object('status', 'in_progress',
        'detail', v_team_pending || ' invitation(s) waiting to be accepted.', 'staff_detail', v_team_pending || ' invitation(s) pending.')
      WHEN h.team_step_state = 'later' THEN jsonb_build_object('status', 'skipped', 'detail', 'You chose to do this later.',
        'staff_detail', 'The Owner chose to invite people later.')
      ELSE jsonb_build_object('status', 'waiting_on_customer', 'detail', 'Invite the people who work your leads, or do it later.',
        'staff_detail', 'No team invited yet.')
    END);

  -- 11. Lead import
  v_out := v_out || jsonb_build_object('lead_import',
    CASE
      WHEN imp.id IS NULL THEN jsonb_build_object('status', 'waiting_on_customer',
        'detail', 'Choose how far back to bring in your existing leads.', 'staff_detail', 'No import started yet.')
      WHEN imp.status = 'done' THEN jsonb_build_object('status', 'done', 'since', imp.finished_at,
        'detail', imp.imported || ' leads brought in.')
      WHEN imp.status IN ('queued', 'running') THEN jsonb_build_object('status', 'in_progress',
        'detail', 'Bringing in your leads. ' || imp.imported || ' so far.', 'staff_detail', imp.imported || ' of ' || imp.found || ' imported so far.',
        'since', COALESCE(imp.started_at, imp.created_at))
      WHEN imp.status = 'paused' THEN jsonb_build_object('status', 'waiting_on_team',
        'detail', 'Your team paused the import for a moment. It will carry on from where it stopped.',
        'staff_detail', 'Import paused.', 'since', imp.paused_at)
      WHEN imp.status = 'failed' THEN jsonb_build_object('status', 'blocked',
        'detail', 'The import stopped part way. Your team is looking at it. Nothing already brought in is lost.',
        'staff_detail', 'Import failed' || COALESCE(': ' || imp.last_error, '.'), 'since', imp.updated_at)
      ELSE jsonb_build_object('status', 'waiting_on_customer', 'detail', 'The import was cancelled. Start it again when you are ready.',
        'staff_detail', 'Import cancelled.')
    END);

  -- 12. Staff configuration review
  v_out := v_out || jsonb_build_object('config_review',
    CASE
      WHEN h.config_review_signed_off_at IS NOT NULL AND h.config_review_version IS NOT DISTINCT FROM v_version
        THEN jsonb_build_object('status', 'done', 'since', h.config_review_signed_off_at)
      WHEN h.config_review_signed_off_at IS NOT NULL THEN jsonb_build_object('status', 'waiting_on_team',
        'detail', 'Your team is reviewing a recent change to your settings.',
        'staff_detail', 'Settings changed after the review was signed off. Review again.')
      ELSE jsonb_build_object('status', 'waiting_on_team', 'detail', 'Your team is reviewing your settings.',
        'staff_detail', 'Review the configuration and sign it off.')
    END);

  -- 13. Sample lead test
  v_out := v_out || jsonb_build_object('sample_test',
    CASE
      WHEN smp.id IS NULL THEN jsonb_build_object('status', 'waiting_on_customer',
        'detail', 'Run a test with a practice lead. Nothing is sent to anyone.', 'staff_detail', 'No sample test yet.')
      WHEN smp.status = 'running' THEN jsonb_build_object('status', 'in_progress', 'detail', 'The sample lead test is running.',
        'staff_detail', 'Sample test running.', 'since', smp.created_at)
      WHEN smp.status = 'failed' THEN jsonb_build_object('status', 'blocked',
        'detail', 'The test stopped part way. Your team has been told. You can run it again.',
        'staff_detail', 'Sample test failed at: ' || COALESCE(smp.failed_step, 'an unknown step') || '.', 'since', smp.updated_at)
      WHEN smp.status = 'problem_reported' THEN jsonb_build_object('status', 'waiting_on_team',
        'detail', 'You reported a problem with the test. Your team is looking at it.',
        'staff_detail', 'The Owner reported a problem with the sample test.', 'since', smp.updated_at)
      WHEN smp.status = 'passed' AND smp.cleanup_verified AND smp.confirmed_at IS NOT NULL THEN
        jsonb_build_object('status', 'done', 'since', smp.confirmed_at)
      WHEN smp.status = 'passed' AND smp.confirmed_at IS NULL THEN jsonb_build_object('status', 'waiting_on_customer',
        'detail', 'Confirm the test worked, or tell your team what looked wrong.', 'staff_detail', 'Test passed; waiting for confirmation.')
      ELSE jsonb_build_object('status', 'in_progress', 'detail', 'Cleaning up the sample lead.', 'staff_detail', 'Sample passed; cleanup not verified yet.')
    END);

  -- 14. Go-live checks (staff)
  v_checks := public.onboarding_checks_compute(p_org_id);
  SELECT count(*) INTO v_fails FROM jsonb_array_elements(v_checks) c
  WHERE c->>'result' = 'fail' OR (c->>'result' = 'warning' AND NOT COALESCE((c->>'accepted')::boolean, false));
  v_out := v_out || jsonb_build_object('go_live_checks',
    CASE WHEN v_fails = 0 THEN jsonb_build_object('status', 'done')
      ELSE jsonb_build_object('status', 'waiting_on_team', 'detail', 'Your team is finishing the final checks.',
        'staff_detail', v_fails || ' check(s) not passing yet.') END,
    '_checks', v_checks);

  -- 15. Go live
  v_out := v_out || jsonb_build_object('go_live',
    CASE
      WHEN h.phase IN ('live', 'settled') THEN jsonb_build_object('status', 'done', 'since', h.go_live_approved_at)
      WHEN h.phase = 'activating' THEN jsonb_build_object('status', 'in_progress',
        'detail', 'Approved. Your agents are being switched on one at a time.', 'staff_detail', 'Approved; staged activation under way.',
        'since', h.go_live_approved_at)
      WHEN h.owner_confirmed_at IS NOT NULL THEN jsonb_build_object('status', 'waiting_on_team',
        'detail', 'You are ready. Your team is reviewing and will approve going live.',
        'staff_detail', 'The Owner confirmed they are ready. Review and approve.', 'since', h.owner_confirmed_at)
      ELSE jsonb_build_object('status', 'waiting_on_customer', 'detail', 'When your steps are done, review and confirm you are ready.',
        'staff_detail', 'Waiting for the Owner to confirm they are ready.')
    END);

  -- 16. First-week check-in
  v_out := v_out || jsonb_build_object('first_week',
    CASE
      WHEN h.phase = 'settled' THEN jsonb_build_object('status', 'done', 'since', h.settled_at)
      WHEN h.phase IN ('live', 'activating') THEN jsonb_build_object('status', 'in_progress',
        'detail', 'Your team checks in on days 1, 3, and 7.', 'staff_detail', 'Check-ins scheduled.')
      ELSE jsonb_build_object('status', 'not_started')
    END);

  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Go-live checks: Prompt 2's configuration check plus the onboarding ones
-- ---------------------------------------------------------------------------

/**
 * Each check: key, label, result (pass, warning, fail), a plain reason, a
 * link to fix it, and whether a Platform Admin accepted it (warnings only).
 * An accepted warning that has since become a failure is a failure again.
 */
CREATE OR REPLACE FUNCTION public.onboarding_checks_compute(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  h public.workspace_onboarding_status%ROWTYPE;
  mr public.messaging_readiness%ROWTYPE;
  em public.email_domain_setup%ROWTYPE;
  imp public.onboarding_import_runs%ROWTYPE;
  smp public.onboarding_sample_runs%ROWTYPE;
  cr public.config_readiness%ROWTYPE;
  b public.workspace_billing%ROWTYPE;
  v_values jsonb;
  v_version text;
  v_crm text;
  v_crm_verified timestamptz;
  v_approvers integer;
  v_contacts_accepted integer;
  v_contacts_verified integer;
  v_blocking integer;
  v_list jsonb := '[]'::jsonb;
  v_out jsonb := '[]'::jsonb;
  c jsonb;
  a public.onboarding_check_acceptances%ROWTYPE;
  v_ws text := '/app/team/onboarding/' || p_org_id::text;
BEGIN
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  SELECT * INTO h FROM public.workspace_onboarding_status WHERE org_id = p_org_id;
  SELECT * INTO mr FROM public.messaging_readiness WHERE org_id = p_org_id;
  SELECT * INTO em FROM public.email_domain_setup WHERE org_id = p_org_id;
  SELECT * INTO imp FROM public.onboarding_import_runs WHERE org_id = p_org_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO smp FROM public.onboarding_sample_runs WHERE org_id = p_org_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO cr FROM public.config_readiness WHERE org_id = p_org_id;
  SELECT * INTO b FROM public.workspace_billing WHERE org_id = p_org_id;
  BEGIN
    v_values := public.config_effective_at(p_org_id) -> 'values';
    v_version := public.config_version_stamp(p_org_id);
  EXCEPTION WHEN OTHERS THEN
    v_values := '{}'::jsonb;
    v_version := NULL;
  END;
  SELECT CASE WHEN bool_or(x.status = 'active') THEN 'active' WHEN bool_or(x.status = 'broken') THEN 'broken' WHEN count(*) > 0 THEN 'inactive' END,
         max(x.last_verified_at)
  INTO v_crm, v_crm_verified
  FROM public.ghl_connections x WHERE x.org_id = p_org_id;
  SELECT count(*) INTO v_approvers FROM public.org_members m
  WHERE m.org_id = p_org_id AND m.active AND m.seat = 'customer' AND m.last_seen_at IS NOT NULL
    AND (m.role = 'owner' OR (m.role = 'member' AND m.can_approve));
  SELECT count(*) FILTER (WHERE m.active), count(*) FILTER (WHERE m.active AND ec.verified_at IS NOT NULL)
  INTO v_contacts_accepted, v_contacts_verified
  FROM public.workspace_escalation_contacts ec
  LEFT JOIN public.org_members m ON m.id = ec.member_id
  WHERE ec.org_id = p_org_id;

  -- Prompt 2: the configuration go-live check, for the configuration as it is now.
  v_list := v_list || jsonb_build_object('key', 'configuration', 'label', 'Configuration complete',
    'result', CASE WHEN cr.ready AND cr.config_version IS NOT DISTINCT FROM v_version THEN 'pass' ELSE 'fail' END,
    'reason', CASE
      WHEN cr.org_id IS NULL OR NOT cr.ready THEN 'The configuration go-live checklist has not been marked ready.'
      WHEN cr.config_version IS DISTINCT FROM v_version THEN 'The configuration changed after it was marked ready. Check it again.'
      ELSE 'Every required setting is filled in and the test run passed.' END,
    'fix_href', '/app/settings/configuration', 'fix_label', 'Open configuration');

  v_list := v_list || jsonb_build_object('key', 'crm', 'label', 'CRM connected and recently synced',
    'result', CASE
      WHEN v_crm = 'active' AND v_crm_verified > now() - interval '24 hours' THEN 'pass'
      WHEN v_crm = 'active' THEN 'warning'
      ELSE 'fail' END,
    'reason', CASE
      WHEN v_crm = 'active' AND v_crm_verified > now() - interval '24 hours' THEN 'Connected, and checked in the last day.'
      WHEN v_crm = 'active' THEN 'Connected, but not checked in the last day. Run a connection check.'
      WHEN v_crm = 'broken' THEN 'The CRM connection is broken. Reconnect it.'
      ELSE 'The CRM is not connected.' END,
    'fix_href', '/app/team/connections', 'fix_label', 'Open connections');

  v_list := v_list || jsonb_build_object('key', 'messaging', 'label', 'Texting number registered and approved',
    'result', CASE
      WHEN NOT COALESCE(h.texting_enabled, true) AND NULLIF(btrim(COALESCE(h.texting_off_reason, '')), '') IS NOT NULL THEN 'pass'
      WHEN mr.carrier_status = 'approved' AND mr.sender_number_confirmed_at IS NOT NULL THEN 'pass'
      ELSE 'fail' END,
    'reason', CASE
      WHEN NOT COALESCE(h.texting_enabled, true) THEN 'Going live without texting: ' || COALESCE(h.texting_off_reason, 'no reason recorded') || '.'
      WHEN mr.carrier_status = 'approved' AND mr.sender_number_confirmed_at IS NOT NULL THEN 'Approved by the carriers, and the sending number is confirmed.'
      WHEN mr.carrier_status = 'approved' THEN 'Approved, but the sending number is not confirmed yet.'
      WHEN mr.carrier_status = 'pending' THEN 'Waiting for carrier approval.'
      WHEN mr.carrier_status = 'rejected' THEN 'The carriers rejected the registration. Fix it and resubmit.'
      ELSE 'Carrier registration has not been submitted.' END,
    'fix_href', v_ws || '#messaging', 'fix_label', 'Open messaging');

  v_list := v_list || jsonb_build_object('key', 'email_domain', 'label', 'Email domain verified',
    'result', CASE
      WHEN NOT COALESCE(h.email_enabled, true) THEN 'pass'
      WHEN em.verified_at IS NOT NULL OR mr.sending_domain_confirmed_at IS NOT NULL THEN 'pass'
      ELSE 'fail' END,
    'reason', CASE
      WHEN NOT COALESCE(h.email_enabled, true) THEN 'This workspace does not send email: ' || COALESCE(h.email_off_reason, 'no reason recorded') || '.'
      WHEN em.verified_at IS NOT NULL OR mr.sending_domain_confirmed_at IS NOT NULL THEN 'The sending domain is verified.'
      ELSE 'The sending domain is not verified yet.' END,
    'fix_href', v_ws || '#email', 'fix_label', 'Open email domain');

  v_list := v_list || jsonb_build_object('key', 'approver', 'label', 'At least one approver',
    'result', CASE WHEN v_approvers > 0 THEN 'pass' ELSE 'fail' END,
    'reason', CASE WHEN v_approvers > 0 THEN v_approvers || ' approver(s) who have signed in.'
      ELSE 'No approver has accepted their invitation and signed in.' END,
    'fix_href', v_ws || '#people', 'fix_label', 'Open people');

  v_list := v_list || jsonb_build_object('key', 'escalation_contact', 'label', 'At least one escalation contact',
    'result', CASE WHEN v_contacts_verified > 0 THEN 'pass' WHEN v_contacts_accepted > 0 THEN 'warning' ELSE 'fail' END,
    'reason', CASE
      WHEN v_contacts_verified > 0 THEN v_contacts_verified || ' contact(s) confirmed a test notification.'
      WHEN v_contacts_accepted > 0 THEN 'Contacts have accounts but none has confirmed a test notification.'
      ELSE 'No escalation contact has accepted their invitation.' END,
    'fix_href', v_ws || '#people', 'fix_label', 'Open people');

  v_list := v_list || jsonb_build_object('key', 'compliance', 'label', 'Quiet hours and compliance rules in place',
    'result', CASE
      WHEN v_values ? 'compliance.quiet_hours' AND jsonb_array_length(COALESCE(v_values -> 'compliance.opt_out_words', '[]'::jsonb)) > 0
        AND COALESCE((v_values ->> 'compliance.daily_cap_per_lead')::numeric, 0) > 0 THEN 'pass'
      ELSE 'fail' END,
    'reason', CASE
      WHEN NOT (v_values ? 'compliance.quiet_hours') THEN 'Quiet hours are not set.'
      WHEN jsonb_array_length(COALESCE(v_values -> 'compliance.opt_out_words', '[]'::jsonb)) = 0 THEN 'No opt-out words are set.'
      WHEN COALESCE((v_values ->> 'compliance.daily_cap_per_lead')::numeric, 0) <= 0 THEN 'The daily message limit is not set.'
      ELSE 'Quiet hours, opt-out words, and the daily limit are in place.' END,
    'fix_href', '/app/settings/configuration', 'fix_label', 'Open configuration');

  v_list := v_list || jsonb_build_object('key', 'config_review', 'label', 'Staff configuration review signed off',
    'result', CASE WHEN h.config_review_signed_off_at IS NOT NULL AND h.config_review_version IS NOT DISTINCT FROM v_version THEN 'pass' ELSE 'fail' END,
    'reason', CASE
      WHEN h.config_review_signed_off_at IS NULL THEN 'Nobody has signed off the configuration review.'
      WHEN h.config_review_version IS DISTINCT FROM v_version THEN 'The configuration changed after the review. Review it again.'
      ELSE 'Signed off.' END,
    'fix_href', v_ws || '#review', 'fix_label', 'Open review');

  v_list := v_list || jsonb_build_object('key', 'sample_test', 'label', 'Sample lead test passed and cleaned up',
    'result', CASE WHEN smp.status = 'passed' AND smp.cleanup_verified THEN 'pass' ELSE 'fail' END,
    'reason', CASE
      WHEN smp.id IS NULL THEN 'No sample lead test has been run.'
      WHEN smp.status = 'passed' AND smp.cleanup_verified THEN 'Passed, and the sample lead was removed.'
      WHEN smp.status = 'passed' THEN 'Passed, but the cleanup has not been verified.'
      WHEN smp.status = 'failed' THEN 'The last test failed at ' || COALESCE(smp.failed_step, 'a step') || '.'
      WHEN smp.status = 'problem_reported' THEN 'The Owner reported a problem with the test.'
      ELSE 'A test is still running.' END,
    'fix_href', v_ws || '#sample', 'fix_label', 'Open sample test');

  v_list := v_list || jsonb_build_object('key', 'lead_import', 'label', 'Lead import complete or running within limits',
    'result', CASE
      WHEN imp.status IN ('done', 'queued', 'running') THEN 'pass'
      WHEN imp.id IS NULL OR imp.status IN ('paused', 'cancelled') THEN 'warning'
      ELSE 'fail' END,
    'reason', CASE
      WHEN imp.status = 'done' THEN imp.imported || ' leads imported.'
      WHEN imp.status IN ('queued', 'running') THEN 'Still running, within the workspace''s limits.'
      WHEN imp.id IS NULL THEN 'No import has been started.'
      WHEN imp.status = 'paused' THEN 'The import is paused.'
      WHEN imp.status = 'cancelled' THEN 'The import was cancelled.'
      ELSE 'The import failed' || COALESCE(': ' || imp.last_error, '.') END,
    'fix_href', v_ws || '#import', 'fix_label', 'Open import');

  v_list := v_list || jsonb_build_object('key', 'billing', 'label', 'Billing in good standing',
    'result', CASE
      WHEN b.org_id IS NULL OR b.status IS NULL THEN 'warning'
      WHEN b.status IN ('active', 'trialing') AND b.payment_failed_at IS NULL THEN 'pass'
      ELSE 'fail' END,
    'reason', CASE
      WHEN b.org_id IS NULL OR b.status IS NULL THEN 'Billing is not set up for this workspace yet.'
      WHEN b.status IN ('active', 'trialing') AND b.payment_failed_at IS NULL THEN 'Billing is up to date.'
      WHEN b.payment_failed_at IS NOT NULL OR b.status IN ('past_due', 'unpaid') THEN 'A payment is past due.'
      ELSE 'The subscription is ' || replace(b.status, '_', ' ') || '.' END,
    'fix_href', '/app/settings/billing', 'fix_label', 'Open billing');

  SELECT
    (SELECT count(*) FROM public.staff_escalations e WHERE e.org_id = p_org_id AND e.status <> 'resolved' AND e.kind IN ('connection', 'agent_failure'))
    + CASE WHEN smp.status = 'problem_reported' THEN 1 ELSE 0 END
    + CASE WHEN v_crm = 'broken' THEN 1 ELSE 0 END
    + (SELECT count(*) FROM public.workspace_onboarding_stages st WHERE st.org_id = p_org_id AND st.status = 'blocked' AND st.stage_key <> 'go_live_checks')
  INTO v_blocking;
  v_list := v_list || jsonb_build_object('key', 'no_blockers', 'label', 'No unresolved blocking issue',
    'result', CASE WHEN v_blocking = 0 THEN 'pass' ELSE 'fail' END,
    'reason', CASE WHEN v_blocking = 0 THEN 'Nothing is blocking this workspace.'
      ELSE v_blocking || ' blocking issue(s): a blocked setup step, a broken connection, an open connection or agent alert, or a reported test problem.' END,
    'fix_href', v_ws, 'fix_label', 'Open workbench');

  FOR c IN SELECT * FROM jsonb_array_elements(v_list) LOOP
    SELECT * INTO a FROM public.onboarding_check_acceptances WHERE org_id = p_org_id AND check_key = c->>'key';
    IF FOUND AND c->>'result' = 'warning' THEN
      c := c || jsonb_build_object('accepted', true, 'accepted_reason', a.reason, 'accepted_by', a.accepted_by_label, 'accepted_at', a.accepted_at);
    ELSE
      c := c || jsonb_build_object('accepted', false);
    END IF;
    v_out := v_out || c;
  END LOOP;
  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Refresh: write the record from the real state, log every change
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.onboarding_customer_state(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'done' THEN 'done'
    WHEN 'skipped' THEN 'skipped'
    WHEN 'waiting_on_customer' THEN 'waiting_on_customer'
    WHEN 'blocked' THEN 'blocked'
    WHEN 'in_progress' THEN 'in_progress'
    WHEN 'not_started' THEN 'coming_next'
    ELSE 'waiting_on_team'
  END;
$$;

/** Where a customer acts on a stage. */
CREATE OR REPLACE FUNCTION public.onboarding_stage_href(p_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_key
    WHEN 'approach' THEN '/app/onboarding/step/approach'
    WHEN 'business_details' THEN '/app/onboarding/step/business'
    WHEN 'crm' THEN '/app/onboarding/step/crm'
    WHEN 'messaging' THEN '/app/onboarding/step/messaging'
    WHEN 'email' THEN '/app/onboarding/step/email'
    WHEN 'approvers' THEN '/app/onboarding/step/approvers'
    WHEN 'escalation' THEN '/app/onboarding/step/escalation'
    WHEN 'team' THEN '/app/onboarding/step/team'
    WHEN 'lead_import' THEN '/app/onboarding/step/import'
    WHEN 'sample_test' THEN '/app/onboarding/step/test'
    WHEN 'go_live' THEN '/app/onboarding/step/review'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_refresh(p_org_id uuid)
RETURNS public.workspace_onboarding_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h public.workspace_onboarding_status%ROWTYPE;
  o public.organizations%ROWTYPE;
  s public.staff_support_settings%ROWTYPE := public.onboarding_settings();
  d public.onboarding_stage_definitions%ROWTYPE;
  r public.workspace_onboarding_stages%ROWTYPE;
  v_access text;
  v_comp jsonb;
  v_entry jsonb;
  v_final jsonb := '{}'::jsonb;
  v_status text;
  v_detail text;
  v_staff_detail text;
  v_since timestamptz;
  v_dep text;
  v_blocked_dep boolean;
  v_steps jsonb := '[]'::jsonb;
  v_current text;
  v_waiting_on text := 'nobody';
  v_waiting_since timestamptz;
  v_any_blocked text;
  v_cust_since timestamptz;
  v_stuck boolean := false;
  v_stuck_reason text;
  v_changed boolean := false;
  v_completed_by uuid;
  v_completed_label text;
  v_live boolean;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_access := public.ws_access(p_org_id);
    IF v_access IS NULL OR v_access = 'operator' THEN
      RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.workspace_onboarding_status (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  SELECT * INTO h FROM public.workspace_onboarding_status WHERE org_id = p_org_id FOR UPDATE;

  v_comp := public.onboarding_compute(p_org_id);

  FOR d IN SELECT * FROM public.onboarding_stage_definitions ORDER BY position LOOP
    v_entry := COALESCE(v_comp -> d.key, jsonb_build_object('status', 'not_started'));
    v_status := v_entry ->> 'status';
    v_detail := v_entry ->> 'detail';
    v_staff_detail := v_entry ->> 'staff_detail';
    v_since := (v_entry ->> 'since')::timestamptz;

    SELECT * INTO r FROM public.workspace_onboarding_stages WHERE org_id = p_org_id AND stage_key = d.key;

    IF r.manual_state = 'skipped' THEN
      v_status := 'skipped';
      v_detail := 'Skipped: ' || r.skip_reason;
      v_staff_detail := 'Skipped by staff: ' || r.skip_reason;
    ELSIF v_status NOT IN ('done', 'skipped') THEN
      v_blocked_dep := false;
      FOREACH v_dep IN ARRAY d.depends_on LOOP
        IF COALESCE(v_final ->> v_dep, 'not_started') NOT IN ('done', 'skipped') THEN
          v_blocked_dep := true;
        END IF;
      END LOOP;
      IF v_blocked_dep THEN
        v_status := 'not_started';
        v_detail := 'Coming next.';
        v_staff_detail := 'Waiting on: ' || array_to_string(d.depends_on, ', ') || '.';
      END IF;
    END IF;
    v_final := v_final || jsonb_build_object(d.key, v_status);

    v_completed_by := CASE d.key
      WHEN 'approach' THEN h.approach_confirmed_by
      WHEN 'config_review' THEN h.config_review_signed_off_by
      WHEN 'go_live' THEN h.go_live_approved_by
      ELSE NULL END;
    v_completed_label := CASE
      WHEN v_status = 'skipped' THEN COALESCE(r.completed_by_label, 'Skipped')
      WHEN v_completed_by IS NOT NULL THEN (SELECT label FROM public.ws_actor(p_org_id, v_completed_by))
      WHEN d.completion = 'automatic' THEN 'Detected automatically'
      ELSE NULL END;

    IF r.org_id IS NULL THEN
      INSERT INTO public.workspace_onboarding_stages (
        org_id, stage_key, status, detail, staff_detail, started_at, finished_at, completed_by, completed_by_label, waiting_since)
      VALUES (
        p_org_id, d.key, v_status, v_detail, v_staff_detail,
        CASE WHEN v_status <> 'not_started' THEN COALESCE(v_since, now()) END,
        CASE WHEN v_status IN ('done', 'skipped') THEN COALESCE(v_since, now()) END,
        CASE WHEN v_status = 'done' THEN v_completed_by END,
        CASE WHEN v_status IN ('done', 'skipped') THEN v_completed_label END,
        CASE WHEN v_status NOT IN ('done', 'skipped', 'not_started') THEN COALESCE(v_since, now()) END);
      v_changed := true;
      PERFORM public.ws_log(p_org_id, 'onboarding.stage_changed', 'workspace_onboarding_stages', d.key,
        jsonb_build_object('stage', d.key, 'from', NULL, 'to', v_status, 'automatic', true), NULL);
    ELSIF r.status IS DISTINCT FROM v_status OR r.detail IS DISTINCT FROM v_detail OR r.staff_detail IS DISTINCT FROM v_staff_detail THEN
      UPDATE public.workspace_onboarding_stages SET
        status = v_status,
        detail = v_detail,
        staff_detail = v_staff_detail,
        started_at = CASE WHEN started_at IS NULL AND v_status <> 'not_started' THEN COALESCE(v_since, now()) ELSE started_at END,
        finished_at = CASE
          WHEN v_status IN ('done', 'skipped') AND r.status NOT IN ('done', 'skipped') THEN COALESCE(v_since, now())
          WHEN v_status IN ('done', 'skipped') THEN finished_at
          ELSE NULL END,
        completed_by = CASE WHEN v_status = 'done' THEN v_completed_by END,
        completed_by_label = CASE WHEN v_status IN ('done', 'skipped') THEN v_completed_label END,
        waiting_since = CASE
          WHEN v_status IN ('done', 'skipped', 'not_started') THEN NULL
          WHEN r.status IS DISTINCT FROM v_status THEN COALESCE(v_since, now())
          ELSE waiting_since END,
        version = CASE WHEN r.status IS DISTINCT FROM v_status THEN version + 1 ELSE version END,
        updated_at = now()
      WHERE org_id = p_org_id AND stage_key = d.key;

      IF r.status IS DISTINCT FROM v_status THEN
        v_changed := true;
        PERFORM public.ws_log(p_org_id, 'onboarding.stage_changed', 'workspace_onboarding_stages', d.key,
          jsonb_build_object('stage', d.key, 'from', r.status, 'to', v_status, 'automatic', true), NULL);
        -- Tell the right people.
        IF v_status = 'blocked' OR (r.status = 'done' AND v_status NOT IN ('done', 'skipped')) THEN
          INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key, detail)
          VALUES (p_org_id, 'staff', CASE WHEN r.status = 'done' THEN 'stage_reverted' ELSE 'stage_blocked' END, d.key,
            jsonb_build_object('from', r.status, 'to', v_status, 'reason', v_staff_detail));
          IF d.owner IN ('customer', 'both') AND d.customer_visible THEN
            INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key, detail)
            VALUES (p_org_id, 'owner', 'needs_attention', d.key, jsonb_build_object('reason', v_detail));
          END IF;
        ELSIF v_status = 'waiting_on_customer' AND r.status IN ('not_started', 'waiting_on_team', 'in_progress') THEN
          INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key)
          VALUES (p_org_id, 'owner', 'needs_you', d.key);
        ELSIF v_status = 'done' AND d.owner IN ('customer', 'both') THEN
          INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key)
          VALUES (p_org_id, 'staff', 'customer_done', d.key);
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- The customer-facing copy of the record (Prompt 5's card, the setup flow).
  FOR d IN SELECT * FROM public.onboarding_stage_definitions WHERE customer_visible ORDER BY position LOOP
    SELECT * INTO r FROM public.workspace_onboarding_stages WHERE org_id = p_org_id AND stage_key = d.key;
    v_steps := v_steps || jsonb_strip_nulls(jsonb_build_object(
      'key', d.key,
      'label', d.customer_label,
      'why', d.why,
      'owner', d.owner,
      'estimate', d.time_estimate,
      'state', public.onboarding_customer_state(r.status),
      'status', r.status,
      'detail', r.detail,
      'note', r.note,
      'eta', r.eta,
      'waiting_since', r.waiting_since,
      'finished_at', r.finished_at,
      'required', d.required_for_go_live,
      'action', CASE WHEN r.status IN ('waiting_on_customer', 'blocked', 'in_progress') AND public.onboarding_stage_href(d.key) IS NOT NULL
        AND d.owner IN ('customer', 'both')
        THEN jsonb_build_object('label', CASE WHEN r.status = 'blocked' THEN 'Fix this' ELSE 'Continue' END, 'href', public.onboarding_stage_href(d.key)) END
    ));
  END LOOP;

  SELECT st.stage_key INTO v_current
  FROM public.workspace_onboarding_stages st
  JOIN public.onboarding_stage_definitions df ON df.key = st.stage_key
  WHERE st.org_id = p_org_id AND st.status NOT IN ('done', 'skipped', 'not_started')
  ORDER BY df.position LIMIT 1;

  SELECT st.stage_key INTO v_any_blocked
  FROM public.workspace_onboarding_stages st
  JOIN public.onboarding_stage_definitions df ON df.key = st.stage_key
  WHERE st.org_id = p_org_id AND st.status = 'blocked'
  ORDER BY df.position LIMIT 1;
  SELECT min(st.waiting_since) INTO v_cust_since
  FROM public.workspace_onboarding_stages st
  WHERE st.org_id = p_org_id AND st.status = 'waiting_on_customer';

  IF h.phase IN ('paused', 'cancelled', 'settled') THEN
    v_waiting_on := 'nobody';
  ELSIF v_any_blocked IS NOT NULL THEN
    v_waiting_on := 'team';
    v_stuck := true;
    v_stuck_reason := 'Blocked: ' || (SELECT staff_label FROM public.onboarding_stage_definitions WHERE key = v_any_blocked) || '.';
    SELECT waiting_since INTO v_waiting_since FROM public.workspace_onboarding_stages WHERE org_id = p_org_id AND stage_key = v_any_blocked;
  ELSIF v_cust_since IS NOT NULL AND EXISTS (SELECT 1 FROM public.workspace_onboarding_stages st WHERE st.org_id = p_org_id AND st.status IN ('waiting_on_team', 'in_progress')) THEN
    v_waiting_on := 'both';
    v_waiting_since := v_cust_since;
  ELSIF v_cust_since IS NOT NULL THEN
    v_waiting_on := 'customer';
    v_waiting_since := v_cust_since;
  ELSIF EXISTS (SELECT 1 FROM public.workspace_onboarding_stages st WHERE st.org_id = p_org_id AND st.status IN ('waiting_on_team', 'in_progress')) THEN
    v_waiting_on := 'team';
    SELECT min(st.waiting_since) INTO v_waiting_since FROM public.workspace_onboarding_stages st
    WHERE st.org_id = p_org_id AND st.status IN ('waiting_on_team', 'in_progress');
  END IF;
  IF NOT v_stuck AND h.phase NOT IN ('paused', 'cancelled', 'settled') AND v_cust_since IS NOT NULL
     AND v_cust_since < now() - make_interval(days => s.onboarding_stuck_customer_days) THEN
    v_stuck := true;
    v_stuck_reason := 'Waiting on the customer for more than ' || s.onboarding_stuck_customer_days || ' days.';
  END IF;

  v_live := h.phase IN ('live', 'settled');

  UPDATE public.workspace_onboarding_status SET
    steps = v_steps,
    current_stage = v_current,
    waiting_on = v_waiting_on,
    waiting_since = v_waiting_since,
    stuck = v_stuck,
    stuck_reason = v_stuck_reason,
    checks = COALESCE(v_comp -> 'go_live_checks' -> '_checks', v_comp -> '_checks', '[]'::jsonb),
    checks_at = now(),
    live = v_live,
    went_live_at = CASE WHEN v_live THEN COALESCE(went_live_at, go_live_approved_at, now()) ELSE NULL END,
    refreshed_at = now(),
    updated_at = CASE WHEN v_changed OR steps IS DISTINCT FROM v_steps OR stuck IS DISTINCT FROM v_stuck THEN now() ELSE updated_at END
  WHERE org_id = p_org_id
  RETURNING * INTO h;
  RETURN h;
END;
$$;

-- Prompt 5's name for the refresh; the home card and progress page call it.
DROP FUNCTION IF EXISTS public.onboarding_status_set_step(uuid, text, text, text, text);
CREATE OR REPLACE FUNCTION public.onboarding_status_refresh(p_org_id uuid)
RETURNS public.workspace_onboarding_status
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.onboarding_refresh(p_org_id);
$$;

-- ---------------------------------------------------------------------------
-- 12. Customer actions (the Owner's guided setup)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.onboarding_confirm_approach(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.onboarding_require_owner_or_staff(p_org_id);
  IF (SELECT industry_template_id FROM public.organizations WHERE id = p_org_id) IS NULL THEN
    RAISE EXCEPTION 'Your team has not chosen a starting setup yet.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.workspace_onboarding_status (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.workspace_onboarding_status
  SET approach_confirmed_at = now(), approach_confirmed_by = auth.uid(), updated_at = now()
  WHERE org_id = p_org_id;
  PERFORM public.ws_log(p_org_id, 'onboarding.approach_confirmed', 'workspace_onboarding_status', p_org_id::text, '{}'::jsonb, auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_request_approach_change(p_org_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note text := left(NULLIF(btrim(COALESCE(p_note, '')), ''), 1000);
BEGIN
  PERFORM public.onboarding_require_owner_or_staff(p_org_id);
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Tell your team what you would like to change.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.workspace_onboarding_status (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.workspace_onboarding_status
  SET approach_adjust_requested_at = now(), approach_adjust_note = v_note, updated_at = now()
  WHERE org_id = p_org_id;
  INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key) VALUES (p_org_id, 'staff', 'approach_change_requested', 'approach');
  PERFORM public.ws_log(p_org_id, 'onboarding.approach_change_requested', 'workspace_onboarding_status', p_org_id::text, '{}'::jsonb, auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_set_team_step(p_org_id uuid, p_state text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.onboarding_require_owner_or_staff(p_org_id);
  IF p_state IS NOT NULL AND p_state NOT IN ('done', 'later') THEN
    RAISE EXCEPTION 'Unknown choice.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.workspace_onboarding_status (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.workspace_onboarding_status SET team_step_state = p_state, updated_at = now() WHERE org_id = p_org_id;
  PERFORM public.ws_log(p_org_id, 'onboarding.team_step', 'workspace_onboarding_status', p_org_id::text,
    jsonb_build_object('state', p_state), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

/** Go live without texting, or without email. A reason is required either way. */
CREATE OR REPLACE FUNCTION public.onboarding_set_channel(p_org_id uuid, p_channel text, p_enabled boolean, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := left(NULLIF(btrim(COALESCE(p_reason, '')), ''), 300);
BEGIN
  PERFORM public.onboarding_require_owner_or_staff(p_org_id);
  IF p_channel NOT IN ('texting', 'email') THEN
    RAISE EXCEPTION 'Unknown channel.' USING ERRCODE = '22023';
  END IF;
  IF NOT p_enabled AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Say why, so your team knows.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.workspace_onboarding_status (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  IF p_channel = 'texting' THEN
    UPDATE public.workspace_onboarding_status
    SET texting_enabled = p_enabled, texting_off_reason = CASE WHEN p_enabled THEN NULL ELSE v_reason END, updated_at = now()
    WHERE org_id = p_org_id;
  ELSE
    UPDATE public.workspace_onboarding_status
    SET email_enabled = p_enabled, email_off_reason = CASE WHEN p_enabled THEN NULL ELSE v_reason END, updated_at = now()
    WHERE org_id = p_org_id;
  END IF;
  INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key, detail)
  VALUES (p_org_id, 'staff', 'channel_changed', CASE WHEN p_channel = 'texting' THEN 'messaging' ELSE 'email' END,
    jsonb_build_object('channel', p_channel, 'enabled', p_enabled));
  PERFORM public.ws_log(p_org_id, 'onboarding.channel_' || CASE WHEN p_enabled THEN 'on' ELSE 'off' END, 'workspace_onboarding_status',
    p_org_id::text, jsonb_build_object('channel', p_channel, 'reason', v_reason), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_request_crm_help(p_org_id uuid, p_crm_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.onboarding_require_owner_or_staff(p_org_id);
  INSERT INTO public.workspace_onboarding_status (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.workspace_onboarding_status SET crm_help_requested_at = now(), updated_at = now() WHERE org_id = p_org_id;
  INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key, detail)
  VALUES (p_org_id, 'staff', 'crm_help_requested', 'crm', jsonb_build_object('crm', left(NULLIF(btrim(COALESCE(p_crm_name, '')), ''), 80)));
  PERFORM public.ws_log(p_org_id, 'onboarding.crm_help_requested', 'workspace_onboarding_status', p_org_id::text, '{}'::jsonb, auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

/** The Owner says they are ready. Staff review and approve; it is never instant. */
CREATE OR REPLACE FUNCTION public.onboarding_owner_confirm(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h public.workspace_onboarding_status%ROWTYPE;
  v_missing text;
BEGIN
  IF public.ws_access(p_org_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  h := public.onboarding_refresh(p_org_id);
  IF h.phase NOT IN ('setup', 'ready_for_review') THEN
    RAISE EXCEPTION 'This workspace is not in setup.' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(d.customer_label, ', ' ORDER BY d.position) INTO v_missing
  FROM public.onboarding_stage_definitions d
  JOIN public.workspace_onboarding_stages st ON st.stage_key = d.key AND st.org_id = p_org_id
  WHERE d.key IN ('approvers', 'escalation', 'sample_test') AND st.status NOT IN ('done', 'skipped');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Finish these first: %.', v_missing USING ERRCODE = '22023';
  END IF;
  UPDATE public.workspace_onboarding_status
  SET owner_confirmed_at = now(), owner_confirmed_by = auth.uid(), phase = 'ready_for_review', updated_at = now()
  WHERE org_id = p_org_id;
  INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key) VALUES (p_org_id, 'staff', 'owner_confirmed', 'go_live');
  PERFORM public.ws_log(p_org_id, 'onboarding.owner_confirmed', 'workspace_onboarding_status', p_org_id::text, '{}'::jsonb, auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

/** The person's own welcome and day-7 prompt flags. */
CREATE OR REPLACE FUNCTION public.onboarding_member_flag(p_org_id uuid, p_flag text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid := public.user_member_id(p_org_id);
BEGIN
  IF v_member IS NULL THEN
    RETURN;
  END IF;
  IF p_flag NOT IN ('welcome', 'feedback') THEN
    RAISE EXCEPTION 'Unknown flag.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.onboarding_member_flags (org_id, member_id) VALUES (p_org_id, v_member) ON CONFLICT DO NOTHING;
  UPDATE public.onboarding_member_flags
  SET welcome_seen_at = CASE WHEN p_flag = 'welcome' THEN COALESCE(welcome_seen_at, now()) ELSE welcome_seen_at END,
      feedback_seen_at = CASE WHEN p_flag = 'feedback' THEN COALESCE(feedback_seen_at, now()) ELSE feedback_seen_at END
  WHERE org_id = p_org_id AND member_id = v_member;
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_feedback_submit(p_org_id uuid, p_rating integer, p_comment text, p_help_request_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF public.ws_access(p_org_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Choose a rating.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.onboarding_feedback (org_id, member_id, rating, comment, help_request_id)
  VALUES (p_org_id, public.user_member_id(p_org_id), p_rating, left(NULLIF(btrim(COALESCE(p_comment, '')), ''), 2000), p_help_request_id)
  RETURNING id INTO v_id;
  PERFORM public.onboarding_member_flag(p_org_id, 'feedback');
  PERFORM public.ws_log(p_org_id, 'onboarding.feedback', 'onboarding_feedback', v_id::text, jsonb_build_object('rating', p_rating), auth.uid());
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. Staff actions on stages
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.onboarding_stage_check_version(p_org_id uuid, p_key text, p_expected integer)
RETURNS public.workspace_onboarding_stages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.workspace_onboarding_stages%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.workspace_onboarding_stages WHERE org_id = p_org_id AND stage_key = p_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown stage.' USING ERRCODE = '22023';
  END IF;
  IF p_expected IS NOT NULL AND r.version <> p_expected THEN
    RAISE EXCEPTION 'Someone else changed this stage a moment ago. Reload and try again.' USING HINT = 'onboarding_conflict', ERRCODE = '40001';
  END IF;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_stage_skip(p_org_id uuid, p_key text, p_reason text, p_expected_version integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := left(NULLIF(btrim(COALESCE(p_reason, '')), ''), 300);
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to skip a stage.' USING ERRCODE = '22023';
  END IF;
  IF p_key IN ('workspace_created', 'go_live_checks', 'go_live') THEN
    RAISE EXCEPTION 'This stage cannot be skipped.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.onboarding_refresh(p_org_id);
  PERFORM public.onboarding_stage_check_version(p_org_id, p_key, p_expected_version);
  UPDATE public.workspace_onboarding_stages
  SET manual_state = 'skipped', skip_reason = v_reason, completed_by = auth.uid(),
      completed_by_label = public.onboarding_actor_label(p_org_id), updated_by = auth.uid(), version = version + 1, updated_at = now()
  WHERE org_id = p_org_id AND stage_key = p_key;
  PERFORM public.ws_log(p_org_id, 'onboarding.stage_skipped', 'workspace_onboarding_stages', p_key,
    jsonb_build_object('stage', p_key, 'reason', v_reason), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_stage_reopen(p_org_id uuid, p_key text, p_reason text, p_expected_version integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := left(NULLIF(btrim(COALESCE(p_reason, '')), ''), 300);
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reopen a stage.' USING ERRCODE = '22023';
  END IF;
  IF p_key IN ('go_live', 'go_live_checks', 'workspace_created') THEN
    RAISE EXCEPTION 'Use "Move back to onboarding" to reopen going live.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.onboarding_stage_check_version(p_org_id, p_key, p_expected_version);
  UPDATE public.workspace_onboarding_stages
  SET manual_state = NULL, skip_reason = NULL, completed_by = NULL, completed_by_label = NULL,
      updated_by = auth.uid(), version = version + 1, updated_at = now()
  WHERE org_id = p_org_id AND stage_key = p_key;
  UPDATE public.workspace_onboarding_status SET
    approach_confirmed_at = CASE WHEN p_key = 'approach' THEN NULL ELSE approach_confirmed_at END,
    approach_confirmed_by = CASE WHEN p_key = 'approach' THEN NULL ELSE approach_confirmed_by END,
    config_review_signed_off_at = CASE WHEN p_key = 'config_review' THEN NULL ELSE config_review_signed_off_at END,
    config_review_signed_off_by = CASE WHEN p_key = 'config_review' THEN NULL ELSE config_review_signed_off_by END,
    team_step_state = CASE WHEN p_key = 'team' THEN NULL ELSE team_step_state END,
    crm_help_requested_at = CASE WHEN p_key = 'crm' THEN NULL ELSE crm_help_requested_at END,
    updated_at = now()
  WHERE org_id = p_org_id;
  PERFORM public.ws_log(p_org_id, 'onboarding.stage_reopened', 'workspace_onboarding_stages', p_key,
    jsonb_build_object('stage', p_key, 'reason', v_reason), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

/** A customer-visible note and timing, and a staff-only note. */
CREATE OR REPLACE FUNCTION public.onboarding_stage_note(
  p_org_id uuid, p_key text, p_note text, p_staff_note text, p_eta text, p_expected_version integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  PERFORM public.onboarding_refresh(p_org_id);
  PERFORM public.onboarding_stage_check_version(p_org_id, p_key, p_expected_version);
  UPDATE public.workspace_onboarding_stages SET
    note = left(NULLIF(btrim(COALESCE(p_note, '')), ''), 300),
    staff_note = left(NULLIF(btrim(COALESCE(p_staff_note, '')), ''), 1000),
    eta = left(NULLIF(btrim(COALESCE(p_eta, '')), ''), 80),
    updated_by = auth.uid(), version = version + 1, updated_at = now()
  WHERE org_id = p_org_id AND stage_key = p_key;
  PERFORM public.ws_log(p_org_id, 'onboarding.stage_note', 'workspace_onboarding_stages', p_key,
    jsonb_build_object('stage', p_key, 'customer_note', p_note IS NOT NULL AND btrim(p_note) <> '', 'eta', left(p_eta, 80)), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_config_review_signoff(p_org_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  INSERT INTO public.workspace_onboarding_status (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.workspace_onboarding_status
  SET config_review_signed_off_at = now(), config_review_signed_off_by = auth.uid(),
      config_review_version = public.config_version_stamp(p_org_id), updated_at = now()
  WHERE org_id = p_org_id;
  PERFORM public.ws_log(p_org_id, 'onboarding.config_review_signed_off', 'workspace_onboarding_status', p_org_id::text,
    jsonb_build_object('version', public.config_version_stamp(p_org_id), 'note', left(p_note, 300)), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

/** Only a Platform Admin accepts a warning, with a reason. Failures cannot be accepted. */
CREATE OR REPLACE FUNCTION public.onboarding_accept_warning(p_org_id uuid, p_check_key text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check jsonb;
  v_reason text := left(NULLIF(btrim(COALESCE(p_reason, '')), ''), 500);
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a Platform Admin can accept a warning.' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Write the reason for accepting this warning.' USING ERRCODE = '22023';
  END IF;
  SELECT c INTO v_check FROM jsonb_array_elements(public.onboarding_checks_compute(p_org_id)) c WHERE c->>'key' = p_check_key;
  IF v_check IS NULL THEN
    RAISE EXCEPTION 'Unknown check.' USING ERRCODE = '22023';
  END IF;
  IF v_check->>'result' = 'fail' THEN
    RAISE EXCEPTION 'A failing check cannot be accepted. Fix it first.' USING ERRCODE = '22023';
  END IF;
  IF v_check->>'result' = 'pass' THEN
    RAISE EXCEPTION 'This check already passes.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.onboarding_check_acceptances (org_id, check_key, reason, accepted_by, accepted_by_label)
  VALUES (p_org_id, p_check_key, v_reason, auth.uid(), public.onboarding_actor_label(p_org_id))
  ON CONFLICT (org_id, check_key) DO UPDATE
    SET reason = EXCLUDED.reason, accepted_by = EXCLUDED.accepted_by, accepted_by_label = EXCLUDED.accepted_by_label, accepted_at = now();
  PERFORM public.ws_log(p_org_id, 'onboarding.warning_accepted', 'onboarding_check_acceptances', p_check_key,
    jsonb_build_object('check', p_check_key, 'reason', v_reason), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_revoke_acceptance(p_org_id uuid, p_check_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a Platform Admin can change an accepted warning.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.onboarding_check_acceptances WHERE org_id = p_org_id AND check_key = p_check_key;
  PERFORM public.ws_log(p_org_id, 'onboarding.warning_acceptance_removed', 'onboarding_check_acceptances', p_check_key, '{}'::jsonb, auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. Go-live approval and staged activation
-- ---------------------------------------------------------------------------

/** Moves the workspace's lifecycle state on behalf of the onboarding flow. */
CREATE OR REPLACE FUNCTION public.onboarding_set_org_status(p_org_id uuid, p_status public.workspace_status, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('vistrial.onboarding_status_change', '1', true);
  UPDATE public.organizations
  SET status = p_status, status_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_org_id;
  PERFORM set_config('vistrial.onboarding_status_change', '0', true);
  IF p_status IN ('paused', 'closed') THEN
    PERFORM public.halt_org_follow_up_sequences(p_org_id, NULL);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_approve_go_live(p_org_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h public.workspace_onboarding_status%ROWTYPE;
  v_blocking text;
  v_days integer[];
  v_day integer;
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Go-live is approved by a person.' USING ERRCODE = '42501';
  END IF;
  h := public.onboarding_refresh(p_org_id);
  IF (SELECT status FROM public.organizations WHERE id = p_org_id) <> 'onboarding' THEN
    RAISE EXCEPTION 'Only a workspace in onboarding can be approved to go live.' USING ERRCODE = '22023';
  END IF;
  IF h.owner_confirmed_at IS NULL OR h.phase <> 'ready_for_review' THEN
    RAISE EXCEPTION 'The Owner has not confirmed they are ready yet.' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(c->>'label', ', ') INTO v_blocking
  FROM jsonb_array_elements(public.onboarding_checks_compute(p_org_id)) c
  WHERE c->>'result' = 'fail' OR (c->>'result' = 'warning' AND NOT COALESCE((c->>'accepted')::boolean, false));
  IF v_blocking IS NOT NULL THEN
    RAISE EXCEPTION 'Go-live is blocked until these pass: %.', v_blocking USING ERRCODE = '22023', HINT = 'onboarding_checks_failing';
  END IF;

  PERFORM public.onboarding_set_org_status(p_org_id, 'active', 'Go-live approved');
  UPDATE public.workspace_onboarding_status
  SET phase = 'activating', go_live_approved_at = now(), go_live_approved_by = auth.uid(),
      go_live_approved_by_label = public.onboarding_actor_label(p_org_id), activation_paused_at = NULL,
      activation_paused_reason = NULL, updated_at = now()
  WHERE org_id = p_org_id;

  INSERT INTO public.workspace_agent_activation (org_id, agent_id, stage, step_order)
  VALUES (p_org_id, 'scribe', 'off', 1), (p_org_id, 'sentry', 'off', 2), (p_org_id, 'relay', 'off', 3), (p_org_id, 'compass', 'off', 4)
  ON CONFLICT (org_id, agent_id) DO NOTHING;

  v_days := (public.onboarding_settings()).onboarding_checkin_days;
  FOREACH v_day IN ARRAY v_days LOOP
    INSERT INTO public.onboarding_checkins (org_id, day, due_at)
    VALUES (p_org_id, v_day, now() + make_interval(days => v_day))
    ON CONFLICT (org_id, day) DO UPDATE SET due_at = EXCLUDED.due_at, status = 'scheduled', completed_at = NULL, completed_by = NULL;
  END LOOP;

  INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key) VALUES (p_org_id, 'owner', 'go_live_approved', 'go_live');
  PERFORM public.ws_log(p_org_id, 'onboarding.go_live_approved', 'workspace_onboarding_status', p_org_id::text,
    jsonb_build_object('note', left(p_note, 300), 'platform_admin', public.is_platform_admin()), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

/** One activation step: Scribe, then Sentry (watch only), then Relay (drafts only), then Compass. */
CREATE OR REPLACE FUNCTION public.onboarding_activate_step(p_org_id uuid, p_agent_id text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h public.workspace_onboarding_status%ROWTYPE;
  a public.workspace_agent_activation%ROWTYPE;
  v_before text;
  v_stage text;
  v_watch_days integer;
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  SELECT * INTO h FROM public.workspace_onboarding_status WHERE org_id = p_org_id FOR UPDATE;
  IF h.phase NOT IN ('activating', 'live') THEN
    RAISE EXCEPTION 'Go-live has not been approved for this workspace.' USING ERRCODE = '22023';
  END IF;
  IF h.activation_paused_at IS NOT NULL THEN
    RAISE EXCEPTION 'Activation is paused. Resume it first.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM public.workspace_agent_activation WHERE org_id = p_org_id AND agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown agent.' USING ERRCODE = '22023';
  END IF;
  IF a.stage <> 'off' THEN
    RAISE EXCEPTION 'This step is already done.' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(x.agent_id, ', ' ORDER BY x.step_order) INTO v_before
  FROM public.workspace_agent_activation x
  WHERE x.org_id = p_org_id AND x.step_order < a.step_order AND x.stage = 'off';
  IF v_before IS NOT NULL THEN
    RAISE EXCEPTION 'Switch on % first. Agents go on in order.', v_before USING ERRCODE = '22023';
  END IF;

  v_stage := CASE p_agent_id WHEN 'scribe' THEN 'on' WHEN 'sentry' THEN 'watch' WHEN 'relay' THEN 'drafts_only' ELSE 'coming_soon' END;
  UPDATE public.workspace_agent_activation
  SET stage = v_stage, activated_at = now(), activated_by = auth.uid(), activated_by_label = public.onboarding_actor_label(p_org_id),
      note = left(NULLIF(btrim(COALESCE(p_note, '')), ''), 300), updated_at = now()
  WHERE org_id = p_org_id AND agent_id = p_agent_id;

  IF p_agent_id = 'sentry' THEN
    SELECT COALESCE(td.sentry_watch_days, 1) INTO v_watch_days
    FROM public.organizations o LEFT JOIN public.onboarding_template_defaults td ON td.template_id = o.industry_template_id
    WHERE o.id = p_org_id;
    -- Watch only: Sentry records what it would have alerted, tells nobody, and
    -- only watches leads that arrive from now on.
    INSERT INTO public.sentry_workspaces (org_id, mode, watch_from, activated_by, activated_at, updated_at)
    VALUES (p_org_id, 'practice', now(), auth.uid(), now(), now())
    ON CONFLICT (org_id) DO UPDATE SET mode = 'practice', watch_from = now(), activated_by = auth.uid(), activated_at = now(), updated_at = now();
    UPDATE public.workspace_onboarding_status
    SET sentry_watch_until = now() + make_interval(days => COALESCE(v_watch_days, 1)), updated_at = now()
    WHERE org_id = p_org_id;
  END IF;

  IF p_agent_id = 'compass' THEN
    UPDATE public.workspace_onboarding_status SET phase = 'live', updated_at = now() WHERE org_id = p_org_id AND phase = 'activating';
    INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key) VALUES (p_org_id, 'owner', 'live', 'go_live');
  ELSE
    INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key, detail)
    VALUES (p_org_id, 'owner', 'agent_on', 'go_live', jsonb_build_object('agent', p_agent_id, 'stage', v_stage));
  END IF;
  PERFORM public.ws_log(p_org_id, 'onboarding.agent_activated', 'workspace_agent_activation', p_agent_id,
    jsonb_build_object('agent', p_agent_id, 'stage', v_stage, 'note', left(p_note, 300)), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

/** After the watch-only period, a person switches Sentry's alerts on. Never automatic. */
CREATE OR REPLACE FUNCTION public.onboarding_sentry_full_on(p_org_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h public.workspace_onboarding_status%ROWTYPE;
  a public.workspace_agent_activation%ROWTYPE;
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'A person switches Sentry''s alerts on.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO h FROM public.workspace_onboarding_status WHERE org_id = p_org_id;
  SELECT * INTO a FROM public.workspace_agent_activation WHERE org_id = p_org_id AND agent_id = 'sentry';
  IF a.stage IS DISTINCT FROM 'watch' THEN
    RAISE EXCEPTION 'Sentry is not in watch-only mode.' USING ERRCODE = '22023';
  END IF;
  IF h.activation_paused_at IS NOT NULL THEN
    RAISE EXCEPTION 'Activation is paused. Resume it first.' USING ERRCODE = '22023';
  END IF;
  IF h.sentry_watch_until IS NOT NULL AND h.sentry_watch_until > now() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Sentry is still in its watch-only period until %. A Platform Admin can end it early.', to_char(h.sentry_watch_until, 'Mon DD HH24:MI "UTC"')
      USING ERRCODE = '22023';
  END IF;
  IF h.sentry_watch_until IS NOT NULL AND h.sentry_watch_until > now() AND NULLIF(btrim(COALESCE(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Say why the watch-only period is ending early.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.workspace_agent_activation
  SET stage = 'on', activated_at = now(), activated_by = auth.uid(), activated_by_label = public.onboarding_actor_label(p_org_id),
      note = left(NULLIF(btrim(COALESCE(p_note, '')), ''), 300), updated_at = now()
  WHERE org_id = p_org_id AND agent_id = 'sentry';
  UPDATE public.sentry_workspaces SET mode = 'live', activated_by = auth.uid(), activated_at = now(), updated_at = now() WHERE org_id = p_org_id;
  INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key, detail)
  VALUES (p_org_id, 'owner', 'agent_on', 'go_live', jsonb_build_object('agent', 'sentry', 'stage', 'on'));
  PERFORM public.ws_log(p_org_id, 'onboarding.sentry_alerts_on', 'workspace_agent_activation', 'sentry',
    jsonb_build_object('early', h.sentry_watch_until > now(), 'note', left(p_note, 300)), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_activation_pause(p_org_id uuid, p_paused boolean, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := left(NULLIF(btrim(COALESCE(p_reason, '')), ''), 300);
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  IF p_paused AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Say why the activation is paused.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.workspace_onboarding_status
  SET activation_paused_at = CASE WHEN p_paused THEN now() END,
      activation_paused_reason = CASE WHEN p_paused THEN v_reason END,
      updated_at = now()
  WHERE org_id = p_org_id AND phase IN ('activating', 'live');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no activation under way.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.ws_log(p_org_id, CASE WHEN p_paused THEN 'onboarding.activation_paused' ELSE 'onboarding.activation_resumed' END,
    'workspace_onboarding_status', p_org_id::text, jsonb_build_object('reason', v_reason), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

/** Back to onboarding (agents off), or paused (nothing runs). The customer is told. */
CREATE OR REPLACE FUNCTION public.onboarding_move_back(p_org_id uuid, p_target text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := left(NULLIF(btrim(COALESCE(p_reason, '')), ''), 300);
  v_status public.workspace_status;
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required.' USING ERRCODE = '22023';
  END IF;
  SELECT status INTO v_status FROM public.organizations WHERE id = p_org_id;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'This workspace is closed.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.workspace_onboarding_status (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  IF p_target = 'onboarding' THEN
    PERFORM public.onboarding_set_org_status(p_org_id, 'onboarding', v_reason);
    UPDATE public.workspace_agent_activation SET stage = 'off', activated_at = NULL, activated_by = NULL, activated_by_label = NULL,
      note = v_reason, updated_at = now()
    WHERE org_id = p_org_id;
    UPDATE public.sentry_workspaces SET mode = 'practice', updated_at = now() WHERE org_id = p_org_id AND mode = 'live';
    UPDATE public.workspace_onboarding_status SET
      phase = 'setup', owner_confirmed_at = NULL, owner_confirmed_by = NULL, go_live_approved_at = NULL, go_live_approved_by = NULL,
      go_live_approved_by_label = NULL, activation_paused_at = NULL, activation_paused_reason = NULL, sentry_watch_until = NULL,
      settled_at = NULL, paused_reason = v_reason, updated_at = now()
    WHERE org_id = p_org_id;
    DELETE FROM public.onboarding_checkins WHERE org_id = p_org_id AND status = 'scheduled';
  ELSIF p_target IN ('paused', 'cancelled') THEN
    PERFORM public.onboarding_set_org_status(p_org_id, 'paused', v_reason);
    UPDATE public.workspace_onboarding_status SET phase = p_target, paused_reason = v_reason, updated_at = now() WHERE org_id = p_org_id;
  ELSE
    RAISE EXCEPTION 'Choose onboarding, paused, or cancelled.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.onboarding_events (org_id, audience, kind, detail)
  VALUES (p_org_id, 'owner', 'moved_' || p_target, jsonb_build_object('reason', v_reason));
  PERFORM public.ws_log(p_org_id, 'onboarding.moved_' || p_target, 'workspace_onboarding_status', p_org_id::text,
    jsonb_build_object('reason', v_reason), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

/** From paused back to where it was: live if it had gone live, otherwise setup. */
CREATE OR REPLACE FUNCTION public.onboarding_resume(p_org_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h public.workspace_onboarding_status%ROWTYPE;
  v_all_on boolean;
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  SELECT * INTO h FROM public.workspace_onboarding_status WHERE org_id = p_org_id FOR UPDATE;
  IF h.phase NOT IN ('paused', 'cancelled') THEN
    RAISE EXCEPTION 'This workspace is not paused.' USING ERRCODE = '22023';
  END IF;
  SELECT bool_and(stage <> 'off') INTO v_all_on FROM public.workspace_agent_activation WHERE org_id = p_org_id;
  IF h.go_live_approved_at IS NOT NULL THEN
    PERFORM public.onboarding_set_org_status(p_org_id, 'active', NULLIF(btrim(COALESCE(p_reason, '')), ''));
    UPDATE public.workspace_onboarding_status
    SET phase = CASE WHEN COALESCE(v_all_on, false) THEN 'live' ELSE 'activating' END, paused_reason = NULL, updated_at = now()
    WHERE org_id = p_org_id;
  ELSE
    PERFORM public.onboarding_set_org_status(p_org_id, 'onboarding', NULLIF(btrim(COALESCE(p_reason, '')), ''));
    UPDATE public.workspace_onboarding_status
    SET phase = CASE WHEN owner_confirmed_at IS NOT NULL THEN 'ready_for_review' ELSE 'setup' END, paused_reason = NULL, updated_at = now()
    WHERE org_id = p_org_id;
  END IF;
  INSERT INTO public.onboarding_events (org_id, audience, kind) VALUES (p_org_id, 'owner', 'resumed');
  PERFORM public.ws_log(p_org_id, 'onboarding.resumed', 'workspace_onboarding_status', p_org_id::text,
    jsonb_build_object('reason', left(p_reason, 300)), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 15. First-week check-ins
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.onboarding_checkin_complete(p_checkin_id uuid, p_note text, p_facts jsonb DEFAULT '{}'::jsonb, p_follow_up_at timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.onboarding_checkins%ROWTYPE;
  v_open integer;
BEGIN
  SELECT * INTO c FROM public.onboarding_checkins WHERE id = p_checkin_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.onboarding_require_staff(c.org_id);
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'A person completes a check-in.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.onboarding_checkins SET
    status = 'done', staff_note = left(NULLIF(btrim(COALESCE(p_note, '')), ''), 2000),
    facts = COALESCE(p_facts, '{}'::jsonb), follow_up_at = p_follow_up_at,
    completed_by = auth.uid(), completed_by_label = public.onboarding_actor_label(c.org_id), completed_at = now()
  WHERE id = p_checkin_id;
  SELECT count(*) INTO v_open FROM public.onboarding_checkins WHERE org_id = c.org_id AND status <> 'done';
  IF v_open = 0 THEN
    UPDATE public.workspace_onboarding_status SET phase = 'settled', settled_at = now(), updated_at = now()
    WHERE org_id = c.org_id AND phase = 'live';
    PERFORM public.ws_log(c.org_id, 'onboarding.settled', 'workspace_onboarding_status', c.org_id::text, '{}'::jsonb, auth.uid());
  END IF;
  PERFORM public.ws_log(c.org_id, 'onboarding.checkin_done', 'onboarding_checkins', p_checkin_id::text,
    jsonb_build_object('day', c.day, 'follow_up_at', p_follow_up_at), auth.uid());
  PERFORM public.onboarding_refresh(c.org_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 16. Platform Admin settings: stage wording, estimates, timings, template defaults
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.onboarding_stage_definition_save(p_key text, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.onboarding_stage_definitions%ROWTYPE;
  v_deps text[];
  v_dep text;
BEGIN
  PERFORM public.staff_require_admin();
  SELECT * INTO d FROM public.onboarding_stage_definitions WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown stage.' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'depends_on' THEN
    SELECT COALESCE(array_agg(x), '{}') INTO v_deps FROM jsonb_array_elements_text(p_patch -> 'depends_on') x;
    FOREACH v_dep IN ARRAY v_deps LOOP
      IF NOT EXISTS (SELECT 1 FROM public.onboarding_stage_definitions WHERE key = v_dep AND position < d.position) THEN
        RAISE EXCEPTION 'A stage can only depend on stages that come before it.' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  ELSE
    v_deps := d.depends_on;
  END IF;
  UPDATE public.onboarding_stage_definitions SET
    customer_label = COALESCE(NULLIF(btrim(p_patch ->> 'customer_label'), ''), customer_label),
    staff_label = COALESCE(NULLIF(btrim(p_patch ->> 'staff_label'), ''), staff_label),
    why = COALESCE(NULLIF(btrim(p_patch ->> 'why'), ''), why),
    time_estimate = COALESCE(NULLIF(btrim(p_patch ->> 'time_estimate'), ''), time_estimate),
    depends_on = v_deps,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE key = p_key;
  PERFORM public.ws_log(NULL, 'onboarding.stage_definition_changed', 'onboarding_stage_definitions', p_key,
    jsonb_build_object('keys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(p_patch) k)), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_settings_save(p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ints integer[];
BEGIN
  PERFORM public.staff_require_admin();
  UPDATE public.staff_support_settings SET
    onboarding_invite_reminder_days = COALESCE((SELECT array_agg(x::int ORDER BY x::int) FROM jsonb_array_elements_text(p_patch -> 'onboarding_invite_reminder_days') x WHERE x ~ '^[0-9]{1,2}$'), onboarding_invite_reminder_days),
    onboarding_checkin_days = COALESCE((SELECT array_agg(x::int ORDER BY x::int) FROM jsonb_array_elements_text(p_patch -> 'onboarding_checkin_days') x WHERE x ~ '^[0-9]{1,2}$' AND x::int BETWEEN 1 AND 60), onboarding_checkin_days),
    onboarding_nudge_every_days = COALESCE((p_patch ->> 'onboarding_nudge_every_days')::int, onboarding_nudge_every_days),
    onboarding_nudge_max_per_step = COALESCE((p_patch ->> 'onboarding_nudge_max_per_step')::int, onboarding_nudge_max_per_step),
    onboarding_stuck_customer_days = COALESCE((p_patch ->> 'onboarding_stuck_customer_days')::int, onboarding_stuck_customer_days),
    onboarding_ai_case_file_limit = COALESCE((p_patch ->> 'onboarding_ai_case_file_limit')::int, onboarding_ai_case_file_limit),
    onboarding_ai_rate_per_hour = COALESCE((p_patch ->> 'onboarding_ai_rate_per_hour')::int, onboarding_ai_rate_per_hour),
    onboarding_ai_active_days = COALESCE((p_patch ->> 'onboarding_ai_active_days')::int, onboarding_ai_active_days),
    onboarding_max_lookback_days = COALESCE((p_patch ->> 'onboarding_max_lookback_days')::int, onboarding_max_lookback_days),
    onboarding_carrier_slow_days = COALESCE((p_patch ->> 'onboarding_carrier_slow_days')::int, onboarding_carrier_slow_days),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id;
  PERFORM public.ws_log(NULL, 'onboarding.settings_changed', 'staff_support_settings', 'onboarding',
    jsonb_build_object('keys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(p_patch) k)), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_template_defaults_save(p_template_id uuid, p_lookback_days integer, p_watch_days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  INSERT INTO public.onboarding_template_defaults (template_id, import_lookback_days, sentry_watch_days, updated_at, updated_by)
  VALUES (p_template_id, p_lookback_days, p_watch_days, now(), auth.uid())
  ON CONFLICT (template_id) DO UPDATE
    SET import_lookback_days = EXCLUDED.import_lookback_days, sentry_watch_days = EXCLUDED.sentry_watch_days,
        updated_at = now(), updated_by = auth.uid();
  PERFORM public.ws_log(NULL, 'onboarding.template_defaults_changed', 'onboarding_template_defaults', p_template_id::text,
    jsonb_build_object('lookback_days', p_lookback_days, 'watch_days', p_watch_days), auth.uid());
END;
$$;

/** Per-workspace staff details: internal note, plan, import pacing. */
CREATE OR REPLACE FUNCTION public.onboarding_staff_details_save(p_org_id uuid, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  INSERT INTO public.onboarding_staff_details (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.onboarding_staff_details SET
    internal_note = CASE WHEN p_patch ? 'internal_note' THEN left(NULLIF(btrim(p_patch ->> 'internal_note'), ''), 2000) ELSE internal_note END,
    intended_price_id = CASE WHEN p_patch ? 'intended_price_id' THEN NULLIF(btrim(p_patch ->> 'intended_price_id'), '') ELSE intended_price_id END,
    intended_plan_label = CASE WHEN p_patch ? 'intended_plan_label' THEN left(NULLIF(btrim(p_patch ->> 'intended_plan_label'), ''), 120) ELSE intended_plan_label END,
    ai_case_file_limit = CASE WHEN p_patch ? 'ai_case_file_limit' THEN (p_patch ->> 'ai_case_file_limit')::int ELSE ai_case_file_limit END,
    ai_rate_per_hour = CASE WHEN p_patch ? 'ai_rate_per_hour' THEN (p_patch ->> 'ai_rate_per_hour')::int ELSE ai_rate_per_hour END,
    ai_paused = CASE WHEN p_patch ? 'ai_paused' THEN (p_patch ->> 'ai_paused')::boolean ELSE ai_paused END,
    updated_at = now()
  WHERE org_id = p_org_id;
  PERFORM public.ws_log(p_org_id, 'onboarding.staff_details_changed', 'onboarding_staff_details', p_org_id::text,
    jsonb_build_object('keys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(p_patch) k)), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.set_staff_create_permission(p_user_id uuid, p_allowed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  UPDATE public.platform_staff SET can_create_workspaces = p_allowed WHERE user_id = p_user_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ws_log(NULL, CASE WHEN p_allowed THEN 'staff.create_workspaces_granted' ELSE 'staff.create_workspaces_revoked' END,
    'platform_staff', p_user_id::text, '{}'::jsonb, auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- 17. Messaging registration (no tax ID, ever), email domain
-- ---------------------------------------------------------------------------

/**
 * The app encrypts the details before calling this. Only field names are
 * logged, never values. The Owner may correct details but cannot read the
 * stored copy back; staff can.
 */
CREATE OR REPLACE FUNCTION public.messaging_registration_save(p_org_id uuid, p_ciphertext text, p_field_names text[], p_complete boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.onboarding_require_owner_or_staff(p_org_id);
  IF p_ciphertext IS NULL OR p_ciphertext !~ '^v1\.' THEN
    RAISE EXCEPTION 'The details could not be stored securely.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_field_names) f WHERE f ~* '(ein|tax|ssn|social)') THEN
    RAISE EXCEPTION 'Vistrial does not store tax IDs.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.messaging_registration_details (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.messaging_registration_details SET
    details_ciphertext = p_ciphertext,
    field_names = COALESCE(p_field_names, '{}'),
    fields_complete = COALESCE(p_complete, false),
    saved_at = now(), saved_by = auth.uid(), saved_by_label = public.onboarding_actor_label(p_org_id),
    updated_at = now()
  WHERE org_id = p_org_id;
  INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key) VALUES (p_org_id, 'staff', 'registration_saved', 'messaging');
  PERFORM public.ws_log(p_org_id, 'messaging.registration_saved', 'messaging_registration_details', p_org_id::text,
    jsonb_build_object('fields', to_jsonb(p_field_names), 'complete', p_complete), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_registration_set_status(
  p_org_id uuid, p_status text, p_rejection_code text DEFAULT NULL, p_note text DEFAULT NULL, p_external_reference text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text;
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  IF p_status = 'rejected' AND p_rejection_code IS NULL THEN
    RAISE EXCEPTION 'Choose the reason the carriers gave.' USING ERRCODE = '22023';
  END IF;
  SELECT carrier_status INTO v_prev FROM public.messaging_readiness WHERE org_id = p_org_id;
  PERFORM public.set_carrier_registration(p_org_id, p_status, p_note);
  INSERT INTO public.messaging_registration_details (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.messaging_registration_details SET
    rejection_code = CASE WHEN p_status = 'rejected' THEN p_rejection_code END,
    rejection_note = CASE WHEN p_status = 'rejected' THEN left(NULLIF(btrim(COALESCE(p_note, '')), ''), 500) END,
    rejected_at = CASE WHEN p_status = 'rejected' THEN now() ELSE rejected_at END,
    submitted_at = CASE WHEN p_status = 'pending' THEN now() ELSE submitted_at END,
    submitted_by = CASE WHEN p_status = 'pending' THEN auth.uid() ELSE submitted_by END,
    external_reference = COALESCE(left(NULLIF(btrim(COALESCE(p_external_reference, '')), ''), 120), external_reference),
    status_changed_at = now(),
    updated_at = now()
  WHERE org_id = p_org_id;
  IF v_prev IS DISTINCT FROM p_status THEN
    INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key, detail)
    VALUES (p_org_id, 'owner', 'messaging_status', 'messaging', jsonb_build_object('status', p_status, 'code', p_rejection_code));
  END IF;
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

/** Staff record that the tax ID was received and entered in the CRM. Nothing else is kept. */
CREATE OR REPLACE FUNCTION public.messaging_registration_ein(p_org_id uuid, p_done boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  INSERT INTO public.messaging_registration_details (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.messaging_registration_details
  SET ein_handled_at = CASE WHEN p_done THEN now() END, ein_handled_by = CASE WHEN p_done THEN auth.uid() END, updated_at = now()
  WHERE org_id = p_org_id;
  PERFORM public.ws_log(p_org_id, CASE WHEN p_done THEN 'messaging.ein_handled' ELSE 'messaging.ein_cleared' END,
    'messaging_registration_details', p_org_id::text, '{}'::jsonb, auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.email_domain_prepare(p_org_id uuid, p_domain text, p_records jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_clean jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  IF jsonb_typeof(COALESCE(p_records, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_records, '[]'::jsonb)) > 10 THEN
    RAISE EXCEPTION 'Add up to 10 records.' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_records, '[]'::jsonb)) LOOP
    IF upper(r->>'type') NOT IN ('TXT', 'CNAME', 'MX') OR NULLIF(btrim(r->>'host'), '') IS NULL OR NULLIF(btrim(r->>'value'), '') IS NULL
       OR char_length(r->>'host') > 255 OR char_length(r->>'value') > 2048 THEN
      RAISE EXCEPTION 'Each record needs a type (TXT, CNAME, or MX), a host, and a value.' USING ERRCODE = '22023';
    END IF;
    v_clean := v_clean || jsonb_build_object('type', upper(r->>'type'), 'host', lower(btrim(r->>'host')), 'value', btrim(r->>'value'),
      'purpose', left(NULLIF(btrim(COALESCE(r->>'purpose', '')), ''), 80));
  END LOOP;
  INSERT INTO public.email_domain_setup (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.email_domain_setup SET
    domain = lower(NULLIF(btrim(COALESCE(p_domain, '')), '')),
    records = v_clean, prepared_at = now(), prepared_by = auth.uid(),
    team_asked_at = NULL, last_result = '[]'::jsonb, verified_at = NULL, updated_at = now()
  WHERE org_id = p_org_id;
  INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key) VALUES (p_org_id, 'owner', 'email_records_ready', 'email');
  PERFORM public.ws_log(p_org_id, 'email.domain_prepared', 'email_domain_setup', p_org_id::text,
    jsonb_build_object('domain', lower(p_domain), 'records', jsonb_array_length(v_clean)), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.email_domain_ask_team(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.onboarding_require_owner_or_staff(p_org_id);
  INSERT INTO public.email_domain_setup (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.email_domain_setup SET team_asked_at = now(), updated_at = now() WHERE org_id = p_org_id;
  INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key) VALUES (p_org_id, 'staff', 'email_help_requested', 'email');
  PERFORM public.ws_log(p_org_id, 'email.domain_help_requested', 'email_domain_setup', p_org_id::text, '{}'::jsonb, auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

/** The app looked the records up; this records what it found. Service role only. */
CREATE OR REPLACE FUNCTION public.email_domain_record_check(p_org_id uuid, p_result jsonb, p_verified boolean, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.email_domain_setup SET
    last_checked_at = now(), last_result = COALESCE(p_result, '[]'::jsonb),
    verified_at = CASE WHEN p_verified THEN COALESCE(verified_at, now()) ELSE NULL END,
    updated_at = now()
  WHERE org_id = p_org_id;
  PERFORM public.ws_log(p_org_id, CASE WHEN p_verified THEN 'email.domain_verified' ELSE 'email.domain_checked' END,
    'email_domain_setup', p_org_id::text, jsonb_build_object('verified', p_verified), p_actor);
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 18. Escalation contacts
-- ---------------------------------------------------------------------------

/**
 * Replaces the ordered list. Each entry names a person in the workspace (or a
 * pending invitation) and a channel. A person keeps their confirmation if
 * their channel did not change.
 */
CREATE OR REPLACE FUNCTION public.escalation_contacts_save(p_org_id uuid, p_contacts jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e jsonb;
  v_pos integer := 0;
  v_member public.org_members%ROWTYPE;
  v_invite public.org_invites%ROWTYPE;
  v_prev jsonb;
  v_channel text;
BEGIN
  PERFORM public.onboarding_require_owner_or_staff(p_org_id);
  IF jsonb_typeof(COALESCE(p_contacts, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_contacts, '[]'::jsonb)) > 10 THEN
    RAISE EXCEPTION 'Choose up to 10 contacts.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(jsonb_object_agg(COALESCE(member_id::text, 'i:' || invite_id::text), jsonb_build_object('channel', channel, 'verified_at', verified_at, 'test_sent_at', test_sent_at)), '{}'::jsonb)
  INTO v_prev FROM public.workspace_escalation_contacts WHERE org_id = p_org_id;
  DELETE FROM public.workspace_escalation_contacts WHERE org_id = p_org_id;

  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_contacts, '[]'::jsonb)) LOOP
    v_pos := v_pos + 1;
    v_channel := COALESCE(e->>'channel', 'push');
    IF v_channel NOT IN ('push', 'email', 'sms') THEN
      RAISE EXCEPTION 'Choose app, email, or text for each contact.' USING ERRCODE = '22023';
    END IF;
    IF e ? 'member_id' AND NULLIF(e->>'member_id', '') IS NOT NULL THEN
      SELECT * INTO v_member FROM public.org_members
      WHERE id = (e->>'member_id')::uuid AND org_id = p_org_id AND seat = 'customer' AND active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Each contact must be someone in this workspace.' USING ERRCODE = '22023';
      END IF;
      IF v_channel = 'sms' AND NULLIF(btrim(COALESCE(v_member.phone, '')), '') IS NULL THEN
        RAISE EXCEPTION '% has no mobile number, so choose app or email for them.', COALESCE(NULLIF(btrim(v_member.display_name), ''), v_member.email)
          USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.workspace_escalation_contacts (org_id, position, member_id, display_name, channel, test_sent_at, verified_at, created_by)
      VALUES (p_org_id, v_pos, v_member.id, COALESCE(NULLIF(btrim(v_member.display_name), ''), v_member.email), v_channel,
        CASE WHEN v_prev -> v_member.id::text ->> 'channel' = v_channel THEN (v_prev -> v_member.id::text ->> 'test_sent_at')::timestamptz END,
        CASE WHEN v_prev -> v_member.id::text ->> 'channel' = v_channel THEN (v_prev -> v_member.id::text ->> 'verified_at')::timestamptz END,
        auth.uid());
    ELSIF e ? 'invite_id' THEN
      SELECT * INTO v_invite FROM public.org_invites
      WHERE id = (e->>'invite_id')::uuid AND org_id = p_org_id AND accepted_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'That invitation is no longer waiting.' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.workspace_escalation_contacts (org_id, position, invite_id, display_name, channel, created_by)
      VALUES (p_org_id, v_pos, v_invite.id, v_invite.email, v_channel, auth.uid());
    ELSE
      RAISE EXCEPTION 'Each contact must be someone in this workspace.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  PERFORM public.ws_log(p_org_id, 'escalation.contacts_saved', 'workspace_escalation_contacts', p_org_id::text,
    jsonb_build_object('count', v_pos), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.escalation_contact_test_sent(p_contact_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.workspace_escalation_contacts SET test_sent_at = now() WHERE id = p_contact_id;
$$;

/** The contact says they got the test notification. Only that person can. */
CREATE OR REPLACE FUNCTION public.escalation_contact_confirm(p_contact_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.workspace_escalation_contacts%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.workspace_escalation_contacts WHERE id = p_contact_id;
  IF NOT FOUND OR c.member_id IS NULL OR c.member_id IS DISTINCT FROM public.user_member_id(c.org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.workspace_escalation_contacts SET verified_at = COALESCE(verified_at, now()) WHERE id = p_contact_id;
  PERFORM public.ws_log(c.org_id, 'escalation.contact_confirmed', 'workspace_escalation_contacts', p_contact_id::text, '{}'::jsonb, auth.uid());
  PERFORM public.onboarding_refresh(c.org_id);
  RETURN c.org_id;
END;
$$;

-- An accepted invitation turns a pending contact into the person.
CREATE OR REPLACE FUNCTION public.escalation_contacts_link_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.seat = 'customer' AND NEW.active THEN
    UPDATE public.workspace_escalation_contacts c
    SET member_id = NEW.id, display_name = COALESCE(NULLIF(btrim(NEW.display_name), ''), NEW.email)
    FROM public.org_invites i
    WHERE c.org_id = NEW.org_id AND c.member_id IS NULL AND c.invite_id = i.id AND lower(i.email) = lower(NEW.email);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS org_members_link_escalation_contacts ON public.org_members;
CREATE TRIGGER org_members_link_escalation_contacts
  AFTER INSERT OR UPDATE OF active ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.escalation_contacts_link_member();

-- ---------------------------------------------------------------------------
-- 19. Lead import
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.onboarding_import_start(p_org_id uuid, p_lookback_days integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_max integer := (public.onboarding_settings()).onboarding_max_lookback_days;
BEGIN
  PERFORM public.onboarding_require_owner_or_staff(p_org_id);
  IF p_lookback_days IS NULL OR p_lookback_days < 1 OR p_lookback_days > v_max THEN
    RAISE EXCEPTION 'Choose between 1 and % days.', v_max USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ghl_connections WHERE org_id = p_org_id AND status = 'active') THEN
    RAISE EXCEPTION 'Connect your CRM first.' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM public.onboarding_import_runs WHERE org_id = p_org_id AND status IN ('queued', 'running', 'paused');
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  INSERT INTO public.onboarding_import_runs (org_id, lookback_days, window_start, requested_by, requested_by_label)
  VALUES (p_org_id, p_lookback_days, now() - make_interval(days => p_lookback_days), auth.uid(), public.onboarding_actor_label(p_org_id))
  RETURNING id INTO v_id;
  PERFORM public.ws_log(p_org_id, 'onboarding.import_started', 'onboarding_import_runs', v_id::text,
    jsonb_build_object('lookback_days', p_lookback_days), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_import_control(p_org_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.onboarding_require_owner_or_staff(p_org_id);
BEGIN
  IF p_action IN ('pause', 'resume', 'retry') AND v_access NOT IN ('platform_admin', 'service_team') THEN
    RAISE EXCEPTION 'Your team manages the import pace.' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'pause' THEN
    UPDATE public.onboarding_import_runs SET status = 'paused', paused_at = now(), paused_by = auth.uid(), claimed_at = NULL, updated_at = now()
    WHERE org_id = p_org_id AND status IN ('queued', 'running');
  ELSIF p_action = 'resume' THEN
    UPDATE public.onboarding_import_runs SET status = 'queued', paused_at = NULL, paused_by = NULL, updated_at = now()
    WHERE org_id = p_org_id AND status = 'paused';
  ELSIF p_action = 'retry' THEN
    UPDATE public.onboarding_import_runs SET status = 'queued', last_error = NULL, attempts = 0, claimed_at = NULL, updated_at = now()
    WHERE id = (SELECT id FROM public.onboarding_import_runs WHERE org_id = p_org_id AND status = 'failed' ORDER BY created_at DESC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM public.onboarding_import_runs WHERE org_id = p_org_id AND status IN ('queued', 'running', 'paused'));
  ELSIF p_action = 'cancel' THEN
    UPDATE public.onboarding_import_runs SET status = 'cancelled', finished_at = now(), claimed_at = NULL, updated_at = now()
    WHERE org_id = p_org_id AND status IN ('queued', 'running', 'paused');
  ELSE
    RAISE EXCEPTION 'Unknown action.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.ws_log(p_org_id, 'onboarding.import_' || p_action, 'onboarding_import_runs', p_org_id::text, '{}'::jsonb, auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_import_problem_decide(p_problem_id uuid, p_decision text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.onboarding_import_problems%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.onboarding_import_problems WHERE id = p_problem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.onboarding_require_owner_or_staff(p.org_id);
  IF p_decision NOT IN ('keep', 'skip', 'pending') THEN
    RAISE EXCEPTION 'Unknown decision.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.onboarding_import_problems SET decision = p_decision, decided_by = auth.uid(), decided_at = now() WHERE id = p_problem_id;
  -- Skipping an imported lead removes it again (it was never worked).
  IF p_decision = 'skip' AND p.lead_id IS NOT NULL AND public.lead_is_historic(p.lead_id) THEN
    DELETE FROM public.leads WHERE id = p.lead_id AND org_id = p.org_id
      AND NOT EXISTS (SELECT 1 FROM public.touches t WHERE t.lead_id = p.lead_id)
      AND NOT EXISTS (SELECT 1 FROM public.calls c WHERE c.lead_id = p.lead_id);
  END IF;
  PERFORM public.ws_log(p.org_id, 'onboarding.import_problem_decided', 'onboarding_import_problems', p_problem_id::text,
    jsonb_build_object('kind', p.kind, 'decision', p_decision), auth.uid());
END;
$$;

/**
 * Writes one page of imported leads, their historic marks, basic case files
 * and data problems in a single transaction, so no job ever sees an imported
 * lead without its mark. A CRM contact already in Vistrial is left alone.
 * Returns the leads created. Service role only (the import job).
 */
CREATE OR REPLACE FUNCTION public.onboarding_import_write(p_org_id uuid, p_run_id uuid, p_rows jsonb)
RETURNS TABLE (lead_id uuid, ghl_contact_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  r jsonb;
  v_id uuid;
  k text;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) LOOP
    INSERT INTO public.leads (org_id, ghl_contact_id, first_name, last_name, email, phone, source, status, timezone, opted_in_at,
      do_not_contact, do_not_contact_reason, do_not_contact_at)
    VALUES (p_org_id, r->>'ghl_contact_id', r->>'first_name', r->>'last_name', r->>'email', r->>'phone', r->>'source', 'new',
      r->>'timezone', COALESCE((r->>'opted_in_at')::timestamptz, now()),
      COALESCE((r->>'do_not_contact')::boolean, false),
      CASE WHEN COALESCE((r->>'do_not_contact')::boolean, false) THEN 'Marked do-not-contact in your CRM' END,
      CASE WHEN COALESCE((r->>'do_not_contact')::boolean, false) THEN now() END)
    ON CONFLICT (org_id, ghl_contact_id) DO NOTHING
    RETURNING id INTO v_id;
    CONTINUE WHEN v_id IS NULL;
    INSERT INTO public.lead_import_marks (lead_id, org_id, run_id, crm_created_at, crm_last_activity_at, ai_state)
    VALUES (v_id, p_org_id, p_run_id, (r->>'crm_created_at')::timestamptz, (r->>'crm_last_activity_at')::timestamptz,
      CASE WHEN COALESCE((r->>'ai_eligible')::boolean, false) THEN 'eligible' ELSE 'none' END);
    INSERT INTO public.case_files (org_id, lead_id, status, depth, summary, built_at)
    VALUES (p_org_id, v_id, 'ready', 'basic', left(r->>'summary', 1200), now())
    ON CONFLICT (org_id, lead_id) DO NOTHING;
    FOR k IN SELECT jsonb_array_elements_text(COALESCE(r->'problems', '[]'::jsonb)) LOOP
      INSERT INTO public.onboarding_import_problems (org_id, run_id, kind, crm_ref, display_label, lead_id)
      VALUES (p_org_id, p_run_id, k, r->>'ghl_contact_id', left(COALESCE(r->>'label', 'A contact'), 120), v_id)
      ON CONFLICT (org_id, kind, crm_ref) DO NOTHING;
    END LOOP;
    lead_id := v_id;
    ghl_contact_id := r->>'ghl_contact_id';
    RETURN NEXT;
  END LOOP;
END;
$$;

/** One decision for every waiting problem of a kind (the Owner decides by group). */
CREATE OR REPLACE FUNCTION public.onboarding_import_problems_decide_kind(p_org_id uuid, p_kind text, p_decision text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.onboarding_import_problems%ROWTYPE;
  v_n integer := 0;
BEGIN
  PERFORM public.onboarding_require_owner_or_staff(p_org_id);
  IF p_decision NOT IN ('keep', 'skip') THEN
    RAISE EXCEPTION 'Unknown decision.' USING ERRCODE = '22023';
  END IF;
  FOR p IN SELECT * FROM public.onboarding_import_problems WHERE org_id = p_org_id AND kind = p_kind AND decision = 'pending' LOOP
    PERFORM public.onboarding_import_problem_decide(p.id, p_decision);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

/** A person brings a historic lead back, so agents treat it like any other. */
CREATE OR REPLACE FUNCTION public.lead_reactivate(p_lead_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.lead_import_marks%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.lead_import_marks WHERE lead_id = p_lead_id;
  IF NOT FOUND OR NOT public.ws_can_work_lead(m.org_id, p_lead_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.lead_import_marks
  SET reactivated_at = COALESCE(reactivated_at, now()), reactivated_by = auth.uid(),
      reactivation_reason = left(COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), 'Brought back by a person'), 300)
  WHERE lead_id = p_lead_id;
  PERFORM public.ws_log(m.org_id, 'lead.reactivated', 'lead_import_marks', p_lead_id::text, '{}'::jsonb, auth.uid());
END;
$$;

-- Reactivation rule: a historic lead comes back when a person works it, or
-- the lead gets in touch again, after the import. Importing never does it.
CREATE OR REPLACE FUNCTION public.lead_import_marks_reactivate_on_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE public.lead_import_marks m
  SET reactivated_at = now(),
      reactivation_reason = CASE WHEN TG_TABLE_NAME = 'calls' THEN 'A call was logged after the import.'
        ELSE 'New activity after the import.' END
  WHERE m.lead_id = NEW.lead_id AND m.reactivated_at IS NULL
    AND COALESCE((to_jsonb(NEW) ->> 'occurred_at')::timestamptz, (to_jsonb(NEW) ->> 'created_at')::timestamptz, now()) > m.imported_at;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS touches_reactivate_historic ON public.touches;
CREATE TRIGGER touches_reactivate_historic AFTER INSERT ON public.touches
  FOR EACH ROW EXECUTE FUNCTION public.lead_import_marks_reactivate_on_activity();
DROP TRIGGER IF EXISTS calls_reactivate_historic ON public.calls;
CREATE TRIGGER calls_reactivate_historic AFTER INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.lead_import_marks_reactivate_on_activity();

-- ---------------------------------------------------------------------------
-- 20. The guards: historic leads get no clocks, alerts, or drafts; the sample
--     lead never sends. Enforced here so every job and screen is covered.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.onboarding_guard_lead_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL AND public.lead_is_historic(NEW.lead_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sentry_clocks', 'sentry_alerts', 'relay_jobs', 'relay_drafts', 'follow_up_sequence_runs', 'follow_up_drafts'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_historic_guard', t);
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.onboarding_guard_lead_row()',
        t || '_historic_guard', t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.onboarding_guard_approval_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.lead_import_marks m WHERE m.lead_id = ANY (NEW.lead_ids) AND m.reactivated_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS approval_items_historic_guard ON public.approval_items;
CREATE TRIGGER approval_items_historic_guard BEFORE INSERT ON public.approval_items
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_guard_approval_items();

-- Notifications never name a historic lead. A notice about only historic
-- leads is not created at all; a batch never gains one.
CREATE OR REPLACE FUNCTION public.onboarding_guard_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kept uuid[];
BEGIN
  IF NEW.subject_ids IS NULL OR cardinality(NEW.subject_ids) = 0 THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lead_import_marks m WHERE m.lead_id = ANY (NEW.subject_ids) AND m.reactivated_at IS NULL) THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(array_agg(x), '{}') INTO v_kept
  FROM unnest(NEW.subject_ids) x
  WHERE NOT EXISTS (SELECT 1 FROM public.lead_import_marks m WHERE m.lead_id = x AND m.reactivated_at IS NULL);
  IF cardinality(v_kept) = 0 THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NULL;
    END IF;
    NEW.subject_ids := OLD.subject_ids;
    RETURN NEW;
  END IF;
  NEW.subject_ids := v_kept;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notifications_historic_guard ON public.notifications;
CREATE TRIGGER notifications_historic_guard BEFORE INSERT OR UPDATE OF subject_ids ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_guard_notifications();

-- The sample lead never sends: any message to it is recorded as not sent.
CREATE OR REPLACE FUNCTION public.ghl_dispatches_sample_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.leads l WHERE l.id = NEW.lead_id AND l.is_test) THEN
    NEW.status := 'suppressed';
    NEW.failure_reason := 'sample_lead_never_sends';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ghl_dispatches_sample_guard ON public.ghl_dispatches;
CREATE TRIGGER ghl_dispatches_sample_guard BEFORE INSERT ON public.ghl_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.ghl_dispatches_sample_guard();

-- ---------------------------------------------------------------------------
-- 21. Sample lead cleanup, verified
-- ---------------------------------------------------------------------------

/**
 * Removes the sample lead and everything that names it, then counts what is
 * left in every table that refers to a lead. Only the append-only activity
 * log keeps a reference (an id, no content), by design.
 */
CREATE OR REPLACE FUNCTION public.onboarding_sample_cleanup(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run public.onboarding_sample_runs%ROWTYPE;
  v_lead uuid;
  t record;
  v_left integer;
  v_report jsonb := '{}'::jsonb;
  v_total integer := 0;
BEGIN
  SELECT * INTO run FROM public.onboarding_sample_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.onboarding_require_owner_or_staff(run.org_id);
  END IF;
  v_lead := run.lead_id;
  IF v_lead IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = v_lead AND org_id = run.org_id AND is_test) AND EXISTS (SELECT 1 FROM public.leads WHERE id = v_lead) THEN
      RAISE EXCEPTION 'Only a sample lead can be cleaned up this way.' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.notifications WHERE org_id = run.org_id AND v_lead = ANY (subject_ids);
    DELETE FROM public.approval_items WHERE org_id = run.org_id AND v_lead = ANY (lead_ids);
    DELETE FROM public.agent_activity_runs WHERE org_id = run.org_id AND lead_id = v_lead;
    FOR t IN
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.column_name = 'lead_id' AND c.data_type = 'uuid'
        AND c.table_name NOT IN ('workspace_activity_log', 'onboarding_sample_runs', 'leads')
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE lead_id = $1', t.table_name) USING v_lead;
      EXCEPTION WHEN OTHERS THEN
        v_report := v_report || jsonb_build_object(t.table_name, 'could not delete: ' || SQLERRM);
      END;
    END LOOP;
    DELETE FROM public.leads WHERE id = v_lead AND org_id = run.org_id AND is_test;

    FOR t IN
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.column_name = 'lead_id' AND c.data_type = 'uuid'
        AND c.table_name NOT IN ('workspace_activity_log', 'onboarding_sample_runs')
    LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE lead_id = $1', t.table_name) INTO v_left USING v_lead;
      IF v_left > 0 THEN
        v_report := v_report || jsonb_build_object(t.table_name, v_left);
        v_total := v_total + v_left;
      END IF;
    END LOOP;
    SELECT count(*) INTO v_left FROM public.leads WHERE id = v_lead;
    v_total := v_total + v_left;
    SELECT count(*) INTO v_left FROM public.approval_items WHERE v_lead = ANY (lead_ids);
    v_total := v_total + v_left;
    SELECT count(*) INTO v_left FROM public.notifications WHERE v_lead = ANY (subject_ids);
    v_total := v_total + v_left;
  END IF;

  UPDATE public.onboarding_sample_runs
  SET cleaned_at = now(), cleanup_verified = (v_total = 0), cleanup_report = v_report || jsonb_build_object('remaining', v_total), updated_at = now()
  WHERE id = p_run_id;
  PERFORM public.ws_log(run.org_id, 'onboarding.sample_cleaned', 'onboarding_sample_runs', p_run_id::text,
    jsonb_build_object('verified', v_total = 0, 'remaining', v_total), auth.uid());
  PERFORM public.onboarding_refresh(run.org_id);
  RETURN jsonb_build_object('verified', v_total = 0, 'remaining', v_total, 'report', v_report);
END;
$$;

/** The Owner (or staff) says the test worked, or reports a problem. */
CREATE OR REPLACE FUNCTION public.onboarding_sample_confirm(p_run_id uuid, p_worked boolean, p_help_request_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run public.onboarding_sample_runs%ROWTYPE;
BEGIN
  SELECT * INTO run FROM public.onboarding_sample_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.onboarding_require_owner_or_staff(run.org_id);
  IF p_worked THEN
    IF run.status <> 'passed' THEN
      RAISE EXCEPTION 'The test has not finished yet.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.onboarding_sample_runs SET confirmed_at = now(), confirmed_by = auth.uid(), updated_at = now() WHERE id = p_run_id;
  ELSE
    UPDATE public.onboarding_sample_runs SET status = 'problem_reported', problem_request_id = p_help_request_id, updated_at = now() WHERE id = p_run_id;
    INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key, detail)
    VALUES (run.org_id, 'staff', 'sample_problem', 'sample_test', jsonb_build_object('run_id', p_run_id, 'request_id', p_help_request_id));
  END IF;
  PERFORM public.ws_log(run.org_id, CASE WHEN p_worked THEN 'onboarding.sample_confirmed' ELSE 'onboarding.sample_problem' END,
    'onboarding_sample_runs', p_run_id::text, '{}'::jsonb, auth.uid());
  PERFORM public.onboarding_refresh(run.org_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 22. Creating a workspace and inviting the Owner
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.onboarding_can_create_workspaces()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.platform_staff s WHERE s.user_id = auth.uid() AND s.active AND s.can_create_workspaces
  );
$$;

DROP FUNCTION IF EXISTS public.create_workspace(text, text, text, text, uuid);
CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name text,
  p_timezone text,
  p_slug text DEFAULT NULL,
  p_owner_email text DEFAULT NULL,
  p_template_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_staff_ids uuid[] DEFAULT NULL,
  p_price_id text DEFAULT NULL,
  p_plan_label text DEFAULT NULL,
  p_internal_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_id uuid;
  v_member uuid;
  v_email text := NULLIF(lower(btrim(COALESCE(p_owner_email, ''))), '');
  v_token text;
  v_template_version integer;
  v_ws public.config_layers%ROWTYPE;
  v_admin boolean := public.is_platform_admin();
  v_staff uuid;
BEGIN
  IF NOT public.onboarding_can_create_workspaces() THEN
    RAISE EXCEPTION 'Only a Platform Admin, or Service Team given permission, can create a workspace.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'A workspace name is required.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_timezone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A timezone is required.';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+$' THEN
    RAISE EXCEPTION 'The owner email is not valid.';
  END IF;
  IF p_price_id IS NOT NULL AND btrim(p_price_id) <> '' AND btrim(p_price_id) !~ '^price_[A-Za-z0-9]{6,}$' THEN
    RAISE EXCEPTION 'Choose a plan from the billing list.';
  END IF;
  IF p_template_id IS NOT NULL THEN
    SELECT l.version INTO v_template_version
    FROM public.config_templates t
    JOIN public.config_layers l ON l.level = 'template' AND l.template_id = t.id
    WHERE t.id = p_template_id AND t.status = 'active';
    IF v_template_version IS NULL THEN
      RAISE EXCEPTION 'Choose an active template. Drafts and retired templates cannot be used for new workspaces.';
    END IF;
  END IF;
  IF p_staff_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_staff_ids) x WHERE NOT EXISTS (SELECT 1 FROM public.platform_staff s WHERE s.user_id = x AND s.active)
  ) THEN
    RAISE EXCEPTION 'Assign only active Vistrial team members.';
  END IF;

  v_base := trim(both '-' from lower(regexp_replace(COALESCE(NULLIF(btrim(p_slug), ''), v_name), '[^a-zA-Z0-9]+', '-', 'g')));
  IF v_base = '' THEN
    v_base := 'workspace';
  END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  END LOOP;

  -- A permitted Service Team member is not yet staff of a workspace that does
  -- not exist, so the settings the new workspace provisions for itself are
  -- written the way the configuration system writes them, then they are
  -- assigned straight away.
  PERFORM set_config('vistrial.config_projecting', '1', true);
  INSERT INTO public.organizations (name, slug, timezone, status, owner_contact_email, owner_contact_name)
  VALUES (v_name, v_slug, btrim(p_timezone), 'onboarding', v_email, left(NULLIF(btrim(COALESCE(p_contact_name, '')), ''), 120))
  RETURNING id INTO v_id;
  PERFORM set_config('vistrial.config_projecting', '0', true);

  -- Staff assigned at creation; Service Team who create a workspace are assigned to it.
  FOREACH v_staff IN ARRAY COALESCE(p_staff_ids, '{}'::uuid[]) || CASE WHEN v_admin THEN '{}'::uuid[] ELSE ARRAY[auth.uid()] END LOOP
    IF NOT EXISTS (SELECT 1 FROM public.workspace_assignments a WHERE a.org_id = v_id AND a.user_id = v_staff AND a.ended_at IS NULL) THEN
      INSERT INTO public.workspace_assignments (org_id, user_id, assigned_by, note)
      VALUES (v_id, v_staff, auth.uid(), 'Assigned when the workspace was created.');
    END IF;
  END LOOP;

  IF p_template_id IS NOT NULL THEN
    UPDATE public.workspace_config_pins
    SET template_id = p_template_id, template_version = v_template_version
    WHERE org_id = v_id;
  END IF;
  IF v_email IS NOT NULL THEN
    SELECT * INTO v_ws FROM public.config_layers WHERE level = 'workspace' AND org_id = v_id;
    PERFORM public.config_write_layer(v_ws.id,
      v_ws.field_values || jsonb_build_object('identity.primary_contact', jsonb_strip_nulls(jsonb_build_object(
        'email', v_email, 'name', NULLIF(btrim(COALESCE(p_contact_name, '')), '')))),
      ARRAY[]::text[], 'create', 'Owner contact from workspace creation.');
  END IF;
  PERFORM public.config_project_workspace(v_id);

  INSERT INTO public.onboarding_staff_details (org_id, internal_note, intended_price_id, intended_plan_label, created_by, created_by_role)
  VALUES (v_id, left(NULLIF(btrim(COALESCE(p_internal_note, '')), ''), 2000), NULLIF(btrim(COALESCE(p_price_id, '')), ''),
    left(NULLIF(btrim(COALESCE(p_plan_label, '')), ''), 120), auth.uid(), CASE WHEN v_admin THEN 'platform_admin' ELSE 'service_team' END)
  ON CONFLICT (org_id) DO UPDATE SET internal_note = EXCLUDED.internal_note, intended_price_id = EXCLUDED.intended_price_id,
    intended_plan_label = EXCLUDED.intended_plan_label, created_by = EXCLUDED.created_by, created_by_role = EXCLUDED.created_by_role;

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_member
    FROM public.org_members
    WHERE org_id = v_id AND user_id = auth.uid() AND seat = 'staff' AND active;
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    INSERT INTO public.org_invites (org_id, email, role, token, invited_by, expires_at, surface_access)
    VALUES (v_id, v_email, 'owner', v_token, v_member, now() + interval '7 days', 'operator');
  END IF;

  IF NOT v_admin THEN
    PERFORM public.ws_log(v_id, 'workspace.created_by_service_team', 'organizations', v_id::text, '{}'::jsonb, auth.uid());
  END IF;
  PERFORM public.onboarding_refresh(v_id);
  -- The organizations and org_invites audit triggers record the creation and the invite.
  RETURN jsonb_build_object('org_id', v_id, 'slug', v_slug, 'invite_token', v_token);
END;
$$;

/** Invite (or re-invite) the Owner. Returns the token for the app to email. */
CREATE OR REPLACE FUNCTION public.onboarding_owner_invite(p_org_id uuid, p_action text, p_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i public.org_invites%ROWTYPE;
  v_email text := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_token text;
  v_member uuid;
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  SELECT * INTO i FROM public.org_invites
  WHERE org_id = p_org_id AND role = 'owner' AND accepted_at IS NULL
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  SELECT id INTO v_member FROM public.org_members WHERE org_id = p_org_id AND user_id = auth.uid() AND seat = 'staff' AND active;

  IF p_action = 'cancel' THEN
    IF i.id IS NULL THEN
      RAISE EXCEPTION 'There is no invitation waiting.' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.org_invites WHERE id = i.id;
    PERFORM public.onboarding_refresh(p_org_id);
    RETURN jsonb_build_object('cancelled', true);
  END IF;

  IF p_action = 'resend' THEN
    IF i.id IS NULL THEN
      RAISE EXCEPTION 'There is no invitation waiting.' USING ERRCODE = '22023';
    END IF;
    IF i.expires_at - interval '7 days' > now() - interval '5 minutes' THEN
      RAISE EXCEPTION 'It was sent a moment ago. Give it a few minutes before sending again.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.org_invites SET expires_at = now() + interval '7 days' WHERE id = i.id;
    UPDATE public.onboarding_staff_details SET owner_invite_reminded_days = '{}' WHERE org_id = p_org_id;
    PERFORM public.ws_log(p_org_id, 'invite.resent', 'org_invites', i.id::text, jsonb_build_object('role', 'owner'), auth.uid());
    PERFORM public.onboarding_refresh(p_org_id);
    RETURN jsonb_build_object('email', i.email, 'token', i.token, 'expires_at', now() + interval '7 days');
  END IF;

  IF p_action IN ('change', 'new') THEN
    IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+$' THEN
      RAISE EXCEPTION 'Enter a valid email.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = p_org_id AND m.seat = 'customer' AND m.active AND lower(m.email) = v_email) THEN
      RAISE EXCEPTION '% is already in this workspace.', v_email USING ERRCODE = '22023';
    END IF;
    IF i.id IS NOT NULL THEN
      DELETE FROM public.org_invites WHERE id = i.id;
    END IF;
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    INSERT INTO public.org_invites (org_id, email, role, token, invited_by, expires_at, surface_access)
    VALUES (p_org_id, v_email, 'owner', v_token, v_member, now() + interval '7 days', 'operator');
    UPDATE public.organizations SET owner_contact_email = COALESCE(owner_contact_email, v_email) WHERE id = p_org_id;
    UPDATE public.onboarding_staff_details SET owner_invite_reminded_days = '{}' WHERE org_id = p_org_id;
    PERFORM public.onboarding_refresh(p_org_id);
    RETURN jsonb_build_object('email', v_email, 'token', v_token, 'expires_at', now() + interval '7 days');
  END IF;
  RAISE EXCEPTION 'Unknown action.' USING ERRCODE = '22023';
END;
$$;

-- ---------------------------------------------------------------------------
-- 23. Keeping the record in step with the workspace's lifecycle state
-- ---------------------------------------------------------------------------

-- Owners may now also give the business address. Status changes made by the
-- onboarding flow (go-live approval, move back, pause) are allowed for the
-- assigned Service Team through those functions only.
CREATE OR REPLACE FUNCTION public.organizations_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed text[];
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF public.ws_end_user_request() AND NOT public.is_platform_admin()
       AND COALESCE(current_setting('vistrial.onboarding_status_change', true), '') <> '1' THEN
      RAISE EXCEPTION 'Only a Platform Admin can change a workspace''s status.' USING ERRCODE = '42501';
    END IF;
    NEW.status_changed_at := now();
    NEW.status_changed_by := COALESCE(auth.uid(), NEW.status_changed_by);
    NEW.closed_at := CASE WHEN NEW.status = 'closed' THEN COALESCE(NEW.closed_at, now()) END;
    IF NEW.status = 'closed' AND NEW.delete_after IS NULL THEN
      NEW.delete_after := (now() + make_interval(days => NEW.closed_retention_days))::date;
    ELSIF NEW.status <> 'closed' AND OLD.status = 'closed' THEN
      NEW.delete_after := NULL;
    END IF;
  END IF;

  IF current_setting('vistrial.config_projecting', true) = '1' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(current_setting('vistrial.onboarding_status_change', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  IF NOT public.ws_end_user_request() OR public.ws_is_staff(NEW.id) THEN
    RETURN NEW;
  END IF;

  v_changed := public.ws_changed_columns(to_jsonb(OLD), to_jsonb(NEW));
  IF EXISTS (
    SELECT 1 FROM unnest(v_changed) c
    WHERE c NOT IN ('owner_contact_name', 'owner_contact_email', 'owner_contact_phone', 'business_address')
  ) THEN
    RAISE EXCEPTION 'Owners can change business contact details. Everything else is managed by the Vistrial team.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- A Platform Admin who changes the status directly (the exception path) keeps
-- the record in step. Going live this way still leaves every agent off until
-- the staged activation switches each one on.
CREATE OR REPLACE FUNCTION public.organizations_onboarding_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all_on boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR COALESCE(current_setting('vistrial.onboarding_status_change', true), '') = '1' THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.workspace_onboarding_status (org_id) VALUES (NEW.id) ON CONFLICT (org_id) DO NOTHING;
  SELECT bool_and(stage <> 'off') INTO v_all_on FROM public.workspace_agent_activation WHERE org_id = NEW.id;
  IF NEW.status = 'paused' THEN
    UPDATE public.workspace_onboarding_status SET phase = 'paused', paused_reason = NEW.status_reason, updated_at = now()
    WHERE org_id = NEW.id AND phase <> 'cancelled';
  ELSIF NEW.status = 'closed' THEN
    UPDATE public.workspace_onboarding_status SET phase = 'cancelled', updated_at = now() WHERE org_id = NEW.id;
  ELSIF NEW.status = 'onboarding' THEN
    UPDATE public.workspace_onboarding_status SET phase = CASE WHEN owner_confirmed_at IS NOT NULL THEN 'ready_for_review' ELSE 'setup' END,
      updated_at = now()
    WHERE org_id = NEW.id;
  ELSIF NEW.status = 'active' THEN
    UPDATE public.workspace_onboarding_status SET
      phase = CASE
        WHEN phase = 'settled' THEN 'settled'
        WHEN COALESCE(v_all_on, false) THEN 'live'
        ELSE 'activating' END,
      go_live_approved_at = COALESCE(go_live_approved_at, now()),
      go_live_approved_by = COALESCE(go_live_approved_by, auth.uid()),
      go_live_approved_by_label = COALESCE(go_live_approved_by_label,
        (SELECT label FROM public.ws_actor(NEW.id, auth.uid())) || ' (status changed directly)'),
      paused_reason = NULL,
      updated_at = now()
    WHERE org_id = NEW.id;
    INSERT INTO public.workspace_agent_activation (org_id, agent_id, stage, step_order)
    VALUES (NEW.id, 'scribe', 'off', 1), (NEW.id, 'sentry', 'off', 2), (NEW.id, 'relay', 'off', 3), (NEW.id, 'compass', 'off', 4)
    ON CONFLICT (org_id, agent_id) DO NOTHING;
    IF OLD.status = 'onboarding' THEN
      PERFORM public.ws_log(NEW.id, 'onboarding.go_live_exception', 'organizations', NEW.id::text,
        jsonb_build_object('reason', NEW.status_reason), auth.uid());
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS organizations_onboarding_sync ON public.organizations;
CREATE TRIGGER organizations_onboarding_sync AFTER UPDATE OF status ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_onboarding_sync();

-- Every new workspace starts with its record and every agent off. (Named so
-- it runs before sentry_new_org; Sentry stays in practice and the activation
-- row, not the Sentry mode, decides whether it runs.)
CREATE OR REPLACE FUNCTION public.organizations_onboarding_init()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_onboarding_status (org_id, phase) VALUES (NEW.id, 'setup') ON CONFLICT (org_id) DO NOTHING;
  INSERT INTO public.onboarding_staff_details (org_id) VALUES (NEW.id) ON CONFLICT (org_id) DO NOTHING;
  INSERT INTO public.workspace_agent_activation (org_id, agent_id, stage, step_order)
  VALUES (NEW.id, 'scribe', 'off', 1), (NEW.id, 'sentry', 'off', 2), (NEW.id, 'relay', 'off', 3), (NEW.id, 'compass', 'off', 4)
  ON CONFLICT (org_id, agent_id) DO NOTHING;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS organizations_onboarding_init ON public.organizations;
CREATE TRIGGER organizations_onboarding_init AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_onboarding_init();

-- ---------------------------------------------------------------------------
-- 24. What customers read (Owners: everything they act on; Members: read-only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.onboarding_customer_view(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
  h public.workspace_onboarding_status%ROWTYPE;
  o public.organizations%ROWTYPE;
  t public.config_templates%ROWTYPE;
  mr public.messaging_readiness%ROWTYPE;
  reg public.messaging_registration_details%ROWTYPE;
  em public.email_domain_setup%ROWTYPE;
  imp public.onboarding_import_runs%ROWTYPE;
  smp public.onboarding_sample_runs%ROWTYPE;
  td public.onboarding_template_defaults%ROWTYPE;
  s public.staff_support_settings%ROWTYPE := public.onboarding_settings();
  v_values jsonb;
  v_member uuid := public.user_member_id(p_org_id);
  v_flags public.onboarding_member_flags%ROWTYPE;
BEGIN
  IF v_access IS NULL OR v_access = 'operator' THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  h := public.onboarding_refresh(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO t FROM public.config_templates WHERE id = o.industry_template_id;
  SELECT * INTO td FROM public.onboarding_template_defaults WHERE template_id = o.industry_template_id;
  SELECT * INTO mr FROM public.messaging_readiness WHERE org_id = p_org_id;
  SELECT * INTO reg FROM public.messaging_registration_details WHERE org_id = p_org_id;
  SELECT * INTO em FROM public.email_domain_setup WHERE org_id = p_org_id;
  SELECT * INTO imp FROM public.onboarding_import_runs WHERE org_id = p_org_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO smp FROM public.onboarding_sample_runs WHERE org_id = p_org_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_flags FROM public.onboarding_member_flags WHERE org_id = p_org_id AND member_id = v_member;
  BEGIN
    v_values := public.config_effective_at(p_org_id) -> 'values';
  EXCEPTION WHEN OTHERS THEN
    v_values := '{}'::jsonb;
  END;

  RETURN jsonb_build_object(
    'access', v_access,
    'phase', h.phase,
    'live', h.live,
    'went_live_at', h.went_live_at,
    'live_seen_at', h.live_seen_at,
    'steps', h.steps,
    'current_stage', h.current_stage,
    'owner_confirmed_at', h.owner_confirmed_at,
    'paused_reason', CASE WHEN h.phase IN ('paused', 'cancelled', 'setup') THEN h.paused_reason END,
    'texting_enabled', h.texting_enabled,
    'email_enabled', h.email_enabled,
    'sentry_watch_until', h.sentry_watch_until,
    'activation_paused', h.activation_paused_at IS NOT NULL,
    'business', jsonb_build_object(
      'name', o.name, 'timezone', o.timezone, 'contact_name', o.owner_contact_name, 'contact_email', o.owner_contact_email,
      'contact_phone', o.owner_contact_phone, 'address', o.business_address),
    'approach', jsonb_strip_nulls(jsonb_build_object(
      'template_name', t.name,
      'template_description', t.description,
      'business_description', v_values ->> 'industry.business_description',
      'first_touch_minutes', v_values -> 'response.first_touch_minutes',
      'after_hours', v_values ->> 'response.after_hours',
      'max_sequence_length', v_values -> 'response.max_sequence_length',
      'max_sequence_days', v_values -> 'response.max_sequence_days',
      'urgency_signals', v_values -> 'industry.urgency_signals',
      'ready_criteria', v_values -> 'qualification.ready_criteria',
      'confirmed_at', h.approach_confirmed_at,
      'adjust_requested_at', h.approach_adjust_requested_at)),
    'messaging', jsonb_build_object(
      'carrier_status', COALESCE(mr.carrier_status, 'not_registered'),
      'sender_confirmed', mr.sender_number_confirmed_at IS NOT NULL,
      'details_saved_at', reg.saved_at,
      'details_complete', COALESCE(reg.fields_complete, false),
      'fields_saved', to_jsonb(COALESCE(reg.field_names, '{}')),
      'rejection_code', CASE WHEN mr.carrier_status = 'rejected' THEN reg.rejection_code END,
      'rejected_at', CASE WHEN mr.carrier_status = 'rejected' THEN reg.rejected_at END,
      'submitted_at', reg.submitted_at,
      'slow', mr.carrier_status = 'pending' AND mr.carrier_updated_at < now() - make_interval(days => s.onboarding_carrier_slow_days)),
    'email', jsonb_build_object(
      'domain', em.domain, 'records', COALESCE(em.records, '[]'::jsonb), 'last_result', COALESCE(em.last_result, '[]'::jsonb),
      'last_checked_at', em.last_checked_at, 'verified', em.verified_at IS NOT NULL OR mr.sending_domain_confirmed_at IS NOT NULL,
      'team_asked_at', em.team_asked_at),
    'import', CASE WHEN imp.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', imp.id, 'status', imp.status, 'lookback_days', imp.lookback_days, 'found', imp.found, 'imported', imp.imported,
      'updated', imp.updated, 'skipped', imp.skipped, 'failed', imp.failed, 'skip_reasons', imp.skip_reasons,
      'do_not_contact', imp.do_not_contact, 'basic_case_files', imp.basic_case_files, 'started_at', imp.started_at,
      'finished_at', imp.finished_at,
      'problems', (SELECT COALESCE(jsonb_object_agg(kind, n), '{}'::jsonb) FROM (
        SELECT kind, count(*) AS n FROM public.onboarding_import_problems WHERE org_id = p_org_id AND decision = 'pending' GROUP BY kind) x)) END,
    'import_defaults', jsonb_build_object(
      'lookback_days', COALESCE(td.import_lookback_days, 90), 'max_lookback_days', s.onboarding_max_lookback_days,
      'ai_active_days', s.onboarding_ai_active_days),
    'sample', CASE WHEN smp.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', smp.id, 'status', smp.status, 'steps', smp.steps, 'failed_step', smp.failed_step, 'confirmed_at', smp.confirmed_at,
      'cleaned', smp.cleanup_verified, 'lead_id', smp.lead_id, 'created_at', smp.created_at) END,
    'agents', (SELECT COALESCE(jsonb_agg(jsonb_build_object('agent', a.agent_id, 'stage', a.stage, 'order', a.step_order,
        'activated_at', a.activated_at) ORDER BY a.step_order), '[]'::jsonb)
      FROM public.workspace_agent_activation a WHERE a.org_id = p_org_id),
    'sentry_watch_days', COALESCE(td.sentry_watch_days, 1),
    'checkin_days', to_jsonb(s.onboarding_checkin_days),
    'welcome_seen', v_flags.welcome_seen_at IS NOT NULL,
    'feedback_due', v_access = 'owner' AND h.phase IN ('live', 'settled') AND v_flags.feedback_seen_at IS NULL
      AND h.go_live_approved_at IS NOT NULL AND h.go_live_approved_at < now() - interval '7 days'
      AND h.go_live_approved_at > now() - interval '30 days'
  );
END;
$$;

-- Prompt 5's "You are live" acknowledgement.
CREATE OR REPLACE FUNCTION public.onboarding_live_seen(p_org_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.workspace_onboarding_status SET live_seen_at = now()
  WHERE org_id = p_org_id AND live AND public.ws_access(p_org_id) IN ('owner', 'member', 'service_team', 'platform_admin');
$$;

-- ---------------------------------------------------------------------------
-- 24b. The staff onboarding queue: one scoped read, fast with many workspaces
-- ---------------------------------------------------------------------------

ALTER TABLE public.staff_saved_views DROP CONSTRAINT IF EXISTS staff_saved_views_page_check;
ALTER TABLE public.staff_saved_views ADD CONSTRAINT staff_saved_views_page_check
  CHECK (page IN ('roster', 'queue', 'audit', 'data_requests', 'onboarding'));

/**
 * Every workspace not yet live, and those live in the last two weeks, that
 * the caller may see: Platform Admins all, Service Team their assigned ones.
 * "mine" narrows anyone to their own assignments.
 */
CREATE OR REPLACE FUNCTION public.onboarding_queue(p_scope text DEFAULT 'all', p_include_settled boolean DEFAULT false)
RETURNS TABLE (
  org_id uuid,
  name text,
  slug text,
  org_status text,
  phase text,
  created_at timestamptz,
  current_stage text,
  current_stage_label text,
  waiting_on text,
  waiting_since timestamptz,
  stuck boolean,
  stuck_reason text,
  next_action text,
  next_action_stage text,
  done_count integer,
  total_count integer,
  owner_confirmed_at timestamptz,
  go_live_approved_at timestamptz,
  settled_at timestamptz,
  assigned jsonb,
  template_name text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT x AS id FROM public.staff_scope_org_ids(p_scope) x
  ),
  next_step AS (
    SELECT DISTINCT ON (st.org_id) st.org_id, st.stage_key, COALESCE(st.staff_detail, d.staff_label) AS action
    FROM public.workspace_onboarding_stages st
    JOIN public.onboarding_stage_definitions d ON d.key = st.stage_key
    WHERE st.org_id IN (SELECT id FROM scope) AND st.status IN ('blocked', 'waiting_on_team', 'waiting_on_customer', 'in_progress')
    ORDER BY st.org_id, CASE st.status WHEN 'blocked' THEN 0 WHEN 'waiting_on_team' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END, d.position
  ),
  counts AS (
    SELECT st.org_id,
      count(*) FILTER (WHERE st.status IN ('done', 'skipped') AND d.required_for_go_live)::int AS done_count,
      count(*) FILTER (WHERE d.required_for_go_live)::int AS total_count
    FROM public.workspace_onboarding_stages st
    JOIN public.onboarding_stage_definitions d ON d.key = st.stage_key
    WHERE st.org_id IN (SELECT id FROM scope)
    GROUP BY st.org_id
  ),
  staff AS (
    SELECT a.org_id, jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', ps.display_name) ORDER BY ps.display_name) AS people
    FROM public.workspace_assignments a
    JOIN public.platform_staff ps ON ps.user_id = a.user_id AND ps.active
    WHERE a.ended_at IS NULL AND a.org_id IN (SELECT id FROM scope)
    GROUP BY a.org_id
  )
  SELECT o.id, o.name, o.slug, o.status::text, w.phase, o.created_at, w.current_stage, d.staff_label,
    w.waiting_on, w.waiting_since, w.stuck, w.stuck_reason, n.action, n.stage_key,
    COALESCE(c.done_count, 0), COALESCE(c.total_count, 0), w.owner_confirmed_at, w.go_live_approved_at, w.settled_at,
    COALESCE(staff.people, '[]'::jsonb), t.name, w.updated_at
  FROM public.organizations o
  JOIN public.workspace_onboarding_status w ON w.org_id = o.id
  LEFT JOIN public.onboarding_stage_definitions d ON d.key = w.current_stage
  LEFT JOIN next_step n ON n.org_id = o.id
  LEFT JOIN counts c ON c.org_id = o.id
  LEFT JOIN staff ON staff.org_id = o.id
  LEFT JOIN public.config_templates t ON t.id = o.industry_template_id
  WHERE o.id IN (SELECT id FROM scope)
    AND o.status <> 'closed'
    AND NOT o.is_platform_workspace
    AND (w.phase IN ('setup', 'ready_for_review', 'activating', 'live', 'paused')
      OR (w.phase = 'settled' AND (p_include_settled OR w.settled_at > now() - interval '14 days')))
  ORDER BY w.stuck DESC, w.waiting_since ASC NULLS LAST, o.name;
$$;

-- ---------------------------------------------------------------------------
-- 25. Existing workspaces keep behaving as they do today
-- ---------------------------------------------------------------------------

-- Every agent stays on where it runs today (Relay only ever drafts; Sentry
-- keeps its current mode). Only workspaces created from now on start with
-- agents off and go through the staged activation.
INSERT INTO public.workspace_agent_activation (org_id, agent_id, stage, step_order, activated_at, note)
SELECT o.id, a.agent_id,
  CASE a.agent_id
    WHEN 'scribe' THEN 'on'
    WHEN 'relay' THEN 'drafts_only'
    WHEN 'compass' THEN 'coming_soon'
    ELSE CASE (SELECT sw.mode FROM public.sentry_workspaces sw WHERE sw.org_id = o.id) WHEN 'live' THEN 'on' WHEN 'practice' THEN 'watch' ELSE 'on' END
  END,
  a.step_order, now(), 'On before staged activation existed.'
FROM public.organizations o
CROSS JOIN (VALUES ('scribe', 1), ('sentry', 2), ('relay', 3), ('compass', 4)) AS a(agent_id, step_order)
ON CONFLICT (org_id, agent_id) DO NOTHING;

INSERT INTO public.workspace_onboarding_status (org_id) SELECT id FROM public.organizations ON CONFLICT (org_id) DO NOTHING;
INSERT INTO public.onboarding_staff_details (org_id) SELECT id FROM public.organizations ON CONFLICT (org_id) DO NOTHING;
UPDATE public.workspace_onboarding_status w SET
  phase = CASE o.status WHEN 'active' THEN 'settled' WHEN 'paused' THEN 'paused' WHEN 'closed' THEN 'cancelled' ELSE 'setup' END,
  settled_at = CASE WHEN o.status = 'active' THEN now() END,
  go_live_approved_at = CASE WHEN o.status = 'active' THEN COALESCE(w.went_live_at, o.activated_at, o.status_changed_at, o.created_at) END,
  go_live_approved_by_label = CASE WHEN o.status = 'active' THEN 'Live before the onboarding flow existed' END,
  approach_confirmed_at = CASE WHEN o.industry_template_id IS NOT NULL AND o.status = 'active' THEN now() END
FROM public.organizations o
WHERE o.id = w.org_id;

DO $$
DECLARE
  v_org uuid;
BEGIN
  FOR v_org IN SELECT id FROM public.organizations WHERE status <> 'closed' LOOP
    PERFORM public.onboarding_refresh(v_org);
  END LOOP;
END $$;

-- Prompt 5's per-step team notes and timings carry over to the matching stage.
UPDATE public.workspace_onboarding_stages st SET
  note = left(NULLIF(btrim(COALESCE(w.overrides -> m.old_key ->> 'note', '')), ''), 300),
  eta = left(NULLIF(btrim(COALESCE(w.overrides -> m.old_key ->> 'eta', '')), ''), 80)
FROM public.workspace_onboarding_status w
CROSS JOIN (VALUES ('approach', 'approach'), ('crm', 'crm'), ('messaging', 'messaging'), ('approvers', 'approvers'),
  ('escalation', 'escalation'), ('team', 'team'), ('test', 'sample_test'), ('go_live', 'go_live')) AS m(old_key, new_key)
WHERE st.org_id = w.org_id AND st.stage_key = m.new_key AND w.overrides ? m.old_key;

-- ---------------------------------------------------------------------------
-- 26. The scheduled job
-- ---------------------------------------------------------------------------

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'onboarding',
  '*/5 * * * *',
  300,
  900,
  'Open /api/cron/onboarding logs, onboarding_import_runs stuck in running, and onboarding_events not processed. Confirm CRON_SECRET and that Vercel Cron still lists this path.'
)
ON CONFLICT (job_name) DO UPDATE
  SET cron_expr = EXCLUDED.cron_expr, interval_seconds = EXCLUDED.interval_seconds,
      grace_seconds = EXCLUDED.grace_seconds, check_first = EXCLUDED.check_first;
INSERT INTO public.ops_job_runs (job_name, last_success_at, updated_at)
SELECT job_name, now(), now() FROM public.ops_job_catalog WHERE job_name = 'onboarding'
ON CONFLICT (job_name) DO NOTHING;

-- Case-file progress for the workbench, counted once after one access check.
-- Reading lead_import_marks through its row policy checks every row, which is
-- far too slow for a large import; this returns only the counts.
CREATE OR REPLACE FUNCTION public.onboarding_case_file_counts(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  SELECT jsonb_build_object(
    'waiting', count(*) FILTER (WHERE ai_state IN ('eligible', 'queued', 'running')),
    'built', count(*) FILTER (WHERE ai_state = 'done'),
    'failed', count(*) FILTER (WHERE ai_state = 'failed'),
    'over_limit', count(*) FILTER (WHERE ai_state = 'over_limit'),
    'none', count(*) FILTER (WHERE ai_state = 'none'))
  INTO v
  FROM public.lead_import_marks
  WHERE org_id = p_org_id;
  RETURN v;
END;
$$;

-- ---------------------------------------------------------------------------
-- 27. Grants. Nothing here is callable by signed-out visitors.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  f text;
  user_facing text[] := ARRAY[
    'onboarding_refresh(uuid)', 'onboarding_status_refresh(uuid)', 'onboarding_customer_view(uuid)', 'onboarding_live_seen(uuid)',
    'onboarding_confirm_approach(uuid)', 'onboarding_request_approach_change(uuid, text)', 'onboarding_set_team_step(uuid, text)',
    'onboarding_set_channel(uuid, text, boolean, text)', 'onboarding_request_crm_help(uuid, text)', 'onboarding_owner_confirm(uuid)',
    'onboarding_member_flag(uuid, text)', 'onboarding_feedback_submit(uuid, integer, text, uuid)',
    'onboarding_stage_skip(uuid, text, text, integer)', 'onboarding_stage_reopen(uuid, text, text, integer)',
    'onboarding_stage_note(uuid, text, text, text, text, integer)', 'onboarding_config_review_signoff(uuid, text)',
    'onboarding_accept_warning(uuid, text, text)', 'onboarding_revoke_acceptance(uuid, text)',
    'onboarding_approve_go_live(uuid, text)', 'onboarding_activate_step(uuid, text, text)', 'onboarding_sentry_full_on(uuid, text)',
    'onboarding_activation_pause(uuid, boolean, text)', 'onboarding_move_back(uuid, text, text)', 'onboarding_resume(uuid, text)',
    'onboarding_checkin_complete(uuid, text, jsonb, timestamptz)', 'onboarding_stage_definition_save(text, jsonb)',
    'onboarding_settings_save(jsonb)', 'onboarding_template_defaults_save(uuid, integer, integer)',
    'onboarding_staff_details_save(uuid, jsonb)', 'set_staff_create_permission(uuid, boolean)',
    'messaging_registration_save(uuid, text, text[], boolean)', 'messaging_registration_set_status(uuid, text, text, text, text)',
    'messaging_registration_ein(uuid, boolean)', 'email_domain_prepare(uuid, text, jsonb)', 'email_domain_ask_team(uuid)',
    'escalation_contacts_save(uuid, jsonb)', 'escalation_contact_confirm(uuid)',
    'onboarding_import_start(uuid, integer)', 'onboarding_import_control(uuid, text)', 'onboarding_import_problem_decide(uuid, text)', 'onboarding_import_problems_decide_kind(uuid, text, text)',
    'lead_reactivate(uuid, text)', 'onboarding_sample_cleanup(uuid)', 'onboarding_sample_confirm(uuid, boolean, uuid)',
    'onboarding_can_create_workspaces()', 'onboarding_owner_invite(uuid, text, text)',
    'create_workspace(text, text, text, text, uuid, text, uuid[], text, text, text)',
    'agent_activation_allows(uuid, text)', 'lead_is_historic(uuid)', 'onboarding_queue(text, boolean)',
    'onboarding_case_file_counts(uuid)'
  ];
  internal text[] := ARRAY[
    'onboarding_actor_label(uuid)', 'onboarding_require_staff(uuid)', 'onboarding_require_owner_or_staff(uuid)',
    'onboarding_settings()', 'historic_lead_ids(uuid)', 'onboarding_compute(uuid)', 'onboarding_checks_compute(uuid)',
    'onboarding_stage_check_version(uuid, text, integer)', 'onboarding_set_org_status(uuid, public.workspace_status, text)',
    'email_domain_record_check(uuid, jsonb, boolean, uuid)', 'escalation_contact_test_sent(uuid)',
    'onboarding_import_write(uuid, uuid, jsonb)',
    'escalation_contacts_link_member()', 'lead_import_marks_reactivate_on_activity()', 'onboarding_guard_lead_row()',
    'onboarding_guard_approval_items()', 'onboarding_guard_notifications()', 'ghl_dispatches_sample_guard()',
    'organizations_onboarding_sync()', 'organizations_onboarding_init()'
  ];
BEGIN
  FOREACH f IN ARRAY user_facing LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
  FOREACH f IN ARRAY internal LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
  -- Helpers called inside row-level policies or other definer functions run
  -- as the definer, so authenticated never needs them directly.
  REVOKE ALL ON FUNCTION public.onboarding_customer_state(text) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.onboarding_stage_href(text) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.onboarding_customer_state(text), public.onboarding_stage_href(text) TO authenticated, service_role;
END $$;

-- ---------------------------------------------------------------------------
-- 28. Notification type for onboarding notices (must be last: a new enum value
--     cannot be used in the transaction that adds it).
-- ---------------------------------------------------------------------------

ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'onboarding';
