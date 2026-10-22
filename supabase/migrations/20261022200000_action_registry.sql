-- Action registry (Prompt 26, build step 7).
-- Owner policies for internal writes (Suggest by default, or Do and log), and
-- one record per action: who or what asked, who approved, before and after,
-- and the result. Actions that reach a person never get a policy row: they
-- always go through the approval gate, and the table refuses them.

CREATE TABLE IF NOT EXISTS public.action_policies (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action ~ '^[a-z]+\.[a-z_]+$' AND action NOT LIKE 'send.%'),
  mode text NOT NULL CHECK (mode IN ('suggest', 'do_and_log')),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, action)
);

CREATE TABLE IF NOT EXISTS public.action_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action ~ '^[a-z]+\.[a-z_]+$'),
  tier text NOT NULL CHECK (tier IN ('internal_write', 'read')),
  connector text NOT NULL,
  requested_by_kind text NOT NULL CHECK (requested_by_kind IN ('agent', 'person')),
  requested_by text NOT NULL,
  lead_id uuid,
  status text NOT NULL CHECK (status IN ('suggested', 'running', 'done', 'failed', 'dismissed', 'undone')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  before jsonb,
  after jsonb,
  result_code text CHECK (result_code IS NULL OR result_code ~ '^[a-z_]{2,40}$'),
  external_ref text,
  decided_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT action_runs_lead_fkey FOREIGN KEY (lead_id, org_id) REFERENCES public.leads (id, org_id) ON DELETE CASCADE,
  CONSTRAINT action_runs_reaches_person CHECK (action NOT LIKE 'send.%')
);

CREATE INDEX IF NOT EXISTS action_runs_org_status_idx ON public.action_runs (org_id, status, created_at DESC);

ALTER TABLE public.action_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.action_policies, public.action_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.action_policies, public.action_runs TO authenticated;
GRANT ALL ON public.action_policies, public.action_runs TO service_role;

DROP POLICY IF EXISTS action_policies_read ON public.action_policies;
CREATE POLICY action_policies_read ON public.action_policies FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS action_runs_read ON public.action_runs;
CREATE POLICY action_runs_read ON public.action_runs FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS ws_operator_lead_scope ON public.action_runs;
CREATE POLICY ws_operator_lead_scope ON public.action_runs AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    NOT (org_id IN (SELECT public.user_operator_org_ids()))
    OR (lead_id IS NOT NULL AND lead_id IN (SELECT public.operator_visible_lead_ids()))
  );

-- Owners only. Managers and staff cannot change action policies.
CREATE OR REPLACE FUNCTION public.set_action_policy(p_org_id uuid, p_action text, p_mode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.ws_access(p_org_id), '') <> 'owner' THEN
    RAISE EXCEPTION 'Only an Owner can change how actions run.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.action_policies (org_id, action, mode, updated_by)
  VALUES (p_org_id, p_action, p_mode, auth.uid())
  ON CONFLICT (org_id, action) DO UPDATE SET mode = EXCLUDED.mode, updated_by = EXCLUDED.updated_by, updated_at = now();
  PERFORM public.ws_log(p_org_id, 'action_policy.set', 'action_policies', p_action, jsonb_build_object('mode', p_mode), auth.uid());
END;
$$;

-- A person confirms or dismisses a suggestion. Running it is the server's job.
CREATE OR REPLACE FUNCTION public.action_run_decide(p_run_id uuid, p_decision text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.action_runs;
  v_access text;
  v_member uuid;
BEGIN
  SELECT * INTO v_run FROM public.action_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'That suggestion no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  v_access := COALESCE(public.ws_access(v_run.org_id), '');
  IF NOT (
    v_access IN ('owner', 'service_team', 'platform_admin')
    OR public.is_team_manager(v_run.org_id)
    OR (v_access = 'operator' AND v_run.lead_id IN (SELECT public.operator_visible_lead_ids()))
  ) THEN
    RAISE EXCEPTION 'You cannot decide this suggestion.' USING ERRCODE = '42501';
  END IF;
  IF v_run.status <> 'suggested' THEN
    RETURN v_run.status;
  END IF;
  SELECT id INTO v_member FROM public.org_members WHERE org_id = v_run.org_id AND user_id = auth.uid() AND active = true LIMIT 1;
  UPDATE public.action_runs
    SET status = CASE WHEN p_decision = 'confirm' THEN 'running' ELSE 'dismissed' END,
        decided_by_member_id = v_member,
        decided_at = now(),
        updated_at = now()
    WHERE id = p_run_id;
  PERFORM public.ws_log(v_run.org_id, CASE WHEN p_decision = 'confirm' THEN 'action.confirmed' ELSE 'action.dismissed' END, 'action_runs', p_run_id::text, jsonb_build_object('action', v_run.action), auth.uid());
  RETURN CASE WHEN p_decision = 'confirm' THEN 'running' ELSE 'dismissed' END;
END;
$$;

REVOKE ALL ON FUNCTION public.set_action_policy(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.action_run_decide(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_action_policy(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.action_run_decide(uuid, text) TO authenticated, service_role;
