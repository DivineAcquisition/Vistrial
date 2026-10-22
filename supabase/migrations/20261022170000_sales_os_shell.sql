-- Sales OS shell (Prompt 26, build step 4).
-- 1. Sales Manager joins the agent registry, off until a workspace turns it on.
-- 2. Manager is an owner-granted permission on a member seat, not a new role.
-- 3. Lead Record "what changed since you last looked" reads a per-person view time.

-- ---------------------------------------------------------------------------
-- 1. Sales Manager in the registry
-- ---------------------------------------------------------------------------
INSERT INTO public.agent_registry (
  id, area_id, name, sublabel, description, long_description, glyph, accent, promise, works_on,
  availability, included_plans, add_on, locked_reason, prerequisites, autonomy, config_sections,
  sort, starts_on, private_runs, activity_source, output_source
) VALUES (
  'sales_manager',
  'sales',
  'Sales Manager',
  'Team Manager',
  'Drafts end of day reports and keeps a scorecard for every rep.',
  'Sales Manager drafts each rep''s end of day report from their real activity, keeps scorecards against your foundation targets, and points to the calls behind each coaching moment. Reps see only their own report and scorecard.',
  'spark',
  'neutral',
  'Sales Manager never changes a rep''s pay, role or access, and never shows one rep another rep''s numbers.',
  ARRAY['lead', 'call', 'task'],
  'available',
  ARRAY['private_access', 'custom', 'internal', 'pilot'],
  false,
  'Not included on your current plan. Request access and the Vistrial team will confirm any plan change with you.',
  ARRAY[]::text[],
  '{"automatic": ["Drafts each rep''s end of day report from their activity", "Keeps scorecards against your foundation targets"], "suggests": ["Coaching moments, linked to the calls they come from"], "never": ["Changes a rep''s pay, role or access", "Shows one rep another rep''s numbers"]}'::jsonb,
  ARRAY[]::text[],
  5,
  false,
  false,
  'runs',
  'activity'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.agent_registry_versions (kind, entry_id, version, entry, note)
SELECT 'agent', r.id, r.version, to_jsonb(r) - 'beta_org_ids', 'Added for the Sales OS.'
FROM public.agent_registry r
WHERE r.id = 'sales_manager'
ON CONFLICT (kind, entry_id, version) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Manager permission
-- ---------------------------------------------------------------------------
ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS can_manage_team boolean NOT NULL DEFAULT false;

ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_can_manage_team_member_only;
ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_can_manage_team_member_only
  CHECK (NOT can_manage_team OR role IN ('member', 'client_viewer'));

COMMENT ON COLUMN public.org_members.can_manage_team IS
  'Manager permission. Members only, granted by an Owner. Sees team scorecards, EOD reports and coaching. Never billing, connections or action policies.';

-- Owners, staff working in the workspace, and members an Owner made a Manager.
CREATE OR REPLACE FUNCTION public.is_team_manager(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.ws_access(p_org_id) IN ('owner', 'service_team', 'platform_admin'), false)
    OR EXISTS (
      SELECT 1
      FROM public.org_members m
      WHERE m.org_id = p_org_id
        AND m.user_id = auth.uid()
        AND m.active = true
        AND m.can_manage_team = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_team_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_manager(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_team_manager(p_member_id uuid, p_on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_role public.org_role;
BEGIN
  SELECT org_id, role INTO v_org, v_role FROM public.org_members WHERE id = p_member_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'That person is not in this workspace.' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(public.ws_access(v_org), '') <> 'owner' THEN
    RAISE EXCEPTION 'Only an Owner can make someone a Manager.' USING ERRCODE = '42501';
  END IF;
  IF p_on AND v_role NOT IN ('member', 'client_viewer') THEN
    RAISE EXCEPTION 'Managers are member seats. Setters and closers stay reps.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.org_members SET can_manage_team = p_on WHERE id = p_member_id;
  PERFORM public.ws_log(v_org, CASE WHEN p_on THEN 'manager.granted' ELSE 'manager.removed' END, 'org_members', p_member_id::text, '{}'::jsonb, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.set_team_manager(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_manager(uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. When each person last opened a Lead Record
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_record_views (
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lead_id),
  CONSTRAINT lead_record_views_lead_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

ALTER TABLE public.lead_record_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_record_views FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lead_record_views TO authenticated;
GRANT ALL ON public.lead_record_views TO service_role;

DROP POLICY IF EXISTS lead_record_views_own ON public.lead_record_views;
CREATE POLICY lead_record_views_own ON public.lead_record_views FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND org_id IN (SELECT public.user_org_ids())
    AND (
      NOT (org_id IN (SELECT public.user_operator_org_ids()))
      OR lead_id IN (SELECT public.operator_visible_lead_ids())
    )
  );
