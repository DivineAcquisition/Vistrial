-- Prompt 17: intra-org visibility, min-n, no grades, no cross-client people.

INSERT INTO auth.users (id, email)
VALUES
  ('171e1711-1711-4171-8171-1711111111a2', 'cq-owner@vistrial.local'),
  ('171e1711-1711-4171-8171-1711111111a4', 'cq-setter-a@vistrial.local'),
  ('171e1711-1711-4171-8171-1711111111a6', 'cq-setter-b@vistrial.local'),
  ('171e1711-1711-4171-8171-1711111111a8', 'cq-setter-c@vistrial.local'),
  ('171e1711-1711-4171-8171-1711111111b2', 'cq-other-owner@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (
  id, name, slug, timezone, activated_at, sales_cycle_days, call_coaching_embargo_hours
) VALUES (
  '171e1711-1711-4171-8171-1711111111a1',
  'Coaching Co',
  'coaching-co',
  'America/New_York',
  now() - interval '90 days',
  14,
  48
);

INSERT INTO public.score_configs (org_id)
VALUES ('171e1711-1711-4171-8171-1711111111a1')
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email, call_coaching_acknowledged_at)
VALUES
(
  '171e1711-1711-4171-8171-1711111111a3',
  '171e1711-1711-4171-8171-1711111111a1',
  '171e1711-1711-4171-8171-1711111111a2',
  'owner',
  'CQ Owner',
  'cq-owner@vistrial.local',
  now() - interval '7 days'
),
(
  '171e1711-1711-4171-8171-1711111111a5',
  '171e1711-1711-4171-8171-1711111111a1',
  '171e1711-1711-4171-8171-1711111111a4',
  'setter',
  'Setter A',
  'cq-setter-a@vistrial.local',
  now() - interval '7 days'
),
(
  '171e1711-1711-4171-8171-1711111111a7',
  '171e1711-1711-4171-8171-1711111111a1',
  '171e1711-1711-4171-8171-1711111111a6',
  'setter',
  'Setter B',
  'cq-setter-b@vistrial.local',
  NULL
),
(
  '171e1711-1711-4171-8171-1711111111a9',
  '171e1711-1711-4171-8171-1711111111a1',
  '171e1711-1711-4171-8171-1711111111a8',
  'setter',
  'Setter C',
  'cq-setter-c@vistrial.local',
  now() - interval '7 days'
);

INSERT INTO public.organizations (
  id, name, slug, timezone, activated_at, sales_cycle_days, call_coaching_embargo_hours
) VALUES (
  '171e1711-1711-4171-8171-1711111111b1',
  'Other Coaching Co',
  'other-coaching-co',
  'America/New_York',
  now() - interval '90 days',
  14,
  48
);

INSERT INTO public.score_configs (org_id)
VALUES ('171e1711-1711-4171-8171-1711111111b1')
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email, call_coaching_acknowledged_at)
VALUES (
  '171e1711-1711-4171-8171-1711111111b3',
  '171e1711-1711-4171-8171-1711111111b1',
  '171e1711-1711-4171-8171-1711111111b2',
  'owner',
  'Other Owner',
  'cq-other-owner@vistrial.local',
  now() - interval '7 days'
);

DO $$
DECLARE
  v_org uuid := '171e1711-1711-4171-8171-1711111111a1';
  v_owner uuid := '171e1711-1711-4171-8171-1711111111a3';
  v_a uuid := '171e1711-1711-4171-8171-1711111111a5';
  v_b uuid := '171e1711-1711-4171-8171-1711111111a7';
  v_lead uuid;
  v_call uuid;
  v_count integer;
  v_json jsonb;
  v_col integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
        'call_quality_measures',
        'call_objection_handlings',
        'brief_views',
        'call_coaching_findings',
        'call_coaching_gaming_signals',
        'call_coaching_benchmarks'
      )
      AND c.relrowsecurity IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'call quality tables must have RLS';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ops_job_catalog WHERE job_name = 'call-quality') THEN
    RAISE EXCEPTION 'call-quality job missing from ops_job_catalog';
  END IF;

  SELECT count(*) INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN (
      'call_quality_measures',
      'call_objection_handlings',
      'call_coaching_findings',
      'call_coaching_gaming_signals',
      'call_coaching_benchmarks'
    )
    AND column_name ~* '(personality|enthusiasm|confidence_rating|leaderboard|rank_position|performance_rating|grade)';
  IF v_col <> 0 THEN
    RAISE EXCEPTION 'forbidden scoring columns exist on call quality tables';
  END IF;

  SELECT count(*) INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'call_coaching_benchmarks'
    AND column_name IN ('org_id', 'member_id', 'user_id');
  IF v_col <> 0 THEN
    RAISE EXCEPTION 'cross-client coaching benchmarks must not carry org or member identity';
  END IF;
END
$$;

DO $$
DECLARE
  v_org uuid := '171e1711-1711-4171-8171-1711111111a1';
  v_a uuid := '171e1711-1711-4171-8171-1711111111a5';
  v_b uuid := '171e1711-1711-4171-8171-1711111111a7';
  v_lead uuid;
  v_call uuid;
BEGIN
  INSERT INTO public.leads (id, org_id, first_name, status, opted_in_at)
  VALUES (gen_random_uuid(), v_org, 'Recent', 'working', now() - interval '10 days')
  RETURNING id INTO v_lead;

  INSERT INTO public.calls (
    id, org_id, lead_id, type, ran_by_member_id, occurred_at, duration_seconds, raw_transcript
  ) VALUES (
    gen_random_uuid(), v_org, v_lead, 'close', v_a, now() - interval '1 hour', 600,
    'Setter: Hello. Prospect: Hi.'
  ) RETURNING id INTO v_call;

  INSERT INTO public.call_quality_measures (
    org_id, call_id, lead_id, member_id, occurred_at, call_type, transcript_sha256,
    speakers_attributed, talk_ratio_rep, talk_ratio_prospect, question_count,
    open_question_count, closed_question_count, next_step_stated, next_step_agreed,
    commitment_clarity, discovery_pain, discovery_timeline, discovery_budget,
    discovery_authority, brief_opened_before_call, analyzer_version
  ) VALUES (
    v_org, v_call, v_lead, v_a, now() - interval '1 hour', 'close', 'hash-recent',
    true, 0.5, 0.5, 3, 2, 1, true, true, 'specific', true, true, true, false, true, 'call_quality.v1'
  );

  INSERT INTO public.leads (id, org_id, first_name, status, opted_in_at)
  VALUES (gen_random_uuid(), v_org, 'Old', 'working', now() - interval '10 days')
  RETURNING id INTO v_lead;

  INSERT INTO public.calls (
    id, org_id, lead_id, type, ran_by_member_id, occurred_at, duration_seconds, raw_transcript
  ) VALUES (
    gen_random_uuid(), v_org, v_lead, 'close', v_a, now() - interval '50 hours', 600,
    'Setter: Hello. Prospect: Hi.'
  ) RETURNING id INTO v_call;

  INSERT INTO public.call_quality_measures (
    org_id, call_id, lead_id, member_id, occurred_at, call_type, transcript_sha256,
    speakers_attributed, talk_ratio_rep, talk_ratio_prospect, question_count,
    open_question_count, closed_question_count, next_step_stated, next_step_agreed,
    commitment_clarity, discovery_pain, discovery_timeline, discovery_budget,
    discovery_authority, brief_opened_before_call, analyzer_version
  ) VALUES (
    v_org, v_call, v_lead, v_a, now() - interval '50 hours', 'close', 'hash-old',
    true, 0.4, 0.6, 4, 3, 1, false, false, 'none', false, false, false, false, false, 'call_quality.v1'
  );

  -- Unacked setter B row should exist only as a probe: insert then confirm hidden.
  INSERT INTO public.leads (id, org_id, first_name, status, opted_in_at)
  VALUES (gen_random_uuid(), v_org, 'BLead', 'working', now() - interval '10 days')
  RETURNING id INTO v_lead;

  INSERT INTO public.calls (
    id, org_id, lead_id, type, ran_by_member_id, occurred_at, raw_transcript
  ) VALUES (
    gen_random_uuid(), v_org, v_lead, 'close', v_b, now() - interval '50 hours',
    'Setter: Hello. Prospect: Hi.'
  ) RETURNING id INTO v_call;

  INSERT INTO public.call_quality_measures (
    org_id, call_id, lead_id, member_id, occurred_at, call_type, transcript_sha256,
    speakers_attributed, question_count, open_question_count, closed_question_count,
    next_step_stated, next_step_agreed, commitment_clarity, discovery_pain,
    discovery_timeline, discovery_budget, discovery_authority, brief_opened_before_call,
    analyzer_version
  ) VALUES (
    v_org, v_call, v_lead, v_b, now() - interval '50 hours', 'close', 'hash-b',
    true, 1, 1, 0, false, false, 'none', false, false, false, false, false, 'call_quality.v1'
  );

  INSERT INTO public.leads (id, org_id, first_name, status, opted_in_at)
  VALUES (gen_random_uuid(), v_org, 'CLead', 'working', now() - interval '10 days')
  RETURNING id INTO v_lead;

  INSERT INTO public.calls (
    id, org_id, lead_id, type, ran_by_member_id, occurred_at, duration_seconds, raw_transcript
  ) VALUES (
    gen_random_uuid(), v_org, v_lead, 'close', '171e1711-1711-4171-8171-1711111111a9',
    now() - interval '50 hours', 600,
    'Setter: Hello. Prospect: Hi.'
  ) RETURNING id INTO v_call;

  INSERT INTO public.call_quality_measures (
    org_id, call_id, lead_id, member_id, occurred_at, call_type, transcript_sha256,
    speakers_attributed, talk_ratio_rep, talk_ratio_prospect, question_count,
    open_question_count, closed_question_count, next_step_stated, next_step_agreed,
    commitment_clarity, discovery_pain, discovery_timeline, discovery_budget,
    discovery_authority, brief_opened_before_call, analyzer_version
  ) VALUES (
    v_org, v_call, v_lead, '171e1711-1711-4171-8171-1711111111a9',
    now() - interval '50 hours', 'close', 'hash-c',
    true, 0.5, 0.5, 2, 1, 1, false, false, 'none', false, false, false, false, false, 'call_quality.v1'
  );

  INSERT INTO public.leads (id, org_id, first_name, status, opted_in_at)
  VALUES (
    gen_random_uuid(), '171e1711-1711-4171-8171-1711111111b1', 'OtherLead', 'working',
    now() - interval '10 days'
  )
  RETURNING id INTO v_lead;

  INSERT INTO public.calls (
    id, org_id, lead_id, type, ran_by_member_id, occurred_at, raw_transcript
  ) VALUES (
    gen_random_uuid(), '171e1711-1711-4171-8171-1711111111b1', v_lead, 'close',
    '171e1711-1711-4171-8171-1711111111b3', now() - interval '50 hours',
    'Setter: Hello. Prospect: Hi.'
  ) RETURNING id INTO v_call;

  INSERT INTO public.call_quality_measures (
    org_id, call_id, lead_id, member_id, occurred_at, call_type, transcript_sha256,
    speakers_attributed, question_count, open_question_count, closed_question_count,
    next_step_stated, next_step_agreed, commitment_clarity, discovery_pain,
    discovery_timeline, discovery_budget, discovery_authority, brief_opened_before_call,
    analyzer_version
  ) VALUES (
    '171e1711-1711-4171-8171-1711111111b1', v_call, v_lead,
    '171e1711-1711-4171-8171-1711111111b3', now() - interval '50 hours', 'close', 'hash-other',
    true, 1, 1, 0, false, false, 'none', false, false, false, false, false, 'call_quality.v1'
  );
END
$$;

DO $$
DECLARE
  v_org uuid := '171e1711-1711-4171-8171-1711111111a1';
  v_a uuid := '171e1711-1711-4171-8171-1711111111a5';
  v_b uuid := '171e1711-1711-4171-8171-1711111111a7';
  v_count integer;
  v_json jsonb;
  v_denied boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '171e1711-1711-4171-8171-1711111111a4', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.call_quality_measures WHERE org_id = v_org;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'setter A should see both of their own rows, saw %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.call_quality_measures
  WHERE member_id IN ('171e1711-1711-4171-8171-1711111111a9', '171e1711-1711-4171-8171-1711111111b3');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'setter A saw a peer or another org''s measures';
  END IF;

  BEGIN
    v_json := public.load_call_quality_rep_snapshot(v_org, v_b, NULL, false);
  EXCEPTION
    WHEN insufficient_privilege OR SQLSTATE '42501' THEN
      v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'setter A loaded another rep snapshot';
  END IF;

  v_denied := false;
  BEGIN
    v_json := public.load_call_quality_manager_snapshot(v_org);
  EXCEPTION
    WHEN insufficient_privilege OR SQLSTATE '42501' THEN
      v_denied := true;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%owner/admin%' OR SQLERRM ILIKE '%reporting%' THEN
        v_denied := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'setter A loaded manager coaching snapshot';
  END IF;

  v_json := public.load_call_quality_rep_snapshot(v_org, v_a, NULL, false);
  IF COALESCE((v_json ->> 'acknowledged')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'acked setter snapshot should be acknowledged';
  END IF;
  IF jsonb_array_length(v_json -> 'calls') <> 2 THEN
    RAISE EXCEPTION 'setter A snapshot should list both own calls, got %', v_json -> 'calls';
  END IF;
  IF COALESCE((v_json -> 'patterns' ->> 'shown')::boolean, true) THEN
    RAISE EXCEPTION 'patterns must not show below 20 calls';
  END IF;
  IF v_json -> 'measuresCatalog' IS NULL OR jsonb_array_length(v_json -> 'measuresCatalog') < 27 THEN
    RAISE EXCEPTION 'rep snapshot must list every computed measure';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM public.list_call_quality_pending(5);
  EXCEPTION
    WHEN insufficient_privilege OR SQLSTATE '42501' THEN
      v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'setter executed list_call_quality_pending';
  END IF;

  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '171e1711-1711-4171-8171-1711111111a6', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.call_quality_measures WHERE org_id = v_org;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'unacked setter B saw % measures', v_count;
  END IF;

  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '171e1711-1711-4171-8171-1711111111a2', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.call_quality_measures WHERE org_id = v_org;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'owner should see only post-embargo acked rows, saw %', v_count;
  END IF;

  RESET ROLE;

  UPDATE public.organizations SET call_coaching_embargo_hours = 0 WHERE id = v_org;

  PERFORM set_config('request.jwt.claim.sub', '171e1711-1711-4171-8171-1711111111a2', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.call_quality_measures WHERE org_id = v_org;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'owner with embargo 0 should see acked rows past and inside the window, saw %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.call_quality_measures
  WHERE member_id = '171e1711-1711-4171-8171-1711111111a7';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'owner saw unacked setter B measures';
  END IF;

  v_json := public.load_call_quality_manager_snapshot(v_org);
  IF v_json -> 'reps' IS NULL THEN
    RAISE EXCEPTION 'manager snapshot missing reps';
  END IF;
  IF v_json::text ILIKE '%leaderboard%' OR v_json::text ILIKE '%rank %' THEN
    RAISE EXCEPTION 'manager snapshot looks like a ranking';
  END IF;

  RESET ROLE;

  BEGIN
    INSERT INTO public.call_coaching_findings (
      org_id, finding_key, finding_kind, sample_closed, sample_lost, statement
    ) VALUES (
      v_org, 'too-small', 'structural', 10, 10, 'should fail'
    );
    RAISE EXCEPTION 'finding min samples did not fire';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.call_coaching_benchmarks (finding_key, org_count, sample_n, statement)
    VALUES ('too-small', 2, 10, 'should fail');
    RAISE EXCEPTION 'benchmark min checks did not fire';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_count FROM public.list_call_quality_pending(5);
END
$$;
