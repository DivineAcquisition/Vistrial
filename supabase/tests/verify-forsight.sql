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

INSERT INTO public.forsight_sources (
  org_id, source_type, label, airtable_base_id, airtable_creatives_table
) VALUES
  (
    'f0f5f0f5-0000-4000-8000-000000000001',
    'airtable',
    'DA Pipeline — Client Acquisition',
    'appForsightDaSeed1',
    'Creatives'
  ),
  (
    'f0f5f0f5-0000-4000-8000-000000000002',
    'airtable',
    'Client base without creatives',
    'appForsightClient1',
    NULL
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
  v_missing text;
  v_denied boolean;
BEGIN
  -- A missing table on a client base is recorded, not guessed.
  SELECT airtable_creatives_table INTO v_missing
  FROM public.forsight_sources
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002' AND source_type = 'airtable';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'client base kept a creatives table it does not have';
  END IF;

  -- A Meta source keeps no Airtable table names, defaults included.
  SELECT count(*) INTO v_count
  FROM public.forsight_sources
  WHERE source_type = 'meta_ads'
    AND (
      airtable_base_id IS NOT NULL
      OR airtable_leads_table IS NOT NULL
      OR airtable_creatives_table IS NOT NULL
      OR airtable_weekly_summary_table IS NOT NULL
      OR airtable_touches_table IS NOT NULL
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'a meta source kept % Airtable fields', v_count;
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

  v_denied := false;
  BEGIN
    INSERT INTO public.forsight_sources (org_id, source_type)
    VALUES ('f0f5f0f5-0000-4000-8000-000000000003', 'airtable');
  EXCEPTION
    WHEN check_violation THEN v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'an airtable source without a base id was accepted';
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

  -- Members cannot point their workspace at another base. Row-level security
  -- filters the statement to nothing rather than raising, so the assertion is
  -- that no row moved, not that an error came back.
  UPDATE public.forsight_sources
  SET airtable_base_id = 'appSomebodyElse'
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
  v_denied boolean;
  v_run uuid;
BEGIN
  -- A calendar id belongs to a GHL source and nowhere else.
  SELECT count(*) INTO v_count
  FROM public.forsight_sources
  WHERE source_type <> 'ghl' AND ghl_calendar_id IS NOT NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '% non-GHL sources kept a calendar id', v_count;
  END IF;

  -- Sync runs belong to a workspace and outlive nothing else.
  INSERT INTO public.forsight_sync_runs (org_id, source_type, status, period_start, period_end, unmatched_ads)
  VALUES (
    'f0f5f0f5-0000-4000-8000-000000000001',
    'meta_ads',
    'succeeded',
    '2026-08-25',
    '2026-09-01',
    '["DA-99 Ad With No Creative"]'::jsonb
  )
  RETURNING id INTO v_run;

  -- One workspace never sees another's sync history.
  PERFORM set_config('request.jwt.claim.sub', 'f0f5f0f5-0000-4000-8000-00000000000b', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.forsight_sync_runs;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'client member saw % sync runs belonging to another workspace', v_count;
  END IF;

  -- Members read the log; only the job writes it.
  v_denied := false;
  BEGIN
    INSERT INTO public.forsight_sync_runs (org_id, source_type)
    VALUES ('f0f5f0f5-0000-4000-8000-000000000002', 'meta_ads');
  EXCEPTION
    WHEN insufficient_privilege THEN v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'an authenticated member was able to write a sync run';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);

  -- The scheduled write is registered as a monitored job.
  SELECT count(*) INTO v_count
  FROM public.ops_job_catalog WHERE job_name = 'forsight-meta-sync';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'forsight-meta-sync is not in the job catalog';
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
    INSERT INTO public.forsight_sources (org_id, source_type, airtable_base_id)
    VALUES ('f0f5f0f5-0000-4000-8000-000000000002', 'vistrial_core', NULL);
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
  INSERT INTO public.platform_admins (user_id)
  VALUES ('f0f5f0f5-0000-4000-8000-00000000000c')
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', 'f0f5f0f5-0000-4000-8000-00000000000c', false);
  SET ROLE authenticated;

  IF NOT public.is_platform_admin() THEN
    RESET ROLE;
    RAISE EXCEPTION 'the seeded operator is not a platform admin';
  END IF;

  -- A workspace reads from one place. Adding core beside Airtable is refused.
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

  -- Switching a client from Airtable to core is a delete then an insert, and
  -- an operator may do both.
  DELETE FROM public.forsight_sources
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002' AND source_type = 'airtable';

  INSERT INTO public.forsight_sources (org_id, source_type, label)
  VALUES ('f0f5f0f5-0000-4000-8000-000000000002', 'vistrial_core', 'Core client');

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
    AND source_type IN ('airtable', 'vistrial_core');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'workspace ended up with % metrics sources', v_count;
  END IF;
END
$$;

-- Sources leave with the workspace they belong to.
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
END
$$;
