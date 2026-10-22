-- Rolls back 20261022230000_sales_calendar_flag.sql.

BEGIN;

DELETE FROM public.workspace_flags WHERE flag = 'sales_calendar';
ALTER TABLE public.workspace_flags DROP CONSTRAINT IF EXISTS workspace_flags_flag_check;
ALTER TABLE public.workspace_flags ADD CONSTRAINT workspace_flags_flag_check
  CHECK (flag IN ('agent_sidebar', 'workflows', 'sales_os'));

COMMIT;
