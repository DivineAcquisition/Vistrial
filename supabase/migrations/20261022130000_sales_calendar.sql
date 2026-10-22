-- Sales calendar: a view of records that already exist.
-- The page is pinned under Case Files and stays off until staff switch it on.

ALTER TABLE public.workspace_flags DROP CONSTRAINT IF EXISTS workspace_flags_flag_check;
ALTER TABLE public.workspace_flags ADD CONSTRAINT workspace_flags_flag_check
  CHECK (flag IN ('agent_sidebar', 'workflows', 'sales_calendar'));

UPDATE public.agent_areas
SET work_page = jsonb_set(
  work_page,
  '{also}',
  COALESCE(work_page -> 'also', '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'label', 'Calendar',
      'href', '/app/calendar',
      'roles', jsonb_build_array('owner', 'member', 'operator', 'service_team', 'platform_admin')
    )
  ),
  true
)
WHERE id = 'sales'
  AND jsonb_typeof(work_page) = 'object'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(work_page -> 'also', '[]'::jsonb)) AS page
    WHERE page ->> 'href' = '/app/calendar'
  );

CREATE INDEX IF NOT EXISTS calls_org_scheduled_idx
  ON public.calls (org_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS calls_org_occurred_idx
  ON public.calls (org_id, occurred_at)
  WHERE occurred_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS sentry_clocks_open_deadline_idx
  ON public.sentry_clocks (org_id, deadline_at)
  WHERE state IN ('on_time', 'at_risk') AND deadline_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS calendar_blocks_org_start_idx
  ON public.calendar_blocks (org_id, starts_at);

CREATE INDEX IF NOT EXISTS workflow_enrollments_org_due_idx
  ON public.workflow_enrollments (org_id, next_due_at)
  WHERE status = 'active' AND next_due_at IS NOT NULL;

ALTER TABLE public.calendar_blocks DROP CONSTRAINT IF EXISTS calendar_blocks_kind_check;
ALTER TABLE public.calendar_blocks
  ADD CONSTRAINT calendar_blocks_kind_check
  CHECK (kind IN ('availability', 'booked', 'no_show', 'hold'));

DROP POLICY IF EXISTS calendar_blocks_select_visible_lead ON public.calendar_blocks;
CREATE POLICY calendar_blocks_select_visible_lead
  ON public.calendar_blocks FOR SELECT TO authenticated
  USING (
    lead_id IS NOT NULL
    AND public.ws_lead_visible(org_id, lead_id)
  );

DROP POLICY IF EXISTS calendar_blocks_select_own_hold ON public.calendar_blocks;
CREATE POLICY calendar_blocks_select_own_hold
  ON public.calendar_blocks FOR SELECT TO authenticated
  USING (
    kind = 'hold'
    AND member_id = public.user_member_id(org_id)
    AND (lead_id IS NULL OR public.ws_lead_visible(org_id, lead_id))
  );

DROP POLICY IF EXISTS calendar_blocks_insert_hold ON public.calendar_blocks;
CREATE POLICY calendar_blocks_insert_hold
  ON public.calendar_blocks FOR INSERT TO authenticated
  WITH CHECK (
    kind = 'hold'
    AND source = 'person'
    AND org_id IN (SELECT public.user_org_ids())
    AND (lead_id IS NULL OR public.ws_lead_visible(org_id, lead_id))
    AND (
      public.user_has_org_role(org_id, 'owner', 'admin')
      OR public.ws_is_staff(org_id)
      OR member_id = public.user_member_id(org_id)
    )
  );

GRANT INSERT ON public.calendar_blocks TO authenticated;
