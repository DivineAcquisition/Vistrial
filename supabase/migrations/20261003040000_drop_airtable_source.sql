-- Forsight reads this workspace. Airtable is gone from the schema.
--
-- Every number Forsight reports — leads, touches, calls, revenue — is already
-- in Vistrial's own tables, and `vistrial_core` reads them directly. Keeping a
-- second source type that copied our data into somebody else's product left
-- two answers to "where do this workspace's weekly numbers come from", and the
-- one that required an operator to paste a base ID was always the worse one.
--
-- Workspaces still on the Airtable source become core sources, which read the
-- same workspace through the same row-level security. The spend sync that
-- wrote Meta totals back into a base has no destination now, so its log table
-- and its job row go with it; the Meta source stays, and Forsight reads spend
-- from it live.

-- The partial index names 'airtable', so it comes down before the value does.
DROP INDEX IF EXISTS public.forsight_sources_one_metrics_source;

-- Every CHECK that mentions source_type comes off before the type is rebuilt,
-- the same way the migrations that added 'ghl' and 'vistrial_core' did it: a
-- constraint cannot be re-validated against a type that is being replaced
-- underneath it.
ALTER TABLE public.forsight_sources
  DROP CONSTRAINT IF EXISTS forsight_sources_airtable_shape,
  DROP CONSTRAINT IF EXISTS forsight_sources_airtable_only_fields,
  DROP CONSTRAINT IF EXISTS forsight_sources_meta_shape,
  DROP CONSTRAINT IF EXISTS forsight_sources_meta_only_fields,
  DROP CONSTRAINT IF EXISTS forsight_sources_ghl_only_fields;

-- The partial unique index that just came down meant a workspace could never
-- hold an Airtable row and a core row at once, so converting in place cannot
-- collide. The base ID is dropped with the column below: core needs no
-- configuration, and a stale base ID would only be a lie about where the
-- numbers come from.
UPDATE public.forsight_sources
SET source_type = 'vistrial_core',
    last_verified_at = NULL,
    last_error = NULL
WHERE source_type = 'airtable';

-- The log of a sync that no longer has anywhere to write. Nothing in the app
-- reads it.
DROP TABLE IF EXISTS public.forsight_sync_runs;
DROP TYPE IF EXISTS public.forsight_sync_status;

DELETE FROM public.ops_job_runs WHERE job_name = 'forsight-meta-sync';
DELETE FROM public.ops_job_catalog WHERE job_name = 'forsight-meta-sync';

ALTER TABLE public.forsight_sources
  DROP COLUMN IF EXISTS airtable_base_id,
  DROP COLUMN IF EXISTS airtable_leads_table,
  DROP COLUMN IF EXISTS airtable_creatives_table,
  DROP COLUMN IF EXISTS airtable_weekly_summary_table,
  DROP COLUMN IF EXISTS airtable_touches_table;

-- A report is frozen at generation and a trigger enforces that, but the type
-- it records is about to lose a value. The payload — every figure a client
-- read — is not touched here; only the label for where those figures came
-- from, and the workspace is that place either way now. The trigger goes down
-- for this one statement and comes straight back up.
ALTER TABLE public.forsight_reports DISABLE TRIGGER forsight_reports_no_update;

UPDATE public.forsight_reports
SET source_type = 'vistrial_core'
WHERE source_type = 'airtable';

ALTER TABLE public.forsight_reports ENABLE TRIGGER forsight_reports_no_update;

ALTER TABLE public.forsight_sources
  ALTER COLUMN source_type TYPE text;

ALTER TABLE public.forsight_reports
  ALTER COLUMN source_type TYPE text;

DROP TYPE public.forsight_source_type;

CREATE TYPE public.forsight_source_type AS ENUM (
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

-- A core source carries no configuration at all: the workspace it belongs to
-- is the whole address. Meta and GHL keep theirs, and keep it to themselves.
ALTER TABLE public.forsight_sources
  ADD CONSTRAINT forsight_sources_meta_shape CHECK (
    source_type <> 'meta_ads'
    OR (meta_ad_account_id IS NOT NULL AND btrim(meta_ad_account_id) <> '')
  ),
  ADD CONSTRAINT forsight_sources_meta_only_fields CHECK (
    source_type = 'meta_ads' OR meta_ad_account_id IS NULL
  ),
  ADD CONSTRAINT forsight_sources_ghl_only_fields CHECK (
    source_type = 'ghl' OR ghl_calendar_id IS NULL
  );

-- A workspace still reads its metrics from exactly one place; core is now the
-- only thing that can answer, so the index guards against a duplicate row.
CREATE UNIQUE INDEX forsight_sources_one_metrics_source
  ON public.forsight_sources (org_id)
  WHERE source_type = 'vistrial_core';

CREATE OR REPLACE FUNCTION public.forsight_sources_clear_foreign_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source_type <> 'meta_ads' THEN
    NEW.meta_ad_account_id := NULL;
  END IF;
  IF NEW.source_type <> 'ghl' THEN
    NEW.ghl_calendar_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON TABLE public.forsight_sources IS
  'What a workspace''s Forsight reads besides its own tables: an ad account, a calendar, or nothing. Readable by that workspace''s members; writable only by DA operators. Holds no credentials.';
