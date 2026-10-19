-- Constraint, trigger, seed, and RLS checks for the Case File spine.
-- Run after the migration + seed against a database that has the auth stub.

DO $$
DECLARE
  v_lead uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_member uuid := '33333333-3333-4333-8333-333333333333';
  v_first timestamptz;
  v_second timestamptz;
  v_score integer;
  v_type public.lead_type;
  v_ok boolean;
BEGIN
  -- Score config rejects weights that do not sum to 100.
  BEGIN
    UPDATE public.score_configs
    SET timeline_weight = 50,
        investment_capacity_weight = 50,
        decision_authority_weight = 50,
        pain_severity_weight = 50
    WHERE org_id = v_org;
    RAISE EXCEPTION 'expected weight-sum rejection';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  -- Revenue log rejects zero or negative amounts.
  BEGIN
    INSERT INTO public.revenue_log (org_id, amount_cents, payment_type)
    VALUES (v_org, 0, 'pif');
    RAISE EXCEPTION 'expected revenue zero rejection';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.revenue_log (org_id, amount_cents, payment_type)
    VALUES (v_org, -100, 'pif');
    RAISE EXCEPTION 'expected revenue negative rejection';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  INSERT INTO public.leads (id, org_id, first_name, last_name, status)
  VALUES (v_lead, v_org, 'Trigger', 'Probe', 'new');

  -- The readiness score is read-only history now.
  BEGIN
    INSERT INTO public.readiness_scores (
      org_id, lead_id,
      timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
      total, reasoning, triggered_by
    ) VALUES (v_org, v_lead, 70, 70, 70, 70, 70, 'Trigger probe.', 'intake');
    RAISE EXCEPTION 'readiness_scores accepted a new row';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'readiness_scores is read-only history%' THEN
        RAISE;
      END IF;
  END;

  -- An Assay score updates the current_score and lead_type caches. Warm is ready.
  PERFORM public.assay_write_scores(v_org, jsonb_build_array(jsonb_build_object(
    'leadId', v_lead, 'score', 70, 'tier', 'warm', 'rulesVersion', 'atest', 'inputsHash', 'itest',
    'cause', 'manual', 'asOf', now())));

  SELECT current_score, lead_type INTO v_score, v_type
  FROM public.leads WHERE id = v_lead;

  IF v_score <> 70 OR v_type <> 'ready_track' THEN
    RAISE EXCEPTION 'score sync failed: score=% type=%', v_score, v_type;
  END IF;

  -- Cool and below routes to nurture.
  PERFORM public.assay_write_scores(v_org, jsonb_build_array(jsonb_build_object(
    'leadId', v_lead, 'score', 40, 'tier', 'cool', 'rulesVersion', 'atest', 'inputsHash', 'itest2',
    'cause', 'manual', 'asOf', now())));

  SELECT current_score, lead_type INTO v_score, v_type
  FROM public.leads WHERE id = v_lead;

  IF v_score <> 40 OR v_type <> 'nurture_track' THEN
    RAISE EXCEPTION 'nurture routing failed: score=% type=%', v_score, v_type;
  END IF;

  IF (SELECT count(*) FROM public.lead_score_history WHERE lead_id = v_lead) <> 2 THEN
    RAISE EXCEPTION 'score history should hold one row per change';
  END IF;

  -- System touch does not set first_human_touch_at.
  INSERT INTO public.touches (org_id, lead_id, type, channel, direction, occurred_at)
  VALUES (v_org, v_lead, 'system', 'email', 'outbound', now() - interval '1 hour');

  SELECT first_human_touch_at INTO v_first FROM public.leads WHERE id = v_lead;
  IF v_first IS NOT NULL THEN
    RAISE EXCEPTION 'system touch must not set first_human_touch_at';
  END IF;

  -- Human outbound without a mapped operator still counts as first human touch.
  v_first := now() - interval '45 minutes';
  INSERT INTO public.touches (
    org_id, lead_id, type, channel, direction, occurred_at
  )
  VALUES (v_org, v_lead, 'human', 'sms', 'outbound', v_first);

  SELECT first_human_touch_at INTO v_second FROM public.leads WHERE id = v_lead;
  IF v_second IS DISTINCT FROM v_first THEN
    RAISE EXCEPTION 'human touch without actor must set first_human_touch_at';
  END IF;

  IF (
    SELECT time_to_first_human_touch_seconds FROM public.leads WHERE id = v_lead
  ) IS NULL THEN
    RAISE EXCEPTION 'generated time_to_first_human_touch_seconds stayed null';
  END IF;

  -- A later human outbound does not move first_human_touch_at later.
  INSERT INTO public.touches (
    org_id, lead_id, type, channel, direction, actor_member_id, occurred_at
  )
  VALUES (v_org, v_lead, 'human', 'call', 'outbound',
    CASE WHEN EXISTS (SELECT 1 FROM org_members WHERE id = v_member) THEN v_member ELSE NULL END,
    now());

  SELECT first_human_touch_at INTO v_first FROM public.leads WHERE id = v_lead;
  IF v_first IS DISTINCT FROM v_second THEN
    RAISE EXCEPTION 'first_human_touch_at moved later: % -> %', v_second, v_first;
  END IF;

  -- Seed produced five Northstar leads, one never touched.
  IF (SELECT count(*) FROM public.leads WHERE org_id = v_org) < 5 THEN
    RAISE EXCEPTION 'expected at least five seeded leads, got %',
      (SELECT count(*) FROM public.leads WHERE org_id = v_org);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = '44444444-4444-4444-8444-444444444442'
      AND first_human_touch_at IS NULL
  ) THEN
    RAISE EXCEPTION 'never-touched seed lead missing or already touched';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = '44444444-4444-4444-8444-444444444441'
      AND status = 'call_booked'
  ) THEN
    RAISE EXCEPTION 'worked seed lead missing status';
  END IF;
END
$$;
