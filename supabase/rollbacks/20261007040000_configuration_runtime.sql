-- Rolls back 20261007040000_configuration_runtime.sql. Opt-outs recorded on
-- leads are kept in vistrial_rollback_keep first so none is lost.

CREATE SCHEMA IF NOT EXISTS vistrial_rollback_keep;
DROP TABLE IF EXISTS vistrial_rollback_keep.lead_opt_outs;
CREATE TABLE vistrial_rollback_keep.lead_opt_outs AS
SELECT id AS lead_id, org_id, opted_out_at, opted_out_word, opted_out_channel
FROM public.leads
WHERE opted_out_at IS NOT NULL;

DROP FUNCTION IF EXISTS public.config_record_stop(uuid, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.config_resolve_stop(uuid, text);
DROP TABLE IF EXISTS public.config_stops;

DROP INDEX IF EXISTS public.leads_opted_out_idx;
ALTER TABLE public.leads
  DROP COLUMN IF EXISTS opted_out_at,
  DROP COLUMN IF EXISTS opted_out_word,
  DROP COLUMN IF EXISTS opted_out_channel;
