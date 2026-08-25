-- Prompt 13 notification schema, RLS, claim RPC, mute expiry.

DO $$
BEGIN
  INSERT INTO public.notifications (
    org_id, event_type, channel, title, body, href, dedupe_key
  ) VALUES (
    NULL, 'job_failure', 'push', 'no', 'no', '/app/ops', 'bad-null-org'
  );
  RAISE EXCEPTION 'org_id null should fail unless channel is da_console';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

INSERT INTO public.notifications (
  org_id, event_type, channel, title, body, href, dedupe_key
) VALUES (
  NULL,
  'job_failure',
  'da_console',
  'reporting aggregation did not run',
  'Staff only. Clients do not see this.',
  '/app/ops',
  'job_failure:test'
);

INSERT INTO public.notifications (
  org_id,
  event_type,
  channel,
  recipient_user_id,
  title,
  body,
  href,
  dedupe_key
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'speed_to_lead',
  'push',
  '12121212-1212-4121-8121-121212121212',
  'Jordan has been waiting 18 minutes',
  'Assigned to you. Open the queue.',
  '/app/queue',
  'speed:setter:test'
);

DO $$
BEGIN
  INSERT INTO public.notification_mutes (org_id, member_id, muted_until, created_at)
  VALUES (
    '22222222-2222-4222-8222-222222222222',
    '13131313-1313-4131-8131-131313131313',
    timestamptz '2020-01-01 00:00:00+00',
    now()
  );
  RAISE EXCEPTION 'mute without a future end should fail';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

INSERT INTO public.notification_mutes (org_id, member_id, muted_until)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '13131313-1313-4131-8131-131313131313',
  now() + interval '2 days'
);

DO $$
DECLARE
  v_count integer;
  v_denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.notifications
  WHERE channel = 'da_console';
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'setter saw % da_console rows', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.notifications
  WHERE dedupe_key = 'speed:setter:test';
  IF v_count <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION 'setter should see their speed-to-lead row';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM public.claim_notification();
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_denied := true;
    WHEN OTHERS THEN
      v_denied := true;
  END;
  IF NOT v_denied THEN
    RESET ROLE;
    RAISE EXCEPTION 'authenticated was allowed to claim_notification';
  END IF;

  RESET ROLE;
END
$$;

DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.notifications
  WHERE channel = 'da_console';
  IF v_count = 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'platform admin should see da_console rows';
  END IF;

  RESET ROLE;
END
$$;

DO $$
DECLARE
  v_id uuid;
BEGIN
  SET ROLE service_role;
  SELECT public.claim_notification() INTO v_id;
  RESET ROLE;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'service_role should claim a queued notification';
  END IF;
END
$$;
