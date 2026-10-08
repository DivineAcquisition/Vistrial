-- Rolls back 20261007040000_configuration_runtime.sql. Opt-outs are kept in
-- vistrial_rollback_keep first so none is lost.

CREATE SCHEMA IF NOT EXISTS vistrial_rollback_keep;
DROP TABLE IF EXISTS vistrial_rollback_keep.lead_opt_outs;
CREATE TABLE vistrial_rollback_keep.lead_opt_outs AS SELECT * FROM public.lead_opt_outs;

DROP FUNCTION IF EXISTS public.config_agent_gate(uuid, text, text, text[]);
DROP FUNCTION IF EXISTS public.config_record_stop(uuid, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.config_resolve_stop(uuid, text);
DROP TABLE IF EXISTS public.config_stops;
DROP TABLE IF EXISTS public.lead_opt_outs;
