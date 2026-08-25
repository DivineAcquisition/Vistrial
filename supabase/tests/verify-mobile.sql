-- Prompt 15: offline outcome identity, mobile training stamp, adoption surface.

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_member uuid := '33333333-3333-4333-8333-333333333333';
  v_lead uuid := '15a15a15-15a1-415a-815a-15a15a15a101';
  v_lead2 uuid := '15a15a15-15a1-415a-815a-15a15a15a102';
  v_event uuid := '15e15e15-15e1-415e-815e-15e15e15e101';
  v_count integer;
  v_trained timestamptz;
  v_watch jsonb;
BEGIN
  INSERT INTO public.leads (
    id, org_id, first_name, last_name, status, source, opted_in_at, ghl_contact_id
  ) VALUES (
    v_lead, v_org, 'Mobile', 'One', 'new', 'mobile-test', now() - interval '20 minutes', 'ghl_ct_mobile_one'
  );

  INSERT INTO public.touches (
    org_id, lead_id, type, channel, direction, outcome, actor_member_id,
    client_surface, queued_offline, client_logged_at, client_event_id, occurred_at
  ) VALUES (
    v_org, v_lead, 'human', 'call', 'outbound', 'connected', v_member,
    'mobile', true, now() - interval '1 minute', v_event, now() - interval '1 minute'
  );

  SELECT logged_outcome_from_mobile_at INTO v_trained
  FROM public.org_members WHERE id = v_member;
  IF v_trained IS NULL THEN
    RAISE EXCEPTION 'a mobile human touch must stamp setter training';
  END IF;

  BEGIN
    INSERT INTO public.touches (
      org_id, lead_id, type, channel, direction, outcome, actor_member_id,
      client_surface, client_event_id
    ) VALUES (
      v_org, v_lead, 'human', 'call', 'outbound', 'no_answer', v_member,
      'mobile', v_event
    );
    RAISE EXCEPTION 'a repeated client_event_id must not insert a second touch';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  SELECT count(*) INTO v_count FROM public.touches WHERE client_event_id = v_event;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'idempotent retry left % rows for one client event', v_count;
  END IF;

  INSERT INTO public.leads (
    id, org_id, first_name, last_name, status, source, opted_in_at, ghl_contact_id
  ) VALUES (
    v_lead2, v_org, 'Desk', 'Two', 'working', 'mobile-test', now() - interval '2 hours', 'ghl_ct_mobile_two'
  );

  INSERT INTO public.touches (
    org_id, lead_id, type, channel, direction, outcome, actor_member_id,
    client_surface, queued_offline, expected_lead_status, sync_discrepancy
  ) VALUES (
    v_org, v_lead2, 'human', 'call', 'outbound', 'no_answer', v_member,
    'desktop', false, 'new',
    jsonb_build_object('plain', 'This lead changed while the outcome was queued. The outcome was still recorded.')
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.touches
    WHERE lead_id = v_lead2 AND sync_discrepancy ? 'plain'
  ) THEN
    RAISE EXCEPTION 'a discrepancy must be stored on the row, not used as a reason to discard it';
  END IF;
END
$$;

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000002';
  v_watch jsonb;
  v_member jsonb;
BEGIN
  v_watch := public.adoption_watch(v_org);
  IF (v_watch ->> 'activated')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'adoption watch must still run on an activated workspace';
  END IF;
  IF jsonb_array_length(v_watch -> 'members') = 0 THEN
    RAISE EXCEPTION 'adoption watch lost per-member rows';
  END IF;
  v_member := (v_watch -> 'members') -> 0;
  IF NOT (v_member ? 'mobile_touches') OR NOT (v_member ? 'desktop_touches') THEN
    RAISE EXCEPTION 'adoption watch must split mobile and desktop touches per member';
  END IF;
  IF NOT (v_member ? 'logged_outcome_from_mobile') THEN
    RAISE EXCEPTION 'adoption watch must say whether a member has logged from a phone';
  END IF;
END
$$;
