-- The monthly client report.
--
-- A report is a snapshot, frozen at generation. Every value it contains is
-- written here once and read back unchanged forever after, because a client
-- will quote a number from it in a conversation three months later and a
-- figure that has quietly moved since destroys more trust than a bad figure
-- ever did.
--
-- That is the opposite of every other Forsight surface, and it is the point.

CREATE TYPE public.forsight_report_actor AS ENUM ('scheduled', 'operator');

CREATE TABLE public.forsight_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  -- Always the first of the calendar month the report covers.
  period_start date NOT NULL,
  period_end date NOT NULL,
  version integer NOT NULL DEFAULT 1,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by public.forsight_report_actor NOT NULL,
  generated_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  -- Snapshot of who generated it, kept even if the member row later disappears.
  generated_by_name text,
  source_type public.forsight_source_type NOT NULL,
  -- Every computed value, exactly as it will be read back.
  payload jsonb NOT NULL,
  -- Lines this workspace's source could not produce, for an operator to see.
  omissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT forsight_reports_period CHECK (period_end >= period_start),
  CONSTRAINT forsight_reports_first_of_month CHECK (
    period_start = (date_trunc('month', period_start::timestamp))::date
  ),
  CONSTRAINT forsight_reports_version_positive CHECK (version >= 1),
  CONSTRAINT forsight_reports_version_key UNIQUE (org_id, period_start, version)
);

CREATE INDEX forsight_reports_latest_idx
  ON public.forsight_reports (org_id, period_start DESC, version DESC);

COMMENT ON TABLE public.forsight_reports IS
  'Frozen monthly client reports. Never mutated. A correction is a new version. Rows only leave with the workspace.';
COMMENT ON COLUMN public.forsight_reports.payload IS
  'The report as generated. Viewing reads this and never re-queries the source.';

-- ---------------------------------------------------------------------------
-- Frozen means frozen.
--
-- Regeneration writes a new version beside the old one. Nothing rewrites a
-- report that a client may already have read. Application roles cannot DELETE;
-- the only delete is the workspace itself going away, via ON DELETE CASCADE.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.forsight_reports_are_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'A generated report is never edited. Generate a new version instead.';
END;
$$;

CREATE TRIGGER forsight_reports_no_update
  BEFORE UPDATE ON public.forsight_reports
  FOR EACH ROW EXECUTE FUNCTION public.forsight_reports_are_immutable();

-- Next version for a period. 1 when nothing has been generated yet.
CREATE OR REPLACE FUNCTION public.forsight_next_report_version(p_org_id uuid, p_period_start date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(version), 0) + 1
  FROM public.forsight_reports
  WHERE org_id = p_org_id AND period_start = p_period_start;
$$;

REVOKE ALL ON FUNCTION public.forsight_next_report_version(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forsight_next_report_version(uuid, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sending. Explicit, operator-initiated, and logged down to the addresses.
-- Nothing reaches a client without somebody deciding it should.
-- Vistrial has no per-workspace contacts table; recipients are the active
-- owner and admin members of the workspace.
-- ---------------------------------------------------------------------------

CREATE TABLE public.forsight_report_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.forsight_reports (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  version integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  sent_by_email text,
  recipients text[] NOT NULL,
  provider_id text,
  error text,
  CONSTRAINT forsight_report_sends_recipients_present CHECK (cardinality(recipients) > 0)
);

CREATE INDEX forsight_report_sends_report_idx
  ON public.forsight_report_sends (report_id, sent_at DESC);

COMMENT ON TABLE public.forsight_report_sends IS
  'Who sent which version of which report, to whom, and when. Append-only.';

CREATE TRIGGER forsight_report_sends_no_update
  BEFORE UPDATE ON public.forsight_report_sends
  FOR EACH ROW EXECUTE FUNCTION public.forsight_reports_are_immutable();

-- ---------------------------------------------------------------------------
-- A client reads their own workspace's reports. Nobody writes through the API.
-- ---------------------------------------------------------------------------

ALTER TABLE public.forsight_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forsight_report_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY forsight_reports_select
  ON public.forsight_reports FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

-- Sends are operational history, not part of the client's document.
CREATE POLICY forsight_report_sends_select
  ON public.forsight_report_sends FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON TABLE public.forsight_reports FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.forsight_report_sends FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.forsight_reports TO authenticated;
GRANT SELECT ON TABLE public.forsight_report_sends TO authenticated;
GRANT SELECT, INSERT ON TABLE public.forsight_reports TO service_role;
GRANT SELECT, INSERT ON TABLE public.forsight_report_sends TO service_role;

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'forsight-reports',
  '0 9 3 * *',
  2592000,
  172800,
  'Open forsight_reports for last month. Generation never sends; an operator does that. Check omissions on each row for lines a workspace could not produce.'
)
ON CONFLICT (job_name) DO UPDATE
  SET cron_expr = EXCLUDED.cron_expr,
      interval_seconds = EXCLUDED.interval_seconds,
      grace_seconds = EXCLUDED.grace_seconds,
      check_first = EXCLUDED.check_first;

INSERT INTO public.ops_job_runs (job_name, last_success_at, updated_at)
VALUES ('forsight-reports', now(), now())
ON CONFLICT (job_name) DO NOTHING;
