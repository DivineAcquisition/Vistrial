-- Prompt 21: derived activity stream. No parallel event log.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('activity_events', 'activity_stream', 'activity_stream_events')
  ) THEN
    RAISE EXCEPTION 'a parallel activity event table was created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'follow_up_events' AND column_name = 'lead_id'
  ) THEN
    RAISE EXCEPTION 'follow_up_events.lead_id was not added';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'objections' AND column_name = 'resolved_by_member_id'
  ) THEN
    RAISE EXCEPTION 'objections.resolved_by_member_id was not added';
  END IF;
END
$$;

INSERT INTO public.webhook_events (
  org_id, source, event_type, payload, status, received_at, contact_key, error_text
) VALUES
(
  '22222222-2222-4222-8222-222222222222',
  'ghl',
  'ContactCreate',
  '{"token":"sk-live-should-never-appear","inbound":"prospect said hi"}'::jsonb,
  'processed',
  now() - interval '5 minutes',
  'ghl_loc_dev_northstar:ghl_ct_maya',
  NULL
),
(
  '22222222-2222-4222-8222-222222222222',
  'ghl',
  'ContactUpdate',
  '{"token":"sk-live-should-never-appear"}'::jsonb,
  'processed',
  now(),
  'ghl_loc_dev_northstar:ghl_ct_maya',
  NULL
),
(
  '22222222-2222-4222-8222-222222222222',
  'ghl',
  'ContactCreate',
  '{"probe":true}'::jsonb,
  'rejected',
  now() - interval '3 minutes',
  'ghl_loc_dev_northstar:ghl_ct_maya',
  'signature mismatch'
);

INSERT INTO public.settings_activity (
  org_id, actor_label, actor_kind, actor_user_id, section, action
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'Jordan (DA)',
  'da_operator',
  '99999999-9999-4999-8999-999999999999',
  'managed',
  'updated working hours'
);

INSERT INTO public.ghl_dispatches (
  org_id, lead_id, channel, status, body_text, failure_reason, idempotency_key, created_at
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'sms',
  'failed',
  'See you Thursday at 2.',
  'timeout',
  'follow-up:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  now() - interval '2 minutes'
);

INSERT INTO public.ghl_dispatches (
  org_id, lead_id, channel, status, body_text, created_at, sent_at
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'sms',
  'sent',
  'See you Thursday at 2.',
  now() - interval '90 seconds',
  now() - interval '90 seconds'
);

UPDATE public.leads
SET assigned_closer_id = '33333333-3333-4333-8333-333333333333'
WHERE id = '44444444-4444-4444-8444-444444444442'
  AND EXISTS (SELECT 1 FROM public.org_members WHERE id = '33333333-3333-4333-8333-333333333333');

INSERT INTO public.lead_type_changes (org_id, lead_id, from_type, to_type)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444443',
  'ready_track',
  'nurture_track'
);

INSERT INTO public.webhook_events (
  org_id, source, event_type, payload, status, received_at
) VALUES (
  '66666666-6666-4666-8666-666666666666',
  'ghl',
  'ContactCreate',
  '{"otherOrg":true}'::jsonb,
  'dead',
  now() - interval '1 minute'
);

DO $$
DECLARE
  v_plan jsonb;
  v_page jsonb;
  v_denied boolean;
  v_count integer;
  v_text text;
  v_first_result text;
BEGIN
  SET LOCAL enable_seqscan = off;

  EXECUTE $q$
    EXPLAIN (FORMAT JSON)
    SELECT id FROM public.ghl_dispatches
    WHERE org_id = '22222222-2222-4222-8222-222222222222'
    ORDER BY created_at DESC
    LIMIT 40
  $q$ INTO v_plan;
  IF v_plan::text NOT ILIKE '%ghl_dispatches_org_created_idx%'
     AND v_plan::text ILIKE '%Seq Scan%' THEN
    RAISE EXCEPTION 'ghl_dispatches org time lookup did not use an index: %', v_plan;
  END IF;

  EXECUTE $q$
    EXPLAIN (FORMAT JSON)
    SELECT id FROM public.readiness_scores
    WHERE org_id = '22222222-2222-4222-8222-222222222222'
    ORDER BY created_at DESC
    LIMIT 40
  $q$ INTO v_plan;
  IF v_plan::text NOT ILIKE '%readiness_scores_org_created_idx%'
     AND v_plan::text ILIKE '%Seq Scan%' AND v_plan::text NOT ILIKE '%Index%' THEN
    RAISE EXCEPTION 'readiness_scores org time lookup used a sequential scan: %', v_plan;
  END IF;

  EXECUTE $q$
    EXPLAIN (FORMAT JSON)
    SELECT id FROM public.lead_assignment_changes
    WHERE org_id = '22222222-2222-4222-8222-222222222222'
    ORDER BY created_at DESC
    LIMIT 40
  $q$ INTO v_plan;
  IF v_plan::text NOT ILIKE '%lead_assignment_changes_org_time_idx%'
     AND v_plan::text ILIKE '%Seq Scan%' AND v_plan::text NOT ILIKE '%Index%' THEN
    RAISE EXCEPTION 'assignment history used a sequential scan: %', v_plan;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lead_assignment_changes
    WHERE lead_id = '44444444-4444-4444-8444-444444444442'
  ) THEN
    RAISE EXCEPTION 'assignment change was not recorded on the lead';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lead_type_changes
    WHERE lead_id = '44444444-4444-4444-8444-444444444443'
      AND to_type = 'nurture_track'
  ) THEN
    RAISE EXCEPTION 'track change was not recorded on the lead';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.activity_stream_source(uuid,timestamptz,timestamptz)',
    'execute'
  ) THEN
    RAISE EXCEPTION 'authenticated users must not execute activity_stream_source directly';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;

  v_page := public.load_org_activity(
    '22222222-2222-4222-8222-222222222222',
    NULL, NULL, NULL, NULL, false, false, false, NULL, NULL, NULL, 40, NULL
  );
  v_text := v_page::text;
  IF v_text ILIKE '%sk-live%' OR v_text ILIKE '%prospect said%' OR v_text ILIKE '%tok_%' THEN
    RESET ROLE;
    RAISE EXCEPTION 'stream leaked a token, payload, or prospect content: %', left(v_text, 500);
  END IF;
  IF v_text ILIKE '%"payload"%' THEN
    RESET ROLE;
    RAISE EXCEPTION 'stream JSON included a raw payload key';
  END IF;

  SELECT count(*) INTO v_count
  FROM jsonb_array_elements(v_page->'events') e
  WHERE e->>'kind' = 'contact_updated';
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'default view included CRM sync noise';
  END IF;

  SELECT count(*) INTO v_count
  FROM jsonb_array_elements(v_page->'events') e
  WHERE e->>'kind' = 'lead_received';
  IF v_count = 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'default view hid lead arrivals';
  END IF;

  SELECT count(*) INTO v_count
  FROM jsonb_array_elements(v_page->'events') e
  WHERE e->>'result' = 'failed' AND e->>'kind' IN ('webhook_rejected', 'dispatch_failed');
  IF v_count < 2 THEN
    RESET ROLE;
    RAISE EXCEPTION 'failures were missing from the default stream';
  END IF;

  SELECT count(*) INTO v_count
  FROM jsonb_array_elements(v_page->'events') e
  WHERE e->>'kind' = 'settings_changed' AND e->>'actorLabel' = 'Jordan (DA)';
  IF v_count = 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'DA operator action was not attributed by name';
  END IF;

  v_page := public.load_org_activity(
    '22222222-2222-4222-8222-222222222222',
    NULL, NULL, NULL, NULL, false, false, true, NULL, NULL, NULL, 80, NULL
  );
  SELECT count(*) INTO v_count
  FROM jsonb_array_elements(v_page->'events') e
  WHERE e->>'kind' = 'lead_scored';
  IF v_count = 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'routine toggle did not restore scoring events';
  END IF;

  SELECT count(*) INTO v_count
  FROM jsonb_array_elements(v_page->'events') e
  WHERE e->>'actorLabel' ILIKE 'system' AND e->>'actorLabel' = 'system';
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'a bare system actor appeared in the stream';
  END IF;

  SELECT count(*) INTO v_count
  FROM jsonb_array_elements(v_page->'events') e
  WHERE e->>'kind' = 'dispatch_failed' AND (e->>'retryable')::boolean IS TRUE;
  IF v_count = 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'failed follow-up dispatch was not retryable';
  END IF;

  v_page := public.load_org_activity(
    '22222222-2222-4222-8222-222222222222',
    NULL, NULL, NULL, NULL, false, true, false, NULL, NULL, NULL, 40, NULL
  );
  SELECT count(*) INTO v_count
  FROM jsonb_array_elements(v_page->'events') e
  WHERE e->>'kind' = 'contact_updated';
  IF v_count = 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'sync toggle did not restore contact updates';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM public.load_org_activity(
      '66666666-6666-4666-8666-666666666666',
      NULL, NULL, NULL, NULL, false, false, false, NULL, NULL, NULL, 40, NULL
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%not authorized%' THEN
        v_denied := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_denied THEN
    RESET ROLE;
    RAISE EXCEPTION 'org A owner loaded org B activity';
  END IF;

  v_page := public.load_org_case_timeline(
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444441',
    NULL,
    20
  );
  SELECT count(*) INTO v_count
  FROM jsonb_array_elements(v_page->'entries') e
  WHERE e->>'kind' = 'activity';
  IF v_count = 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'case timeline did not merge derived activity';
  END IF;
  SELECT count(*) INTO v_count
  FROM jsonb_array_elements(v_page->'entries') e
  WHERE e->>'kind' IN ('touch', 'call', 'status');
  -- Seeded Maya has touches/calls; merged list must still include the original kinds.
  IF v_count = 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'case timeline dropped the existing touch/call/status sequence';
  END IF;

  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);
  SET ROLE authenticated;

  v_denied := false;
  BEGIN
    PERFORM public.load_org_activity(
      '22222222-2222-4222-8222-222222222222',
      NULL, NULL, NULL, NULL, false, false, false, NULL, NULL, NULL, 40, NULL
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%not authorized%' THEN
        v_denied := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_denied THEN
    RESET ROLE;
    RAISE EXCEPTION 'setter reached the full activity stream';
  END IF;

  v_page := public.load_org_case_timeline(
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444442',
    NULL,
    20
  );
  IF v_page IS NULL OR jsonb_typeof(v_page->'entries') IS DISTINCT FROM 'array' THEN
    RESET ROLE;
    RAISE EXCEPTION 'setter could not load per-lead timeline';
  END IF;

  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);
  SET ROLE authenticated;

  v_page := public.load_ops_activity(
    NULL, false, false, false, NULL, NULL, NULL, 40, NULL
  );
  v_first_result := v_page->'events'->0->>'result';
  IF jsonb_array_length(v_page->'events') > 0 AND v_first_result IS DISTINCT FROM 'failed' THEN
    SELECT count(*) INTO v_count
    FROM jsonb_array_elements(v_page->'events') e
    WHERE e->>'result' = 'failed';
    IF v_count > 0 THEN
      RESET ROLE;
      RAISE EXCEPTION 'ops activity did not surface failures first';
    END IF;
  END IF;

  SELECT count(*) INTO v_count
  FROM jsonb_array_elements(v_page->'events') e
  WHERE e->>'orgId' = '66666666-6666-4666-8666-666666666666'
    AND e->>'result' = 'failed';
  IF v_count = 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'ops activity missed the other-org failure';
  END IF;

  RESET ROLE;
END
$$;
