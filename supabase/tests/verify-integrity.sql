-- Build Check B data-integrity and closed-won INSERT guard.

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_lead uuid := 'b6b6b6b6-b6b6-4b6b-8b6b-b6b6b6b6b6b6';
  v_member uuid := '33333333-3333-4333-8333-333333333333';
  v_call uuid := 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6';
  v_status public.lead_status;
  v_activated timestamptz;
  v_quote_count integer;
  v_claimed uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'activated_at'
  ) THEN
    RAISE EXCEPTION 'organizations.activated_at is missing';
  END IF;

  SELECT public.mark_org_activated(v_org) INTO v_activated;
  IF v_activated IS NULL THEN
    RAISE EXCEPTION 'mark_org_activated did not set a timestamp';
  END IF;
  IF public.mark_org_activated(v_org) IS DISTINCT FROM v_activated THEN
    RAISE EXCEPTION 'mark_org_activated overwrote an existing activation timestamp';
  END IF;

  INSERT INTO public.leads (
    id, org_id, first_name, last_name, email, status, source, opted_in_at, ghl_contact_id
  ) VALUES (
    v_lead, v_org, 'Integrity', 'Lead', 'integrity@example.test', 'new', 'audit', now(), 'ghl_integrity_1'
  );

  BEGIN
    INSERT INTO public.leads (
      id, org_id, first_name, last_name, email, status, source, opted_in_at, ghl_contact_id
    ) VALUES (
      'b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7',
      v_org,
      'Won',
      'Insert',
      'won-insert@example.test',
      'closed_won',
      'audit',
      now(),
      'ghl_integrity_won'
    );
    RAISE EXCEPTION 'INSERT closed_won was allowed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM ILIKE '%closed_won%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.leads SET status = 'closed_won' WHERE id = v_lead;
    RAISE EXCEPTION 'direct UPDATE closed_won was allowed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM ILIKE '%closed_won%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;

  INSERT INTO public.revenue_log (org_id, lead_id, amount_cents, payment_type)
  VALUES (v_org, v_lead, 150000, 'pif');

  SELECT status INTO v_status FROM public.leads WHERE id = v_lead;
  IF v_status IS DISTINCT FROM 'closed_won' THEN
    RAISE EXCEPTION 'payment did not set closed_won, status=%', v_status;
  END IF;

  INSERT INTO public.calls (
    id, org_id, lead_id, type, occurred_at, raw_transcript, transcript_source
  ) VALUES (
    v_call,
    v_org,
    v_lead,
    'close',
    now(),
    'Maya: Realistically we are looking at after Q1. The spouse has to be in the room.',
    'manual'
  );

  INSERT INTO public.call_extractions (
    org_id, call_id, summary, quotes, model_version
  ) VALUES (
    v_org,
    v_call,
    'Held.',
    '[{"text":"Realistically we are looking at after Q1.","topic":"timeline"}]'::jsonb,
    'test'
  );

  SELECT count(*) INTO v_quote_count
  FROM public.extraction_quotes_not_in_transcript()
  WHERE call_id = v_call;
  IF v_quote_count <> 0 THEN
    RAISE EXCEPTION 'verbatim quote helper flagged a real quote: %', v_quote_count;
  END IF;

  UPDATE public.call_extractions
  SET quotes = '[{"text":"I will wire two million tomorrow.","topic":"budget"}]'::jsonb
  WHERE call_id = v_call;

  SELECT count(*) INTO v_quote_count
  FROM public.extraction_quotes_not_in_transcript()
  WHERE call_id = v_call;
  IF v_quote_count < 1 THEN
    RAISE EXCEPTION 'verbatim quote helper missed an invented quote';
  END IF;

  UPDATE public.call_extractions
  SET quotes = '[{"text":"Realistically we are looking at after Q1.","topic":"timeline"}]'::jsonb
  WHERE call_id = v_call;

  INSERT INTO public.ghl_dispatches (
    id, org_id, lead_id, channel, body_text, actor_member_id, status, idempotency_key
  ) VALUES (
    'd6d6d6d6-d6d6-4d6d-8d6d-d6d6d6d6d6d6',
    v_org,
    v_lead,
    'sms',
    'Tuesday still work?',
    v_member,
    'queued',
    'integrity-claim-1'
  );

  SELECT id INTO v_claimed FROM public.claim_ghl_dispatch('d6d6d6d6-d6d6-4d6d-8d6d-d6d6d6d6d6d6');
  IF v_claimed IS NULL THEN
    RAISE EXCEPTION 'first dispatch claim failed';
  END IF;
  IF public.claim_ghl_dispatch('d6d6d6d6-d6d6-4d6d-8d6d-d6d6d6d6d6d6') IS NOT NULL THEN
    RAISE EXCEPTION 'second dispatch claim was allowed while lease is live';
  END IF;

  UPDATE public.ghl_dispatches
  SET claimed_at = now() - interval '3 minutes'
  WHERE id = 'd6d6d6d6-d6d6-4d6d-8d6d-d6d6d6d6d6d6';

  IF public.claim_ghl_dispatch('d6d6d6d6-d6d6-4d6d-8d6d-d6d6d6d6d6d6') IS NULL THEN
    RAISE EXCEPTION 'stale dispatch lease was not reclaimable';
  END IF;
END
$$;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.claim_follow_up_job()', 'execute') THEN
    RAISE EXCEPTION 'authenticated must not execute claim_follow_up_job';
  END IF;
  IF has_function_privilege('authenticated', 'public.expire_stale_follow_up_drafts()', 'execute') THEN
    RAISE EXCEPTION 'authenticated must not execute expire_stale_follow_up_drafts';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_follow_up_job()', 'execute') THEN
    RAISE EXCEPTION 'service_role must execute claim_follow_up_job';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.expire_stale_follow_up_drafts()', 'execute') THEN
    RAISE EXCEPTION 'service_role must execute expire_stale_follow_up_drafts';
  END IF;
END
$$;
