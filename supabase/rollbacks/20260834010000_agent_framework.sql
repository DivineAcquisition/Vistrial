DROP FUNCTION IF EXISTS public.activity_stream_source(uuid, timestamptz, timestamptz);

ALTER FUNCTION public.activity_stream_source_v21(uuid, timestamptz, timestamptz)
  RENAME TO activity_stream_source;

REVOKE ALL ON FUNCTION public.activity_stream_source(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activity_stream_source(uuid, timestamptz, timestamptz) TO service_role;

DROP FUNCTION IF EXISTS public.activity_stream_agent_framework(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.agent_run_visible(uuid);

DROP TABLE IF EXISTS public.agent_research_facts;
DROP TABLE IF EXISTS public.agent_assets;
DROP TABLE IF EXISTS public.agent_escalations;
DROP TABLE IF EXISTS public.agent_run_approvals;
DROP TABLE IF EXISTS public.agent_run_steps;
DROP TABLE IF EXISTS public.agent_runs;
DROP TABLE IF EXISTS public.org_agent_settings;
DROP TABLE IF EXISTS public.agent_model_routes;

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_agent_run_as_member_fkey;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS last_interactive_at;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS agent_run_as_member_id;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS agent_calendar_writes_halted;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS agent_crm_writes_halted;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS agents_halted;

DROP INDEX IF EXISTS public.org_members_one_agent_identity;
ALTER TABLE public.org_members DROP COLUMN IF EXISTS is_agent_identity;

DELETE FROM public.ops_job_runs WHERE job_name = 'agent-runtime';
DELETE FROM public.ops_job_catalog WHERE job_name = 'agent-runtime';
