-- The Sales OS switch replaced the flag list and dropped sales_calendar.
-- Put it back beside sales_os. Off unless a row says on.

ALTER TABLE public.workspace_flags DROP CONSTRAINT IF EXISTS workspace_flags_flag_check;
ALTER TABLE public.workspace_flags ADD CONSTRAINT workspace_flags_flag_check
  CHECK (flag IN ('agent_sidebar', 'workflows', 'sales_os', 'sales_calendar'));
