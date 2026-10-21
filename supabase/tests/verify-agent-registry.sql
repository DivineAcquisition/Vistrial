-- Agent registry, the Postgres copy of the live record, the one may-run
-- decision, and the shared summary. Run after verify-rls.sql (Org A setter,
-- Org B owner) and verify-scoring.sql (Org A member without approvals).

-- A second Org A setter, so one setter's leads are hidden from the other.
INSERT INTO auth.users (id, email)
VALUES ('16161616-1616-4161-8161-161616161616', 'setter-two@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES (
  '17171717-1717-4171-8171-171717171717',
  '22222222-2222-4222-8222-222222222222',
  '16161616-1616-4161-8161-161616161616',
  'setter',
  'Org A Second Setter',
  'setter-two@vistrial.local'
)
ON CONFLICT (org_id, user_id) DO NOTHING;

UPDATE public.leads SET assigned_setter_id = '17171717-1717-4171-8171-171717171717'
WHERE id = '44444444-4444-4444-8444-444444444443';

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_mine uuid := '44444444-4444-4444-8444-444444444442';
  v_theirs uuid := '44444444-4444-4444-8444-444444444443';
  v_run uuid := 'b1b1b1b1-0000-4000-8000-000000000001';
  v_out jsonb;
  v_count integer;
  v_text text;
  v_denied boolean;
  v_summary jsonb;
  v_agent jsonb;
  v_started timestamptz;
  v_ms numeric;
BEGIN
  -- The registry knows every current agent, and every agent column points at it.
  SELECT count(*) INTO v_count FROM public.agent_registry WHERE id IN ('sentry', 'scribe', 'relay', 'compass', 'assay');
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'expected the five agents in the registry, found %', v_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_registry WHERE area_id = 'client_retention') THEN
    RAISE EXCEPTION 'an agent was placed in Client Retention';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_agent_activation WHERE org_id = v_org AND agent_id = 'assay' AND stage = 'on'
  ) THEN
    RAISE EXCEPTION 'Assay is not On for an existing workspace';
  END IF;

  -- Direct writes to the live tables are still refused: only the copy writes them.
  v_denied := false;
  BEGIN
    INSERT INTO public.agent_activity_runs (org_id, agent_id, trigger_key, subject_label)
    VALUES (v_org, 'relay', 'direct', 'a lead');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'a direct write reached the live record';
  END IF;

  -- An unknown agent cannot be recorded.
  v_denied := false;
  BEGIN
    PERFORM public.live_record_copy(jsonb_build_object(
      'kind', 'run', 'action', 'insert', 'workspaceId', v_org, 'occurredAt', now(),
      'row', jsonb_build_object('id', gen_random_uuid(), 'agent_id', 'nobody', 'trigger_key', 'x', 'subject_label', 'a lead')));
  EXCEPTION WHEN foreign_key_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'a run for an unregistered agent was recorded';
  END IF;

  -- The copy is idempotent, and the same trigger is one run.
  v_out := public.live_record_copy(jsonb_build_object(
    'kind', 'run', 'action', 'insert', 'workspaceId', v_org, 'occurredAt', now() - interval '3 minutes',
    'row', jsonb_build_object('id', v_run, 'org_id', v_org, 'agent_id', 'relay', 'trigger_key', 'verify:t1',
      'subject_label', 'Follow-up for a lead', 'lead_id', v_mine, 'status', 'queued')));
  IF NOT (v_out ->> 'applied')::boolean THEN
    RAISE EXCEPTION 'the first copy of a run was not applied: %', v_out;
  END IF;
  v_out := public.live_record_copy(jsonb_build_object(
    'kind', 'run', 'action', 'insert', 'workspaceId', v_org, 'occurredAt', now(),
    'row', jsonb_build_object('id', gen_random_uuid(), 'org_id', v_org, 'agent_id', 'relay', 'trigger_key', 'verify:t1',
      'subject_label', 'Follow-up for a lead', 'lead_id', v_mine)));
  IF (v_out ->> 'applied')::boolean OR (v_out ->> 'id')::uuid <> v_run OR NOT (v_out ->> 'existing')::boolean THEN
    RAISE EXCEPTION 'a repeated trigger made a second run: %', v_out;
  END IF;

  -- Newest wins: a late, older change never rolls the run back.
  PERFORM public.live_record_copy(jsonb_build_object(
    'kind', 'run', 'action', 'update', 'workspaceId', v_org, 'occurredAt', now() - interval '1 minute',
    'row', jsonb_build_object('id', v_run, 'org_id', v_org, 'status', 'working', 'current_step_label', 'Drafting the follow-up')));
  PERFORM public.live_record_copy(jsonb_build_object(
    'kind', 'run', 'action', 'update', 'workspaceId', v_org, 'occurredAt', now() - interval '2 minutes',
    'row', jsonb_build_object('id', v_run, 'org_id', v_org, 'status', 'queued', 'current_step_label', NULL)));
  SELECT status || ':' || COALESCE(current_step_label, '') INTO v_text FROM public.agent_activity_runs WHERE id = v_run;
  IF v_text <> 'working:Drafting the follow-up' THEN
    RAISE EXCEPTION 'a late change rolled the run back: %', v_text;
  END IF;

  -- A change for a run that is not here yet is refused, so it is retried.
  v_denied := false;
  BEGIN
    PERFORM public.live_record_copy(jsonb_build_object(
      'kind', 'run', 'action', 'update', 'workspaceId', v_org, 'occurredAt', now(),
      'row', jsonb_build_object('id', gen_random_uuid(), 'org_id', v_org, 'status', 'working')));
  EXCEPTION WHEN no_data_found THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'a change for a missing run was dropped instead of retried';
  END IF;

  -- A change cannot cross workspaces.
  v_denied := false;
  BEGIN
    PERFORM public.live_record_copy(jsonb_build_object(
      'kind', 'event', 'action', 'insert', 'workspaceId', v_org, 'occurredAt', now(),
      'row', jsonb_build_object('id', gen_random_uuid(), 'org_id', gen_random_uuid(), 'run_id', v_run, 'kind', 'output', 'label', 'x')));
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'a copied change left its workspace';
  END IF;

  -- Events count once; output bodies are never copied.
  FOR i IN 1..2 LOOP
    PERFORM public.live_record_copy(jsonb_build_object(
      'kind', 'event', 'action', 'insert', 'workspaceId', v_org, 'occurredAt', now(),
      'row', jsonb_build_object('id', 'b1b1b1b1-0000-4000-8000-0000000000e1', 'org_id', v_org, 'run_id', v_run,
        'kind', 'output', 'label', 'Drafted a follow-up', 'occurred_at', now())));
    PERFORM public.live_record_copy(jsonb_build_object(
      'kind', 'output', 'action', 'insert', 'workspaceId', v_org, 'occurredAt', now(),
      'row', jsonb_build_object('id', 'b1b1b1b1-0000-4000-8000-0000000000f1', 'org_id', v_org, 'run_id', v_run,
        'kind', 'draft', 'title', 'Follow-up for a lead', 'body', 'Hi June, see you Tuesday.', 'after_value', '{"text": "secret"}')));
  END LOOP;
  SELECT count(*) INTO v_count FROM public.agent_activity_events WHERE id = 'b1b1b1b1-0000-4000-8000-0000000000e1';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'a repeated event was counted % times', v_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.agent_activity_outputs
    WHERE id = 'b1b1b1b1-0000-4000-8000-0000000000f1' AND (body IS NOT NULL OR after_value IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'message text reached the copy';
  END IF;

  -- The one may-run decision: staged activation, pause, workspace stop, platform halt, plan.
  IF public.agent_may_run(v_org, 'relay') ->> 'reason' <> 'not_activated' THEN
    RAISE EXCEPTION 'relay ran before it was switched on';
  END IF;
  IF NOT (public.agent_may_run(v_org, 'relay', true) ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'the onboarding sample could not run';
  END IF;
  UPDATE public.workspace_agent_activation SET stage = 'on' WHERE org_id = v_org AND agent_id IN ('relay', 'sentry', 'scribe');
  IF NOT (public.agent_may_run(v_org, 'relay') ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'relay may not run in an active workspace: %', public.agent_may_run(v_org, 'relay');
  END IF;
  IF public.agent_may_run(v_org, 'nobody') ->> 'reason' <> 'unknown' THEN
    RAISE EXCEPTION 'an unknown agent was allowed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;
  PERFORM public.set_agent_paused(v_org, 'assay', true, NULL);
  RESET ROLE;
  IF public.agent_may_run(v_org, 'assay') ->> 'reason' <> 'paused' THEN
    RAISE EXCEPTION 'a paused Assay may still run: %', public.agent_may_run(v_org, 'assay');
  END IF;
  INSERT INTO public.assay_jobs (org_id, lead_id, cause, dedupe_key, silent)
  VALUES (v_org, NULL, 'manual', 'verify:paused', false);
  SET ROLE authenticated;
  PERFORM public.set_agent_paused(v_org, 'assay', false, NULL);
  RESET ROLE;
  IF NOT (public.agent_may_run(v_org, 'assay') ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'Assay did not resume';
  END IF;
  IF NOT (SELECT silent FROM public.assay_jobs WHERE org_id = v_org AND dedupe_key = 'verify:paused') THEN
    RAISE EXCEPTION 'catch-up from the paused period was not made quiet';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_activity_log WHERE org_id = v_org AND action = 'agent.resumed' AND target_id = 'assay'
  ) THEN
    RAISE EXCEPTION 'resuming Assay was not recorded';
  END IF;

  UPDATE public.organizations SET agents_halted = true WHERE id = v_org;
  IF public.agent_may_run(v_org, 'scribe') ->> 'by' <> 'workspace_stop' THEN
    RAISE EXCEPTION 'the workspace stop did not stop Scribe';
  END IF;
  UPDATE public.organizations SET agents_halted = false WHERE id = v_org;

  PERFORM set_config('vistrial.live_record_replica', 'on', true);
  INSERT INTO public.platform_agent_halts (agent_id, halted, reason) VALUES ('sentry', true, 'verify')
  ON CONFLICT (agent_id) DO UPDATE SET halted = true;
  IF public.agent_may_run(v_org, 'sentry') ->> 'by' <> 'vistrial' THEN
    RAISE EXCEPTION 'the platform halt did not stop Sentry';
  END IF;
  UPDATE public.platform_agent_halts SET halted = false WHERE agent_id = 'sentry';
  PERFORM set_config('vistrial.live_record_replica', '', true);

  INSERT INTO public.billing_overrides (org_id, entitlement_key, enabled, reason)
  VALUES (v_org, 'agent:relay', false, 'verify lock');
  IF public.agent_may_run(v_org, 'relay') ->> 'reason' <> 'locked' THEN
    RAISE EXCEPTION 'a plan without Relay still runs it';
  END IF;
  v_out := public.entitlement_check(v_org, 'agent:relay');
  IF (v_out ->> 'allowed')::boolean OR v_out ->> 'reason' NOT LIKE 'Not included%' THEN
    RAISE EXCEPTION 'entitlement_check did not lock Relay: %', v_out;
  END IF;
  DELETE FROM public.billing_overrides WHERE org_id = v_org AND entitlement_key = 'agent:relay';
  IF NOT (public.entitlement_check(v_org, 'agent:relay') ->> 'allowed')::boolean THEN
    RAISE EXCEPTION 'the plan does not include Relay';
  END IF;

  -- Waiting items: two Relay drafts (one per setter's lead) and a Scribe question.
  INSERT INTO public.approval_items (org_id, kind, action_type, title, lead_ids, assigned_member_id, agent_id, run_id, preview)
  VALUES
    (v_org, 'no_show_rebook', 'no_show_rebook', 'Follow-up for a lead', ARRAY[v_mine], '13131313-1313-4131-8131-131313131313', 'relay', v_run, 'Hi June, see you Tuesday.'),
    (v_org, 'no_show_rebook', 'no_show_rebook', 'Follow-up for a lead', ARRAY[v_theirs], '17171717-1717-4171-8171-171717171717', 'relay', NULL, 'Hi Sam.'),
    (v_org, 'agent_question', 'agent_question', 'Which plan did they pick?', ARRAY[v_theirs], NULL, 'scribe', NULL, NULL);
END
$$;

-- The shared summary, as each role. Run as the signed-in person.
DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_summary jsonb;
  v_relay jsonb;
  v_count integer;
  v_sum integer;
  v_denied boolean;
BEGIN
  -- Owner: every item, and the badge, the rows and the Decisions query agree.
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;
  v_summary := public.agent_summary(v_org);
  SELECT count(*) INTO v_count FROM public.approval_items
  WHERE org_id = v_org AND agent_id IS NOT NULL AND status IN ('pending', 'approved');
  RESET ROLE;
  SELECT COALESCE(sum((a -> 'facts' -> 'waiting' ->> 'approvals')::integer + (a -> 'facts' -> 'waiting' ->> 'questions')::integer), 0)
  INTO v_sum FROM jsonb_array_elements(v_summary -> 'agents') a WHERE a -> 'facts' <> 'null'::jsonb;
  IF (v_summary ->> 'waitingTotal')::integer <> 3 OR v_count <> 3 OR v_sum <> 3 THEN
    RAISE EXCEPTION 'owner counts disagree: badge %, decisions %, rows %', v_summary ->> 'waitingTotal', v_count, v_sum;
  END IF;
  SELECT a INTO v_relay FROM jsonb_array_elements(v_summary -> 'agents') a WHERE a ->> 'id' = 'relay';
  IF (v_relay -> 'facts' -> 'waiting' ->> 'approvals')::integer <> 2 THEN
    RAISE EXCEPTION 'owner sees the wrong Relay count: %', v_relay -> 'facts' -> 'waiting';
  END IF;
  IF v_relay -> 'facts' -> 'openRun' ->> 'step' <> 'Drafting the follow-up' THEN
    RAISE EXCEPTION 'the summary lost the current step: %', v_relay -> 'facts' -> 'openRun';
  END IF;
  IF v_summary::text LIKE '%see you Tuesday%' OR v_summary::text LIKE '%Hi Sam%' THEN
    RAISE EXCEPTION 'message text reached the summary';
  END IF;

  -- Operator: only their own lead's items and lines, and no workspace-wide count.
  PERFORM set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);
  SET ROLE authenticated;
  v_summary := public.agent_summary(v_org);
  RESET ROLE;
  IF (v_summary ->> 'waitingTotal')::integer <> 1 THEN
    RAISE EXCEPTION 'an Operator counted other people''s items: %', v_summary ->> 'waitingTotal';
  END IF;
  SELECT a INTO v_relay FROM jsonb_array_elements(v_summary -> 'agents') a WHERE a ->> 'id' = 'relay';
  IF jsonb_array_length(v_relay -> 'facts' -> 'outputs') <> 1
     OR v_relay -> 'facts' -> 'outputs' -> 0 ->> 'leadId' <> '44444444-4444-4444-8444-444444444442' THEN
    RAISE EXCEPTION 'an Operator saw a line about someone else''s lead: %', v_relay -> 'facts' -> 'outputs';
  END IF;

  -- Member without the approval grant: states, no approval counts.
  PERFORM set_config('request.jwt.claim.sub', '14141414-1414-4141-8141-141414141414', false);
  SET ROLE authenticated;
  v_summary := public.agent_summary(v_org);
  RESET ROLE;
  IF (v_summary ->> 'waitingTotal')::integer <> 0 THEN
    RAISE EXCEPTION 'a Member without approvals counted approvals: %', v_summary ->> 'waitingTotal';
  END IF;
  IF jsonb_array_length(v_summary -> 'agents') <> 5 THEN
    RAISE EXCEPTION 'a Member did not see the roster';
  END IF;

  -- Another workspace: nothing.
  PERFORM set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);
  SET ROLE authenticated;
  v_denied := false;
  BEGIN
    PERFORM public.agent_summary(v_org);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  SELECT count(*) INTO v_count FROM public.agent_waiting_items WHERE org_id = v_org;
  RESET ROLE;
  IF NOT v_denied OR v_count <> 0 THEN
    RAISE EXCEPTION 'another workspace read the agent summary';
  END IF;

  -- Locked agents return their description only.
  INSERT INTO public.billing_overrides (org_id, entitlement_key, enabled, reason)
  VALUES (v_org, 'agent:scribe', false, 'verify lock');
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;
  v_summary := public.agent_summary(v_org);
  RESET ROLE;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_summary -> 'agents') a
    WHERE a ->> 'id' = 'scribe' AND (a -> 'facts' <> 'null'::jsonb OR (a ->> 'planAllowed')::boolean)
  ) THEN
    RAISE EXCEPTION 'a locked agent returned data';
  END IF;
  DELETE FROM public.billing_overrides WHERE org_id = v_org AND entitlement_key = 'agent:scribe';

  DELETE FROM public.approval_items WHERE org_id = v_org AND agent_id IS NOT NULL;
END
$$;

-- Database cost of the copy: 200 events in a burst.
DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_started timestamptz := clock_timestamp();
  v_ms numeric;
BEGIN
  FOR i IN 1..200 LOOP
    PERFORM public.live_record_copy(jsonb_build_object(
      'kind', 'event', 'action', 'insert', 'workspaceId', v_org, 'occurredAt', clock_timestamp(),
      'row', jsonb_build_object('id', gen_random_uuid(), 'org_id', v_org, 'run_id', 'b1b1b1b1-0000-4000-8000-000000000001',
        'kind', 'step_started', 'label', 'Step ' || i, 'occurred_at', clock_timestamp())));
  END LOOP;
  v_ms := EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000;
  RAISE NOTICE 'live_record_copy: 200 events in % ms (% ms each)', round(v_ms), round(v_ms / 200, 2);
  v_started := clock_timestamp();
  FOR i IN 1..50 LOOP
    PERFORM public.agent_summary_frame(v_org);
  END LOOP;
END
$$;
