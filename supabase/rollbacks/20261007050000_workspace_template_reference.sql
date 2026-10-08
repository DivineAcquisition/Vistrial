-- Rolls back 20261007050000_workspace_template_reference.sql. The column keeps
-- its values; only the link to templates and the syncing are removed.

DROP TRIGGER IF EXISTS organizations_template_matches_pin ON public.organizations;
DROP TRIGGER IF EXISTS workspace_config_pins_sync_template ON public.workspace_config_pins;
DROP FUNCTION IF EXISTS public.organizations_template_matches_pin();
DROP FUNCTION IF EXISTS public.config_pin_sync_template();
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_industry_template_id_fkey;

COMMENT ON COLUMN public.organizations.industry_template_id IS
  'Industry template this workspace inherits configuration from. The templates table arrives with the configuration system; until then this stays null.';
