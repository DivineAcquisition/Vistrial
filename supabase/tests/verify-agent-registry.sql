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
  v_count := public.agent_waiting_count(v_org);
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

-- The sidebar switch, turning agents on and off, Run now, interest, hidden rows, and the registry tools.
INSERT INTO auth.users (id, email)
VALUES ('18181818-1818-4181-8181-181818181818', 'registry-admin@vistrial.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.platform_staff (user_id, role, display_name, email)
VALUES ('18181818-1818-4181-8181-181818181818', 'platform_admin', 'Registry Admin', 'registry-admin@vistrial.local')
ON CONFLICT (user_id) DO NOTHING;

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_owner text := '11111111-1111-4111-8111-111111111111';
  v_admin text := '18181818-1818-4181-8181-181818181818';
  v_out jsonb;
  v_denied boolean;
  v_count integer;
  v_version integer;
BEGIN
  -- Only the Vistrial team flips the sidebar switch.
  PERFORM set_config('request.jwt.claim.sub', v_owner, false);
  SET ROLE authenticated;
  v_denied := false;
  BEGIN
    PERFORM public.set_workspace_flag(v_org, 'agent_sidebar', true);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'an Owner flipped the sidebar switch';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_admin, false);
  SET ROLE authenticated;
  PERFORM public.set_workspace_flag(v_org, 'agent_sidebar', true);
  v_out := public.agent_summary(v_org);
  RESET ROLE;
  IF NOT (v_out ->> 'sidebar')::boolean THEN
    RAISE EXCEPTION 'the summary did not report the sidebar switch';
  END IF;

  -- Staff turn an agent on: it waits for the Owner, and does not run.
  UPDATE public.workspace_agent_activation SET stage = 'off_by_choice' WHERE org_id = v_org AND agent_id = 'relay';
  SET ROLE authenticated;
  v_out := public.agent_set_enabled(v_org, 'relay', true, false);
  RESET ROLE;
  IF v_out ->> 'stage' <> 'pending' THEN
    RAISE EXCEPTION 'a staff enable did not wait for the Owner: %', v_out;
  END IF;
  IF (public.agent_may_run(v_org, 'relay') ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'an agent waiting for the Owner ran';
  END IF;

  -- The Owner confirms, during onboarding they cannot, and once live they can.
  PERFORM set_config('request.jwt.claim.sub', v_owner, false);
  UPDATE public.organizations SET status = 'onboarding' WHERE id = v_org;
  SET ROLE authenticated;
  v_denied := false;
  BEGIN
    PERFORM public.agent_set_enabled(v_org, 'relay', true, false);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  RESET ROLE;
  UPDATE public.organizations SET status = 'active' WHERE id = v_org;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'an Owner turned an agent on before go-live';
  END IF;
  SET ROLE authenticated;
  v_out := public.agent_set_enabled(v_org, 'relay', true, false);
  RESET ROLE;
  IF v_out ->> 'action' <> 'agent.confirmed' OR NOT (public.agent_may_run(v_org, 'relay') ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'the Owner''s confirmation did not turn the agent on: %', v_out;
  END IF;

  -- A locked agent cannot be turned on by any route.
  INSERT INTO public.billing_overrides (org_id, entitlement_key, enabled, reason) VALUES (v_org, 'agent:compass', false, 'verify lock');
  SET ROLE authenticated;
  v_denied := false;
  BEGIN
    PERFORM public.agent_set_enabled(v_org, 'compass', true, false);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  RESET ROLE;
  DELETE FROM public.billing_overrides WHERE org_id = v_org AND entitlement_key = 'agent:compass';
  IF NOT v_denied THEN
    RAISE EXCEPTION 'a locked agent was turned on';
  END IF;

  -- Turning off can withdraw open requests; data is kept either way.
  INSERT INTO public.approval_items (org_id, kind, action_type, title, agent_id)
  VALUES (v_org, 'no_show_rebook', 'no_show_rebook', 'Follow-up for a lead', 'relay');
  SET ROLE authenticated;
  v_out := public.agent_set_enabled(v_org, 'relay', false, true);
  RESET ROLE;
  IF v_out ->> 'stage' <> 'off_by_choice' OR (v_out ->> 'withdrawn')::integer < 1 THEN
    RAISE EXCEPTION 'turning off did not withdraw the open request: %', v_out;
  END IF;
  SELECT count(*) INTO v_count FROM public.approval_items WHERE org_id = v_org AND agent_id = 'relay' AND status = 'withdrawn';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'the withdrawn request was not kept';
  END IF;
  SET ROLE authenticated;
  PERFORM public.agent_set_enabled(v_org, 'relay', true, false);
  RESET ROLE;

  -- Members and Operators cannot turn agents on.
  PERFORM set_config('request.jwt.claim.sub', '14141414-1414-4141-8141-141414141414', false);
  SET ROLE authenticated;
  v_denied := false;
  BEGIN
    PERFORM public.agent_set_enabled(v_org, 'scribe', true, false);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'a Member turned an agent on';
  END IF;

  -- Run now: one per cooldown, a daily cap, and never while paused.
  v_out := public.agent_run_now_claim(v_org, 'assay', v_owner::uuid, 10, 6);
  IF NOT (v_out ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'the first Run now was refused: %', v_out;
  END IF;
  v_out := public.agent_run_now_claim(v_org, 'assay', v_owner::uuid, 10, 6);
  IF v_out ->> 'reason' <> 'cooldown' OR v_out ->> 'availableAt' IS NULL THEN
    RAISE EXCEPTION 'Run now ignored the cooldown: %', v_out;
  END IF;
  UPDATE public.agent_run_now_log SET requested_at = now() - interval '11 minutes' WHERE org_id = v_org AND agent_id = 'assay';
  INSERT INTO public.agent_run_now_log (org_id, agent_id, requested_at)
  SELECT v_org, 'assay', now() - make_interval(mins => 20 + g) FROM generate_series(1, 5) g;
  v_out := public.agent_run_now_claim(v_org, 'assay', v_owner::uuid, 10, 6);
  IF v_out ->> 'reason' <> 'cap' THEN
    RAISE EXCEPTION 'Run now ignored the daily cap: %', v_out;
  END IF;
  PERFORM set_config('vistrial.live_record_replica', 'on', true);
  INSERT INTO public.agent_presence_controls (org_id, agent_id, paused) VALUES (v_org, 'sentry', true)
  ON CONFLICT (org_id, agent_id) DO UPDATE SET paused = true;
  v_out := public.agent_run_now_claim(v_org, 'sentry', v_owner::uuid, 10, 6);
  UPDATE public.agent_presence_controls SET paused = false WHERE org_id = v_org AND agent_id = 'sentry';
  PERFORM set_config('vistrial.live_record_replica', '', true);
  IF v_out ->> 'reason' <> 'paused' THEN
    RAISE EXCEPTION 'Run now went past a pause: %', v_out;
  END IF;

  -- Interest is recorded once, and only the Owner or staff record it.
  PERFORM set_config('request.jwt.claim.sub', v_owner, false);
  SET ROLE authenticated;
  PERFORM public.agent_record_interest(v_org, NULL, 'client_retention', 'notify_me');
  PERFORM public.agent_record_interest(v_org, NULL, 'client_retention', 'notify_me');
  v_out := public.agent_summary(v_org);
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.agent_interest WHERE org_id = v_org AND area_id = 'client_retention';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'interest was recorded % times', v_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_out -> 'areas') a WHERE a ->> 'id' = 'client_retention' AND a -> 'interest' ? 'notify_me'
  ) THEN
    RAISE EXCEPTION 'the summary did not show the recorded interest';
  END IF;

  -- A hidden row is the Owner's own: the agent stays on, and nobody else's view changes.
  SET ROLE authenticated;
  INSERT INTO public.agent_hidden (user_id, org_id, agent_id) VALUES (v_owner::uuid, v_org, 'assay');
  v_out := public.agent_summary(v_org);
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out -> 'agents') a WHERE a ->> 'id' = 'assay' AND (a ->> 'hidden')::boolean) THEN
    RAISE EXCEPTION 'the hidden row was not reported';
  END IF;
  IF NOT (public.agent_may_run(v_org, 'assay') ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'hiding a row stopped the agent';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);
  SET ROLE authenticated;
  v_denied := false;
  BEGIN
    INSERT INTO public.agent_hidden (user_id, org_id, agent_id) VALUES ('12121212-1212-4121-8121-121212121212', v_org, 'relay');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'an Operator hid a row';
  END IF;

  -- Registry tools: Platform Admin only, every save a new version with a note.
  PERFORM set_config('request.jwt.claim.sub', v_owner, false);
  SET ROLE authenticated;
  v_denied := false;
  BEGIN
    PERFORM public.agent_registry_save('relay', '{"name": "Renamed"}'::jsonb, 'not allowed');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'an Owner edited the registry';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_admin, false);
  SET ROLE authenticated;
  v_denied := false;
  BEGIN
    PERFORM public.agent_registry_save('relay', '{"sort": 3}'::jsonb, '');
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  v_version := public.agent_registry_save('relay', '{"sort": 3}'::jsonb, 'Verify a version bump.');
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'a registry edit was saved without a note';
  END IF;
  IF v_version <> 2 OR NOT EXISTS (
    SELECT 1 FROM public.agent_registry_versions WHERE kind = 'agent' AND entry_id = 'relay' AND version = 2 AND note = 'Verify a version bump.'
  ) THEN
    RAISE EXCEPTION 'the registry edit was not versioned: %', v_version;
  END IF;

  -- The sample agent proof: registered as a beta for this workspace only, it
  -- appears in this workspace's summary and nowhere else, and goes when removed.
  SET ROLE authenticated;
  PERFORM public.agent_registry_save('sample_agent', jsonb_build_object(
    'name', 'Sample', 'sublabel', 'Test agent', 'description', 'A sample agent for the registry test.',
    'long_description', 'A sample agent for the registry test.', 'promise', 'It never contacts a lead.',
    'area_id', 'sales', 'availability', 'beta', 'beta_org_ids', jsonb_build_array(v_org), 'included_plans', jsonb_build_array('internal')
  ), 'Sample agent for the registry test.');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_owner, false);
  SET ROLE authenticated;
  v_out := public.agent_summary(v_org);
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out -> 'agents') a WHERE a ->> 'id' = 'sample_agent' AND (a ->> 'inCohort')::boolean) THEN
    RAISE EXCEPTION 'the sample agent did not appear in its beta workspace';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);
  SET ROLE authenticated;
  v_out := public.agent_summary((SELECT o.id FROM public.organizations o JOIN public.org_members m ON m.org_id = o.id
    WHERE m.user_id = '55555555-5555-4555-8555-555555555555' LIMIT 1));
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_out -> 'agents') a WHERE a ->> 'id' = 'sample_agent') THEN
    RAISE EXCEPTION 'the sample agent leaked to another workspace';
  END IF;
  DELETE FROM public.agent_registry_versions WHERE entry_id = 'sample_agent';
  DELETE FROM public.workspace_agent_activation WHERE agent_id = 'sample_agent';
  DELETE FROM public.agent_registry WHERE id = 'sample_agent';
  PERFORM set_config('request.jwt.claim.sub', v_owner, false);
  SET ROLE authenticated;
  v_out := public.agent_summary(v_org);
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_out -> 'agents') a WHERE a ->> 'id' = 'sample_agent') THEN
    RAISE EXCEPTION 'the sample agent stayed after it was removed';
  END IF;

  DELETE FROM public.agent_hidden WHERE org_id = v_org;
  DELETE FROM public.approval_items WHERE org_id = v_org AND agent_id IS NOT NULL;
END
$$;

-- Summary cost on the seeded workspace, as the Owner.
DO $$
DECLARE
  v_started timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;
  v_started := clock_timestamp();
  FOR i IN 1..20 LOOP
    PERFORM public.agent_summary('22222222-2222-4222-8222-222222222222');
  END LOOP;
  RESET ROLE;
  RAISE NOTICE 'agent_summary: % ms each', round(EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000 / 20, 1);
END
$$;
