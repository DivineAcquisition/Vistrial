-- Inverse of 20261003040000_drop_airtable_source.sql.
--
-- Puts the Airtable source type, its columns, the spend-sync log and the sync
-- job back. It cannot put the data back: a workspace converted to a core
-- source no longer carries the base ID it used to read, and the sync history
-- was dropped with the table. Restoring those means re-provisioning each
-- workspace by hand.

DROP INDEX IF EXISTS public.forsight_sources_one_metrics_source;

ALTER TABLE public.forsight_sources
  DROP CONSTRAINT IF EXISTS forsight_sources_meta_shape,
  DROP CONSTRAINT IF EXISTS forsight_sources_meta_only_fields,
  DROP CONSTRAINT IF EXISTS forsight_sources_ghl_only_fields;

-- Both tables hold the type, so both release it before it is rebuilt.
ALTER TABLE public.forsight_sources
  ALTER COLUMN source_type TYPE text;

ALTER TABLE public.forsight_reports
  ALTER COLUMN source_type TYPE text;

DROP TYPE public.forsight_source_type;

CREATE TYPE public.forsight_source_type AS ENUM (
  'airtable',
  'meta_ads',
  'ghl',
  'vistrial_core'
);

ALTER TABLE public.forsight_sources
  ALTER COLUMN source_type TYPE public.forsight_source_type
    USING source_type::public.forsight_source_type;

ALTER TABLE public.forsight_reports
  ALTER COLUMN source_type TYPE public.forsight_source_type
    USING source_type::public.forsight_source_type;

ALTER TABLE public.forsight_sources
  ADD COLUMN airtable_base_id text,
  ADD COLUMN airtable_leads_table text DEFAULT 'Leads',
  ADD COLUMN airtable_creatives_table text DEFAULT 'Creatives',
  ADD COLUMN airtable_weekly_summary_table text DEFAULT 'Weekly Summary',
  ADD COLUMN airtable_touches_table text DEFAULT 'Touches';

-- Nothing is an Airtable source after the forward migration, so every row
-- must have these cleared for the only-fields constraint to hold. The column
-- defaults stay, because that is the shape the original table had.
UPDATE public.forsight_sources
SET airtable_leads_table = NULL,
    airtable_creatives_table = NULL,
    airtable_weekly_summary_table = NULL,
    airtable_touches_table = NULL;

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

CREATE UNIQUE INDEX forsight_sources_one_metrics_source
  ON public.forsight_sources (org_id)
  WHERE source_type IN ('airtable', 'vistrial_core');

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

CREATE INDEX forsight_sync_runs_last_success_idx
  ON public.forsight_sync_runs (org_id, source_type, period_end DESC)
  WHERE status = 'succeeded';

COMMENT ON TABLE public.forsight_sync_runs IS
  'One row per Forsight sync attempt. The only write Forsight makes is Meta spend into Airtable; this is the receipt for it.';
COMMENT ON COLUMN public.forsight_sync_runs.unmatched_ads IS
  'Meta ad names with no Airtable creative of the same name. Never auto-created, never fuzzy matched.';

ALTER TABLE public.forsight_sync_runs ENABLE ROW LEVEL SECURITY;

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

COMMENT ON TABLE public.forsight_sources IS
  'Where a workspace''s Forsight metrics come from. Readable by that workspace''s members; writable only by DA operators. Holds no credentials.';
