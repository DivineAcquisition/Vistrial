-- Prompt 16: holdout, calibration bands vs raw tables, suggestions never auto-apply.

INSERT INTO auth.users (id, email)
VALUES
  ('161e1611-1611-4161-8161-1611111111a2', 'cal-owner@vistrial.local'),
  ('161e1611-1611-4161-8161-1611111111a4', 'cal-setter@vistrial.local')
ON CONFLICT (id) DO NOTHING;

-- Well-calibrated org: holdout on, monotonic curve.
INSERT INTO public.organizations (
  id, name, slug, timezone, activated_at, sales_cycle_days, holdout_percent
) VALUES (
  '161e1611-1611-4161-8161-1611111111a1',
  'Calibrated Co',
  'calibrated-co',
  'America/New_York',
  now() - interval '90 days',
  14,
  5
);

INSERT INTO public.score_configs (org_id)
VALUES ('161e1611-1611-4161-8161-1611111111a1')
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES (
  '161e1611-1611-4161-8161-1611111111a3',
  '161e1611-1611-4161-8161-1611111111a1',
  '161e1611-1611-4161-8161-1611111111a2',
  'owner',
  'Cal Owner',
  'cal-owner@vistrial.local'
);

-- Reversed org: high scores close less.
INSERT INTO public.organizations (
  id, name, slug, timezone, activated_at, sales_cycle_days, holdout_percent
) VALUES (
  '161e1611-1611-4161-8161-1611111111b1',
  'Reversed Co',
  'reversed-co',
  'America/New_York',
  now() - interval '90 days',
  14,
  5
);

INSERT INTO public.score_configs (org_id)
VALUES ('161e1611-1611-4161-8161-1611111111b1')
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES (
  '161e1611-1611-4161-8161-1611111111b3',
  '161e1611-1611-4161-8161-1611111111b1',
  '161e1611-1611-4161-8161-1611111111a2',
  'owner',
  'Rev Owner',
  'cal-owner@vistrial.local'
);

-- Holdout disabled.
INSERT INTO public.organizations (
  id, name, slug, timezone, activated_at, sales_cycle_days, holdout_percent
) VALUES (
  '161e1611-1611-4161-8161-1611111111c1',
  'No Holdout Co',
  'no-holdout-co',
  'America/New_York',
  now() - interval '90 days',
  14,
  0
);

INSERT INTO public.score_configs (org_id)
VALUES ('161e1611-1611-4161-8161-1611111111c1')
ON CONFLICT (org_id) DO NOTHING;

DO $$
DECLARE
  v_well uuid := '161e1611-1611-4161-8161-1611111111a1';
  v_rev uuid := '161e1611-1611-4161-8161-1611111111b1';
  v_off uuid := '161e1611-1611-4161-8161-1611111111c1';
  v_owner uuid := '161e1611-1611-4161-8161-1611111111a3';
  v_opted timestamptz := now() - interval '30 days';
  i integer;
  v_lead uuid;
  v_json jsonb;
  v_band jsonb;
  v_n bigint;
  v_k bigint;
  v_pct numeric;
  v_col integer;
  v_type public.lead_type;
  v_holdout boolean;
  v_scores_before bigint;
  v_scores_after bigint;
  v_versions integer;
  v_sug uuid;
  v_src text;
  v_cfg integer;
  v_audit integer;
  v_grounded boolean;
  v_call uuid;
  v_ext uuid;
  v_status text;
BEGIN
  -- Queue view must not expose holdout.
  SELECT count(*) INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'queue_rows' AND column_name = 'is_holdout';
  IF v_col <> 0 THEN
    RAISE EXCEPTION 'queue_rows must not expose is_holdout';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
        'score_config_versions',
        'calibration_suggestions',
        'extraction_audits',
        'calibration_benchmarks'
      )
      AND c.relrowsecurity IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'calibration tables must have RLS';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ops_job_catalog WHERE job_name = 'calibration') THEN
    RAISE EXCEPTION 'calibration job missing from ops_job_catalog';
  END IF;

  -- 0% holdout: trigger with percent 0 never assigns.
  INSERT INTO public.leads (id, org_id, first_name, status, opted_in_at)
  VALUES ('161e1611-1611-4161-8161-1611111111c2', v_off, 'Zero', 'new', v_opted);
  SELECT is_holdout INTO v_holdout FROM public.leads WHERE id = '161e1611-1611-4161-8161-1611111111c2';
  IF v_holdout THEN
    RAISE EXCEPTION 'holdout_percent 0 must not assign holdout';
  END IF;

  -- Explicit true is honored at intake; holdout leads are ready_track even with a low score.
  INSERT INTO public.leads (id, org_id, first_name, status, opted_in_at, is_holdout)
  VALUES ('161e1611-1611-4161-8161-1611111111a9', v_well, 'LowHoldout', 'new', v_opted, true);
  SELECT is_holdout INTO v_holdout FROM public.leads WHERE id = '161e1611-1611-4161-8161-1611111111a9';
  IF NOT v_holdout THEN
    RAISE EXCEPTION 'explicit is_holdout true must be honored';
  END IF;
  INSERT INTO public.readiness_scores (
    org_id, lead_id, timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
    total, reasoning, triggered_by
  ) VALUES (
    v_well, '161e1611-1611-4161-8161-1611111111a9',
    10, 10, 10, 10, 10, 'low holdout', 'intake'
  );
  SELECT lead_type INTO v_type FROM public.leads WHERE id = '161e1611-1611-4161-8161-1611111111a9';
  IF v_type <> 'ready_track' THEN
    RAISE EXCEPTION 'holdout lead must be ready_track regardless of score, got %', v_type;
  END IF;

  -- Explicit false is honored even when the org holdout is on.
  INSERT INTO public.leads (id, org_id, first_name, status, opted_in_at, is_holdout)
  VALUES ('161e1611-1611-4161-8161-1611111111a8', v_well, 'NotHoldout', 'new', v_opted, false);
  SELECT is_holdout INTO v_holdout FROM public.leads WHERE id = '161e1611-1611-4161-8161-1611111111a8';
  IF v_holdout THEN
    RAISE EXCEPTION 'explicit is_holdout false must be honored';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'assign_lead_holdout';
  IF v_src NOT ILIKE '%random()%' THEN
    RAISE EXCEPTION 'holdout assignment must use random()';
  END IF;

  -- Well-calibrated cohort: 25 low (5 closed), 25 high (20 closed).
  FOR i IN 1..50 LOOP
    v_lead := ('161e1611-1611-4161-8161-16111111' || lpad(i::text, 4, '0'))::uuid;
    INSERT INTO public.leads (id, org_id, first_name, status, opted_in_at, is_holdout, holdout_assigned_at)
    VALUES (
      v_lead, v_well, 'Well' || i,
      CASE WHEN i <= 25 THEN
        CASE WHEN i <= 5 THEN 'closed_won' ELSE 'closed_lost' END
      ELSE
        CASE WHEN i <= 45 THEN 'closed_won' ELSE 'closed_lost' END
      END,
      v_opted, true, v_opted
    );
    INSERT INTO public.readiness_scores (
      org_id, lead_id, timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
      total, reasoning, triggered_by
    ) VALUES (
      v_well, v_lead,
      CASE WHEN i <= 25 THEN 10 ELSE 90 END,
      CASE WHEN i <= 25 THEN 10 ELSE 90 END,
      CASE WHEN (i <= 5) OR (i BETWEEN 26 AND 45) THEN 90 ELSE 10 END,
      50,
      CASE WHEN i <= 25 THEN 10 ELSE 90 END,
      'fixture', 'intake'
    );
    IF (i <= 5) OR (i BETWEEN 26 AND 45) THEN
      INSERT INTO public.revenue_log (org_id, lead_id, amount_cents, payment_type)
      VALUES (v_well, v_lead, 10000, 'pif');
    END IF;
  END LOOP;

  -- Hand count vs RPC. a9 is unresolved (status new), so 0–19 is 5/25.
  SELECT count(*), count(*) FILTER (WHERE closed)
  INTO v_n, v_k
  FROM public.calibration_mature_resolved(v_well) r
  WHERE r.is_holdout AND public.calibration_score_band(r.score) = '0-19';
  IF v_n <> 25 OR v_k <> 5 THEN
    RAISE EXCEPTION 'hand count 0-19 expected 5/25, got %/%', v_k, v_n;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE closed)
  INTO v_n, v_k
  FROM public.calibration_mature_resolved(v_well) r
  WHERE r.is_holdout AND public.calibration_score_band(r.score) = '80-100';
  IF v_n <> 25 OR v_k <> 20 THEN
    RAISE EXCEPTION 'hand count 80-100 expected 20/25, got %/%', v_k, v_n;
  END IF;

  v_json := public.calibration_band_curve(v_well, true);
  SELECT elem INTO v_band
  FROM jsonb_array_elements(v_json -> 'rows') elem
  WHERE elem ->> 'band_key' = '0-19';
  IF v_band IS NULL THEN
    RAISE EXCEPTION '0-19 band missing from curve';
  END IF;
  IF (v_band -> 'close_rate' ->> 'k')::bigint <> 5
     OR (v_band -> 'close_rate' ->> 'n')::bigint <> 25 THEN
    RAISE EXCEPTION 'RPC 0-19 did not match hand count: %', v_band;
  END IF;
  IF COALESCE((v_band -> 'close_rate' ->> 'too_small')::boolean, true) THEN
    RAISE EXCEPTION '0-19 n=25 should display';
  END IF;
  v_pct := (v_band -> 'close_rate' ->> 'pct')::numeric;
  -- 5/25 = 20.0
  IF v_pct IS DISTINCT FROM 20.0 THEN
    RAISE EXCEPTION '0-19 close rate expected 20.0, got %', v_pct;
  END IF;

  SELECT elem INTO v_band
  FROM jsonb_array_elements(v_json -> 'rows') elem
  WHERE elem ->> 'band_key' = '20-39';
  IF v_band IS NOT NULL AND NOT COALESCE((v_band -> 'close_rate' ->> 'too_small')::boolean, true) THEN
    RAISE EXCEPTION 'empty/small bands must be suppressed';
  END IF;

  IF COALESCE((v_json ->> 'monotonic')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'well-calibrated holdout curve should be monotonic';
  END IF;

  -- Job must not write score_configs.
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'refresh_calibration_suggestions';
  IF v_src ~* 'update[[:space:]]+public\.score_configs' OR v_src ~* 'update[[:space:]]+score_configs' THEN
    RAISE EXCEPTION 'refresh_calibration_suggestions must not write score_configs';
  END IF;

  SELECT ready_threshold INTO v_cfg FROM public.score_configs WHERE org_id = v_well;
  v_json := public.refresh_calibration_suggestions(v_well);
  IF v_json ->> 'status' <> 'working' THEN
    RAISE EXCEPTION 'well-calibrated org should get no weight suggestion, got %', v_json;
  END IF;
  IF (SELECT ready_threshold FROM public.score_configs WHERE org_id = v_well) <> v_cfg THEN
    RAISE EXCEPTION 'refresh changed live threshold';
  END IF;

  -- Reversed cohort: 25 low (20 closed), 25 high (5 closed).
  FOR i IN 1..50 LOOP
    v_lead := ('161e1611-1611-4161-8161-16112222' || lpad(i::text, 4, '0'))::uuid;
    INSERT INTO public.leads (id, org_id, first_name, status, opted_in_at, is_holdout, holdout_assigned_at)
    VALUES (
      v_lead, v_rev, 'Rev' || i,
      CASE WHEN i <= 25 THEN
        CASE WHEN i <= 20 THEN 'closed_won' ELSE 'closed_lost' END
      ELSE
        CASE WHEN i <= 30 THEN 'closed_won' ELSE 'closed_lost' END
      END,
      v_opted, true, v_opted
    );
    INSERT INTO public.readiness_scores (
      org_id, lead_id, timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
      total, reasoning, triggered_by
    ) VALUES (
      v_rev, v_lead,
      CASE WHEN i <= 25 THEN 10 ELSE 90 END,
      50, 
      CASE WHEN (i <= 20) OR (i BETWEEN 26 AND 30) THEN 90 ELSE 10 END,
      50,
      CASE WHEN i <= 25 THEN 10 ELSE 90 END,
      'fixture', 'intake'
    );
    IF (i <= 20) OR (i BETWEEN 26 AND 30) THEN
      INSERT INTO public.revenue_log (org_id, lead_id, amount_cents, payment_type)
      VALUES (v_rev, v_lead, 10000, 'pif');
    END IF;
  END LOOP;

  v_json := public.calibration_band_curve(v_rev, true);
  IF COALESCE((v_json ->> 'monotonic')::boolean, true) THEN
    RAISE EXCEPTION 'reversed curve must not be monotonic';
  END IF;
  IF jsonb_array_length(v_json -> 'breaks') < 1 THEN
    RAISE EXCEPTION 'reversed curve must name the break';
  END IF;

  v_json := public.refresh_calibration_suggestions(v_rev);
  IF v_json ->> 'status' <> 'pending' THEN
    RAISE EXCEPTION 'reversed org should get a pending suggestion, got %', v_json;
  END IF;
  v_sug := (v_json ->> 'id')::uuid;

  -- Holdout off withholds.
  v_json := public.refresh_calibration_suggestions(v_off);
  IF v_json ->> 'reason' <> 'holdout_disabled' THEN
    RAISE EXCEPTION 'disabled holdout must withhold, got %', v_json;
  END IF;

  -- Apply versions config and leaves scores.
  PERFORM set_config('request.jwt.claim.sub', '161e1611-1611-4161-8161-1611111111a2', true);
  SELECT count(*) INTO v_scores_before FROM public.readiness_scores WHERE org_id = v_rev;
  SELECT count(*) INTO v_versions FROM public.score_config_versions WHERE org_id = v_rev;
  v_json := public.apply_calibration_suggestion(v_rev, v_sug);
  IF COALESCE((v_json ->> 'scores_unchanged')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'apply must leave score history untouched';
  END IF;
  SELECT count(*) INTO v_scores_after FROM public.readiness_scores WHERE org_id = v_rev;
  IF v_scores_after <> v_scores_before THEN
    RAISE EXCEPTION 'readiness_scores grew on apply';
  END IF;
  IF (SELECT count(*) FROM public.score_config_versions WHERE org_id = v_rev) <= v_versions THEN
    RAISE EXCEPTION 'apply must write a score_config_versions row';
  END IF;
  IF (SELECT source FROM public.score_config_versions WHERE org_id = v_rev ORDER BY created_at DESC LIMIT 1)
     <> 'calibration_apply' THEN
    RAISE EXCEPTION 'applied version source must be calibration_apply';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- Immutable holdout.
  BEGIN
    UPDATE public.leads SET is_holdout = false WHERE id = '161e1611-1611-4161-8161-1611111111a9';
    RAISE EXCEPTION 'holdout update should have failed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%is_holdout%' THEN
        RAISE;
      END IF;
  END;

  -- Sample audit grounds against the transcript.
  v_call := '161e1611-1611-4161-8161-1611111111d1';
  INSERT INTO public.leads (id, org_id, first_name, status, opted_in_at, is_holdout, holdout_assigned_at)
  VALUES ('161e1611-1611-4161-8161-1611111111d0', v_well, 'Audit', 'working', now(), true, now());
  INSERT INTO public.calls (id, org_id, lead_id, type, raw_transcript, transcript_source)
  VALUES (v_call, v_well, '161e1611-1611-4161-8161-1611111111d0', 'discovery', 'They said budget 10k and next Tuesday.', 'upload');
  INSERT INTO public.call_extractions (
    org_id, call_id, summary, budget_signal, stated_objection, model_version
  ) VALUES (
    v_well, v_call, 'Talked budget', 'budget 10k', 'totally-not-in-the-transcript-xyz', 'test-model-1'
  )
  RETURNING id INTO v_ext;

  v_audit := public.run_extraction_sample_audit(v_well, 5);
  IF v_audit < 1 THEN
    RAISE EXCEPTION 'sample audit did not sample the extraction';
  END IF;
  SELECT grounded INTO v_grounded
  FROM public.extraction_audits
  WHERE extraction_id = v_ext AND field_name = 'budget_signal';
  IF v_grounded IS NOT TRUE THEN
    RAISE EXCEPTION 'budget_signal present in transcript must be grounded';
  END IF;
  SELECT grounded INTO v_grounded
  FROM public.extraction_audits
  WHERE extraction_id = v_ext AND field_name = 'stated_objection';
  IF v_grounded IS NOT FALSE THEN
    RAISE EXCEPTION 'hallucinated objection must not be grounded';
  END IF;

  v_json := public.calibration_extraction_report(v_well);
  IF jsonb_array_length(v_json -> 'correction_by_field') <> 12 THEN
    RAISE EXCEPTION 'correction rates must be per field, not aggregated';
  END IF;

  -- Cross-client: below min cohort writes nothing reconstructable.
  v_n := public.refresh_calibration_benchmarks();
  -- Two contributing orgs is below 5.
  IF EXISTS (SELECT 1 FROM public.calibration_benchmarks) AND (
    SELECT min(org_count) FROM public.calibration_benchmarks
  ) < 5 THEN
    RAISE EXCEPTION 'calibration_benchmarks leaked a small cohort';
  END IF;

  v_json := public.load_calibration_report(v_well);
  IF COALESCE((v_json -> 'holdout' ->> 'enabled')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'load_calibration_report missing holdout state';
  END IF;
  IF COALESCE((v_json ->> 'well_calibrated')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'well org should be marked well_calibrated';
  END IF;
  IF (v_json ->> 'honesty') IS NULL OR (v_json ->> 'honesty') NOT LIKE '%association%' THEN
    RAISE EXCEPTION 'report must state association not causation';
  END IF;

  v_json := public.load_ops_calibration();
  SELECT elem ->> 'stopped_predicting' INTO v_status
  FROM jsonb_array_elements(v_json -> 'clients') elem
  WHERE elem ->> 'id' = v_rev::text;
  IF v_status IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'reversed org must surface as stopped predicting, got %', v_json;
  END IF;
  SELECT elem ->> 'holdout_disabled' INTO v_status
  FROM jsonb_array_elements(v_json -> 'clients') elem
  WHERE elem ->> 'id' = v_off::text;
  IF v_status IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'holdout-off org must be identifiable';
  END IF;
END
$$;
