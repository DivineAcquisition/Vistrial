-- Prompt 18 rollback.

DROP POLICY IF EXISTS operator_run_leads_insert_owner ON public.operator_run_leads;
DROP POLICY IF EXISTS operator_run_leads_select ON public.operator_run_leads;
DROP POLICY IF EXISTS operator_run_confirmations_update_owner ON public.operator_run_confirmations;
DROP POLICY IF EXISTS operator_run_confirmations_insert_owner ON public.operator_run_confirmations;
DROP POLICY IF EXISTS operator_run_confirmations_select ON public.operator_run_confirmations;
DROP POLICY IF EXISTS operator_run_steps_update_owner ON public.operator_run_steps;
DROP POLICY IF EXISTS operator_run_steps_insert_owner ON public.operator_run_steps;
DROP POLICY IF EXISTS operator_run_steps_select ON public.operator_run_steps;
DROP POLICY IF EXISTS operator_runs_update_self ON public.operator_runs;
DROP POLICY IF EXISTS operator_runs_insert_self ON public.operator_runs;
DROP POLICY IF EXISTS operator_runs_select ON public.operator_runs;

DROP FUNCTION IF EXISTS public.consume_operator_agent_rate_limit(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.operator_run_visible(uuid);
DROP FUNCTION IF EXISTS public.operator_run_is_owner(uuid);
DROP FUNCTION IF EXISTS public.operator_run_user_is_self(uuid);

DROP TABLE IF EXISTS public.operator_run_leads;
DROP TABLE IF EXISTS public.operator_run_confirmations;
DROP TABLE IF EXISTS public.operator_run_steps;
DROP TABLE IF EXISTS public.operator_runs;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_operator_agent_batch_cap_range;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS operator_agent_batch_cap;

ALTER TABLE public.org_members
  DROP CONSTRAINT IF EXISTS org_members_id_org_key;
