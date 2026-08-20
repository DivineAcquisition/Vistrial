-- Case Files: search, cursor paging, status integrity, revenue ACL, timeline.

DO $$
DECLARE
  v_plan jsonb;
BEGIN
  SET LOCAL enable_seqscan = off;

  EXECUTE $q$
    EXPLAIN (FORMAT JSON)
    SELECT l.id
    FROM public.leads l
    WHERE l.org_id = '22222222-2222-4222-8222-222222222222'
      AND l.first_name ILIKE '%Maya%'
  $q$ INTO v_plan;
  IF v_plan::text NOT ILIKE '%leads_first_name_trgm_idx%'
     AND v_plan::text NOT ILIKE '%gin_trgm%'
     AND v_plan::text NOT ILIKE '%Bitmap Index%' THEN
    RAISE EXCEPTION 'name search did not use a trigram/gin index: %', v_plan;
  END IF;

  EXECUTE $q$
    EXPLAIN (FORMAT JSON)
    SELECT l.id
    FROM public.leads l
    WHERE l.org_id = '22222222-2222-4222-8222-222222222222'
      AND l.email ILIKE '%maya.chen%'
  $q$ INTO v_plan;
  IF v_plan::text NOT ILIKE '%leads_email_trgm_idx%'
     AND v_plan::text NOT ILIKE '%gin_trgm%'
     AND v_plan::text NOT ILIKE '%Bitmap Index%' THEN
    RAISE EXCEPTION 'email search did not use a trigram/gin index: %', v_plan;
  END IF;

  EXECUTE $q$
    EXPLAIN (FORMAT JSON)
    SELECT t.id
    FROM public.touches t
    WHERE t.lead_id = '44444444-4444-4444-8444-444444444441'
    ORDER BY t.occurred_at DESC, t.id DESC
    LIMIT 20
  $q$ INTO v_plan;
  IF v_plan::text NOT ILIKE '%touches_lead_occurred_idx%' THEN
    RAISE EXCEPTION 'timeline touch lookup did not use touches_lead_occurred_idx: %', v_plan;
  END IF;

  EXECUTE $q$
    EXPLAIN (FORMAT JSON)
    SELECT l.id
    FROM public.leads l
    WHERE l.org_id = '22222222-2222-4222-8222-222222222222'
    ORDER BY l.last_touch_at DESC NULLS LAST, l.id DESC
    LIMIT 50
  $q$ INTO v_plan;
  IF v_plan::text ILIKE '%Seq Scan%' AND v_plan::text NOT ILIKE '%Index%' THEN
    RAISE EXCEPTION 'case list last-touch sort used a sequential scan: %', v_plan;
  END IF;
END
$$;

INSERT INTO public.leads (
  id, org_id, first_name, last_name, email, phone, status, source, opted_in_at, ghl_contact_id
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
  '22222222-2222-4222-8222-222222222222',
  'Bare',
  'File',
  'bare.file@example.com',
  '+15555550999',
  'new',
  'case-test',
  now() - interval '1 day',
  'ghl_ct_bare_file'
);

INSERT INTO public.leads (
  id, org_id, first_name, last_name, email, phone, status, source, opted_in_at, ghl_contact_id,
  assigned_setter_id
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02',
  '22222222-2222-4222-8222-222222222222',
  'Worked',
  'Lead',
  'worked.lead@example.com',
  '+15555550888',
  'working',
  'case-test',
  now() - interval '4 days',
  'ghl_ct_worked_lead',
  '33333333-3333-4333-8333-333333333333'
);

INSERT INTO public.readiness_scores (
  org_id, lead_id,
  timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
  total, reasoning, triggered_by
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02',
  90, 20, 40, 70, 55,
  'Case file fixture: high timeline, low investment.',
  'intake'
), (
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02',
  80, 20, 40, 70, 52,
  'Case file fixture: later override-shaped row.',
  'manual'
);

INSERT INTO public.touches (
  org_id, lead_id, type, channel, direction, actor_member_id, outcome, summary, occurred_at
)
SELECT
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02',
  'human',
  'call',
  'outbound',
  id,
  'connected',
  'Operator note only.',
  now() - interval '3 hours'
FROM public.org_members
WHERE id = '33333333-3333-4333-8333-333333333333';

INSERT INTO public.calls (
  id, org_id, lead_id, type, ran_by_member_id, occurred_at, duration_seconds, outcome
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02',
  'discovery',
  '33333333-3333-4333-8333-333333333333',
  now() - interval '2 hours',
  1800,
  'held'
);

INSERT INTO public.objections (
  id, org_id, lead_id, type, verbatim, call_id
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb20',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02',
  'price',
  'I need to talk to my accountant first.',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10'
);

INSERT INTO public.touches (
  org_id, lead_id, type, channel, direction, summary, occurred_at
)
SELECT
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02',
  'system',
  'sms',
  'inbound',
  'Inbound sms received',
  now() - (gs || ' minutes')::interval
FROM generate_series(1, 80) AS gs;

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_owner uuid := '11111111-1111-4111-8111-111111111111';
  v_payload jsonb;
  v_ids uuid[];
  v_page2 uuid[];
  v_overlap integer;
  v_cursor jsonb;
  v_file jsonb;
  v_timeline jsonb;
  v_status public.lead_status;
  v_count integer;
  v_denied boolean;
  v_source public.status_change_source;
  v_supersedes boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  v_payload := public.load_org_case_list(v_org, 'Maya');
  IF jsonb_array_length(v_payload->'rows') < 1 THEN
    RAISE EXCEPTION 'search for Maya returned no rows';
  END IF;
  IF (v_payload->'rows'->0->>'name') NOT ILIKE '%Maya%'
     AND (v_payload->'rows'->0->>'email') NOT ILIKE '%maya%' THEN
    RAISE EXCEPTION 'search for Maya returned a non-matching first row: %', v_payload->'rows'->0;
  END IF;

  v_payload := public.load_org_case_list(v_org, '5555550101');
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_payload->'rows') r
    WHERE r->>'id' = '44444444-4444-4444-8444-444444444441'
  ) THEN
    RAISE EXCEPTION 'phone-digit search missed Maya Chen';
  END IF;

  v_payload := public.load_org_case_list(
    v_org, 'Maya', 'call_booked', NULL, 'facebook'
  );
  IF jsonb_array_length(v_payload->'rows') < 1 THEN
    RAISE EXCEPTION 'combined search+status+source returned no rows';
  END IF;
  v_payload := public.load_org_case_list(
    v_org, 'Maya', 'ghost', NULL, 'facebook'
  );
  IF jsonb_array_length(v_payload->'rows') <> 0 THEN
    RAISE EXCEPTION 'combined search with a non-matching status still returned rows';
  END IF;

  v_payload := public.load_org_case_list(
    p_org_id := v_org,
    p_q := NULL,
    p_status := NULL,
    p_track := NULL,
    p_source := 'case-test',
    p_sort := 'last_touch',
    p_dir := 'desc',
    p_limit := 1
  );
  v_ids := ARRAY[(v_payload->'rows'->0->>'id')::uuid];
  v_cursor := jsonb_build_object(
    'id', v_payload->'rows'->0->>'id',
    't', v_payload->'rows'->0->>'lastTouchAt'
  );
  v_payload := public.load_org_case_list(
    p_org_id := v_org,
    p_source := 'case-test',
    p_sort := 'last_touch',
    p_dir := 'desc',
    p_cursor := v_cursor,
    p_limit := 1
  );
  v_page2 := ARRAY[(v_payload->'rows'->0->>'id')::uuid];
  SELECT count(*) INTO v_overlap FROM unnest(v_ids) a JOIN unnest(v_page2) b ON a = b;
  IF v_overlap <> 0 THEN
    RAISE EXCEPTION 'case list cursor duplicated rows: % / %', v_ids, v_page2;
  END IF;

  v_file := public.load_org_case_file(v_org, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01');
  IF v_file IS NULL THEN
    RAISE EXCEPTION 'empty case file did not load';
  END IF;
  IF v_file->'score' IS NOT NULL AND jsonb_typeof(v_file->'score') <> 'null' THEN
    RAISE EXCEPTION 'bare lead unexpectedly had a score: %', v_file->'score';
  END IF;
  IF jsonb_array_length(v_file->'timeline'->'entries') <> 0 THEN
    RAISE EXCEPTION 'bare lead timeline was not empty';
  END IF;

  v_file := public.load_org_case_file(v_org, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02');
  IF (v_file->'score'->>'timeline')::int <> 80 THEN
    RAISE EXCEPTION 'current score factors were not the latest row';
  END IF;
  IF jsonb_array_length(v_file->'scoreHistory') <> 2 THEN
    RAISE EXCEPTION 'score history missing rows: %', v_file->'scoreHistory';
  END IF;
  IF v_file->'scoreHistory'->0->>'previousTotal' IS NULL THEN
    RAISE EXCEPTION 'newest score history row missing previousTotal';
  END IF;
  IF (v_file->'objections'->0->>'verbatim') IS DISTINCT FROM 'I need to talk to my accountant first.' THEN
    RAISE EXCEPTION 'open objection verbatim missing';
  END IF;
  IF jsonb_typeof(v_file->'revenue') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'owner case file omitted revenue';
  END IF;

  v_timeline := public.load_org_case_timeline(
    v_org, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', NULL, 20
  );
  IF jsonb_array_length(v_timeline->'entries') <> 20 THEN
    RAISE EXCEPTION 'timeline page expected 20, got %', jsonb_array_length(v_timeline->'entries');
  END IF;
  IF (v_timeline->>'hasMore')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'timeline with 80+ events did not paginate';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_timeline->'entries') e
    WHERE e ? 'body' OR e ? 'preview' OR e ? 'unread' OR e ? 'message' OR e ? 'rawTranscript'
  ) THEN
    RAISE EXCEPTION 'timeline leaked conversation fields';
  END IF;

  v_cursor := jsonb_build_object(
    'at', v_timeline->'entries'->19->>'at',
    'id', v_timeline->'entries'->19->>'id'
  );
  v_payload := public.load_org_case_timeline(
    v_org, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', v_cursor, 20
  );
  SELECT count(*) INTO v_overlap
  FROM jsonb_array_elements(v_timeline->'entries') a
  JOIN jsonb_array_elements(v_payload->'entries') b ON a->>'id' = b->>'id';
  IF v_overlap <> 0 THEN
    RAISE EXCEPTION 'timeline cursor duplicated entries';
  END IF;

  IF public.load_org_case_file(v_org, '88888888-8888-4888-8888-888888888888') IS NOT NULL THEN
    RAISE EXCEPTION 'other-org case file leaked';
  END IF;
  IF public.load_org_case_file(v_org, '00000000-0000-4000-8000-000000000000') IS NOT NULL THEN
    RAISE EXCEPTION 'missing case file was not null';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM public.change_org_lead_status(
      v_org, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'closed_won', 'nope'
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%closed_won%' THEN
        v_denied := true;
      ELSE
        RESET ROLE;
        RAISE;
      END IF;
  END;
  IF NOT v_denied THEN
    RESET ROLE;
    RAISE EXCEPTION 'manual closed_won was allowed';
  END IF;

  PERFORM public.change_org_lead_status(
    v_org, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'follow_up', 'Setter asked to park it.'
  );

  RESET ROLE;

  SELECT source INTO v_source
  FROM public.lead_status_changes
  WHERE lead_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  IF v_source IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION 'manual status change was not recorded as manual';
  END IF;

  UPDATE public.leads
  SET status = 'call_booked'
  WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  v_timeline := public.load_org_case_timeline(
    v_org, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', NULL, 20
  );
  RESET ROLE;

  SELECT (e->>'supersedesManual')::boolean INTO v_supersedes
  FROM jsonb_array_elements(v_timeline->'entries') e
  WHERE e->>'kind' = 'status'
  ORDER BY (e->>'at') DESC
  LIMIT 1;
  IF v_supersedes IS NOT TRUE THEN
    RAISE EXCEPTION 'event status change did not mark supersedesManual';
  END IF;

  v_denied := false;
  BEGIN
    UPDATE public.leads
    SET status = 'closed_won'
    WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%closed_won%' THEN
        v_denied := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'direct closed_won update was allowed';
  END IF;

  INSERT INTO public.revenue_log (
    org_id, lead_id, amount_cents, currency, payment_type
  ) VALUES (
    v_org, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 150000, 'usd', 'pif'
  );

  SELECT status INTO v_status
  FROM public.leads WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';
  IF v_status IS DISTINCT FROM 'closed_won' THEN
    RAISE EXCEPTION 'payment did not set closed_won, status=%', v_status;
  END IF;

  UPDATE public.objections
  SET resolved = true, resolved_at = now(), resolved_note = 'Accountant signed off.'
  WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb20';

  v_denied := false;
  BEGIN
    DELETE FROM public.objections WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb20';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%not deleted%' THEN
        v_denied := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'objection delete was allowed';
  END IF;
  SELECT count(*) INTO v_count FROM public.objections WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb20' AND resolved;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'resolved objection was not preserved';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.org_members WHERE id = '13131313-1313-4131-8131-131313131313') THEN
    RAISE NOTICE 'setter fixture missing; skip setter ACL checks';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);
  SET ROLE authenticated;

  v_file := public.load_org_case_file(v_org, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02');
  IF jsonb_typeof(v_file->'revenue') <> 'null' THEN
    RESET ROLE;
    RAISE EXCEPTION 'setter case file included revenue: %', v_file->'revenue';
  END IF;

  SELECT count(*) INTO v_count FROM public.revenue_log WHERE lead_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'setter selected % revenue rows', v_count;
  END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.readiness_scores (
      org_id, lead_id,
      timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
      total, reasoning, triggered_by
    ) VALUES (
      v_org, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      10, 10, 10, 10, 10, 'Setter override on an unassigned lead.', 'manual'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_denied := true;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%row-level security%' OR SQLERRM ILIKE '%42501%' THEN
        v_denied := true;
      ELSE
        RESET ROLE;
        RAISE;
      END IF;
  END;
  RESET ROLE;
  SELECT count(*) INTO v_count
  FROM public.readiness_scores
  WHERE lead_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'setter overrode an unassigned lead';
  END IF;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'setter override on an unassigned lead did not raise';
  END IF;
END
$$;
