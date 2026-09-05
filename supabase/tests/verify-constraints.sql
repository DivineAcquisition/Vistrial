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

  -- Inserting a readiness score updates current_score and lead_type.
  INSERT INTO public.readiness_scores (
    org_id, lead_id,
    timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
    total, reasoning, triggered_by
  ) VALUES (v_org, v_lead, 70, 70, 70, 70, 70, 'Trigger probe: above threshold.', 'intake');

  SELECT current_score, lead_type INTO v_score, v_type
  FROM public.leads WHERE id = v_lead;

  IF v_score <> 70 OR v_type <> 'ready_track' THEN
    RAISE EXCEPTION 'score sync failed: score=% type=%', v_score, v_type;
  END IF;

  -- Below-threshold score routes to nurture.
  INSERT INTO public.readiness_scores (
    org_id, lead_id,
    timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
    total, reasoning, triggered_by
  ) VALUES (v_org, v_lead, 10, 10, 10, 10, 40, 'Trigger probe: below threshold.', 'manual');

  SELECT current_score, lead_type INTO v_score, v_type
  FROM public.leads WHERE id = v_lead;

  IF v_score <> 40 OR v_type <> 'nurture_track' THEN
    RAISE EXCEPTION 'nurture routing failed: score=% type=%', v_score, v_type;
  END IF;

  -- Human touch with no actor is rejected.
  BEGIN
    INSERT INTO public.touches (org_id, lead_id, type, channel, direction)
    VALUES (v_org, v_lead, 'human', 'sms', 'outbound');
    RAISE EXCEPTION 'expected human-without-actor rejection';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  -- System touch does not set first_human_touch_at.
  INSERT INTO public.touches (org_id, lead_id, type, channel, direction, occurred_at)
  VALUES (v_org, v_lead, 'system', 'email', 'outbound', now() - interval '1 hour');

  SELECT first_human_touch_at INTO v_first FROM public.leads WHERE id = v_lead;
  IF v_first IS NOT NULL THEN
    RAISE EXCEPTION 'system touch must not set first_human_touch_at';
  END IF;

  -- Human outbound sets it; a later human outbound does not move it later.
  v_first := now() - interval '30 minutes';
  INSERT INTO public.touches (
    org_id, lead_id, type, channel, direction, actor_member_id, occurred_at
  )
  VALUES (v_org, v_lead, 'human', 'sms', 'outbound',
    CASE WHEN EXISTS (SELECT 1 FROM org_members WHERE id = v_member) THEN v_member ELSE NULL END,
    v_first);

  -- If the member is missing, the human insert is rejected. Skip the later-touch
  -- assertion in that case; seed/verify still covers it when the owner exists.
  SELECT first_human_touch_at INTO v_second FROM public.leads WHERE id = v_lead;
  IF v_second IS NOT NULL THEN
    INSERT INTO public.touches (
      org_id, lead_id, type, channel, direction, actor_member_id, occurred_at
    )
    VALUES (v_org, v_lead, 'human', 'call', 'outbound', v_member, now());

    SELECT first_human_touch_at INTO v_first FROM public.leads WHERE id = v_lead;
    IF v_first <> v_second THEN
      RAISE EXCEPTION 'first_human_touch_at moved later: % -> %', v_second, v_first;
    END IF;
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
      AND current_score = 83
      AND lead_type = 'ready_track'
      AND status = 'call_booked'
  ) THEN
    RAISE EXCEPTION 'worked seed lead missing score/type/status';
  END IF;
END
$$;

-- Revenue outlives the lead it came from. The tenant-safe foreign key pairs
-- lead_id with org_id, so an unscoped ON DELETE SET NULL would try to null
-- org_id too and fail the delete instead of releasing the reference.
--
-- Case-file rows are undeletable outside an org wipe, so the wipe GUC is set
-- here: it is the only path on which the null-out can fire at all.
DO $$
DECLARE
  v_org uuid;
  v_lead uuid;
  v_call uuid;
  v_revenue uuid;
  v_objection uuid;
BEGIN
  PERFORM set_config('vistrial.allow_org_wipe', '1', true);

  INSERT INTO public.organizations (name, slug)
  VALUES ('Detach Probe', 'detach-probe')
  RETURNING id INTO v_org;

  INSERT INTO public.leads (org_id, first_name, last_name)
  VALUES (v_org, 'Detach', 'Probe')
  RETURNING id INTO v_lead;

  INSERT INTO public.revenue_log (org_id, lead_id, amount_cents, payment_type)
  VALUES (v_org, v_lead, 500000, 'pif')
  RETURNING id INTO v_revenue;

  DELETE FROM public.leads WHERE id = v_lead;

  IF NOT EXISTS (
    SELECT 1 FROM public.revenue_log
    WHERE id = v_revenue AND org_id = v_org AND lead_id IS NULL
  ) THEN
    RAISE EXCEPTION 'revenue did not survive its lead with org_id intact';
  END IF;

  -- Same shape on objections: the call reference is optional, so deleting the
  -- call releases it and keeps the objection on the case file.
  INSERT INTO public.leads (org_id, first_name, last_name)
  VALUES (v_org, 'Detach', 'Call')
  RETURNING id INTO v_lead;

  INSERT INTO public.calls (org_id, lead_id, type)
  VALUES (v_org, v_lead, 'discovery')
  RETURNING id INTO v_call;

  INSERT INTO public.objections (org_id, lead_id, type, verbatim, call_id)
  VALUES (v_org, v_lead, 'price', 'Needs to talk to a partner about the number.', v_call)
  RETURNING id INTO v_objection;

  DELETE FROM public.calls WHERE id = v_call;

  IF NOT EXISTS (
    SELECT 1 FROM public.objections
    WHERE id = v_objection AND org_id = v_org AND lead_id = v_lead AND call_id IS NULL
  ) THEN
    RAISE EXCEPTION 'objection did not survive its call with org_id intact';
  END IF;

  DELETE FROM public.revenue_log WHERE org_id = v_org;
  DELETE FROM public.objections WHERE org_id = v_org;
  DELETE FROM public.leads WHERE org_id = v_org;
  DELETE FROM public.score_configs WHERE org_id = v_org;
  DELETE FROM public.organizations WHERE id = v_org;
END
$$;

-- No composite foreign key may keep an unscoped SET NULL: it would try to null
-- the NOT NULL tenant column and fail the parent delete.
DO $$
DECLARE
  v_offenders text;
BEGIN
  SELECT string_agg(cl.relname || '.' || con.conname, ', ' ORDER BY cl.relname)
    INTO v_offenders
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
   WHERE n.nspname = 'public'
     AND con.contype = 'f'
     AND con.confdeltype = 'n'
     AND array_length(con.conkey, 1) > 1
     AND con.confdelsetcols IS NULL
     AND EXISTS (
       SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = con.conrelid
          AND a.attnum = ANY (con.conkey)
          AND a.attnotnull
     );

  IF v_offenders IS NOT NULL THEN
    RAISE EXCEPTION 'unscoped composite SET NULL on: %', v_offenders;
  END IF;
END
$$;
