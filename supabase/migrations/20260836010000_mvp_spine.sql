-- MVP spine: EOD submissions, agent action audit, case-file notes, revenue lifecycle.
-- Additive only. Existing tables and columns stay. No backfill.

-- ---------------------------------------------------------------------------
-- Case file: operator context notes (UI in a later phase)
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS context_notes text;

COMMENT ON COLUMN public.leads.context_notes IS
  'Workspace-authored context for the case file. Not a CRM transcript.';

-- ---------------------------------------------------------------------------
-- Revenue lifecycle: New / Repeat / Recurring / Reactivation
-- Distinct from payment_type (pif/plan/bnpl) and kind (sale/refund/chargeback/failed).
-- Null until a later phase writes it. Existing rows are left null on purpose.
-- ---------------------------------------------------------------------------

CREATE TYPE public.revenue_lifecycle AS ENUM (
  'new',
  'repeat',
  'recurring',
  'reactivation'
);

ALTER TABLE public.revenue_log
  ADD COLUMN IF NOT EXISTS lifecycle public.revenue_lifecycle;

COMMENT ON COLUMN public.revenue_log.lifecycle IS
  'New / repeat / recurring / reactivation. Null means not classified yet.';

-- ---------------------------------------------------------------------------
-- End-of-day submissions
-- ---------------------------------------------------------------------------

CREATE TABLE public.eod_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  submitted_on date NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  conversations integer NOT NULL DEFAULT 0,
  bookings integer NOT NULL DEFAULT 0,
  outcomes text,
  blockers text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eod_submissions_id_org_key UNIQUE (id, org_id),
  CONSTRAINT eod_submissions_org_member_day_key UNIQUE (org_id, member_id, submitted_on),
  CONSTRAINT eod_submissions_member_org_fkey
    FOREIGN KEY (member_id, org_id)
    REFERENCES public.org_members (id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT eod_submissions_counts_nonneg CHECK (
    calls >= 0 AND conversations >= 0 AND bookings >= 0
  )
);

COMMENT ON TABLE public.eod_submissions IS
  'One end-of-day log per operator per calendar date. Workspace-scoped.';

CREATE INDEX eod_submissions_org_day_idx
  ON public.eod_submissions (org_id, submitted_on DESC);

CREATE TRIGGER eod_submissions_set_updated_at
  BEFORE UPDATE ON public.eod_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.eod_submission_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  submission_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eod_submission_leads_unique UNIQUE (submission_id, lead_id),
  CONSTRAINT eod_submission_leads_submission_org_fkey
    FOREIGN KEY (submission_id, org_id)
    REFERENCES public.eod_submissions (id, org_id)
    ON DELETE CASCADE,
  CONSTRAINT eod_submission_leads_lead_org_fkey
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id)
    ON DELETE CASCADE
);

COMMENT ON TABLE public.eod_submission_leads IS
  'Optional lead references attached to an end-of-day submission.';

CREATE INDEX eod_submission_leads_org_lead_idx
  ON public.eod_submission_leads (org_id, lead_id);

-- ---------------------------------------------------------------------------
-- Agent action audit. Every agent action must be writable here.
-- Distinct from operator_runs / agent_runs, which stay for the Operator runtime.
-- lead_id uses a single-column FK with ON DELETE SET NULL so org_id is never
-- nulled (a composite FK with SET NULL would clear org_id too). A trigger
-- rejects a lead that belongs to another workspace.
-- ---------------------------------------------------------------------------

CREATE TABLE public.agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid,
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_taken text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_events_actor_present CHECK (btrim(actor) <> ''),
  CONSTRAINT agent_events_lead_fkey
    FOREIGN KEY (lead_id)
    REFERENCES public.leads (id)
    ON DELETE SET NULL
);

COMMENT ON TABLE public.agent_events IS
  'Append-oriented audit of agent actions. Authenticated members may read their workspace; writes are service-role.';

CREATE INDEX agent_events_org_time_idx
  ON public.agent_events (org_id, occurred_at DESC);

CREATE INDEX agent_events_lead_time_idx
  ON public.agent_events (lead_id, occurred_at DESC)
  WHERE lead_id IS NOT NULL;

-- Same-org lead: reject a lead_id that belongs to another workspace.
CREATE OR REPLACE FUNCTION public.agent_events_same_org_lead()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.leads WHERE id = NEW.lead_id AND org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'agent_events.lead_id must belong to the same org';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_events_same_org_lead
  BEFORE INSERT OR UPDATE ON public.agent_events
  FOR EACH ROW EXECUTE FUNCTION public.agent_events_same_org_lead();

-- ---------------------------------------------------------------------------
-- Isolation. No cross-workspace read or write for authenticated.
-- ---------------------------------------------------------------------------

ALTER TABLE public.eod_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eod_submission_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY eod_submissions_all
  ON public.eod_submissions
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY eod_submission_leads_all
  ON public.eod_submission_leads
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY agent_events_select
  ON public.agent_events
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

REVOKE ALL ON TABLE public.eod_submissions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.eod_submission_leads FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.agent_events FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eod_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eod_submission_leads TO authenticated;
GRANT SELECT ON public.agent_events TO authenticated;

GRANT ALL ON TABLE public.eod_submissions TO service_role;
GRANT ALL ON TABLE public.eod_submission_leads TO service_role;
GRANT ALL ON TABLE public.agent_events TO service_role;
