-- Prompt 14: retention, deletion completeness, missed-job alerts,
-- dispatch-in-error walkthrough, two-phase drop, RLS on ops tables.

-- ---------------------------------------------------------------------------
-- Two-phase: the unused pad column must be gone after the second migration.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ops_alerts'
      AND column_name = 'phase1_unused_pad'
  ) THEN
    RAISE EXCEPTION 'phase1_unused_pad must be dropped in the second migration, not left in place';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Transcript purge preserves extraction + objections. Quote check skips purged.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_lead uuid := '44444444-4444-4444-8444-444444444441';
  v_call uuid := 'e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e1';
  v_extraction uuid;
  v_quotes integer;
  v_n integer;
  v_run jsonb;
BEGIN
  INSERT INTO public.calls (
    id, org_id, lead_id, type, occurred_at, raw_transcript, transcript_source, created_at
  ) VALUES (
    v_call,
    v_org,
    v_lead,
    'close',
    now() - interval '400 days',
    'Maya: The price is the wall. We cannot do twelve thousand this quarter.',
    'manual',
    now() - interval '400 days'
  );

  INSERT INTO public.call_extractions (
    org_id, call_id, summary, stated_objection, quotes, model_version
  ) VALUES (
    v_org,
    v_call,
    'Price objection on the close.',
    'The price is the wall',
    '[{"text":"The price is the wall.","topic":"price"}]'::jsonb,
    'test'
  )
  RETURNING id INTO v_extraction;

  INSERT INTO public.objections (
    org_id, lead_id, type, verbatim, call_id
  ) VALUES (
    v_org, v_lead, 'price', 'The price is the wall', v_call
  );

  UPDATE public.organizations
  SET transcript_retention_days = 365
  WHERE id = v_org;

  v_run := public.run_data_retention(true);
  IF (v_run ->> 'dryRun') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'dry-run must say dryRun true';
  END IF;
  IF COALESCE((v_run ->> 'transcriptsPurged')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'dry-run should count the aged transcript, got %', v_run;
  END IF;

  SELECT count(*) INTO v_n FROM public.calls WHERE id = v_call AND raw_transcript IS NOT NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'dry-run deleted a transcript';
  END IF;

  v_run := public.run_data_retention(false);
  IF COALESCE((v_run ->> 'transcriptsPurged')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'retention did not purge the aged transcript: %', v_run;
  END IF;

  -- Idempotent second run.
  v_run := public.run_data_retention(false);
  IF COALESCE((v_run ->> 'transcriptsPurged')::integer, 0) <> 0 THEN
    RAISE EXCEPTION 'second retention run must be a no-op, got %', v_run;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.calls
  WHERE id = v_call AND raw_transcript IS NULL AND transcript_purged_at IS NOT NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'transcript body was not cleared';
  END IF;

  SELECT count(*) INTO v_n FROM public.call_extractions WHERE id = v_extraction;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'purging a transcript orphaned the extraction';
  END IF;

  SELECT count(*) INTO v_n FROM public.objections WHERE call_id = v_call;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'purging a transcript orphaned the objection';
  END IF;

  SELECT count(*) INTO v_quotes
  FROM public.extraction_quotes_not_in_transcript()
  WHERE call_id = v_call;
  IF v_quotes <> 0 THEN
    RAISE EXCEPTION 'purged transcript must not fail quote integrity, got %', v_quotes;
  END IF;
END
$$;

-- Webhook payload + notification purge.
DO $$
DECLARE
  v_run jsonb;
  v_n integer;
  v_id uuid;
BEGIN
  INSERT INTO public.webhook_events (source, event_type, payload, processed, received_at)
  VALUES ('ghl', 'contact.create', '{"keep":true}'::jsonb, true, now() - interval '20 days')
  RETURNING id INTO v_id;

  INSERT INTO public.notifications (
    org_id, event_type, channel, title, body, href, dedupe_key, queued_at, status
  ) VALUES (
    '22222222-2222-4222-8222-222222222222',
    'daily_brief',
    'email',
    'old',
    'old',
    '/app/queue',
    'retention-old-brief',
    now() - interval '100 days',
    'sent'
  );

  v_run := public.run_data_retention(false);
  IF COALESCE((v_run ->> 'webhookPayloadsPurged')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'webhook payloads were not purged: %', v_run;
  END IF;
  IF COALESCE((v_run ->> 'notificationsDeleted')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'old notifications were not deleted: %', v_run;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.webhook_events
  WHERE id = v_id AND payload = '{"purged":true}'::jsonb AND payload_purged_at IS NOT NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'webhook payload tombstone missing';
  END IF;

  SELECT count(*) INTO v_n FROM public.notifications WHERE dedupe_key = 'retention-old-brief';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'aged notification survived purge';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Job that did not run alerts (not only jobs that failed).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_eval jsonb;
  v_open integer;
  v_check text;
BEGIN
  UPDATE public.ops_job_runs
  SET last_success_at = now() - interval '1 hour',
      last_error = NULL
  WHERE job_name = 'ghl-ingest';

  v_eval := public.evaluate_ops_alerts();

  SELECT count(*), max(check_first) INTO v_open, v_check
  FROM public.ops_alerts
  WHERE fingerprint = 'job_missed:ghl-ingest' AND resolved_at IS NULL;

  IF v_open <> 1 THEN
    RAISE EXCEPTION 'missed ghl-ingest must page, eval=%', v_eval;
  END IF;
  IF v_check IS NULL OR length(v_check) < 20 THEN
    RAISE EXCEPTION 'alert must name what to check first';
  END IF;

  UPDATE public.ops_job_runs
  SET last_success_at = now()
  WHERE job_name = 'ghl-ingest';

  PERFORM public.evaluate_ops_alerts();

  SELECT count(*) INTO v_open
  FROM public.ops_alerts
  WHERE fingerprint = 'job_missed:ghl-ingest' AND resolved_at IS NULL;
  IF v_open <> 0 THEN
    RAISE EXCEPTION 'recovered job must resolve the missed-job alert';
  END IF;
END
$$;

-- Per-client extraction failure alert.
DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_lead uuid := '44444444-4444-4444-8444-444444444441';
  v_call uuid;
  i integer;
  v_open integer;
BEGIN
  FOR i IN 1..12 LOOP
    v_call := ('e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5' || lpad(i::text, 2, '0'))::uuid;
    INSERT INTO public.calls (id, org_id, lead_id, type, occurred_at)
    VALUES (v_call, v_org, v_lead, 'triage', now());
    INSERT INTO public.extraction_jobs (org_id, call_id, status, last_error, created_at)
    VALUES (
      v_org,
      v_call,
      CASE WHEN i <= 4 THEN 'dead' ELSE 'processed' END,
      CASE WHEN i <= 4 THEN 'anthropic_http' ELSE NULL END,
      now() - interval '1 hour'
    );
  END LOOP;

  PERFORM public.evaluate_ops_alerts();

  SELECT count(*) INTO v_open
  FROM public.ops_alerts
  WHERE fingerprint = 'extraction_fail:' || v_org::text AND resolved_at IS NULL;
  IF v_open <> 1 THEN
    RAISE EXCEPTION 'extraction failure rate >20% with n=12 must page';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Dispatch-in-error walkthrough (runbook executed, not only written).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_lead uuid := '44444444-4444-4444-8444-444444444441';
  v_member uuid := '33333333-3333-4333-8333-333333333333';
  v_sent integer;
  v_halted boolean;
  v_incident uuid;
BEGIN
  INSERT INTO public.ghl_dispatches (
    org_id, lead_id, channel, body_text, actor_member_id, status, sent_at, ghl_message_id
  ) VALUES (
    v_org, v_lead, 'sms', NULL, v_member, 'sent', now() - interval '5 minutes', 'ghl_msg_drill_1'
  );

  -- Immediate action from the runbook: halt org-wide.
  PERFORM public.halt_org_follow_up_sequences(v_org, v_member);

  SELECT sequences_halted INTO v_halted
  FROM public.follow_up_settings WHERE org_id = v_org;
  IF v_halted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'dispatch-in-error drill did not halt sequences';
  END IF;

  -- Scope from the dispatch log (sent rows in the window).
  SELECT count(*) INTO v_sent
  FROM public.ghl_dispatches
  WHERE org_id = v_org
    AND status = 'sent'
    AND sent_at > now() - interval '1 hour';
  IF v_sent < 1 THEN
    RAISE EXCEPTION 'dispatch log did not show the erroneous send';
  END IF;

  INSERT INTO public.ops_incidents (
    kind, status, org_id, title, timeline, cause, impact, prevention,
    client_notified_at, client_notified_by
  ) VALUES (
    'dispatch_in_error',
    'mitigating',
    v_org,
    'Messages dispatched in error (staging drill)',
    jsonb_build_array(
      jsonb_build_object('at', now(), 'event', 'detected from dispatch log'),
      jsonb_build_object('at', now(), 'event', 'halt_org_follow_up_sequences'),
      jsonb_build_object('at', now(), 'event', 'client notified by DA')
    ),
    'Staging walkthrough of the dispatch-in-error runbook.',
    v_sent || ' message(s) in the last hour marked sent.',
    'Keep org-wide halt as the first control. Never delete the dispatch log.',
    now(),
    'DA operator (drill)'
  )
  RETURNING id INTO v_incident;

  IF v_incident IS NULL THEN
    RAISE EXCEPTION 'incident record was not created';
  END IF;

  -- Resume so later tests are not stuck halted.
  UPDATE public.follow_up_settings
  SET sequences_halted = false, sequences_halted_at = NULL, sequences_halted_by = NULL
  WHERE org_id = v_org;
END
$$;

-- ---------------------------------------------------------------------------
-- Offboarding + deletion: leftover rows forbidden; aggregates drop the org.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  i integer;
  v_org uuid;
  v_user uuid;
  v_lead uuid;
  v_call uuid;
  v_key text;
  v_count_before integer;
  v_count_after integer;
  v_median_before numeric;
  v_median_after numeric;
  v_delete_org uuid := '14141414-1414-4141-8141-000000100001';
  v_result jsonb;
  v_leftover jsonb;
  v_records integer;
  v_off jsonb;
BEGIN
  v_key := public.profile_cohort_key('agency_service', 2500000, 80);

  FOR i IN 1..5 LOOP
    v_org := ('14141414-1414-4141-8141-' || lpad((100000 + i)::text, 12, '0'))::uuid;
    v_user := ('15151515-1515-4151-8151-' || lpad((100000 + i)::text, 12, '0'))::uuid;
    v_lead := ('16161616-1616-4161-8161-' || lpad((100000 + i)::text, 12, '0'))::uuid;
    v_call := ('17171717-1717-4171-8171-' || lpad((100000 + i)::text, 12, '0'))::uuid;

    INSERT INTO auth.users (id, email) VALUES (v_user, 'wipe' || i || '@vistrial.local');
    INSERT INTO public.organizations (id, name, slug, activated_at)
    VALUES (v_org, 'Wipe Cohort ' || i, 'wipe-cohort-' || i, now() - interval '90 days');
    INSERT INTO public.org_members (org_id, user_id, role, display_name, email)
    VALUES (v_org, v_user, 'owner', 'Wipe Owner ' || i, 'wipe' || i || '@vistrial.local');
    PERFORM public.save_business_profile(v_org, NULL, jsonb_build_object(
      'offer_type', 'agency_service', 'price_point_cents', 2500000,
      'monthly_lead_volume', 80, 'touches_to_close', 6
    ), NULL);
    INSERT INTO public.org_benchmark_metrics (org_id, metric, value, sample_n, source)
    VALUES (v_org, 'close_rate', 8 + i, 30, 'live');

    INSERT INTO public.leads (id, org_id, first_name, last_name, status, opted_in_at)
    VALUES (v_lead, v_org, 'Wipe', 'Lead' || i, 'new', now() - interval '10 days');
    INSERT INTO public.calls (id, org_id, lead_id, type, raw_transcript, occurred_at)
    VALUES (v_call, v_org, v_lead, 'triage', 'hello from wipe org ' || i, now() - interval '9 days');
    INSERT INTO public.call_extractions (org_id, call_id, summary, model_version)
    VALUES (v_org, v_call, 'summary ' || i, 'test');
    INSERT INTO public.touches (org_id, lead_id, type, channel, direction, occurred_at)
    VALUES (v_org, v_lead, 'system', 'sms', 'outbound', now() - interval '8 days');
    INSERT INTO public.readiness_scores (
      org_id, lead_id, total, reasoning, triggered_by,
      timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw
    ) VALUES (
      v_org, v_lead, 70, 'seed', 'intake', 3, 3, 3, 3
    );
    INSERT INTO public.revenue_log (org_id, lead_id, amount_cents, payment_type, occurred_at)
    VALUES (v_org, v_lead, 10000, 'pif', now() - interval '2 days');
    INSERT INTO public.webhook_events (org_id, source, event_type, payload, processed)
    VALUES (v_org, 'ghl', 'contact.create', '{"n":1}'::jsonb, true);
    INSERT INTO public.notifications (
      org_id, event_type, channel, title, body, href, dedupe_key
    ) VALUES (
      v_org, 'daily_brief', 'email', 'hi', 'hi', '/app/queue', 'wipe-brief-' || i
    );
  END LOOP;

  PERFORM public.benchmark_refresh_cohorts();
  SELECT org_count, median_value INTO v_count_before, v_median_before
  FROM public.benchmark_cohorts
  WHERE cohort_key = v_key AND metric = 'close_rate';
  IF v_count_before <> 5 THEN
    RAISE EXCEPTION 'wipe cohort should start at 5, got %', v_count_before;
  END IF;

  -- Offboarding sequence (CRM unlink is application-side; SQL marks inactive + halt).
  v_off := public.mark_org_offboarded(v_delete_org, 'staging offboarding drill', 30);
  IF (v_off ->> 'orgId') IS DISTINCT FROM v_delete_org::text THEN
    RAISE EXCEPTION 'offboard did not return the org';
  END IF;
  IF (SELECT inactive_at IS NULL FROM public.organizations WHERE id = v_delete_org) THEN
    RAISE EXCEPTION 'offboard must set inactive_at';
  END IF;
  IF (SELECT sequences_halted FROM public.follow_up_settings WHERE org_id = v_delete_org) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'offboard must halt sequences';
  END IF;

  -- Wrong confirmation name is refused.
  BEGIN
    PERFORM public.delete_org_data(v_delete_org, 'Wrong Name', 'test');
    RAISE EXCEPTION 'delete without naming the org was allowed';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%confirmation_mismatch%' THEN
        RAISE;
      END IF;
  END;

  v_result := public.delete_org_data(
    v_delete_org,
    'Wipe Cohort 1',
    'staging deletion drill',
    NULL,
    'da@vistrial.local'
  );

  IF (v_result ->> 'aggregatesRecomputed') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'deletion must recompute aggregates';
  END IF;

  v_leftover := public.org_scoped_row_counts(v_delete_org);
  IF v_leftover <> '{}'::jsonb THEN
    RAISE EXCEPTION 'deletion left rows behind: %', v_leftover;
  END IF;

  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = v_delete_org) THEN
    RAISE EXCEPTION 'organization row survived deletion';
  END IF;

  SELECT count(*) INTO v_records
  FROM public.org_deletion_records
  WHERE org_id = v_delete_org AND status = 'completed' AND completed_at IS NOT NULL;
  IF v_records <> 1 THEN
    RAISE EXCEPTION 'surviving deletion record missing';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = '15151515-1515-4151-8151-000000100001') THEN
    RAISE EXCEPTION 'deleted org member auth user survived';
  END IF;

  IF EXISTS (SELECT 1 FROM public.staff_access_log WHERE org_id = v_delete_org) THEN
    RAISE EXCEPTION 'staff_access_log rows survived deletion';
  END IF;

  PERFORM public.benchmark_refresh_cohorts();
  SELECT org_count, median_value INTO v_count_after, v_median_after
  FROM public.benchmark_cohorts
  WHERE cohort_key = v_key AND metric = 'close_rate';

  -- 4 remaining is below the minimum of 5, so the cohort row must disappear.
  IF v_count_after IS NOT NULL THEN
    RAISE EXCEPTION 'deleted org still in the cohort (count=%)', v_count_after;
  END IF;

  -- Confirm remaining orgs still exist and their metrics remain.
  IF (SELECT count(*) FROM public.org_benchmark_metrics WHERE org_id = '14141414-1414-4141-8141-000000100002') <> 1 THEN
    RAISE EXCEPTION 'sibling org metrics were removed with the deleted org';
  END IF;
END
$$;

-- Rate limit RPC.
DO $$
DECLARE
  v_first jsonb;
  v_last jsonb;
  i integer;
BEGIN
  v_first := public.consume_rate_limit('test-key-hardening-auth', 3, 60);
  IF (v_first ->> 'allowed') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'first hit must be allowed';
  END IF;
  PERFORM public.consume_rate_limit('test-key-hardening-auth', 3, 60);
  PERFORM public.consume_rate_limit('test-key-hardening-auth', 3, 60);
  v_last := public.consume_rate_limit('test-key-hardening-auth', 3, 60);
  IF (v_last ->> 'allowed') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'fourth hit in a 3-limit window must be blocked: %', v_last;
  END IF;
END
$$;

-- RLS: clients never see ops_alerts; DA does.
DO $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.ops_alerts (fingerprint, kind, severity, title, check_first)
  VALUES ('rls-probe', 'job_missed', 'warning', 'probe', 'Look at ops_alerts RLS.');

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.ops_alerts WHERE fingerprint = 'rls-probe';
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'org owner saw ops_alerts';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.ops_alerts WHERE fingerprint = 'rls-probe';
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'platform admin did not see ops_alerts';
  END IF;
END
$$;

-- Default transcript retention is bounded, not indefinite.
DO $$
DECLARE
  v_default integer;
BEGIN
  SELECT transcript_retention_days INTO v_default
  FROM public.organizations
  WHERE id = '22222222-2222-4222-8222-222222222222';
  IF v_default IS DISTINCT FROM 365 THEN
    RAISE EXCEPTION 'transcript retention default must be 365 days, got %', v_default;
  END IF;
END
$$;

-- Queued webhook events survive a process restart (the deploy-during-ingest contract).
DO $$
DECLARE
  v_id uuid;
  v_n integer;
BEGIN
  INSERT INTO public.webhook_events (source, event_type, payload, processed, status)
  VALUES ('ghl', 'contact.create', '{"deploy":"queue-survives"}'::jsonb, false, 'pending')
  RETURNING id INTO v_id;

  -- No processor runs here. The row must still be pending, as after a deploy swap.
  SELECT count(*) INTO v_n
  FROM public.webhook_events
  WHERE id = v_id AND processed = false AND status = 'pending';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'queued webhook did not survive the simulated deploy window';
  END IF;

  DELETE FROM public.webhook_events WHERE id = v_id;
END
$$;

DO $$
DECLARE
  v_runtime jsonb;
BEGIN
  v_runtime := public.sample_db_runtime();
  IF COALESCE((v_runtime ->> 'connectionsTotal')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'sample_db_runtime must see at least this session, got %', v_runtime;
  END IF;
END
$$;
