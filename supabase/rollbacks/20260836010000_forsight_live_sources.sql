-- Rollback for 20260836010000_forsight_live_sources.sql.
-- Drops the GHL source type and the sync log. Any GHL source rows go with it,
-- which is correct: without the type there is nothing to read them with.

DELETE FROM public.ops_job_runs WHERE job_name = 'forsight-meta-sync';
DELETE FROM public.ops_job_catalog WHERE job_name = 'forsight-meta-sync';

DROP TABLE IF EXISTS public.forsight_sync_runs;
DROP TYPE IF EXISTS public.forsight_sync_status;

DELETE FROM public.forsight_sources WHERE source_type = 'ghl';

ALTER TABLE public.forsight_sources
  DROP CONSTRAINT IF EXISTS forsight_sources_ghl_only_fields,
  DROP CONSTRAINT IF EXISTS forsight_sources_airtable_shape,
  DROP CONSTRAINT IF EXISTS forsight_sources_meta_shape,
  DROP CONSTRAINT IF EXISTS forsight_sources_airtable_only_fields,
  DROP CONSTRAINT IF EXISTS forsight_sources_meta_only_fields;

ALTER TABLE public.forsight_sources
  DROP COLUMN IF EXISTS ghl_calendar_id;

ALTER TABLE public.forsight_sources
  ALTER COLUMN source_type TYPE text;

DROP TYPE public.forsight_source_type;

CREATE TYPE public.forsight_source_type AS ENUM ('airtable', 'meta_ads');

ALTER TABLE public.forsight_sources
  ALTER COLUMN source_type TYPE public.forsight_source_type
    USING source_type::public.forsight_source_type;

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
  RETURN NEW;
END;
$$;
