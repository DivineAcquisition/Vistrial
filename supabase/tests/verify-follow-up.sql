-- Follow-up drafting: provision, routing bounds, halt, expiry, RLS, outbound body.

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_org_b uuid := '66666666-6666-4666-8666-666666666666';
  v_lead uuid := '44444444-4444-4444-8444-444444444441';
  v_lead_b uuid := '88888888-8888-4888-8888-888888888888';
  v_member uuid := '33333333-3333-4333-8333-333333333333';
  v_call uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  v_draft uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
  v_run uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  v_draft_b uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc6';
  v_n integer;
  v_halted boolean;
  v_quiet boolean;
  v_max integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.follow_up_settings WHERE org_id = v_org;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'org A was not provisioned follow-up settings';
  END IF;

  SELECT sequences_halted, quiet_hours_enabled, max_sequence_length
  INTO v_halted, v_quiet, v_max
  FROM public.follow_up_settings
  WHERE org_id = v_org;

  IF v_halted IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'org-wide sequence stop must default off (exists before any run)';
  END IF;
  IF v_quiet IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'quiet hours must default on';
  END IF;
  IF v_max IS NULL OR v_max < 1 THEN
    RAISE EXCEPTION 'sequence max length cannot be unbounded';
  END IF;

  SELECT count(*) INTO v_n FROM public.org_voice_profiles WHERE org_id = v_org;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'org A was not provisioned a voice profile';
  END IF;

  SELECT count(*) INTO v_n FROM public.follow_up_routing_rules WHERE org_id = v_org;
  IF v_n < 6 THEN
    RAISE EXCEPTION 'default routing rules were not seeded';
  END IF;

  SELECT count(*) INTO v_n FROM public.follow_up_settings WHERE org_id = v_org_b;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'org B was not provisioned follow-up settings on insert';
  END IF;
END
$$;

-- Sequence bounds cannot be removed.
DO $$
BEGIN
  INSERT INTO public.follow_up_sequence_runs (
    org_id, lead_id, call_id, branch, max_steps, max_until
  ) VALUES (
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444441',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'ghost_risk',
    9,
    now() + interval '21 days'
  );
  RAISE EXCEPTION 'unbounded sequence length was allowed';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

DO $$
BEGIN
  INSERT INTO public.follow_up_sequence_runs (
    org_id, lead_id, call_id, branch, max_steps, max_until
  ) VALUES (
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444441',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'ghost_risk',
    NULL,
    now() + interval '21 days'
  );
  RAISE EXCEPTION 'NULL sequence max was allowed';
EXCEPTION
  WHEN not_null_violation OR check_violation THEN
    NULL;
END
$$;

-- Inbound body cannot land on outbound_body.
DO $$
BEGIN
  INSERT INTO public.touches (
    org_id, lead_id, type, channel, direction, summary, outbound_body
  ) VALUES (
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444441',
    'system',
    'sms',
    'inbound',
    'Inbound sms received',
    'secret inbound'
  );
  RAISE EXCEPTION 'inbound outbound_body was allowed';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

INSERT INTO public.calls (
  id, org_id, lead_id, type, outcome, occurred_at, raw_transcript
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'discovery',
  'held',
  now(),
  'Maya: Realistically we are looking at after Q1.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.follow_up_sequence_runs (
  id, org_id, lead_id, call_id, branch, status, max_steps, max_until, next_position
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  'ghost_risk',
  'active',
  3,
  now() + interval '21 days',
  2
);

INSERT INTO public.follow_up_drafts (
  id, org_id, lead_id, call_id, sequence_run_id, sequence_position, branch, channel,
  status, generated_body, edited_body, model_version, expires_at
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
  1,
  'ghost_risk',
  'sms',
  'pending',
  'You said after Q1. Tuesday still work?',
  'You said after Q1. Tuesday still work?',
  'claude-opus-4-6',
  now() + interval '5 days'
);

INSERT INTO public.touches (
  id, org_id, lead_id, type, channel, direction, summary, outbound_body, actor_member_id
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc4',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'human',
  'sms',
  'outbound',
  'Outbound sms sent',
  'You said after Q1. Tuesday still work?',
  '33333333-3333-4333-8333-333333333333'
);

INSERT INTO public.follow_up_drafts (
  org_id, lead_id, call_id, sequence_run_id, sequence_position, branch, channel,
  status, generated_body, edited_body, sent_body, model_version, expires_at,
  approved_at, approved_by_member_id, touch_id, sent_at, edit_distance
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
  1,
  'ghost_risk',
  'sms',
  'sent',
  'You said after Q1. Tuesday still work?',
  'You said after Q1. Tuesday still work?',
  'You said after Q1. Tuesday still work?',
  'claude-opus-4-6',
  now() + interval '5 days',
  now() - interval '1 hour',
  '33333333-3333-4333-8333-333333333333',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc4',
  now() - interval '1 hour',
  0
);

-- Sent without a named approver is rejected.
DO $$
BEGIN
  UPDATE public.follow_up_drafts
  SET status = 'sent', sent_body = generated_body, sent_at = now()
  WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
  RAISE EXCEPTION 'sent without approval was allowed';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

-- Inbound reply halts the sequence immediately and discards pending drafts.
INSERT INTO public.touches (
  org_id, lead_id, type, channel, direction, summary
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'system',
  'sms',
  'inbound',
  'Inbound sms received'
);

DO $$
DECLARE
  v_status public.follow_up_sequence_status;
  v_reason public.follow_up_halt_reason;
  v_draft public.follow_up_draft_status;
  v_replies integer;
BEGIN
  SELECT status, halt_reason INTO v_status, v_reason
  FROM public.follow_up_sequence_runs
  WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  IF v_status <> 'halted' OR v_reason <> 'inbound_reply' THEN
    RAISE EXCEPTION 'inbound did not halt sequence: % %', v_status, v_reason;
  END IF;

  SELECT status INTO v_draft
  FROM public.follow_up_drafts
  WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
  IF v_draft <> 'discarded' THEN
    RAISE EXCEPTION 'inbound did not discard pending draft: %', v_draft;
  END IF;

  SELECT count(*) INTO v_replies
  FROM public.follow_up_reply_signals
  WHERE lead_id = '44444444-4444-4444-8444-444444444441';
  IF v_replies < 1 THEN
    RAISE EXCEPTION 'reply signal was not recorded';
  END IF;
END
$$;

-- Reply table never stores message content.
DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'follow_up_reply_signals'
    AND column_name ILIKE '%body%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'reply signals have a body column';
  END IF;
END
$$;

-- Stale pending drafts expire.
INSERT INTO public.follow_up_drafts (
  org_id, lead_id, call_id, sequence_position, branch, channel,
  status, generated_body, edited_body, model_version, expires_at
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  2,
  'ghost_risk',
  'sms',
  'pending',
  'Day two ping',
  'Day two ping',
  'claude-opus-4-6',
  now() - interval '1 hour'
);

DO $$
DECLARE
  v_n integer;
BEGIN
  PERFORM public.expire_stale_follow_up_drafts();
  SELECT count(*) INTO v_n
  FROM public.follow_up_drafts
  WHERE call_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
    AND sequence_position = 2
    AND status = 'expired';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'stale draft was not expired';
  END IF;
END
$$;

-- Quality failures are queryable by type.
INSERT INTO public.follow_up_quality_check_failures (
  org_id, branch, failure_type, attempt, detail
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'ghost_risk',
  'banned_phrase',
  1,
  'I wanted to reach out'
);

DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.follow_up_quality_check_failures
  WHERE org_id = '22222222-2222-4222-8222-222222222222'
    AND failure_type = 'banned_phrase';
  IF v_n < 1 THEN
    RAISE EXCEPTION 'quality failures are not queryable by type';
  END IF;
END
$$;

-- Org-wide stop.
SELECT public.halt_org_follow_up_sequences(
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);

DO $$
DECLARE
  v_halted boolean;
BEGIN
  SELECT sequences_halted INTO v_halted
  FROM public.follow_up_settings
  WHERE org_id = '22222222-2222-4222-8222-222222222222';
  IF v_halted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'org-wide stop did not flip settings';
  END IF;
END
$$;

-- Booking / closed status halt (new run, since previous was already halted).
UPDATE public.leads
SET status = 'working'
WHERE id = '44444444-4444-4444-8444-444444444441';

INSERT INTO public.follow_up_sequence_runs (
  org_id, lead_id, call_id, branch, status, max_steps, max_until
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  'follow_up_scheduled',
  'active',
  2,
  now() + interval '21 days'
);

UPDATE public.leads
SET status = 'call_booked'
WHERE id = '44444444-4444-4444-8444-444444444441';

DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.follow_up_sequence_runs
  WHERE lead_id = '44444444-4444-4444-8444-444444444441'
    AND status = 'active';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'booking did not halt the active sequence';
  END IF;
END
$$;

-- Cross-org drafts are unreachable.
INSERT INTO public.follow_up_drafts (
  id, org_id, lead_id, call_id, sequence_position, branch, channel,
  status, generated_body, edited_body, model_version, expires_at
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc6',
  '66666666-6666-4666-8666-666666666666',
  '88888888-8888-4888-8888-888888888888',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  1,
  'ghost_risk',
  'sms',
  'pending',
  'org b draft',
  'org b draft',
  'claude-opus-4-6',
  now() + interval '5 days'
);

DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.follow_up_drafts
  WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc6';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'org A user saw org B draft by id';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.follow_up_drafts
  WHERE org_id = '66666666-6666-4666-8666-666666666666';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'org A user listed org B drafts';
  END IF;

  BEGIN
    PERFORM public.halt_org_follow_up_sequences('66666666-6666-4666-8666-666666666666');
    RAISE EXCEPTION 'cross-org sequence stop was allowed';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not authorized%' THEN
        RAISE;
      END IF;
  END;
END
$$;

RESET ROLE;
