-- Rolls back 20261022130000_sales_calendar.sql.

BEGIN;

REVOKE INSERT ON public.calendar_blocks FROM authenticated;
DROP POLICY IF EXISTS calendar_blocks_insert_hold ON public.calendar_blocks;
DROP POLICY IF EXISTS calendar_blocks_select_own_hold ON public.calendar_blocks;
DROP POLICY IF EXISTS calendar_blocks_select_visible_lead ON public.calendar_blocks;

ALTER TABLE public.calendar_blocks DROP CONSTRAINT IF EXISTS calendar_blocks_kind_check;
ALTER TABLE public.calendar_blocks
  ADD CONSTRAINT calendar_blocks_kind_check
  CHECK (kind IN ('availability', 'booked', 'no_show'));

DROP INDEX IF EXISTS public.workflow_enrollments_org_due_idx;
DROP INDEX IF EXISTS public.calendar_blocks_org_start_idx;
DROP INDEX IF EXISTS public.sentry_clocks_open_deadline_idx;
DROP INDEX IF EXISTS public.calls_org_occurred_idx;
DROP INDEX IF EXISTS public.calls_org_scheduled_idx;

UPDATE public.agent_areas
SET work_page = work_page - 'also' || jsonb_build_object(
  'also', COALESCE((
    SELECT jsonb_agg(page)
    FROM jsonb_array_elements(COALESCE(work_page -> 'also', '[]'::jsonb)) AS page
    WHERE page ->> 'href' IS DISTINCT FROM '/app/calendar'
  ), '[]'::jsonb)
)
WHERE id = 'sales' AND work_page ? 'also';

UPDATE public.agent_areas
SET work_page = work_page - 'also'
WHERE id = 'sales' AND jsonb_array_length(COALESCE(work_page -> 'also', '[]'::jsonb)) = 0;

DELETE FROM public.workspace_flags WHERE flag = 'sales_calendar';
ALTER TABLE public.workspace_flags DROP CONSTRAINT IF EXISTS workspace_flags_flag_check;
ALTER TABLE public.workspace_flags ADD CONSTRAINT workspace_flags_flag_check
  CHECK (flag IN ('agent_sidebar', 'workflows'));

COMMIT;
