-- Prompt 24: agent runtime, routing, approvals, and controls.
-- No working agent ships here. Operator is grandfathered enabled.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS agents_halted boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS agent_crm_writes_halted boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS agent_calendar_writes_halted boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS agent_run_as_member_id uuid;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS last_interactive_at timestamptz;

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS is_agent_identity boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS org_members_one_agent_identity
  ON public.org_members (org_id)
  WHERE is_agent_identity;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_agent_run_as_member_fkey;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_agent_run_as_member_fkey
    FOREIGN KEY (agent_run_as_member_id, id)
    REFERENCES public.org_members (id, org_id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.organizations.agents_halted IS
  'Global agent stop. Does not disconnect integrations.';
COMMENT ON COLUMN public.organizations.agent_crm_writes_halted IS
  'Stops agent writes to the CRM without disconnecting it.';
COMMENT ON COLUMN public.organizations.agent_calendar_writes_halted IS
  'Stops agent writes to the calendar without disconnecting it.';
COMMENT ON COLUMN public.org_members.is_agent_identity IS
  'This member is who scheduled and triggered agents run as. Not a service role.';

CREATE TABLE IF NOT EXISTS public.agent_model_routes (
  work_kind text PRIMARY KEY,
  tier text NOT NULL,
  model_id text NOT NULL,
  escalate_to_tier text,
  use_batch_when_async boolean NOT NULL DEFAULT true,
  CONSTRAINT agent_model_routes_tier_check CHECK (tier IN ('opus', 'sonnet', 'haiku')),
  CONSTRAINT agent_model_routes_escalate_check CHECK (
    escalate_to_tier IS NULL OR escalate_to_tier IN ('opus', 'sonnet', 'haiku')
  ),
  CONSTRAINT agent_model_routes_no_fable CHECK (
    lower(model_id) NOT LIKE '%fable%' AND lower(model_id) NOT LIKE '%creative%'
  )
);

INSERT INTO public.agent_model_routes (work_kind, tier, model_id, escalate_to_tier, use_batch_when_async)
VALUES
  ('playbook', 'opus', 'claude-opus-5', NULL, true),
  ('follow_up_draft', 'opus', 'claude-opus-5', NULL, true),
  ('extraction', 'sonnet', 'claude-sonnet-5', NULL, true),
  ('verification', 'sonnet', 'claude-sonnet-5', NULL, true),
  ('agent_planning', 'sonnet', 'claude-sonnet-5', 'opus', true),
  ('summarize', 'sonnet', 'claude-sonnet-5', NULL, true),
  ('classify', 'haiku', 'claude-haiku-4-5-20251001', NULL, true)
ON CONFLICT (work_kind) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.org_agent_settings (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  observation_mode boolean NOT NULL DEFAULT true,
  daily_run_cap integer NOT NULL DEFAULT 40,
  daily_spend_cap_usd numeric NOT NULL DEFAULT 25,
  PRIMARY KEY (org_id, agent_id),
  CONSTRAINT org_agent_settings_agent_id_check CHECK (agent_id IN ('operator')),
  CONSTRAINT org_agent_settings_run_cap_check CHECK (daily_run_cap BETWEEN 1 AND 1000),
  CONSTRAINT org_agent_settings_spend_cap_check CHECK (daily_spend_cap_usd >= 0)
);

INSERT INTO public.org_agent_settings (org_id, agent_id, enabled, observation_mode, daily_run_cap, daily_spend_cap_usd)
SELECT id, 'operator', true, false, 40, 25
FROM public.organizations
ON CONFLICT (org_id, agent_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  agent_label text NOT NULL,
  mode text NOT NULL,
  trigger_kind text NOT NULL,
  trigger_key text NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_member_id uuid NOT NULL,
  actor_role text NOT NULL,
  actor_display_name text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  request_text text,
  output_text text,
  model text,
  model_version text,
  work_kind text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  spend_usd numeric NOT NULL DEFAULT 0,
  step_count integer NOT NULL DEFAULT 0,
  stop_reason text,
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  batch_id text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT agent_runs_id_org_key UNIQUE (id, org_id),
  CONSTRAINT agent_runs_trigger_unique UNIQUE (org_id, agent_id, trigger_key),
  CONSTRAINT agent_runs_member_org_fkey FOREIGN KEY (actor_member_id, org_id)
    REFERENCES public.org_members (id, org_id) ON DELETE CASCADE,
  CONSTRAINT agent_runs_agent_id_check CHECK (agent_id IN ('operator')),
  CONSTRAINT agent_runs_mode_check CHECK (mode IN ('on_demand', 'triggered', 'scheduled')),
  CONSTRAINT agent_runs_status_check CHECK (status IN (
    'queued',
    'running',
    'awaiting_confirmation',
    'awaiting_batch',
    'completed',
    'failed',
    'dead_lettered',
    'cancelled',
    'stopped_step_limit',
    'stopped_time_limit',
    'stopped_cap',
    'stopped_halt',
    'observation'
  ))
);

CREATE INDEX IF NOT EXISTS agent_runs_org_created_idx
  ON public.agent_runs (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_retry_idx
  ON public.agent_runs (status, next_retry_at);

COMMENT ON TABLE public.agent_runs IS
  'One agent execution. Same trigger twice produces one row.';

CREATE TABLE IF NOT EXISTS public.agent_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.agent_runs (id) ON DELETE CASCADE,
  seq integer NOT NULL,
  tool_name text NOT NULL,
  label text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  result_summary text,
  state text NOT NULL,
  error_kind text,
  error_text text,
  model text,
  model_version text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  CONSTRAINT agent_run_steps_run_seq UNIQUE (run_id, seq),
  CONSTRAINT agent_run_steps_org_run_fkey FOREIGN KEY (run_id, org_id)
    REFERENCES public.agent_runs (id, org_id) ON DELETE CASCADE,
  CONSTRAINT agent_run_steps_state_check CHECK (state IN ('running', 'done', 'failed', 'permission')),
  CONSTRAINT agent_run_steps_no_forbidden CHECK (
    tool_name NOT IN (
      'send_message', 'dispatch_message', 'approve_draft', 'approve_follow_up',
      'delete', 'call_endpoint', 'generic_write', 'run_code', 'execute_code',
      'research_person', 'modify_automation'
    )
  )
);

CREATE INDEX IF NOT EXISTS agent_run_steps_run_idx
  ON public.agent_run_steps (run_id, seq);

CREATE TABLE IF NOT EXISTS public.agent_run_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.agent_runs (id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.agent_run_steps (id) ON DELETE SET NULL,
  operation text NOT NULL,
  system text NOT NULL,
  preview_before text NOT NULL,
  preview_after text NOT NULL,
  record_label text NOT NULL,
  reversible boolean NOT NULL,
  irreversible_label text,
  named_human_id uuid,
  decision text NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  execute_result jsonb,
  undo_until timestamptz,
  undone_at timestamptz,
  undo_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_run_approvals_org_run_fkey FOREIGN KEY (run_id, org_id)
    REFERENCES public.agent_runs (id, org_id) ON DELETE CASCADE,
  CONSTRAINT agent_run_approvals_decision_check CHECK (decision IN (
    'pending', 'approved', 'rejected', 'undone'
  )),
  CONSTRAINT agent_run_approvals_no_payload_preview CHECK (
    left(btrim(preview_before), 1) NOT IN ('{', '[')
    AND left(btrim(preview_after), 1) NOT IN ('{', '[')
  )
);

CREATE TABLE IF NOT EXISTS public.agent_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  run_id uuid NOT NULL REFERENCES public.agent_runs (id) ON DELETE CASCADE,
  step_index integer NOT NULL,
  work_kind text NOT NULL,
  from_tier text NOT NULL,
  to_tier text NOT NULL,
  reason text NOT NULL DEFAULT 'verification_failed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_escalations_org_agent_idx
  ON public.agent_escalations (org_id, agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  run_id uuid REFERENCES public.agent_runs (id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  data_basis text NOT NULL,
  sample_size integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  verbatim_flagged boolean NOT NULL DEFAULT false,
  verbatim_excerpts jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  exported_at timestamptz,
  exported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_assets_sample_check CHECK (sample_size >= 1),
  CONSTRAINT agent_assets_basis_check CHECK (length(btrim(data_basis)) > 0)
);

CREATE TABLE IF NOT EXISTS public.agent_research_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs (id) ON DELETE SET NULL,
  company_name text NOT NULL,
  fact text NOT NULL,
  source text NOT NULL,
  found_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_research_facts_complete CHECK (
    length(btrim(company_name)) > 0
    AND length(btrim(fact)) > 0
    AND length(btrim(source)) > 0
  )
);

CREATE OR REPLACE FUNCTION public.agent_run_visible(p_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agent_runs r
    WHERE r.id = p_run_id
      AND r.org_id IN (SELECT public.user_org_ids())
      AND (
        r.actor_user_id = auth.uid()
        OR public.user_has_org_role(r.org_id, 'owner', 'admin')
        OR public.is_platform_admin()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.agent_run_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_run_visible(uuid) TO authenticated, service_role;

ALTER TABLE public.agent_model_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_research_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_model_routes_select
  ON public.agent_model_routes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY org_agent_settings_select
  ON public.org_agent_settings FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY org_agent_settings_write
  ON public.org_agent_settings FOR ALL TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(org_id, 'owner', 'admin')
  )
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(org_id, 'owner', 'admin')
  );

CREATE POLICY agent_runs_select
  ON public.agent_runs FOR SELECT TO authenticated
  USING (public.agent_run_visible(id));

CREATE POLICY agent_runs_insert
  ON public.agent_runs FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND actor_user_id = auth.uid()
    AND actor_member_id = public.user_member_id(org_id)
  );

CREATE POLICY agent_runs_update
  ON public.agent_runs FOR UPDATE TO authenticated
  USING (public.agent_run_visible(id))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY agent_run_steps_select
  ON public.agent_run_steps FOR SELECT TO authenticated
  USING (public.agent_run_visible(run_id));

CREATE POLICY agent_run_steps_write
  ON public.agent_run_steps FOR ALL TO authenticated
  USING (public.agent_run_visible(run_id))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY agent_run_approvals_select
  ON public.agent_run_approvals FOR SELECT TO authenticated
  USING (public.agent_run_visible(run_id));

CREATE POLICY agent_run_approvals_write
  ON public.agent_run_approvals FOR ALL TO authenticated
  USING (public.agent_run_visible(run_id))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY agent_escalations_select
  ON public.agent_escalations FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY agent_escalations_insert
  ON public.agent_escalations FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY agent_assets_select
  ON public.agent_assets FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY agent_assets_write
  ON public.agent_assets FOR ALL TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(org_id, 'owner', 'admin')
  )
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(org_id, 'owner', 'admin')
  );

CREATE POLICY agent_research_facts_select
  ON public.agent_research_facts FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY agent_research_facts_write
  ON public.agent_research_facts FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

REVOKE ALL ON TABLE public.agent_model_routes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.org_agent_settings FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.agent_runs FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.agent_run_steps FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.agent_run_approvals FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.agent_escalations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.agent_assets FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.agent_research_facts FROM PUBLIC, anon;

GRANT SELECT ON public.agent_model_routes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.org_agent_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agent_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agent_run_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agent_run_approvals TO authenticated;
GRANT SELECT, INSERT ON public.agent_escalations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agent_assets TO authenticated;
GRANT SELECT, INSERT ON public.agent_research_facts TO authenticated;

GRANT ALL ON TABLE public.agent_model_routes TO service_role;
GRANT ALL ON TABLE public.org_agent_settings TO service_role;
GRANT ALL ON TABLE public.agent_runs TO service_role;
GRANT ALL ON TABLE public.agent_run_steps TO service_role;
GRANT ALL ON TABLE public.agent_run_approvals TO service_role;
GRANT ALL ON TABLE public.agent_escalations TO service_role;
GRANT ALL ON TABLE public.agent_assets TO service_role;
GRANT ALL ON TABLE public.agent_research_facts TO service_role;

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'agent-runtime',
  '* * * * *',
  60,
  180,
  'Open /api/cron/agent-runtime and agent_runs in dead_lettered. Confirm CRON_SECRET and that a failed run stopped instead of looping.'
)
ON CONFLICT (job_name) DO UPDATE
  SET cron_expr = EXCLUDED.cron_expr,
      interval_seconds = EXCLUDED.interval_seconds,
      grace_seconds = EXCLUDED.grace_seconds,
      check_first = EXCLUDED.check_first;

INSERT INTO public.ops_job_runs (job_name, last_success_at, updated_at)
SELECT job_name, now(), now() FROM public.ops_job_catalog WHERE job_name = 'agent-runtime'
ON CONFLICT (job_name) DO NOTHING;

-- Wrap the Prompt 21/23 activity function without copying it.
ALTER FUNCTION public.activity_stream_source(uuid, timestamptz, timestamptz)
  RENAME TO activity_stream_source_v21;

CREATE OR REPLACE FUNCTION public.activity_stream_agent_framework(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  org_id uuid,
  id uuid,
  occurred_at timestamptz,
  category text,
  kind text,
  headline text,
  actor_label text,
  actor_kind text,
  actor_user_id uuid,
  integration text,
  lead_id uuid,
  lead_name text,
  href text,
  result text,
  result_reason text,
  retryable boolean,
  retry_kind text,
  retry_id uuid,
  is_sync_noise boolean,
  detail jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.org_id,
    r.id,
    COALESCE(r.started_at, r.created_at),
    'agent',
    'agent_run_started',
    r.agent_label || ' · ' || r.actor_display_name || ' · started a run',
    r.actor_display_name,
    'person',
    r.actor_user_id,
    NULL::text,
    NULL::uuid,
    NULL::text,
    '/app/activity',
    CASE
      WHEN r.status IN ('failed', 'dead_lettered', 'cancelled') THEN 'failed'
      WHEN r.status IN ('running', 'queued', 'awaiting_confirmation', 'awaiting_batch') THEN 'running'
      ELSE 'succeeded'
    END,
    CASE WHEN r.status IN ('failed', 'dead_lettered') THEN public.activity_plain_reason(r.stop_reason) ELSE NULL END,
    r.status = 'dead_lettered',
    CASE WHEN r.status = 'dead_lettered' THEN 'agent_run' ELSE NULL END,
    CASE WHEN r.status = 'dead_lettered' THEN r.id ELSE NULL END,
    false,
    jsonb_build_object('agent', r.agent_id, 'identity', r.actor_display_name, 'status', r.status, 'model', r.model_version)
  FROM public.agent_runs r
  WHERE r.agent_id <> 'operator'
    AND (p_org_id IS NULL OR r.org_id = p_org_id)
    AND (p_from IS NULL OR COALESCE(r.started_at, r.created_at) >= p_from)
    AND (p_to IS NULL OR COALESCE(r.started_at, r.created_at) <= p_to)

  UNION ALL

  SELECT
    s.org_id,
    s.id,
    s.started_at,
    'agent',
    'agent_tool',
    r.agent_label || ' · ' || r.actor_display_name || ' · ' || s.label,
    r.actor_display_name,
    'person',
    r.actor_user_id,
    NULL::text,
    NULL::uuid,
    NULL::text,
    '/app/activity',
    CASE WHEN s.state = 'failed' THEN 'failed' WHEN s.state = 'running' THEN 'running' ELSE 'succeeded' END,
    public.activity_plain_reason(s.error_kind),
    false, NULL, NULL, false,
    jsonb_build_object('agent', r.agent_id, 'identity', r.actor_display_name, 'label', s.label, 'model', s.model_version)
  FROM public.agent_run_steps s
  JOIN public.agent_runs r ON r.id = s.run_id AND r.org_id = s.org_id
  WHERE r.agent_id <> 'operator'
    AND (p_org_id IS NULL OR s.org_id = p_org_id)
    AND (p_from IS NULL OR s.started_at >= p_from)
    AND (p_to IS NULL OR s.started_at <= p_to)

  UNION ALL

  SELECT
    a.org_id,
    a.id,
    COALESCE(a.decided_at, a.created_at),
    'agent',
    'agent_write_decided',
    r.agent_label || ' · ' || COALESCE(decider.display_name, r.actor_display_name) || ' · ' ||
      CASE a.decision
        WHEN 'approved' THEN 'approved a connected-system change'
        WHEN 'rejected' THEN 'rejected a connected-system change'
        WHEN 'undone' THEN 'undid a connected-system change'
        ELSE 'waiting on a connected-system change'
      END,
    COALESCE(decider.display_name, r.actor_display_name),
    'person',
    COALESCE(decider.user_id, r.actor_user_id),
    a.system,
    NULL::uuid,
    NULL::text,
    '/app/activity',
    CASE WHEN a.decision = 'rejected' THEN 'failed' WHEN a.decision = 'pending' THEN 'running' ELSE 'succeeded' END,
    NULL, false, NULL, NULL, false,
    jsonb_build_object(
      'agent', r.agent_id,
      'identity', COALESCE(decider.display_name, r.actor_display_name),
      'operation', a.operation,
      'before', a.preview_before,
      'after', a.preview_after
    )
  FROM public.agent_run_approvals a
  JOIN public.agent_runs r ON r.id = a.run_id AND r.org_id = a.org_id
  LEFT JOIN public.org_members decider ON decider.id = a.decided_by
  WHERE r.agent_id <> 'operator'
    AND (p_org_id IS NULL OR a.org_id = p_org_id)
    AND (p_from IS NULL OR COALESCE(a.decided_at, a.created_at) >= p_from)
    AND (p_to IS NULL OR COALESCE(a.decided_at, a.created_at) <= p_to);
$$;

CREATE OR REPLACE FUNCTION public.activity_stream_source(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  org_id uuid,
  id uuid,
  occurred_at timestamptz,
  category text,
  kind text,
  headline text,
  actor_label text,
  actor_kind text,
  actor_user_id uuid,
  integration text,
  lead_id uuid,
  lead_name text,
  href text,
  result text,
  result_reason text,
  retryable boolean,
  retry_kind text,
  retry_id uuid,
  is_sync_noise boolean,
  detail jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.org_id, s.id, s.occurred_at, s.category, s.kind,
    CASE
      WHEN s.category = 'agent' AND s.kind = 'agent_run_started'
        THEN 'Operator · ' || s.actor_label || ' · started a run'
      WHEN s.category = 'agent' AND s.kind = 'agent_tool'
        THEN 'Operator · ' || s.actor_label || ' · ' || regexp_replace(s.headline, '^Agent tool · ', '')
      WHEN s.category = 'agent' AND s.kind = 'agent_write_decided'
        THEN 'Operator · ' || s.actor_label || ' · ' || lower(s.headline)
      ELSE s.headline
    END,
    s.actor_label, s.actor_kind, s.actor_user_id, s.integration,
    s.lead_id, s.lead_name, s.href, s.result, s.result_reason,
    s.retryable, s.retry_kind, s.retry_id, s.is_sync_noise, s.detail
  FROM public.activity_stream_source_v21(p_org_id, p_from, p_to) s
  UNION ALL
  SELECT * FROM public.activity_stream_agent_framework(p_org_id, p_from, p_to);
$$;

REVOKE ALL ON FUNCTION public.activity_stream_source_v21(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_stream_agent_framework(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_stream_source(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activity_stream_source_v21(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.activity_stream_agent_framework(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.activity_stream_source(uuid, timestamptz, timestamptz) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_runs;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;
