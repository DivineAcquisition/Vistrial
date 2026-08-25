-- Prompt 18: operator agent.
--
-- Stated choices the prompt left unnamed:
--   * Batch cap default 10, org-configurable 1–40. Never silent truncate.
--   * Undo window: 15 minutes. Reverse through the same server actions.
--   * Step limit: 12 tool calls, then stop and report what completed.
--   * Time limit: 90 seconds.
--   * Rate limit: 20 runs / user / hour and 60 / org / hour via consume_rate_limit.
--   * Result page sent to the model: 20 rows, with hasMore rather than a dump.
--   * Keyboard shortcut: Mod+K.
--   * Generate-from-scratch follow-up is not a tool. regenerateFollowUp on an
--     existing draft is the only draft write exposed, and it still lands pending.
--
-- Tools wrap existing user-scoped server actions. There is no service-role
-- execute path. Writes are stored as proposals until the requesting user
-- confirms in that run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.org_members
  DROP CONSTRAINT IF EXISTS org_members_id_org_key;

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_id_org_key UNIQUE (id, org_id);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS operator_agent_batch_cap integer NOT NULL DEFAULT 10;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_operator_agent_batch_cap_range;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_operator_agent_batch_cap_range
    CHECK (operator_agent_batch_cap BETWEEN 1 AND 40);

COMMENT ON COLUMN public.organizations.operator_agent_batch_cap IS
  'Max records one confirmed operator-agent write may touch. Refuse above this; never truncate.';

CREATE TABLE public.operator_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  user_id uuid NOT NULL,
  request_text text NOT NULL,
  follow_up_text text,
  follow_up_used boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'running',
  final_response text,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  step_count integer NOT NULL DEFAULT 0,
  stop_reason text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT operator_runs_id_org_key UNIQUE (id, org_id),
  CONSTRAINT operator_runs_member_org_fkey FOREIGN KEY (member_id, org_id)
    REFERENCES public.org_members (id, org_id) ON DELETE CASCADE,
  CONSTRAINT operator_runs_status_check CHECK (status IN (
    'running',
    'awaiting_confirmation',
    'completed',
    'failed',
    'cancelled',
    'stopped_step_limit',
    'stopped_time_limit',
    'rate_limited'
  )),
  CONSTRAINT operator_runs_request_not_blank CHECK (length(btrim(request_text)) > 0)
);

CREATE INDEX operator_runs_org_created_idx
  ON public.operator_runs (org_id, created_at DESC);

CREATE INDEX operator_runs_user_created_idx
  ON public.operator_runs (user_id, created_at DESC);

COMMENT ON TABLE public.operator_runs IS
  'One operator-agent task. Not a chat thread. Tokens are attributable per org.';

CREATE TABLE public.operator_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.operator_runs (id) ON DELETE CASCADE,
  seq integer NOT NULL,
  tool_name text NOT NULL,
  label text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  result_summary text,
  state text NOT NULL,
  error_kind text,
  error_text text,
  ui jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  CONSTRAINT operator_run_steps_run_seq UNIQUE (run_id, seq),
  CONSTRAINT operator_run_steps_state_check CHECK (state IN ('running', 'done', 'failed', 'permission')),
  CONSTRAINT operator_run_steps_org_run_fkey FOREIGN KEY (run_id, org_id)
    REFERENCES public.operator_runs (id, org_id) ON DELETE CASCADE
);

CREATE INDEX operator_run_steps_run_idx
  ON public.operator_run_steps (run_id, seq);

CREATE TABLE public.operator_run_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.operator_runs (id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.operator_run_steps (id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  write_kind text NOT NULL,
  reversible boolean NOT NULL,
  irreversible_reason text,
  record_count integer NOT NULL,
  records jsonb NOT NULL,
  execute_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  execute_result jsonb,
  undo_until timestamptz,
  undone_at timestamptz,
  undo_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operator_run_confirmations_org_run_fkey FOREIGN KEY (run_id, org_id)
    REFERENCES public.operator_runs (id, org_id) ON DELETE CASCADE,
  CONSTRAINT operator_run_confirmations_decision_check CHECK (decision IN (
    'pending', 'confirmed', 'cancelled', 'adjusted'
  )),
  CONSTRAINT operator_run_confirmations_write_kind_check CHECK (write_kind IN (
    'assign',
    'log_outcome',
    'create_next_action',
    'complete_next_action',
    'reassign_next_action',
    'override_score',
    'resolve_objection',
    'change_status',
    'regenerate_follow_up'
  )),
  CONSTRAINT operator_run_confirmations_record_count_check CHECK (record_count >= 1)
);

CREATE INDEX operator_run_confirmations_run_idx
  ON public.operator_run_confirmations (run_id, created_at);

CREATE TABLE public.operator_run_leads (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  PRIMARY KEY (run_id, lead_id),
  CONSTRAINT operator_run_leads_run_org_fkey FOREIGN KEY (run_id, org_id)
    REFERENCES public.operator_runs (id, org_id) ON DELETE CASCADE,
  CONSTRAINT operator_run_leads_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE INDEX operator_run_leads_lead_idx
  ON public.operator_run_leads (lead_id, run_id);

COMMENT ON TABLE public.operator_run_leads IS
  'Leads a run read or proposed to change. The case file lists runs from this index.';

CREATE OR REPLACE FUNCTION public.operator_run_is_owner(p_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.operator_runs r
    WHERE r.id = p_run_id
      AND r.user_id = auth.uid()
      AND r.org_id IN (SELECT public.user_org_ids())
  );
$$;

CREATE OR REPLACE FUNCTION public.operator_run_visible(p_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.operator_runs r
    WHERE r.id = p_run_id
      AND r.org_id IN (SELECT public.user_org_ids())
      AND (
        r.user_id = auth.uid()
        OR public.user_has_org_role(r.org_id, 'owner', 'admin')
        OR public.is_platform_admin()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.operator_run_user_is_self(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND p_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.operator_run_is_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_run_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_run_user_is_self(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_run_is_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.operator_run_visible(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.operator_run_user_is_self(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_operator_agent_rate_limit(
  p_org_id uuid,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_scope = 'user' THEN
    v_key := 'operator-agent-user:' || p_org_id::text || ':' || auth.uid()::text;
  ELSIF p_scope = 'org' THEN
    v_key := 'operator-agent-org:' || p_org_id::text;
  ELSE
    RAISE EXCEPTION 'invalid_scope';
  END IF;
  RETURN public.consume_rate_limit(v_key, p_limit, p_window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_operator_agent_rate_limit(uuid, text, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_operator_agent_rate_limit(uuid, text, integer, integer)
  TO authenticated, service_role;

ALTER TABLE public.operator_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_run_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_run_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY operator_runs_select
  ON public.operator_runs FOR SELECT TO authenticated
  USING (public.operator_run_visible(id));

CREATE POLICY operator_runs_insert_self
  ON public.operator_runs FOR INSERT TO authenticated
  WITH CHECK (
    public.operator_run_user_is_self(user_id)
    AND org_id IN (SELECT public.user_org_ids())
    AND member_id = public.user_member_id(org_id)
  );

CREATE POLICY operator_runs_update_self
  ON public.operator_runs FOR UPDATE TO authenticated
  USING (public.operator_run_is_owner(id))
  WITH CHECK (
    public.operator_run_is_owner(id)
    AND public.operator_run_user_is_self(user_id)
  );

CREATE POLICY operator_run_steps_select
  ON public.operator_run_steps FOR SELECT TO authenticated
  USING (public.operator_run_visible(run_id));

CREATE POLICY operator_run_steps_insert_owner
  ON public.operator_run_steps FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND public.operator_run_is_owner(run_id)
  );

CREATE POLICY operator_run_steps_update_owner
  ON public.operator_run_steps FOR UPDATE TO authenticated
  USING (public.operator_run_is_owner(run_id))
  WITH CHECK (public.operator_run_is_owner(run_id));

CREATE POLICY operator_run_confirmations_select
  ON public.operator_run_confirmations FOR SELECT TO authenticated
  USING (public.operator_run_visible(run_id));

CREATE POLICY operator_run_confirmations_insert_owner
  ON public.operator_run_confirmations FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND public.operator_run_is_owner(run_id)
  );

CREATE POLICY operator_run_confirmations_update_owner
  ON public.operator_run_confirmations FOR UPDATE TO authenticated
  USING (public.operator_run_is_owner(run_id))
  WITH CHECK (public.operator_run_is_owner(run_id));

CREATE POLICY operator_run_leads_select
  ON public.operator_run_leads FOR SELECT TO authenticated
  USING (public.operator_run_visible(run_id));

CREATE POLICY operator_run_leads_insert_owner
  ON public.operator_run_leads FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND public.operator_run_is_owner(run_id)
  );

REVOKE ALL ON TABLE public.operator_runs FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.operator_run_steps FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.operator_run_confirmations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.operator_run_leads FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE ON public.operator_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.operator_run_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.operator_run_confirmations TO authenticated;
GRANT SELECT, INSERT ON public.operator_run_leads TO authenticated;

GRANT ALL ON TABLE public.operator_runs TO service_role;
GRANT ALL ON TABLE public.operator_run_steps TO service_role;
GRANT ALL ON TABLE public.operator_run_confirmations TO service_role;
GRANT ALL ON TABLE public.operator_run_leads TO service_role;
