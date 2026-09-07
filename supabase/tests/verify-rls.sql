-- RLS checks. Requires seed + a second org created below.

INSERT INTO auth.users (id, email)
VALUES (
  '55555555-5555-4555-8555-555555555555',
  'owner-b@vistrial.local'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, holdout_percent)
VALUES (
  '66666666-6666-4666-8666-666666666666',
  'Org B',
  'org-b',
  0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES (
  '77777777-7777-4777-8777-777777777777',
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  'owner',
  'Org B Owner',
  'owner-b@vistrial.local'
)
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO public.leads (id, org_id, first_name, last_name, status)
VALUES (
  '88888888-8888-4888-8888-888888888888',
  '66666666-6666-4666-8666-666666666666',
  'OrgB',
  'Lead',
  'new'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.webhook_events (source, event_type, payload)
VALUES ('ghl', 'contact.create', '{"probe":true}'::jsonb);

DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.leads
  WHERE org_id = '66666666-6666-4666-8666-666666666666';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'org A user saw % org B leads', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.webhook_events;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'authenticated user saw % webhook_events', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.webhook_dead_letters;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'authenticated user saw % webhook_dead_letters', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.leads
  WHERE org_id = '22222222-2222-4222-8222-222222222222';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'org A user saw zero of their own leads';
  END IF;
END
$$;

RESET ROLE;

INSERT INTO auth.users (id, email)
VALUES (
  '12121212-1212-4121-8121-121212121212',
  'setter-a@vistrial.local'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES (
  '13131313-1313-4131-8131-131313131313',
  '22222222-2222-4222-8222-222222222222',
  '12121212-1212-4121-8121-121212121212',
  'setter',
  'Org A Setter',
  'setter-a@vistrial.local'
)
ON CONFLICT (org_id, user_id) DO NOTHING;

UPDATE public.leads
SET assigned_setter_id = '13131313-1313-4131-8131-131313131313'
WHERE id = '44444444-4444-4444-8444-444444444442';

DO $$
DECLARE
  v_denied boolean;
  v_rows integer;
  v_status public.lead_status;
  v_score integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;

  v_denied := false;
  BEGIN
    UPDATE public.leads
    SET current_score = 1
    WHERE id = '44444444-4444-4444-8444-444444444441';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_denied := true;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%trigger-maintained%' THEN
        v_denied := true;
      ELSE
        RAISE;
      END IF;
  END;

  RESET ROLE;

  IF NOT v_denied THEN
    RAISE EXCEPTION 'owner JWT was allowed to write leads.current_score';
  END IF;

  SELECT current_score INTO v_score
  FROM public.leads
  WHERE id = '44444444-4444-4444-8444-444444444441';
  IF v_score IS DISTINCT FROM 83 THEN
    RAISE EXCEPTION 'owner score-cache write leaked; current_score=%', v_score;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);
  SET ROLE authenticated;

  UPDATE public.leads
  SET status = 'working'
  WHERE id = '44444444-4444-4444-8444-444444444441';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'unassigned setter updated % owner-assigned leads', v_rows;
  END IF;

  v_denied := false;
  BEGIN
    UPDATE public.leads
    SET assigned_closer_id = '33333333-3333-4333-8333-333333333333'
    WHERE id = '44444444-4444-4444-8444-444444444442';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_denied := true;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%not authorized to reassign%' THEN
        v_denied := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'setter was allowed to reassign an assigned lead';
  END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.readiness_scores (
      org_id, lead_id,
      timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw,
      total, reasoning, triggered_by
    ) VALUES (
      '22222222-2222-4222-8222-222222222222',
      '44444444-4444-4444-8444-444444444441',
      10, 10, 10, 10, 10, 'setter forge', 'manual'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_denied := true;
    WHEN OTHERS THEN
      v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'unassigned setter inserted a readiness_scores row';
  END IF;

  RESET ROLE;

  SELECT status INTO v_status
  FROM public.leads
  WHERE id = '44444444-4444-4444-8444-444444444441';
  IF v_status <> 'call_booked' THEN
    RAISE EXCEPTION 'owner-assigned lead status changed to %', v_status;
  END IF;
END
$$;

