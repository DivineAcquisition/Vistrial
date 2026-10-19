-- Assay scoring checks. Run after migrations, seed, and verify-rls.sql (which
-- creates Org B's owner). The readiness score is retired: its tables are
-- read-only history and Assay never reads them.

-- A Member of Org A without transcript access.
INSERT INTO auth.users (id, email)
VALUES ('14141414-1414-4141-8141-141414141414', 'member-a@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES (
  '15151515-1515-4151-8151-151515151515',
  '22222222-2222-4222-8222-222222222222',
  '14141414-1414-4141-8141-141414141414',
  'member',
  'Org A Member',
  'member-a@vistrial.local'
)
ON CONFLICT (org_id, user_id) DO NOTHING;

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_lead uuid := '44444444-4444-4444-8444-444444444442';
  v_probe uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab1';
  v_count integer;
  v_view jsonb;
  v_denied boolean;
  v_job record;
  v_closed timestamptz;
BEGIN
  -- A score with one call-based reason and one that is not.
  PERFORM public.assay_write_scores(v_org, jsonb_build_array(jsonb_build_object(
    'leadId', v_lead, 'score', 78, 'tier', 'hot', 'early', false, 'contactable', true,
    'raising', jsonb_build_array(
      jsonb_build_object('ruleId', 'booked', 'part', 'engagement', 'text', 'Booked an estimate.', 'impact', 9, 'callBased', false),
      jsonb_build_object('ruleId', 'timeline_30', 'part', 'call', 'text', 'Wants the work done within 30 days.', 'impact', 4, 'callBased', true)
    ),
    'lowering', '[]'::jsonb,
    'rulesVersion', 'averify', 'inputsHash', 'iverify', 'cause', 'event', 'asOf', now())));

  -- Other workspaces cannot see it, by table or by function.
  PERFORM set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.lead_scores WHERE lead_id = v_lead;
  v_denied := false;
  BEGIN
    PERFORM public.assay_lead_score(v_org, v_lead);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'another workspace read a lead score';
  END IF;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'another workspace read a lead score through assay_lead_score';
  END IF;

  -- A Member without transcript access sees the number and tier, not the call-based reason.
  PERFORM set_config('request.jwt.claim.sub', '14141414-1414-4141-8141-141414141414', false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.lead_scores WHERE lead_id = v_lead AND score = 78 AND tier = 'hot';
  v_view := public.assay_lead_score(v_org, v_lead);
  v_denied := false;
  BEGIN
    PERFORM raising FROM public.lead_scores WHERE lead_id = v_lead;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'the member could not see the score and tier';
  END IF;
  IF (v_view ->> 'hiddenCallReasons')::integer <> 1 OR jsonb_array_length(v_view -> 'raising') <> 1
    OR v_view -> 'raising' -> 0 ->> 'ruleId' <> 'booked' THEN
    RAISE EXCEPTION 'call-based reason was not hidden from a person without transcript access: %', v_view;
  END IF;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'reasons were readable straight from the table';
  END IF;

  -- An Operator may see transcripts on the leads they can see, so the call reason shows.
  PERFORM set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);
  SET ROLE authenticated;
  v_view := public.assay_lead_score(v_org, v_lead);
  RESET ROLE;
  IF (v_view ->> 'hiddenCallReasons')::integer <> 0 OR jsonb_array_length(v_view -> 'raising') <> 2 THEN
    RAISE EXCEPTION 'an Operator with transcript access lost a call-based reason: %', v_view;
  END IF;

  -- History is append-only.
  BEGIN
    UPDATE public.lead_score_history SET score = 1 WHERE lead_id = v_lead;
    RAISE EXCEPTION 'score history accepted an update';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'lead_score_history is append-only%' THEN
      RAISE;
    END IF;
  END;

  -- Events queue one pending rescore per lead; repeats coalesce.
  INSERT INTO public.leads (id, org_id, first_name, status) VALUES (v_probe, v_org, 'Queue', 'new');
  INSERT INTO public.touches (org_id, lead_id, type, channel, direction) VALUES (v_org, v_probe, 'system', 'sms', 'inbound');
  INSERT INTO public.touches (org_id, lead_id, type, channel, direction) VALUES (v_org, v_probe, 'system', 'sms', 'inbound');
  SELECT count(*) INTO v_count FROM public.assay_jobs WHERE lead_id = v_probe AND status = 'pending';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one pending rescore for the lead, found %', v_count;
  END IF;
  SELECT * INTO v_job FROM public.assay_jobs WHERE lead_id = v_probe AND status = 'pending';
  IF v_job.silent OR v_job.cause <> 'event' THEN
    RAISE EXCEPTION 'a live event was queued as silent';
  END IF;

  -- A replayed key adds nothing.
  PERFORM public.assay_enqueue(v_org, v_probe, v_job.dedupe_key);
  UPDATE public.assay_jobs SET status = 'done' WHERE id = v_job.id;
  PERFORM public.assay_enqueue(v_org, v_probe, v_job.dedupe_key);
  SELECT count(*) INTO v_count FROM public.assay_jobs WHERE lead_id = v_probe AND status = 'pending';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'a replayed event was queued again';
  END IF;

  -- A lead from a history import is scored silently.
  INSERT INTO public.lead_import_marks (lead_id, org_id) VALUES (v_probe, v_org);
  INSERT INTO public.touches (org_id, lead_id, type, channel, direction) VALUES (v_org, v_probe, 'system', 'sms', 'inbound');
  SELECT * INTO v_job FROM public.assay_jobs WHERE lead_id = v_probe AND status = 'pending';
  IF NOT v_job.silent OR v_job.cause <> 'history_import' THEN
    RAISE EXCEPTION 'a history import event was not queued silently';
  END IF;

  -- closed_at follows the status.
  UPDATE public.leads SET status = 'closed_lost' WHERE id = v_probe;
  SELECT closed_at INTO v_closed FROM public.leads WHERE id = v_probe;
  IF v_closed IS NULL THEN
    RAISE EXCEPTION 'closed_at was not set on close';
  END IF;
  UPDATE public.leads SET status = 'working' WHERE id = v_probe;
  SELECT closed_at INTO v_closed FROM public.leads WHERE id = v_probe;
  IF v_closed IS NOT NULL THEN
    RAISE EXCEPTION 'closed_at was not cleared on reopen';
  END IF;

  -- The retired field maps are frozen.
  INSERT INTO public.score_field_maps (org_id, field_name, factor) VALUES (v_org, 'verify_frozen', 'timeline');
  IF EXISTS (SELECT 1 FROM public.score_field_maps WHERE field_name = 'verify_frozen') THEN
    RAISE EXCEPTION 'score_field_maps accepted a new row';
  END IF;

  -- Assay tasks are a known task source.
  INSERT INTO public.next_actions (org_id, lead_id, action_text, created_by, source_kind, purpose_key)
  VALUES (v_org, v_probe, 'Call today.', 'system', 'assay', 'assay:lead');

  DELETE FROM public.next_actions WHERE lead_id = v_probe;
END
$$;
