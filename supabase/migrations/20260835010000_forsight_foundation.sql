-- Forsight foundation: per-workspace metric sources.
--
-- Forsight never owns metric data. It reads whatever a workspace's source
-- already calculates. The source is a row here, not an environment variable,
-- so a new client is a row insert and not a deployment.
--
-- Credentials do not live here. Airtable and Meta both authenticate with a
-- single Divine Acquisition credential held in environment configuration,
-- because DA owns every base and ad account involved. Nothing in this table
-- is a secret, which is why authenticated members may read whole rows.

CREATE TYPE public.forsight_source_type AS ENUM ('airtable', 'meta_ads');

CREATE TABLE public.forsight_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  source_type public.forsight_source_type NOT NULL,
  status public.ghl_connection_status NOT NULL DEFAULT 'active',
  label text,

  -- Airtable. One base per workspace, duplicated from the master template.
  airtable_base_id text,
  -- Table names inside that base. NULL means the base does not have it, and
  -- the display layer treats those metrics as unavailable rather than broken.
  airtable_leads_table text DEFAULT 'Leads',
  airtable_creatives_table text DEFAULT 'Creatives',
  airtable_weekly_summary_table text DEFAULT 'Weekly Summary',
  airtable_touches_table text DEFAULT 'Touches',

  -- Meta Marketing API. Only some workspaces track their own ad account.
  meta_ad_account_id text,

  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT forsight_sources_org_type_key UNIQUE (org_id, source_type),
  CONSTRAINT forsight_sources_airtable_shape CHECK (
    source_type <> 'airtable'
    OR (airtable_base_id IS NOT NULL AND btrim(airtable_base_id) <> '')
  ),
  CONSTRAINT forsight_sources_meta_shape CHECK (
    source_type <> 'meta_ads'
    OR (meta_ad_account_id IS NOT NULL AND btrim(meta_ad_account_id) <> '')
  ),
  CONSTRAINT forsight_sources_airtable_only_fields CHECK (
    source_type = 'airtable'
    OR (
      airtable_base_id IS NULL
      AND airtable_leads_table IS NULL
      AND airtable_creatives_table IS NULL
      AND airtable_weekly_summary_table IS NULL
      AND airtable_touches_table IS NULL
    )
  ),
  CONSTRAINT forsight_sources_meta_only_fields CHECK (
    source_type = 'meta_ads' OR meta_ad_account_id IS NULL
  )
);

CREATE INDEX forsight_sources_org_idx ON public.forsight_sources (org_id);

COMMENT ON TABLE public.forsight_sources IS
  'Where a workspace''s Forsight metrics come from. Read-only. Holds no credentials.';
COMMENT ON COLUMN public.forsight_sources.airtable_leads_table IS
  'NULL means this base has no Leads table, so those metrics read as unavailable.';
COMMENT ON COLUMN public.forsight_sources.meta_ad_account_id IS
  'act_-prefixed Meta ad account. Only workspaces whose spend Forsight tracks have one.';

CREATE TRIGGER forsight_sources_set_updated_at
  BEFORE UPDATE ON public.forsight_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The table-name columns default to the master template's names so the common
-- case is a one-column insert. They mean nothing on a source that is not an
-- Airtable base, so clear them there rather than reject the row.
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

CREATE TRIGGER forsight_sources_clear_foreign_fields
  BEFORE INSERT OR UPDATE ON public.forsight_sources
  FOR EACH ROW EXECUTE FUNCTION public.forsight_sources_clear_foreign_fields();

-- ---------------------------------------------------------------------------
-- Isolation. A workspace's source is visible to that workspace's members only.
-- Writes are an internal operator action, so authenticated has no write path.
-- ---------------------------------------------------------------------------

ALTER TABLE public.forsight_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY forsight_sources_select
  ON public.forsight_sources FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

REVOKE ALL ON TABLE public.forsight_sources FROM PUBLIC, anon;
GRANT SELECT ON public.forsight_sources TO authenticated;
GRANT ALL ON TABLE public.forsight_sources TO service_role;
