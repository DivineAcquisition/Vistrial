-- Forsight live sources: GoHighLevel as a third source type, and the log for
-- the one scheduled write Forsight performs.
--
-- GHL credentials are deliberately absent from this table. Vistrial already
-- holds a per-sub-account OAuth connection in `ghl_connections`, and Forsight
-- reads through it rather than standing up a second one. What the source
-- record adds is which calendar to read, because the existing integration
-- lists every calendar on a location and never persists a chosen one.

-- `ALTER TYPE ... ADD VALUE` cannot be used by a constraint in the same
-- transaction, and this migration needs the new value in CHECK expressions.
-- Rebuilding the type sidesteps that entirely.
ALTER TABLE public.forsight_sources
  DROP CONSTRAINT forsight_sources_airtable_shape,
  DROP CONSTRAINT forsight_sources_meta_shape,
  DROP CONSTRAINT forsight_sources_airtable_only_fields,
  DROP CONSTRAINT forsight_sources_meta_only_fields;

ALTER TABLE public.forsight_sources
  ALTER COLUMN source_type TYPE text;

DROP TYPE public.forsight_source_type;

CREATE TYPE public.forsight_source_type AS ENUM ('airtable', 'meta_ads', 'ghl');

ALTER TABLE public.forsight_sources
  ALTER COLUMN source_type TYPE public.forsight_source_type
    USING source_type::public.forsight_source_type;

-- Which calendar the appointment read covers. NULL means every calendar on the
-- location, which is what the rest of Vistrial already does.
ALTER TABLE public.forsight_sources
  ADD COLUMN ghl_calendar_id text;

COMMENT ON COLUMN public.forsight_sources.ghl_calendar_id IS
  'GHL calendar to read appointments from. NULL reads every calendar on the location. Credentials come from ghl_connections, never from here.';

ALTER TABLE public.forsight_sources
  ADD CONSTRAINT forsight_sources_airtable_shape CHECK (
    source_type <> 'airtable'
    OR (airtable_base_id IS NOT NULL AND btrim(airtable_base_id) <> '')
  ),
  ADD CONSTRAINT forsight_sources_meta_shape CHECK (
    source_type <> 'meta_ads'
    OR (meta_ad_account_id IS NOT NULL AND btrim(meta_ad_account_id) <> '')
  ),
  ADD CONSTRAINT forsight_sources_airtable_only_fields CHECK (
    source_type = 'airtable'
    OR (
      airtable_base_id IS NULL
      AND airtable_leads_table IS NULL
      AND airtable_creatives_table IS NULL
      AND airtable_weekly_summary_table IS NULL
      AND airtable_touches_table IS NULL
    )
  ),
  ADD CONSTRAINT forsight_sources_meta_only_fields CHECK (
    source_type = 'meta_ads' OR meta_ad_account_id IS NULL
  ),
  ADD CONSTRAINT forsight_sources_ghl_only_fields CHECK (
    source_type = 'ghl' OR ghl_calendar_id IS NULL
  );

CREATE OR REPLACE FUNCTION public.forsight_sources_clear_foreign_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source_type <> 'airtable' THEN
    NEW.airtable_base_id := NULL;
    NEW.airtable_leads_table := NULL;
    NEW.airtable_creatives_table := NULL;
    NEW.airtable_weekly_summary_table := NULL;
    NEW.airtable_touches_table := NULL;
  END IF;
  IF NEW.source_type <> 'meta_ads' THEN
    NEW.meta_ad_account_id := NULL;
  END IF;
  IF NEW.source_type <> 'ghl' THEN
    NEW.ghl_calendar_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- The one write Forsight performs, and its receipts.
--
-- Meta spend has to land in Airtable because Airtable's cost formulas divide
-- by it. If spend only ever existed as a live read, either those formulas
-- break or the dashboard starts dividing, and the dashboard does not divide.
--
-- Every run is recorded whether it worked or not, including the ad names that
-- matched nothing. An unmatched ad is a naming mistake on our side that
-- somebody needs to see, not something for the sync to paper over.
-- ---------------------------------------------------------------------------

CREATE TYPE public.forsight_sync_status AS ENUM ('running', 'succeeded', 'failed');

CREATE TABLE public.forsight_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  source_type public.forsight_source_type NOT NULL,
  status public.forsight_sync_status NOT NULL DEFAULT 'running',
  period_start date,
  period_end date,
  creatives_written integer NOT NULL DEFAULT 0,
  weeks_written integer NOT NULL DEFAULT 0,
  spend_written numeric NOT NULL DEFAULT 0,
  unmatched_ads jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT forsight_sync_runs_counts_nonneg CHECK (
    creatives_written >= 0 AND weeks_written >= 0 AND spend_written >= 0
  )
);

CREATE INDEX forsight_sync_runs_org_started_idx
  ON public.forsight_sync_runs (org_id, started_at DESC);

-- Where the next run starts from. Only a run that finished cleanly counts, so
-- a failure leaves the period to be picked up again rather than skipped.
CREATE INDEX forsight_sync_runs_last_success_idx
  ON public.forsight_sync_runs (org_id, source_type, period_end DESC)
  WHERE status = 'succeeded';

COMMENT ON TABLE public.forsight_sync_runs IS
  'One row per Forsight sync attempt. The only write Forsight makes is Meta spend into Airtable; this is the receipt for it.';
COMMENT ON COLUMN public.forsight_sync_runs.unmatched_ads IS
  'Meta ad names with no Airtable creative of the same name. Never auto-created, never fuzzy matched.';

ALTER TABLE public.forsight_sync_runs ENABLE ROW LEVEL SECURITY;

-- Members can see their own workspace's runs, because a silently failing sync
-- is exactly the thing a workspace needs to be able to notice. Writing is the
-- job's business alone.
CREATE POLICY forsight_sync_runs_select
  ON public.forsight_sync_runs FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

REVOKE ALL ON TABLE public.forsight_sync_runs FROM PUBLIC, anon;
GRANT SELECT ON public.forsight_sync_runs TO authenticated;
GRANT ALL ON TABLE public.forsight_sync_runs TO service_role;

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'forsight-meta-sync',
  '0 8 * * *',
  86400,
  7200,
  'Open forsight_sync_runs for the last day. A failed run leaves its period unsynced on purpose; the next run redoes it. Check META_ACCESS_TOKEN and AIRTABLE_API_KEY, then unmatched_ads for creative naming drift.'
)
ON CONFLICT (job_name) DO UPDATE
  SET cron_expr = EXCLUDED.cron_expr,
      interval_seconds = EXCLUDED.interval_seconds,
      grace_seconds = EXCLUDED.grace_seconds,
      check_first = EXCLUDED.check_first;

INSERT INTO public.ops_job_runs (job_name, last_success_at, updated_at)
VALUES ('forsight-meta-sync', now(), now())
ON CONFLICT (job_name) DO NOTHING;
