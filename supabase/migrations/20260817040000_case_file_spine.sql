-- Vistrial Case File spine.
-- One atomic migration: enums, tenancy, leads, history, indexes, triggers, RLS.
-- Scores are history. Money is bigint cents. Timestamps are timestamptz.
-- Every table carries org_id so RLS is a single-column check.

-- ---------------------------------------------------------------------------
-- Enums (never text + check)
-- ---------------------------------------------------------------------------

CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'closer', 'setter');

CREATE TYPE public.lead_type AS ENUM ('nurture_track', 'ready_track');

CREATE TYPE public.lead_status AS ENUM (
  'new',
  'working',
  'call_booked',
  'no_show',
  'follow_up',
  'objection_hold',
  'ghost',
  'closed_won',
  'closed_lost'
);

CREATE TYPE public.touch_type AS ENUM ('system', 'human');

CREATE TYPE public.touch_channel AS ENUM (
  'sms',
  'email',
  'call',
  'dm',
  'voicemail',
  'other'
);

CREATE TYPE public.touch_direction AS ENUM ('outbound', 'inbound');

CREATE TYPE public.score_trigger AS ENUM ('intake', 'call', 'manual', 'event');

CREATE TYPE public.call_type AS ENUM (
  'triage',
  'discovery',
  'close',
  'follow_up'
);

CREATE TYPE public.call_outcome AS ENUM (
  'held',
  'no_show',
  'cancelled',
  'rescheduled'
);

CREATE TYPE public.transcript_source AS ENUM (
  'fathom',
  'fireflies',
  'zoom',
  'ghl',
  'manual'
);

CREATE TYPE public.objection_type AS ENUM (
  'price',
  'timing',
  'spouse_partner',
  'trust',
  'fit',
  'competitor',
  'other'
);

CREATE TYPE public.action_creator AS ENUM ('system', 'user');

CREATE TYPE public.payment_type AS ENUM ('pif', 'plan', 'bnpl');

CREATE TYPE public.webhook_source AS ENUM (
  'ghl',
  'stripe',
  'commas',
  'transcript',
  'other'
);

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  ghl_location_id text,
  timezone text NOT NULL DEFAULT 'America/New_York',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_key UNIQUE (slug),
  CONSTRAINT organizations_ghl_location_id_key UNIQUE (ghl_location_id)
);

CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  role public.org_role NOT NULL,
  display_name text NOT NULL,
  email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_members_org_user_key UNIQUE (org_id, user_id)
);

COMMENT ON TABLE public.org_members IS
  'Members are deactivated, never deleted. Touches and calls keep attribution.';

CREATE TABLE public.score_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  timeline_weight integer NOT NULL DEFAULT 35,
  investment_capacity_weight integer NOT NULL DEFAULT 30,
  decision_authority_weight integer NOT NULL DEFAULT 20,
  pain_severity_weight integer NOT NULL DEFAULT 15,
  ready_threshold integer NOT NULL DEFAULT 60,
  speed_to_lead_minutes integer NOT NULL DEFAULT 15,
  ghost_days_soft integer NOT NULL DEFAULT 14,
  ghost_days_hard integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT score_configs_org_id_key UNIQUE (org_id),
  CONSTRAINT score_configs_weights_sum_100 CHECK (
    timeline_weight
    + investment_capacity_weight
    + decision_authority_weight
    + pain_severity_weight
    = 100
  ),
  CONSTRAINT score_configs_ready_threshold_range CHECK (
    ready_threshold BETWEEN 0 AND 100
  ),
  CONSTRAINT score_configs_weights_range CHECK (
    timeline_weight BETWEEN 0 AND 100
    AND investment_capacity_weight BETWEEN 0 AND 100
    AND decision_authority_weight BETWEEN 0 AND 100
    AND pain_severity_weight BETWEEN 0 AND 100
  )
);

-- ---------------------------------------------------------------------------
-- Case File spine
-- ---------------------------------------------------------------------------

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  ghl_contact_id text,
  ghl_opportunity_id text,
  first_name text,
  last_name text,
  email text,
  phone text,
  source text,
  campaign text,
  ad_id text,
  offer_name text,
  application_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  lead_type public.lead_type,
  current_score integer,
  status public.lead_status NOT NULL DEFAULT 'new',
  pipeline_stage text,
  assigned_setter_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  assigned_closer_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  opted_in_at timestamptz NOT NULL DEFAULT now(),
  first_human_touch_at timestamptz,
  last_touch_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_id_org_key UNIQUE (id, org_id),
  CONSTRAINT leads_org_ghl_contact_key UNIQUE (org_id, ghl_contact_id),
  CONSTRAINT leads_current_score_range CHECK (
    current_score IS NULL OR current_score BETWEEN 0 AND 100
  )
);

COMMENT ON COLUMN public.leads.current_score IS
  'Trigger-maintained cache of the latest readiness_scores.total. Must never be written directly.';

COMMENT ON COLUMN public.leads.first_human_touch_at IS
  'Null means nobody has talked to this person, which is what the never-touched alarm reads.';

CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  type public.call_type NOT NULL,
  ran_by_member_id uuid REFERENCES public.org_members (id) ON DELETE RESTRICT,
  scheduled_at timestamptz,
  occurred_at timestamptz,
  duration_seconds integer,
  outcome public.call_outcome,
  recording_url text,
  raw_transcript text,
  transcript_source public.transcript_source,
  transcript_arrived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calls_id_org_key UNIQUE (id, org_id),
  CONSTRAINT calls_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE TABLE public.readiness_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  timeline_raw integer NOT NULL,
  investment_capacity_raw integer NOT NULL,
  decision_authority_raw integer NOT NULL,
  pain_severity_raw integer NOT NULL,
  total integer NOT NULL,
  reasoning text,
  triggered_by public.score_trigger NOT NULL,
  call_id uuid,
  scored_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT readiness_scores_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE,
  CONSTRAINT readiness_scores_call_org_fkey FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE SET NULL,
  CONSTRAINT readiness_scores_raw_range CHECK (
    timeline_raw BETWEEN 0 AND 100
    AND investment_capacity_raw BETWEEN 0 AND 100
    AND decision_authority_raw BETWEEN 0 AND 100
    AND pain_severity_raw BETWEEN 0 AND 100
    AND total BETWEEN 0 AND 100
  )
);

COMMENT ON TABLE public.readiness_scores IS
  'Append-only history. The lead current_score cache is maintained by trigger. Nothing overwrites a row.';

CREATE TABLE public.touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  type public.touch_type NOT NULL,
  channel public.touch_channel NOT NULL,
  direction public.touch_direction NOT NULL,
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE RESTRICT,
  summary text,
  ghl_message_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT touches_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE,
  CONSTRAINT touches_human_requires_actor CHECK (
    type <> 'human' OR actor_member_id IS NOT NULL
  )
);

CREATE TABLE public.call_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  call_id uuid NOT NULL,
  summary text,
  stated_objection text,
  budget_signal text,
  timeline_signal text,
  decision_process text,
  next_step_agreed text,
  quotes jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version text,
  extracted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_extractions_call_id_key UNIQUE (call_id),
  CONSTRAINT call_extractions_call_org_fkey FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE CASCADE,
  CONSTRAINT call_extractions_quotes_is_array CHECK (jsonb_typeof(quotes) = 'array')
);

CREATE TABLE public.objections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  type public.objection_type NOT NULL,
  verbatim text NOT NULL,
  call_id uuid,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT objections_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE,
  CONSTRAINT objections_call_org_fkey FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE SET NULL
);

CREATE TABLE public.next_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  action_text text NOT NULL,
  owner_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  due_at timestamptz,
  completed_at timestamptz,
  created_by public.action_creator NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT next_actions_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE TABLE public.revenue_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  payment_type public.payment_type NOT NULL,
  processor text,
  processor_ref text,
  closed_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revenue_log_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE SET NULL,
  CONSTRAINT revenue_log_amount_positive CHECK (amount_cents > 0)
);

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  source public.webhook_source NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error_text text,
  attempt_count integer NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.webhook_events IS
  'Raw payloads are stored before parsing so a bad parse is replayable. org_id is nullable: unresolved payloads still persist. Service-role only.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX leads_org_status_idx ON public.leads (org_id, status);
CREATE INDEX leads_org_score_desc_idx ON public.leads (org_id, current_score DESC NULLS LAST);
CREATE INDEX leads_org_ghl_contact_idx ON public.leads (org_id, ghl_contact_id);
CREATE INDEX leads_assigned_setter_idx
  ON public.leads (org_id, assigned_setter_id)
  WHERE assigned_setter_id IS NOT NULL;
CREATE INDEX leads_assigned_closer_idx
  ON public.leads (org_id, assigned_closer_id)
  WHERE assigned_closer_id IS NOT NULL;
CREATE INDEX leads_never_touched_idx
  ON public.leads (org_id, opted_in_at)
  WHERE first_human_touch_at IS NULL;
CREATE INDEX leads_org_last_touch_idx
  ON public.leads (org_id, last_touch_at NULLS FIRST);

CREATE INDEX touches_lead_occurred_idx ON public.touches (lead_id, occurred_at DESC);
CREATE INDEX touches_org_type_time_idx ON public.touches (org_id, type, occurred_at);

CREATE INDEX calls_lead_time_idx ON public.calls (lead_id, occurred_at DESC);
CREATE INDEX readiness_scores_lead_time_idx
  ON public.readiness_scores (lead_id, created_at DESC);

CREATE INDEX objections_unresolved_lead_idx
  ON public.objections (lead_id)
  WHERE resolved = false;

CREATE INDEX next_actions_open_due_idx
  ON public.next_actions (org_id, due_at)
  WHERE completed_at IS NULL;

CREATE INDEX revenue_org_occurred_idx
  ON public.revenue_log (org_id, occurred_at DESC);

CREATE INDEX webhook_events_unprocessed_idx
  ON public.webhook_events (received_at)
  WHERE processed = false;

CREATE INDEX org_members_user_id_idx ON public.org_members (user_id);
CREATE INDEX org_members_org_active_idx
  ON public.org_members (org_id)
  WHERE active;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER score_configs_set_updated_at
  BEFORE UPDATE ON public.score_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER calls_set_updated_at
  BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Routing is a database concern so application code cannot drift.
CREATE OR REPLACE FUNCTION public.sync_lead_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_threshold integer;
BEGIN
  SELECT ready_threshold
  INTO v_threshold
  FROM public.score_configs
  WHERE org_id = NEW.org_id;

  UPDATE public.leads
  SET
    current_score = NEW.total,
    lead_type = CASE
      WHEN v_threshold IS NOT NULL AND NEW.total >= v_threshold
        THEN 'ready_track'::public.lead_type
      ELSE 'nurture_track'::public.lead_type
    END
  WHERE id = NEW.lead_id
    AND org_id = NEW.org_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER readiness_scores_sync_lead
  AFTER INSERT ON public.readiness_scores
  FOR EACH ROW EXECUTE FUNCTION public.sync_lead_score();

CREATE OR REPLACE FUNCTION public.forbid_readiness_score_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'readiness_scores is append-only';
END;
$$;

CREATE TRIGGER readiness_scores_append_only
  BEFORE UPDATE OR DELETE ON public.readiness_scores
  FOR EACH ROW EXECUTE FUNCTION public.forbid_readiness_score_mutation();

CREATE OR REPLACE FUNCTION public.sync_lead_touch_times()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.leads
  SET
    last_touch_at = GREATEST(
      COALESCE(last_touch_at, NEW.occurred_at),
      NEW.occurred_at
    ),
    first_human_touch_at = CASE
      WHEN NEW.type = 'human' AND NEW.direction = 'outbound' THEN
        LEAST(
          COALESCE(first_human_touch_at, NEW.occurred_at),
          NEW.occurred_at
        )
      ELSE first_human_touch_at
    END
  WHERE id = NEW.lead_id
    AND org_id = NEW.org_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER touches_sync_lead_times
  AFTER INSERT ON public.touches
  FOR EACH ROW EXECUTE FUNCTION public.sync_lead_touch_times();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- Must be SECURITY DEFINER with a pinned search_path. A policy on org_members
-- that queried org_members without this would recurse until Postgres gave up.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM public.org_members
  WHERE user_id = auth.uid()
    AND active = true;
$$;

CREATE OR REPLACE FUNCTION public.user_has_org_role(
  p_org_id uuid,
  VARIADIC p_roles public.org_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND active = true
      AND role = ANY (p_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.user_org_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_org_role(uuid, public.org_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_org_role(uuid, public.org_role[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readiness_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.touches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.next_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Organizations: members can select; owner/admin can update.
CREATE POLICY organizations_select
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.user_org_ids()));

CREATE POLICY organizations_update
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (public.user_has_org_role(id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(id, 'owner', 'admin'));

-- Org members: members of the org can select; owner/admin can write.
CREATE POLICY org_members_select
  ON public.org_members
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY org_members_insert
  ON public.org_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY org_members_update
  ON public.org_members
  FOR UPDATE
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY org_members_delete
  ON public.org_members
  FOR DELETE
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

-- Full access for caller orgs on the Case File tables.
CREATE POLICY score_configs_all
  ON public.score_configs
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY leads_all
  ON public.leads
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY readiness_scores_all
  ON public.readiness_scores
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY touches_all
  ON public.touches
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY calls_all
  ON public.calls
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY call_extractions_all
  ON public.call_extractions
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY objections_all
  ON public.objections
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY next_actions_all
  ON public.next_actions
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- Revenue: owner/admin select + insert only. Append-only money log.
CREATE POLICY revenue_log_select
  ON public.revenue_log
  FOR SELECT
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY revenue_log_insert
  ON public.revenue_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

-- webhook_events: RLS on, no policies. Client SELECT is allowed by grant
-- but returns zero rows. Writes stay service-role only.
GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.organizations,
  public.org_members,
  public.score_configs,
  public.leads,
  public.readiness_scores,
  public.touches,
  public.calls,
  public.call_extractions,
  public.objections,
  public.next_actions,
  public.revenue_log
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
