-- organizations.industry_template_id was added with workspace isolation, before
-- templates existed. The workspace's template now lives on its configuration
-- pin; this column mirrors that pin so it can never disagree with what the
-- workspace actually resolves against.

UPDATE public.organizations o
SET industry_template_id = p.template_id
FROM public.workspace_config_pins p
WHERE p.org_id = o.id
  AND o.industry_template_id IS DISTINCT FROM p.template_id;

UPDATE public.organizations o
SET industry_template_id = NULL
WHERE o.industry_template_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.workspace_config_pins p WHERE p.org_id = o.id);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_industry_template_id_fkey
  FOREIGN KEY (industry_template_id) REFERENCES public.config_templates (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.organizations.industry_template_id IS
  'Industry template this workspace inherits configuration from. A copy of workspace_config_pins.template_id, kept in step by trigger; change it by switching templates under Configuration.';

CREATE OR REPLACE FUNCTION public.config_pin_sync_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.organizations
  SET industry_template_id = NEW.template_id
  WHERE id = NEW.org_id
    AND industry_template_id IS DISTINCT FROM NEW.template_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER workspace_config_pins_sync_template
  AFTER INSERT OR UPDATE OF template_id ON public.workspace_config_pins
  FOR EACH ROW EXECUTE FUNCTION public.config_pin_sync_template();

-- Writing the column directly would let it drift from the pin.
CREATE OR REPLACE FUNCTION public.organizations_template_matches_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.industry_template_id IS DISTINCT FROM
     (SELECT template_id FROM public.workspace_config_pins WHERE org_id = NEW.id) THEN
    RAISE EXCEPTION 'A workspace''s template is changed by switching templates under Configuration, not directly.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_template_matches_pin
  BEFORE INSERT OR UPDATE OF industry_template_id ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_template_matches_pin();

REVOKE ALL ON FUNCTION public.config_pin_sync_template() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.organizations_template_matches_pin() FROM PUBLIC, anon, authenticated;
