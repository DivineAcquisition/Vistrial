-- Queue: alarm index, composite urgency, no duplicates, human vs system touch,
-- self-assign, and cursor paging.

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
      AND l.first_human_touch_at IS NULL
      AND l.opted_in_at <= now() - interval '15 minutes'
    ORDER BY l.opted_in_at ASC, l.id ASC
  $q$ INTO v_plan;

  IF v_plan::text NOT ILIKE '%leads_never_touched_idx%'
     AND v_plan::text NOT ILIKE '%leads_org_opted_in_idx%' THEN
    RAISE EXCEPTION 'alarm query did not use an opted-in index: %', v_plan;
  END IF;

  EXECUTE $q$
    EXPLAIN (FORMAT JSON)
    SELECT l.id
    FROM public.leads l
    WHERE l.org_id = '22222222-2222-4222-8222-222222222222'
      AND l.status NOT IN ('closed_won', 'closed_lost', 'ghost')
  $q$ INTO v_plan;

  IF v_plan::text ILIKE '%Seq Scan%' AND v_plan::text NOT ILIKE '%Index%' THEN
    RAISE EXCEPTION 'working-queue lead lookup used a sequential scan: %', v_plan;
  END IF;
END
$$;

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.alarm_band_leads(v_org) a
  WHERE a.id = '44444444-4444-4444-8444-444444444442';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'seed never-touched lead missing from alarm band';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.queue_rows q
  WHERE q.org_id = v_org
    AND q.id IN (SELECT id FROM public.alarm_band_leads(v_org))
    AND NOT q.in_alarm;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'alarm lead also appeared in the working-queue membership';
  END IF;
END
$$;

INSERT INTO public.leads (
  id, org_id, first_name, last_name, status, source, opted_in_at, ghl_contact_id
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
  '22222222-2222-4222-8222-222222222222',
  'Ready',
  'Untouched',
  'new',
  'queue-test',
  now() - interval '5 minutes',
  'ghl_ct_ready_untouched'
);

INSERT INTO public.readiness_scores (
  org_id, lead_id,
  timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
  total, reasoning, triggered_by
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
  70, 70, 70, 70, 70,
  'Queue test: ready untouched, four factors.',
  'manual'
);

INSERT INTO public.leads (
  id, org_id, first_name, last_name, status, source, opted_in_at, ghl_contact_id
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
  '22222222-2222-4222-8222-222222222222',
  'High',
  'Touched',
  'working',
  'queue-test',
  now() - interval '2 days',
  'ghl_ct_high_touched'
);

INSERT INTO public.readiness_scores (
  org_id, lead_id,
  timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
  total, reasoning, triggered_by
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
  99, 99, 99, 99, 99,
  'Queue test: high score already contacted, four factors.',
  'manual'
);

INSERT INTO public.touches (
  org_id, lead_id, type, channel, direction, actor_member_id, summary, occurred_at
)
SELECT
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
  'human',
  'call',
  'outbound',
  id,
  'Already contacted.',
  now() - interval '1 day'
FROM public.org_members
WHERE id = '33333333-3333-4333-8333-333333333333';

INSERT INTO public.leads (
  id, org_id, first_name, last_name, status, source, opted_in_at, ghl_contact_id
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03',
  '22222222-2222-4222-8222-222222222222',
  'Thin',
  'Score',
  'working',
  'queue-test',
  now() - interval '3 days',
  'ghl_ct_thin_score'
);

INSERT INTO public.readiness_scores (
  org_id, lead_id,
  timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
  total, reasoning, triggered_by
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03',
  78, NULL, NULL, NULL, 78,
  'Queue test: same 78 from one factor.',
  'manual'
);

INSERT INTO public.touches (
  org_id, lead_id, type, channel, direction, actor_member_id, summary, occurred_at
)
SELECT
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03',
  'human',
  'sms',
  'outbound',
  id,
  'Touched thin score.',
  now() - interval '12 hours'
FROM public.org_members
WHERE id = '33333333-3333-4333-8333-333333333333';

INSERT INTO public.leads (
  id, org_id, first_name, last_name, status, source, opted_in_at, ghl_contact_id
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04',
  '22222222-2222-4222-8222-222222222222',
  'Full',
  'Score',
  'working',
  'queue-test',
  now() - interval '3 days',
  'ghl_ct_full_score'
);

INSERT INTO public.readiness_scores (
  org_id, lead_id,
  timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
  total, reasoning, triggered_by
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04',
  78, 78, 78, 78, 78,
  'Queue test: same 78 from four factors.',
  'manual'
);

INSERT INTO public.touches (
  org_id, lead_id, type, channel, direction, actor_member_id, summary, occurred_at
)
SELECT
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04',
  'human',
  'sms',
  'outbound',
  id,
  'Touched full score.',
  now() - interval '12 hours'
FROM public.org_members
WHERE id = '33333333-3333-4333-8333-333333333333';

INSERT INTO public.leads (
  id, org_id, first_name, last_name, status, source, opted_in_at, ghl_contact_id
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05',
  '22222222-2222-4222-8222-222222222222',
  'Unscored',
  'New',
  'new',
  'queue-test',
  now() - interval '3 minutes',
  'ghl_ct_unscored_new'
);

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_untouched integer;
  v_touched integer;
  v_known integer;
  v_score integer;
  v_conf text;
BEGIN
  SELECT q.urgency_rank INTO v_untouched
  FROM public.queue_rows q
  WHERE q.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';

  SELECT q.urgency_rank INTO v_touched
  FROM public.queue_rows q
  WHERE q.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02';

  IF v_untouched IS NULL OR v_touched IS NULL OR v_untouched >= v_touched THEN
    RAISE EXCEPTION 'ready untouched rank % was not above contacted high score rank %', v_untouched, v_touched;
  END IF;

  SELECT score INTO v_score
  FROM public.queue_rows
  WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05';
  IF v_score IS NOT NULL THEN
    RAISE EXCEPTION 'unscored lead showed score %', v_score;
  END IF;

  SELECT known_factor_count, score_confidence
  INTO v_known, v_conf
  FROM public.queue_rows
  WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03';
  IF v_known <> 1 OR v_conf <> 'very_low' THEN
    RAISE EXCEPTION 'one-factor score confidence expected very_low/1, got % / %', v_conf, v_known;
  END IF;

  SELECT known_factor_count, score_confidence
  INTO v_known, v_conf
  FROM public.queue_rows
  WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04';
  IF v_known <> 4 OR v_conf <> 'high' THEN
    RAISE EXCEPTION 'four-factor score confidence expected high/4, got % / %', v_conf, v_known;
  END IF;
END
$$;

INSERT INTO public.leads (
  id, org_id, first_name, last_name, status, source, opted_in_at, ghl_contact_id
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa07',
  '22222222-2222-4222-8222-222222222222',
  'Overdue',
  'Action',
  'working',
  'queue-test',
  now() - interval '5 days',
  'ghl_ct_overdue_action'
);

INSERT INTO public.readiness_scores (
  org_id, lead_id,
  timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
  total, reasoning, triggered_by
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa07',
  40, 40, 40, 40, 40,
  'Queue test: overdue next action, lower score.',
  'manual'
);

INSERT INTO public.touches (
  org_id, lead_id, type, channel, direction, actor_member_id, summary, occurred_at
)
SELECT
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa07',
  'human',
  'call',
  'outbound',
  id,
  'Touched overdue fixture.',
  now() - interval '2 days'
FROM public.org_members
WHERE id = '33333333-3333-4333-8333-333333333333';

INSERT INTO public.next_actions (
  org_id, lead_id, action_text, due_at, created_by
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa07',
  'Call back yesterday',
  now() - interval '3 hours',
  'user'
);

DO $$
DECLARE
  v_overdue integer;
  v_ready integer;
BEGIN
  SELECT q.urgency_rank INTO v_overdue
  FROM public.queue_rows q
  WHERE q.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa07';

  SELECT q.urgency_rank INTO v_ready
  FROM public.queue_rows q
  WHERE q.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02';

  IF v_overdue IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'overdue next action expected rank 2, got %', v_overdue;
  END IF;
  IF v_ready IS NULL OR v_overdue >= v_ready THEN
    RAISE EXCEPTION 'overdue rank % was not above contacted ready-track rank %', v_overdue, v_ready;
  END IF;
END
$$;

INSERT INTO public.leads (
  id, org_id, first_name, last_name, status, opted_in_at, ghl_contact_id
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa06',
  '22222222-2222-4222-8222-222222222222',
  'Alarm',
  'Probe',
  'new',
  now() - interval '45 minutes',
  'ghl_ct_alarm_probe'
);

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_lead uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa06';
  v_member uuid;
  v_first timestamptz;
  v_in_alarm boolean;
  v_count integer;
BEGIN
  SELECT id INTO v_member FROM public.org_members WHERE org_id = v_org LIMIT 1;

  SELECT count(*) INTO v_count FROM public.alarm_band_leads(v_org) WHERE id = v_lead;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'alarm probe missing before touches';
  END IF;

  INSERT INTO public.touches (
    org_id, lead_id, type, channel, direction, actor_member_id, summary
  ) VALUES (
    v_org, v_lead, 'system', 'email', 'outbound', NULL, 'Auto ack'
  );

  SELECT first_human_touch_at, in_alarm
  INTO v_first, v_in_alarm
  FROM public.queue_rows WHERE id = v_lead;
  IF v_first IS NOT NULL OR NOT v_in_alarm THEN
    RAISE EXCEPTION 'system touch cleared the alarm';
  END IF;

  INSERT INTO public.touches (
    org_id, lead_id, type, channel, direction, actor_member_id, outcome, summary
  ) VALUES (
    v_org, v_lead, 'human', 'call', 'outbound', v_member, 'connected', 'Reached them'
  );

  SELECT count(*) INTO v_count FROM public.alarm_band_leads(v_org) WHERE id = v_lead;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'human outbound touch did not leave the alarm band';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.touches
  WHERE lead_id = v_lead AND type = 'human' AND outcome = 'connected';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one human connected touch, got %', v_count;
  END IF;
END
$$;

INSERT INTO public.leads (id, org_id, first_name, last_name, status, opted_in_at, ghl_contact_id)
SELECT
  ('c0c0c0c0-c0c0-4c0c-8c0c-0000000000' || lpad(gs::text, 2, '0'))::uuid,
  '22222222-2222-4222-8222-222222222222',
  'Page',
  gs::text,
  'working',
  now() - (gs || ' days')::interval,
  'ghl_ct_page_' || gs
FROM generate_series(1, 3) AS gs;

INSERT INTO public.readiness_scores (
  org_id, lead_id, timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
  total, reasoning, triggered_by
)
SELECT
  '22222222-2222-4222-8222-222222222222',
  ('c0c0c0c0-c0c0-4c0c-8c0c-0000000000' || lpad(gs::text, 2, '0'))::uuid,
  50, 50, 50, 50, 50,
  'Paging fixture.',
  'manual'
FROM generate_series(1, 3) AS gs;

INSERT INTO public.touches (
  org_id, lead_id, type, channel, direction, actor_member_id, summary, occurred_at
)
SELECT
  '22222222-2222-4222-8222-222222222222',
  ('c0c0c0c0-c0c0-4c0c-8c0c-0000000000' || lpad(gs::text, 2, '0'))::uuid,
  'human',
  'sms',
  'outbound',
  (SELECT id FROM public.org_members WHERE org_id = '22222222-2222-4222-8222-222222222222' LIMIT 1),
  'paging',
  now() - (gs || ' hours')::interval
FROM generate_series(1, 3) AS gs;

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_cursor_u integer;
  v_cursor_s integer;
  v_cursor_t timestamptz;
  v_cursor_id uuid;
  v_page1 uuid[];
  v_page2 uuid[];
  v_overlap integer;
BEGIN
  SELECT array_agg(id)
  INTO v_page1
  FROM (
    SELECT q.id
    FROM public.queue_rows q
    WHERE q.org_id = v_org
      AND NOT q.in_alarm
      AND q.status NOT IN ('closed_won', 'closed_lost', 'ghost')
      AND q.urgency_rank IS NOT NULL
    ORDER BY q.urgency_rank ASC, q.sort_score DESC, q.last_touch_at ASC NULLS FIRST, q.id ASC
    LIMIT 2
  ) s;

  SELECT q.urgency_rank, q.sort_score, q.last_touch_at, q.id
  INTO v_cursor_u, v_cursor_s, v_cursor_t, v_cursor_id
  FROM public.queue_rows q
  WHERE q.id = v_page1[2];

  INSERT INTO public.leads (
    id, org_id, first_name, last_name, status, opted_in_at, ghl_contact_id
  ) VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
    v_org,
    'Mid',
    'Insert',
    'new',
    now() - interval '4 minutes',
    'ghl_ct_mid_insert'
  );

  SELECT array_agg(id)
  INTO v_page2
  FROM (
    SELECT q.id
    FROM public.queue_rows q
    WHERE q.org_id = v_org
      AND NOT q.in_alarm
      AND q.status NOT IN ('closed_won', 'closed_lost', 'ghost')
      AND q.urgency_rank IS NOT NULL
      AND (q.urgency_rank, -q.sort_score, COALESCE(q.last_touch_at, '-infinity'::timestamptz), q.id)
        > (v_cursor_u, -v_cursor_s, COALESCE(v_cursor_t, '-infinity'::timestamptz), v_cursor_id)
    ORDER BY q.urgency_rank ASC, q.sort_score DESC, q.last_touch_at ASC NULLS FIRST, q.id ASC
    LIMIT 2
  ) s;

  SELECT count(*) INTO v_overlap
  FROM unnest(v_page1) a
  JOIN unnest(v_page2) b ON a = b;
  IF v_overlap <> 0 THEN
    RAISE EXCEPTION 'cursor page overlapped after mid-scroll insert: % / %', v_page1, v_page2;
  END IF;
END
$$;

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_lead uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05';
  v_setter uuid := '13131313-1313-4131-8131-131313131313';
  v_owner uuid := '33333333-3333-4333-8333-333333333333';
  v_denied boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.org_members WHERE id = v_setter) THEN
    RAISE NOTICE 'setter fixture missing; skip assignment RLS checks';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);
  SET ROLE authenticated;

  PERFORM public.assign_org_lead(v_org, v_lead, v_setter, NULL);

  v_denied := false;
  BEGIN
    PERFORM public.assign_org_lead(v_org, v_lead, v_owner, NULL);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%not authorized to reassign%' THEN
        v_denied := true;
      ELSE
        RESET ROLE;
        RAISE;
      END IF;
  END;
  IF NOT v_denied THEN
    RESET ROLE;
    RAISE EXCEPTION 'setter assigned a lead to another member';
  END IF;

  INSERT INTO public.touches (
    org_id, lead_id, type, channel, direction, actor_member_id, outcome, summary
  ) VALUES (
    v_org, v_lead, 'human', 'call', 'outbound', v_setter, 'no_answer', NULL
  );

  RESET ROLE;
END
$$;
