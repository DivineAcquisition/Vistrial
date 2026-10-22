-- Prompt 26: the Sales OS ships behind a per-workspace switch, set by Vistrial
-- staff and logged like the others. Off unless a row says on.
ALTER TABLE public.workspace_flags DROP CONSTRAINT IF EXISTS workspace_flags_flag_check;
ALTER TABLE public.workspace_flags ADD CONSTRAINT workspace_flags_flag_check
  CHECK (flag IN ('agent_sidebar', 'workflows', 'sales_os'));
