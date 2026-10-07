-- Forsight foundation: per-workspace source records stay inside their workspace,
-- carry no write path for members, and refuse malformed shapes.
-- IDs use the f0f5f0f5- prefix so they do not collide with earlier fixtures.

INSERT INTO auth.users (id, email)
VALUES
  ('f0f5f0f5-0000-4000-8000-00000000000a', 'forsight-da@vistrial.local'),
  ('f0f5f0f5-0000-4000-8000-00000000000b', 'forsight-client@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, timezone, holdout_percent)
VALUES
  ('f0f5f0f5-0000-4000-8000-000000000001', 'Forsight DA', 'forsight-da', 'America/New_York', 0),
  ('f0f5f0f5-0000-4000-8000-000000000002', 'Forsight Client', 'forsight-client', 'America/New_York', 0),
  ('f0f5f0f5-0000-4000-8000-000000000003', 'Forsight Unset', 'forsight-unset', 'America/New_York', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES
  (
    'f0f5f0f5-0000-4000-8000-000000000011',
    'f0f5f0f5-0000-4000-8000-000000000001',
    'f0f5f0f5-0000-4000-8000-00000000000a',
    'owner',
    'Forsight DA Owner',
    'forsight-da@vistrial.local'
  ),
  (
    'f0f5f0f5-0000-4000-8000-000000000012',
    'f0f5f0f5-0000-4000-8000-000000000002',
    'f0f5f0f5-0000-4000-8000-00000000000b',
    'owner',
    'Forsight Client Owner',
    'forsight-client@vistrial.local'
  )
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO public.forsight_sources (org_id, source_type, label)
VALUES
  (
    'f0f5f0f5-0000-4000-8000-000000000001',
    'vistrial_core',
    'DA Pipeline — Client Acquisition'
  ),
  (
    'f0f5f0f5-0000-4000-8000-000000000002',
    'vistrial_core',
    'Forsight Client'
  )
ON CONFLICT (org_id, source_type) DO NOTHING;

INSERT INTO public.forsight_sources (org_id, source_type, label, meta_ad_account_id)
VALUES (
  'f0f5f0f5-0000-4000-8000-000000000001',
  'meta_ads',
  'DA ad account',
  'act_1234567890'
)
ON CONFLICT (org_id, source_type) DO NOTHING;

DO $$
DECLARE
  v_count integer;
  v_denied boolean;
BEGIN
  -- Airtable is gone from the schema, not merely unused by the app.
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'forsight_sources'
    AND column_name LIKE 'airtable%';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'forsight_sources still has % airtable columns', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'forsight_source_type' AND e.enumlabel = 'airtable';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'forsight_source_type still offers airtable';
  END IF;

  SELECT count(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'forsight_sync_runs';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'the Airtable spend-sync log is still here';
  END IF;

  -- A source must name the thing it reads.
  v_denied := false;
  BEGIN
    INSERT INTO public.forsight_sources (org_id, source_type)
    VALUES ('f0f5f0f5-0000-4000-8000-000000000003', 'meta_ads');
  EXCEPTION
    WHEN check_violation THEN v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'a meta source without an ad account id was accepted';
  END IF;

  -- A workspace only sees its own source.
  PERFORM set_config('request.jwt.claim.sub', 'f0f5f0f5-0000-4000-8000-00000000000b', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.forsight_sources;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'client member saw % forsight sources, expected 1', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.forsight_sources
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'client member saw % DA forsight sources', v_count;
  END IF;

  -- Members cannot repoint their workspace's source. Row-level security
  -- filters the statement to nothing rather than raising, so the assertion is
  -- that no row moved, not that an error came back.
  UPDATE public.forsight_sources
  SET label = 'member renamed this'
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'an authenticated member edited % forsight sources', v_count;
  END IF;

  -- An insert is refused outright, because the policy's WITH CHECK fails.
  v_denied := false;
  BEGIN
    INSERT INTO public.forsight_sources (org_id, source_type, meta_ad_account_id)
    VALUES ('f0f5f0f5-0000-4000-8000-000000000002', 'meta_ads', 'act_nope');
  EXCEPTION
    WHEN insufficient_privilege THEN v_denied := true;
  END;
  IF NOT v_denied THEN
    RESET ROLE;
    RAISE EXCEPTION 'an authenticated member was able to create a forsight source';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
END
$$;

-- A GHL source carries a calendar and no credential; the OAuth connection in
-- ghl_connections is what authenticates, and it is not duplicated here.
INSERT INTO public.forsight_sources (org_id, source_type, label, ghl_calendar_id)
VALUES (
  'f0f5f0f5-0000-4000-8000-000000000001',
  'ghl',
  'Lead Leak Audit calendar',
  'cal_abc123'
)
ON CONFLICT (org_id, source_type) DO NOTHING;

DO $$
DECLARE
  v_count integer;
BEGIN
  -- A calendar id belongs to a GHL source and nowhere else.
  SELECT count(*) INTO v_count
  FROM public.forsight_sources
  WHERE source_type <> 'ghl' AND ghl_calendar_id IS NOT NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '% non-GHL sources kept a calendar id', v_count;
  END IF;

  -- Forsight writes nothing outward, so there is no sync job to monitor.
  SELECT count(*) INTO v_count
  FROM public.ops_job_catalog WHERE job_name = 'forsight-meta-sync';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'the Airtable spend sync is still in the job catalog';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Client users never configure anything, and that is Postgres's job to enforce
-- rather than a hidden link's. A DA operator provisions; a client cannot.
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, email)
VALUES ('f0f5f0f5-0000-4000-8000-00000000000c', 'forsight-operator@vistrial.local')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_count integer;
  v_denied boolean;
BEGIN
  -- A client member cannot create a source for their own workspace.
  PERFORM set_config('request.jwt.claim.sub', 'f0f5f0f5-0000-4000-8000-00000000000b', false);
  SET ROLE authenticated;

  v_denied := false;
  BEGIN
    INSERT INTO public.forsight_sources (org_id, source_type, label)
    VALUES ('f0f5f0f5-0000-4000-8000-000000000002', 'ghl', 'client added this');
  EXCEPTION
    WHEN insufficient_privilege THEN v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'a client user created a forsight source';
  END IF;

  -- Nor edit the one they have. RLS filters rather than raising, so what is
  -- asserted is that nothing moved.
  UPDATE public.forsight_sources
  SET label = 'client edited this'
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'a client user edited % forsight sources', v_count;
  END IF;

  -- Nor delete it.
  DELETE FROM public.forsight_sources
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'a client user deleted % forsight sources', v_count;
  END IF;

  -- And still cannot see another workspace's, by any route.
  SELECT count(*) INTO v_count
  FROM public.forsight_sources
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'client member saw % sources from another workspace', v_count;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
END
$$;

DO $$
DECLARE
  v_count integer;
  v_orgs integer;
  v_denied boolean;
BEGIN
  -- The same statements, from an operator.
  INSERT INTO public.platform_staff (user_id, role, display_name, email)
  SELECT id, 'platform_admin', 'Platform Admin', COALESCE(email, '') FROM auth.users WHERE id = 'f0f5f0f5-0000-4000-8000-00000000000c'
  ON CONFLICT (user_id) DO UPDATE SET role = 'platform_admin', active = true, deactivated_at = NULL;

  PERFORM set_config('request.jwt.claim.sub', 'f0f5f0f5-0000-4000-8000-00000000000c', false);
  SET ROLE authenticated;

  IF NOT public.is_platform_admin() THEN
    RESET ROLE;
    RAISE EXCEPTION 'the seeded operator is not a platform admin';
  END IF;

  -- A workspace reads from one place. A second core row is refused.
  v_denied := false;
  BEGIN
    INSERT INTO public.forsight_sources (org_id, source_type, label)
    VALUES ('f0f5f0f5-0000-4000-8000-000000000002', 'vistrial_core', 'Core client');
  EXCEPTION
    WHEN unique_violation THEN v_denied := true;
  END;
  IF NOT v_denied THEN
    RESET ROLE;
    RAISE EXCEPTION 'a workspace was given two metrics sources at once';
  END IF;

  UPDATE public.forsight_sources
  SET label = 'Core client, renamed'
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002'
    AND source_type = 'vistrial_core';

  -- Cross-workspace read is the operator overview, gated the same way.
  SELECT count(DISTINCT org_id) INTO v_orgs FROM public.forsight_sources;
  IF v_orgs < 2 THEN
    RESET ROLE;
    RAISE EXCEPTION 'operator saw sources for only % workspaces', v_orgs;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);

  -- A workspace reads its metrics from one place, not two.
  SELECT count(*) INTO v_count
  FROM public.forsight_sources
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002'
    AND source_type = 'vistrial_core';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'workspace ended up with % metrics sources', v_count;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Monthly reports. Frozen at generation. A correction is a new version.
-- ---------------------------------------------------------------------------

INSERT INTO public.forsight_reports (
  id, org_id, period_start, period_end, version, generated_at,
  generated_by, generated_by_name, source_type, payload, omissions
) VALUES
  (
    'f0f5f0f5-0000-4000-8000-0000000000a1',
    'f0f5f0f5-0000-4000-8000-000000000001',
    '2026-08-01',
    '2026-08-31',
    1,
    '2026-09-01T09:00:00Z',
    'scheduled',
    'scheduled',
    'vistrial_core',
    '{"schemaVersion":1,"workspace":{"id":"f0f5f0f5-0000-4000-8000-000000000001","name":"Forsight DA"},"period":{"start":"2026-08-01","end":"2026-08-31","label":"August 2026"},"generatedAt":"2026-09-01T09:00:00Z","sections":[{"kind":"funnel","title":"The funnel","steps":[{"label":"Closed","count":1}]}],"omissions":[]}'::jsonb,
    '[]'::jsonb
  ),
  (
    'f0f5f0f5-0000-4000-8000-0000000000a2',
    'f0f5f0f5-0000-4000-8000-000000000001',
    '2026-08-01',
    '2026-08-31',
    2,
    '2026-09-01T10:00:00Z',
    'operator',
    'Dana',
    'vistrial_core',
    '{"schemaVersion":1,"workspace":{"id":"f0f5f0f5-0000-4000-8000-000000000001","name":"Forsight DA"},"period":{"start":"2026-08-01","end":"2026-08-31","label":"August 2026"},"generatedAt":"2026-09-01T10:00:00Z","sections":[{"kind":"funnel","title":"The funnel","steps":[{"label":"Closed","count":2}]}],"omissions":[]}'::jsonb,
    '[]'::jsonb
  ),
  (
    'f0f5f0f5-0000-4000-8000-0000000000b1',
    'f0f5f0f5-0000-4000-8000-000000000002',
    '2026-08-01',
    '2026-08-31',
    1,
    '2026-09-01T09:30:00Z',
    'operator',
    'Dana',
    'vistrial_core',
    '{"schemaVersion":1,"workspace":{"id":"f0f5f0f5-0000-4000-8000-000000000002","name":"Forsight Client"},"period":{"start":"2026-08-01","end":"2026-08-31","label":"August 2026"},"generatedAt":"2026-09-01T09:30:00Z","sections":[{"kind":"absent","title":"Objections","line":"No calls were held this month, so there are no objections to read."}],"omissions":[]}'::jsonb,
    '[]'::jsonb
  );

INSERT INTO public.forsight_report_sends (
  id, report_id, org_id, version, sent_at, sent_by_email, recipients
) VALUES (
  'f0f5f0f5-0000-4000-8000-0000000000c1',
  'f0f5f0f5-0000-4000-8000-0000000000a2',
  'f0f5f0f5-0000-4000-8000-000000000001',
  2,
  '2026-09-01T11:00:00Z',
  'forsight-operator@vistrial.local',
  ARRAY['forsight-da@vistrial.local']
);

DO $$
DECLARE
  v_count integer;
  v_denied boolean;
  v_version integer;
  v_closed integer;
BEGIN
  SELECT public.forsight_next_report_version(
    'f0f5f0f5-0000-4000-8000-000000000001',
    '2026-08-01'
  ) INTO v_version;
  IF v_version <> 3 THEN
    RAISE EXCEPTION 'next report version was %, expected 3', v_version;
  END IF;

  v_denied := false;
  BEGIN
    UPDATE public.forsight_reports
    SET generated_by_name = 'rewritten'
    WHERE id = 'f0f5f0f5-0000-4000-8000-0000000000a1';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%never edited%' THEN v_denied := true; END IF;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'a generated report was updated';
  END IF;

  SELECT count(*) INTO v_count FROM public.ops_job_catalog WHERE job_name = 'forsight-reports';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'forsight-reports is not in the job catalog';
  END IF;

  -- Both versions remain readable. The numbers in v1 did not move when v2 was written.
  SELECT (payload #>> '{sections,0,steps,0,count}')::integer INTO v_closed
  FROM public.forsight_reports
  WHERE id = 'f0f5f0f5-0000-4000-8000-0000000000a1';
  IF v_closed <> 1 THEN
    RAISE EXCEPTION 'version 1 closed count was rewritten to %', v_closed;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', 'f0f5f0f5-0000-4000-8000-00000000000b', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.forsight_reports
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'client member saw % reports from another workspace', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.forsight_reports
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'client member saw % of their own reports, expected 1', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.forsight_report_sends;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'client member saw % report sends', v_count;
  END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.forsight_reports (
      org_id, period_start, period_end, version, generated_by, source_type, payload
    ) VALUES (
      'f0f5f0f5-0000-4000-8000-000000000002',
      '2026-07-01',
      '2026-07-31',
      1,
      'operator',
      'vistrial_core',
      '{}'::jsonb
    );
  EXCEPTION
    WHEN insufficient_privilege THEN v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'an authenticated member inserted a report';
  END IF;

  v_denied := false;
  BEGIN
    DELETE FROM public.forsight_reports
    WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002';
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_denied := true;
      v_count := 0;
  END;
  IF NOT v_denied AND v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'an authenticated member deleted % reports', v_count;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', 'f0f5f0f5-0000-4000-8000-00000000000c', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.forsight_report_sends;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'operator saw % report sends, expected 1', v_count;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
END
$$;

-- Sources leave with the workspace they belong to. Reports leave with them.
DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('vistrial.allow_org_wipe', '1', true);
  DELETE FROM public.organizations WHERE id = 'f0f5f0f5-0000-4000-8000-000000000002';
  SELECT count(*) INTO v_count
  FROM public.forsight_sources
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'deleting a workspace left % forsight sources behind', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.forsight_reports
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'deleting a workspace left % reports behind', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.forsight_reports
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000001';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'wiping another workspace deleted this one''s reports';
  END IF;
END
$$;
