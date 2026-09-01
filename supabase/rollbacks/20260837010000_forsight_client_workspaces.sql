-- Rollback for 20260837010000_forsight_client_workspaces.sql.
-- Removes the core source type and takes the operator write path away again.
-- Core-source workspaces lose their source row: without the type there is
-- nothing to read them with.

DROP POLICY IF EXISTS forsight_sources_operator_insert ON public.forsight_sources;
DROP POLICY IF EXISTS forsight_sources_operator_update ON public.forsight_sources;
DROP POLICY IF EXISTS forsight_sources_operator_delete ON public.forsight_sources;

REVOKE INSERT, UPDATE, DELETE ON public.forsight_sources FROM authenticated;

DROP INDEX IF EXISTS public.forsight_sources_one_metrics_source;

DELETE FROM public.forsight_sources WHERE source_type = 'vistrial_core';
DELETE FROM public.forsight_sync_runs WHERE source_type = 'vistrial_core';

ALTER TABLE public.forsight_sources
  DROP CONSTRAINT IF EXISTS forsight_sources_airtable_shape,
  DROP CONSTRAINT IF EXISTS forsight_sources_meta_shape,
  DROP CONSTRAINT IF EXISTS forsight_sources_airtable_only_fields,
  DROP CONSTRAINT IF EXISTS forsight_sources_meta_only_fields,
  DROP CONSTRAINT IF EXISTS forsight_sources_ghl_only_fields;

ALTER TABLE public.forsight_sources
  ALTER COLUMN source_type TYPE text;

ALTER TABLE public.forsight_sync_runs
  ALTER COLUMN source_type TYPE text;

DROP TYPE public.forsight_source_type;

CREATE TYPE public.forsight_source_type AS ENUM ('airtable', 'meta_ads', 'ghl');

ALTER TABLE public.forsight_sources
  ALTER COLUMN source_type TYPE public.forsight_source_type
    USING source_type::public.forsight_source_type;

ALTER TABLE public.forsight_sync_runs
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
  ),
  ADD CONSTRAINT forsight_sources_ghl_only_fields CHECK (
    source_type = 'ghl' OR ghl_calendar_id IS NULL
  );

COMMENT ON TABLE public.forsight_sources IS
  'Where a workspace''s Forsight metrics come from. Read-only. Holds no credentials.';
