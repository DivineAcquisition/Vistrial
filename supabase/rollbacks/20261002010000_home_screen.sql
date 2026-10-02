-- Inverse of 20261002010000_home_screen.sql.
-- Drops the approval queue, approval gate settings, their history, and the job row.

DELETE FROM public.ops_job_catalog WHERE job_name = 'home-agents';

DROP FUNCTION IF EXISTS public.mark_approval_gate_reviewed(uuid, boolean);
DROP FUNCTION IF EXISTS public.set_approval_gate_limits(uuid, time, time, integer, integer);
DROP FUNCTION IF EXISTS public.set_approval_gate_action(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.approval_gate_require_owner(uuid);
DROP FUNCTION IF EXISTS public.approval_gate_actor(uuid);
DROP FUNCTION IF EXISTS public.approval_gate_mode(uuid, text);

DROP TABLE IF EXISTS public.approval_items;
DROP FUNCTION IF EXISTS public.approval_items_same_org_leads();
DROP TABLE IF EXISTS public.approval_gate_changes;
DROP TABLE IF EXISTS public.approval_gate_actions;
DROP TABLE IF EXISTS public.approval_gate_settings;
DROP TABLE IF EXISTS public.approval_action_types;
