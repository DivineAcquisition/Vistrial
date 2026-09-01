-- Forsight client workspaces: the Vistrial-core source type, and the write
-- path an operator needs to provision a client.
--
-- Clients whose lead, touch and outcome activity is already logged in
-- Vistrial's core tables should not have to reach it through an Airtable base
-- we copied our own data into. `vistrial_core` reads those tables directly and
-- presents them in the same shape the Airtable adapter presents, so the
-- dashboard pages cannot tell the two apart.
--
-- Existing Airtable-source clients are untouched. Nothing migrates.

ALTER TABLE public.forsight_sources
  DROP CONSTRAINT forsight_sources_airtable_shape,
  DROP CONSTRAINT forsight_sources_meta_shape,
  DROP CONSTRAINT forsight_sources_airtable_only_fields,
  DROP CONSTRAINT forsight_sources_meta_only_fields,
  DROP CONSTRAINT forsight_sources_ghl_only_fields;

ALTER TABLE public.forsight_sources
  ALTER COLUMN source_type TYPE text;

ALTER TABLE public.forsight_sync_runs
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

ALTER TABLE public.forsight_sync_runs
  ALTER COLUMN source_type TYPE public.forsight_source_type
    USING source_type::public.forsight_source_type;

-- A core source needs no configuration at all: the workspace it belongs to is
-- the whole address, and the same RLS that protects every other table is what
-- scopes it.
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

-- A workspace reads its metrics from exactly one place. Airtable and core both
-- answer "where do this workspace's weekly numbers come from", so having both
-- would leave the answer ambiguous.
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

-- ---------------------------------------------------------------------------
-- Provisioning is an operator action, enforced where it cannot be bypassed.
--
-- Until now nobody could write this table through the API at all; source rows
-- were inserted by hand. That does not scale past a few clients, so operators
-- get a screen. The rule that clients never touch configuration is unchanged,
-- and it is kept by row-level security rather than by hiding a link: a client
-- user's INSERT, UPDATE and DELETE are refused by Postgres.
--
-- `is_platform_admin()` is the existing DA-operator concept. No new permission
-- is introduced here.
-- ---------------------------------------------------------------------------

CREATE POLICY forsight_sources_operator_insert
  ON public.forsight_sources FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY forsight_sources_operator_update
  ON public.forsight_sources FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY forsight_sources_operator_delete
  ON public.forsight_sources FOR DELETE TO authenticated
  USING (public.is_platform_admin());

GRANT INSERT, UPDATE, DELETE ON public.forsight_sources TO authenticated;

COMMENT ON TABLE public.forsight_sources IS
  'Where a workspace''s Forsight metrics come from. Readable by that workspace''s members; writable only by DA operators. Holds no credentials.';
