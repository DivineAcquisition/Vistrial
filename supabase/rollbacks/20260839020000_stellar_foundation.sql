-- Rollback for 20260839020000_stellar_foundation.sql.
--
-- Dropping placements discards placement history, and dropping the DA access
-- log discards the audit trail of who looked into which client workspace.
-- Both are things the forward schema deliberately preserves, so this is only
-- acceptable as the rollback of a release that should not have shipped.
--
-- The product flag goes too. Every org falls back to the core default, which
-- is correct once no Stellar surface exists to read it.

DROP FUNCTION IF EXISTS public.stellar_da_get_placement(uuid);
DROP FUNCTION IF EXISTS public.stellar_da_list_placements();

DROP TRIGGER IF EXISTS placements_stamp_build_stage ON public.placements;
DROP TRIGGER IF EXISTS placements_set_updated_at ON public.placements;
DROP TRIGGER IF EXISTS stellar_build_stage_mappings_set_updated_at
  ON public.stellar_build_stage_mappings;

DROP TABLE IF EXISTS public.placements;
DROP TABLE IF EXISTS public.stellar_build_stage_mappings;

DROP FUNCTION IF EXISTS public.record_stellar_da_access(uuid, text, text);
DROP TABLE IF EXISTS public.stellar_da_access_log;

DROP FUNCTION IF EXISTS public.is_stellar_da_operator();
DROP TABLE IF EXISTS public.stellar_da_operators;

DROP FUNCTION IF EXISTS public.stamp_placement_build_stage_updated_at();

DROP INDEX IF EXISTS public.organizations_product_idx;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS product;

DROP TYPE IF EXISTS public.placement_build_stage;
DROP TYPE IF EXISTS public.placement_agreement_status;
DROP TYPE IF EXISTS public.org_product;
