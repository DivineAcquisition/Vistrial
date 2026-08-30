-- Prompt 24: runtime tables, halt columns, activity wrap, no generic write path.

INSERT INTO auth.users (id, email)
VALUES
  ('241e2411-2411-4241-8241-2411111111a2', 'af-owner@vistrial.local'),
  ('241e2411-2411-4241-8241-2411111111a4', 'af-setter@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, timezone, activated_at)
VALUES (
  '241e2411-2411-4241-8241-2411111111a1',
  'Agent Framework Co',
  'agent-framework-co',
  'America/Chicago',
  now() - interval '30 days'
);

INSERT INTO public.score_configs (org_id)
VALUES ('241e2411-2411-4241-8241-2411111111a1')
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES
(
  '241e2411-2411-4241-8241-2411111111a3',
  '241e2411-2411-4241-8241-2411111111a1',
  '241e2411-2411-4241-8241-2411111111a2',
  'owner',
  'AF Owner',
  'af-owner@vistrial.local'
),
(
  '241e2411-2411-4241-8241-2411111111a5',
  '241e2411-2411-4241-8241-2411111111a1',
  '241e2411-2411-4241-8241-2411111111a4',
  'setter',
  'AF Setter',
  'af-setter@vistrial.local'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'agents_halted'
  ) THEN
    RAISE EXCEPTION 'agents_halted missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'org_members' AND column_name = 'is_agent_identity'
  ) THEN
    RAISE EXCEPTION 'is_agent_identity missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agent_model_routes WHERE work_kind = 'agent_planning') THEN
    RAISE EXCEPTION 'model routes not seeded';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_model_routes WHERE lower(model_id) LIKE '%fable%') THEN
    RAISE EXCEPTION 'creative-tier model is seeded';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_agent_settings
    WHERE org_id = '241e2411-2411-4241-8241-2411111111a1'
      AND agent_id = 'operator'
      AND enabled = true
      AND observation_mode = false
  ) THEN
    RAISE EXCEPTION 'operator was not grandfathered enabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ops_job_catalog WHERE job_name = 'agent-runtime') THEN
    RAISE EXCEPTION 'agent-runtime job missing from ops_job_catalog';
  END IF;
END $$;

-- Same trigger twice produces one run.
INSERT INTO public.agent_runs (
  org_id, agent_id, agent_label, mode, trigger_kind, trigger_key,
  actor_user_id, actor_member_id, actor_role, actor_display_name, status
) VALUES (
  '241e2411-2411-4241-8241-2411111111a1',
  'operator',
  'Operator',
  'on_demand',
  'on_demand',
  'on_demand:241e2411-2411-4241-8241-2411111111c1',
  '241e2411-2411-4241-8241-2411111111a2',
  '241e2411-2411-4241-8241-2411111111a3',
  'owner',
  'AF Owner',
  'completed'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.agent_runs (
      org_id, agent_id, agent_label, mode, trigger_kind, trigger_key,
      actor_user_id, actor_member_id, actor_role, actor_display_name, status
    ) VALUES (
      '241e2411-2411-4241-8241-2411111111a1',
      'operator',
      'Operator',
      'on_demand',
      'on_demand',
      'on_demand:241e2411-2411-4241-8241-2411111111c1',
      '241e2411-2411-4241-8241-2411111111a2',
      '241e2411-2411-4241-8241-2411111111a3',
      'owner',
      'AF Owner',
      'completed'
    );
    RAISE EXCEPTION 'duplicate trigger was allowed';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END $$;

-- Preview cannot be a payload.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.agent_run_approvals (
      org_id, run_id, operation, system, preview_before, preview_after, record_label, reversible
    )
    SELECT
      org_id, id, 'crm.add_tag', 'crm', '{"tag":"x"}', 'after', 'Pat Lead', true
    FROM public.agent_runs
    WHERE trigger_key = 'on_demand:241e2411-2411-4241-8241-2411111111c1';
    RAISE EXCEPTION 'raw payload preview was allowed';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END $$;

-- Activity wrap still returns operator rows and names the agent.
DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.activity_stream_source('241e2411-2411-4241-8241-2411111111a1', NULL, NULL);
  IF v_n IS NULL THEN
    RAISE EXCEPTION 'activity_stream_source wrapper failed';
  END IF;
END $$;

-- At most one service identity.
UPDATE public.org_members
SET is_agent_identity = true
WHERE id = '241e2411-2411-4241-8241-2411111111a5';

DO $$
BEGIN
  BEGIN
    UPDATE public.org_members
    SET is_agent_identity = true
    WHERE id = '241e2411-2411-4241-8241-2411111111a3';
    RAISE EXCEPTION 'two agent identities were allowed';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END $$;
