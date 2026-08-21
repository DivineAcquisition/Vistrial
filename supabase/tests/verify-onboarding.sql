-- Prompt 12: activation gate, setup order, test-lead exclusion, staff console.
-- IDs use the 222e2222-2222-4222-8222- prefix.

INSERT INTO auth.users (id, email)
VALUES
  ('222e2222-2222-4222-8222-2222222222a2', 'onboard-owner@vistrial.local'),
  ('222e2222-2222-4222-8222-2222222222c2', 'onboard-client@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, timezone)
VALUES (
  '222e2222-2222-4222-8222-2222222222a1',
  'Onboard Co',
  'onboard-co',
  'America/New_York'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES (
  '222e2222-2222-4222-8222-2222222222a3',
  '222e2222-2222-4222-8222-2222222222a1',
  '222e2222-2222-4222-8222-2222222222a2',
  'owner',
  'Onboard Owner',
  'onboard-owner@vistrial.local'
)
ON CONFLICT (org_id, user_id) DO NOTHING;

DO $$
DECLARE
  v_org uuid := '222e2222-2222-4222-8222-2222222222a1';
  v_owner uuid := '222e2222-2222-4222-8222-2222222222a3';
  v_owner_user uuid := '222e2222-2222-4222-8222-2222222222a2';
  v_staff uuid := '99999999-9999-4999-8999-999999999999';
  v_client_user uuid := '222e2222-2222-4222-8222-2222222222c2';
  v_gate jsonb;
  v_hard jsonb;
  v_item jsonb;
  v_ok boolean;
  v_id text;
  v_run uuid;
  v_lead uuid := '222e2222-2222-4222-8222-2222222222b1';
  v_test uuid := '222e2222-2222-4222-8222-2222222222b2';
  v_at timestamptz;
  v_prev timestamptz;
  v_denied boolean;
  v_log integer;
  v_created jsonb;
  v_new_org uuid;
  v_health jsonb;
  v_inspect jsonb;
  v_count integer;
  v_queue boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.org_onboarding WHERE org_id = v_org) THEN
    RAISE EXCEPTION 'org_onboarding was not created with the organization';
  END IF;

  IF pg_get_functiondef('public.complete_baseline_run(uuid, boolean)'::regprocedure)
     NOT ILIKE '%p_activate boolean DEFAULT false%' THEN
    RAISE EXCEPTION 'complete_baseline_run must default p_activate to false';
  END IF;

  -- Direct UPDATE of activated_at is blocked.
  v_denied := false;
  BEGIN
    UPDATE public.organizations SET activated_at = now() WHERE id = v_org;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%change_activation_timestamp%' THEN
        v_denied := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'direct activated_at update was allowed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  v_gate := public.evaluate_activation_gate(v_org);
  RESET ROLE;

  IF (v_gate->>'can_activate')::boolean THEN
    RAISE EXCEPTION 'empty org should not be able to activate';
  END IF;

  -- Scoring defaults and the creating owner exist; the rest must still block.
  FOREACH v_id IN ARRAY ARRAY['crm_verified', 'backfill_resolved', 'field_mapping']
  LOOP
    SELECT (item->>'ok')::boolean INTO v_ok
    FROM jsonb_array_elements(v_gate->'hard') item
    WHERE item->>'id' = v_id;
    IF v_ok THEN
      RAISE EXCEPTION 'hard requirement % should fail on a blank org', v_id;
    END IF;
  END LOOP;

  -- Skip backfill must not activate.
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  PERFORM public.skip_baseline_backfill(v_org, v_owner);
  RESET ROLE;
  IF (SELECT activated_at FROM public.organizations WHERE id = v_org) IS NOT NULL THEN
    RAISE EXCEPTION 'skip_baseline_backfill set activated_at';
  END IF;

  -- Unusable skip still blocks until fallback.
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  v_gate := public.evaluate_activation_gate(v_org);
  RESET ROLE;
  SELECT (item->>'ok')::boolean INTO v_ok
  FROM jsonb_array_elements(v_gate->'hard') item
  WHERE item->>'id' = 'backfill_resolved';
  IF v_ok THEN
    RAISE EXCEPTION 'skipped backfill without fallback should still block';
  END IF;

  UPDATE public.org_onboarding
  SET baseline_fallback = 'declined'
  WHERE org_id = v_org;

  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  v_gate := public.evaluate_activation_gate(v_org);
  RESET ROLE;
  SELECT (item->>'ok')::boolean INTO v_ok
  FROM jsonb_array_elements(v_gate->'hard') item
  WHERE item->>'id' = 'backfill_resolved';
  IF NOT v_ok THEN
    RAISE EXCEPTION 'declined fallback should resolve the backfill requirement';
  END IF;

  -- CRM verified within the hour.
  INSERT INTO public.ghl_connections (
    org_id, location_id, location_name, status, last_verified_at
  ) VALUES (
    v_org, 'loc_onboard', 'Onboard Location', 'active', now()
  )
  ON CONFLICT (org_id) DO UPDATE
    SET status = 'active', location_id = 'loc_onboard', last_verified_at = now();

  UPDATE public.organizations SET ghl_location_id = 'loc_onboard' WHERE id = v_org;

  -- Field mapping + a scored real lead.
  UPDATE public.org_onboarding SET field_maps_saved_at = now() WHERE org_id = v_org;
  INSERT INTO public.leads (
    id, org_id, first_name, last_name, email, status, source, opted_in_at, ghl_contact_id
  ) VALUES (
    v_lead, v_org, 'Real', 'Lead', 'real@onboard.test', 'new', 'web', now(), 'ghl_onboard_real'
  );
  INSERT INTO public.readiness_scores (
    org_id, lead_id, total, reasoning, triggered_by,
    timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw
  ) VALUES (
    v_org, v_lead, 72, 'mapped', 'intake', 80, 70, 65, 60
  );

  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  v_gate := public.evaluate_activation_gate(v_org);
  RESET ROLE;

  IF NOT (v_gate->>'can_activate')::boolean THEN
    RAISE EXCEPTION 'fully configured org should be able to activate, gate=%', v_gate;
  END IF;

  -- Warnings: no voice, no transcript. Team count includes platform admins.
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_gate->'warnings') w
    WHERE w->>'id' = 'no_voice_examples' AND (w->>'applies')::boolean
  ) THEN
    RAISE EXCEPTION 'voice warning missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_gate->'warnings') w
    WHERE w->>'id' = 'no_transcript_source' AND (w->>'applies')::boolean
  ) THEN
    RAISE EXCEPTION 'transcript warning missing';
  END IF;

  -- Activation without acknowledging warnings fails.
  v_denied := false;
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.activate_org(v_org, v_owner, '{}', false, NULL, NULL);
  EXCEPTION
    WHEN OTHERS THEN
      v_denied := true;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'activation without warning acknowledgments was allowed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  PERFORM public.activate_org(
    v_org,
    v_owner,
    ARRAY['no_voice_examples', 'no_transcript_source', 'thin_team'],
    false,
    NULL,
    NULL
  );
  RESET ROLE;

  SELECT activated_at INTO v_at FROM public.organizations WHERE id = v_org;
  IF v_at IS NULL THEN
    RAISE EXCEPTION 'activate_org did not set activated_at';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.activation_events
    WHERE org_id = v_org
      AND actor_user_id = v_owner_user
      AND 'thin_team' = ANY (warnings_acknowledged)
      AND override = false
  ) THEN
    RAISE EXCEPTION 'activation event did not record acknowledged warnings';
  END IF;

  -- Second activate is idempotent.
  v_prev := v_at;
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  PERFORM public.activate_org(
    v_org,
    v_owner,
    ARRAY['no_voice_examples', 'no_transcript_source', 'thin_team'],
    false,
    NULL,
    NULL
  );
  RESET ROLE;
  IF (SELECT activated_at FROM public.organizations WHERE id = v_org) IS DISTINCT FROM v_prev THEN
    RAISE EXCEPTION 'second activate overwrote the timestamp';
  END IF;

  -- Changing the timestamp requires the slug.
  v_denied := false;
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.change_activation_timestamp(
      v_org, v_owner, 'wrong-slug', v_at - interval '1 day', 'shifting figures on purpose'
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_denied := true;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'timestamp change without the slug was allowed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  PERFORM public.change_activation_timestamp(
    v_org, v_owner, 'onboard-co', v_at - interval '2 days', 'correcting a mistaken go-live'
  );
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM public.activation_timestamp_changes
    WHERE org_id = v_org AND reason = 'correcting a mistaken go-live'
  ) THEN
    RAISE EXCEPTION 'timestamp change was not recorded';
  END IF;

  -- Override is recorded, never silent. Fresh org.
  INSERT INTO public.organizations (id, name, slug, timezone)
  VALUES (
    '222e2222-2222-4222-8222-2222222222d1',
    'Override Co',
    'override-co',
    'America/New_York'
  );
  INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
  VALUES (
    '222e2222-2222-4222-8222-2222222222d3',
    '222e2222-2222-4222-8222-2222222222d1',
    v_owner_user,
    'owner',
    'Override Owner',
    'onboard-owner@vistrial.local'
  );

  v_denied := false;
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.activate_org(
      '222e2222-2222-4222-8222-2222222222d1',
      '222e2222-2222-4222-8222-2222222222d3',
      ARRAY['no_voice_examples', 'no_transcript_source', 'thin_team'],
      true,
      'please',
      'we need to go live today for a demo'
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_denied := true;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'override without ACTIVATE phrase was allowed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  PERFORM public.activate_org(
    '222e2222-2222-4222-8222-2222222222d1',
    '222e2222-2222-4222-8222-2222222222d3',
    ARRAY['no_voice_examples', 'no_transcript_source', 'thin_team'],
    true,
    'ACTIVATE',
    'we need to go live today for a demo'
  );
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM public.activation_events
    WHERE org_id = '222e2222-2222-4222-8222-2222222222d1'
      AND override
      AND override_reason = 'we need to go live today for a demo'
      AND jsonb_array_length(unmet_hard) > 0
  ) THEN
    RAISE EXCEPTION 'override was not recorded with unmet hard requirements';
  END IF;

  -- Test leads are excluded from the queue and live counts.
  INSERT INTO public.leads (
    id, org_id, first_name, last_name, email, status, source, opted_in_at, ghl_contact_id, is_test
  ) VALUES (
    v_test, v_org, 'Go', 'Live', 'golive@onboard.test', 'new', 'vistrial_golive',
    now() - interval '2 hours', 'vistrial-golive-test', true
  );

  SELECT EXISTS (SELECT 1 FROM public.queue_rows WHERE id = v_test) INTO v_queue;
  IF v_queue THEN
    RAISE EXCEPTION 'test lead appeared in queue_rows';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.case_file_rows WHERE id = v_test) INTO v_queue;
  IF v_queue THEN
    RAISE EXCEPTION 'test lead appeared in case_file_rows';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.alarm_band_leads(v_org) a WHERE a.id = v_test) INTO v_queue;
  IF v_queue THEN
    RAISE EXCEPTION 'test lead appeared in alarm_band_leads';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  v_inspect := public.golive_inspect_lead(v_org, v_test);
  RESET ROLE;
  IF v_inspect IS NULL OR NOT (v_inspect->>'isTest')::boolean THEN
    RAISE EXCEPTION 'golive_inspect_lead should see the test lead';
  END IF;
  IF (v_inspect->>'inQueueView')::boolean THEN
    RAISE EXCEPTION 'golive inspect should report the test lead is not in the queue view';
  END IF;

  -- First-week zero-ingest warning is not about the test lead.
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  v_health := public.first_week_health(v_org);
  RESET ROLE;
  IF (v_health->>'leads_ingested')::bigint < 1 THEN
    RAISE EXCEPTION 'first_week_health ignored the real lead';
  END IF;

  -- Client owner cannot reach the staff console.
  v_denied := false;
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.staff_org_overview();
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_denied := true;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%staff%' THEN
        v_denied := true;
      ELSE
        RAISE;
      END IF;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'client owner was allowed to load staff_org_overview';
  END IF;

  -- Staff access is logged.
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, false);
  SET ROLE authenticated;
  PERFORM public.log_staff_access('list_orgs', NULL, jsonb_build_object('source', 'verify'));
  PERFORM public.log_staff_access('view_org', v_org, jsonb_build_object('source', 'verify'));
  PERFORM public.staff_org_overview();
  RESET ROLE;

  SELECT count(*) INTO v_log
  FROM public.staff_access_log
  WHERE staff_user_id = v_staff
    AND action IN ('list_orgs', 'view_org');
  IF v_log < 2 THEN
    RAISE EXCEPTION 'staff access was not logged, got %', v_log;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_access_log
    WHERE staff_user_id = v_staff AND org_id = v_org AND action = 'view_org'
  ) THEN
    RAISE EXCEPTION 'view_org log missing org id';
  END IF;

  -- Staff overview never includes transcript or draft bodies.
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, false);
  SET ROLE authenticated;
  v_created := public.staff_org_overview();
  RESET ROLE;
  IF v_created::text ILIKE '%raw_transcript%'
     OR v_created::text ILIKE '%body_text%'
     OR v_created::text ILIKE '%quoted%' THEN
    RAISE EXCEPTION 'staff overview leaked client content keys';
  END IF;

  -- Broken ingestion is identifiable: a connected, activated org with no events.
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_created) s
    WHERE s->>'id' = v_org::text
  ) THEN
    RAISE EXCEPTION 'onboard org missing from staff overview';
  END IF;

  -- Staff can create a client org.
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, false);
  SET ROLE authenticated;
  v_created := public.create_client_org(
    'Fresh Client',
    'America/Chicago',
    NULL,
    'owner@fresh.example'
  );
  RESET ROLE;
  v_new_org := (v_created->>'org_id')::uuid;
  IF v_new_org IS NULL THEN
    RAISE EXCEPTION 'create_client_org did not return an org';
  END IF;
  IF (SELECT timezone FROM public.organizations WHERE id = v_new_org) IS DISTINCT FROM 'America/Chicago' THEN
    RAISE EXCEPTION 'create_client_org did not persist timezone';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.org_onboarding WHERE org_id = v_new_org) THEN
    RAISE EXCEPTION 'new org missing onboarding row';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.score_configs WHERE org_id = v_new_org) THEN
    RAISE EXCEPTION 'new org missing score_configs defaults';
  END IF;
  IF (v_created->>'invite_token') IS NULL THEN
    RAISE EXCEPTION 'create_client_org should mint an owner invite for staff JWTs';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_invites
    WHERE org_id = v_new_org AND role = 'owner' AND email = 'owner@fresh.example'
  ) THEN
    RAISE EXCEPTION 'owner invite was not created';
  END IF;

  -- Isolated CRM-verified failure: stale last_verified_at.
  UPDATE public.ghl_connections
  SET last_verified_at = now() - interval '2 hours'
  WHERE org_id = v_org;
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  v_gate := public.evaluate_activation_gate(v_org);
  RESET ROLE;
  SELECT (item->>'ok')::boolean INTO v_ok
  FROM jsonb_array_elements(v_gate->'hard') item
  WHERE item->>'id' = 'crm_verified';
  IF v_ok THEN
    RAISE EXCEPTION 'stale CRM verification should block';
  END IF;
  UPDATE public.ghl_connections SET last_verified_at = now() WHERE org_id = v_org;

  -- Wide speed-to-lead warning.
  UPDATE public.score_configs SET speed_to_lead_minutes = 120 WHERE org_id = v_org;
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);
  SET ROLE authenticated;
  v_gate := public.evaluate_activation_gate(v_org);
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_gate->'warnings') w
    WHERE w->>'id' = 'wide_speed_to_lead' AND (w->>'applies')::boolean
  ) THEN
    RAISE EXCEPTION 'wide speed-to-lead warning missing';
  END IF;
  UPDATE public.score_configs SET speed_to_lead_minutes = 15 WHERE org_id = v_org;

  SELECT count(*) INTO v_count FROM public.leads WHERE org_id = v_org AND is_test;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one leftover test lead before cleanup, got %', v_count;
  END IF;
  DELETE FROM public.leads WHERE id = v_test;
  IF EXISTS (SELECT 1 FROM public.leads WHERE id = v_test) THEN
    RAISE EXCEPTION 'test lead delete failed';
  END IF;
END
$$;
