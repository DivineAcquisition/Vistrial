-- Scoring engine schema checks. Run after migrations + seed.

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_lead uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  v_org_b uuid := '99999999-9999-4999-8999-999999999999';
  v_score_id uuid;
  v_count integer;
  v_flag timestamptz;
  v_status public.lead_status;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.score_field_maps
    WHERE org_id = v_org AND field_name = 'timeline' AND factor = 'timeline'
  ) THEN
    RAISE EXCEPTION 'seeded org missing default timeline map';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.score_field_rules r
    JOIN public.score_field_maps m ON m.id = r.field_map_id
    WHERE m.org_id = v_org
      AND m.field_name = 'timeline'
      AND r.answer_value = '30 days'
      AND r.score = 80
  ) THEN
    RAISE EXCEPTION 'default 30 days timeline mapping missing';
  END IF;

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_b, 'Second Org', 'second-org');

  IF NOT EXISTS (
    SELECT 1 FROM public.score_configs WHERE org_id = v_org_b
  ) THEN
    RAISE EXCEPTION 'new org did not get a score_configs row';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.score_field_maps WHERE org_id = v_org_b
  ) THEN
    RAISE EXCEPTION 'new org did not get default score maps';
  END IF;

  UPDATE public.score_field_rules r
  SET score = 10
  FROM public.score_field_maps m
  WHERE r.field_map_id = m.id
    AND m.org_id = v_org_b
    AND m.field_name = 'timeline'
    AND r.answer_value = '30 days';

  IF (
    SELECT r.score FROM public.score_field_rules r
    JOIN public.score_field_maps m ON m.id = r.field_map_id
    WHERE m.org_id = v_org AND m.field_name = 'timeline' AND r.answer_value = '30 days'
  ) = 10 THEN
    RAISE EXCEPTION 'updating org B mapping leaked into org A';
  END IF;

  INSERT INTO public.leads (id, org_id, first_name, status)
  VALUES (v_lead, v_org, 'NullFactor', 'new');

  INSERT INTO public.readiness_scores (
    org_id, lead_id,
    timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
    total, reasoning, triggered_by, idempotency_key
  ) VALUES (
    v_org, v_lead,
    80, 80, NULL, NULL,
    85, 'Two known factors after redistributing unknowns.', 'intake',
    'intake:' || v_lead::text
  )
  RETURNING id INTO v_score_id;

  BEGIN
    INSERT INTO public.readiness_scores (
      org_id, lead_id,
      timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
      total, reasoning, triggered_by, idempotency_key
    ) VALUES (
      v_org, v_lead, 80, 80, NULL, NULL, 85,
      'Duplicate intake should not write.', 'intake',
      'intake:' || v_lead::text
    );
    RAISE EXCEPTION 'expected idempotency rejection';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  SELECT count(*) INTO v_count
  FROM public.readiness_scores
  WHERE lead_id = v_lead;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'duplicate intake wrote % rows', v_count;
  END IF;

  BEGIN
    INSERT INTO public.readiness_scores (
      org_id, lead_id,
      timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
      total, reasoning, triggered_by
    ) VALUES (
      v_org, v_lead, 10, 10, 10, 10, 10, '   ', 'manual'
    );
    RAISE EXCEPTION 'expected empty reasoning rejection';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  UPDATE public.leads
  SET ghost_approaching_at = now(), status = 'working'
  WHERE id = '44444444-4444-4444-8444-444444444444';

  INSERT INTO public.touches (
    org_id, lead_id, type, channel, direction, occurred_at
  ) VALUES (
    v_org, '44444444-4444-4444-8444-444444444444',
    'system', 'sms', 'inbound', now()
  );

  SELECT ghost_approaching_at, status INTO v_flag, v_status
  FROM public.leads
  WHERE id = '44444444-4444-4444-8444-444444444444';

  IF v_flag IS NOT NULL THEN
    RAISE EXCEPTION 'touch did not clear approaching-ghost flag';
  END IF;
  IF v_status <> 'working' THEN
    RAISE EXCEPTION 'inbound on a non-ghost lead changed status to %', v_status;
  END IF;

  UPDATE public.leads
  SET status = 'ghost'
  WHERE id = '44444444-4444-4444-8444-444444444445';

  INSERT INTO public.touches (
    org_id, lead_id, type, channel, direction, occurred_at
  ) VALUES (
    v_org, '44444444-4444-4444-8444-444444444445',
    'system', 'sms', 'inbound', now()
  );

  SELECT status INTO v_status
  FROM public.leads
  WHERE id = '44444444-4444-4444-8444-444444444445';
  IF v_status <> 'working' THEN
    RAISE EXCEPTION 'inbound reply did not return ghosted lead to working';
  END IF;
END
$$;
