-- Touch ingestion schema: raw bodies, dead letters, generated TTFT, human-without-actor.

INSERT INTO public.webhook_events (
  source, event_type, payload, provider_event_id, raw_body, processed
)
VALUES (
  'ghl',
  'ContactCreate',
  '{"type":"ContactCreate","body":{"redacted":true}}'::jsonb,
  'evt-raw-1',
  '{"type":"ContactCreate","body":"Secret reply about budget"}',
  true
);

DO $$
DECLARE
  v_raw text;
  v_payload jsonb;
BEGIN
  SELECT raw_body, payload INTO v_raw, v_payload
  FROM public.webhook_events
  WHERE provider_event_id = 'evt-raw-1';

  IF v_raw IS DISTINCT FROM '{"type":"ContactCreate","body":"Secret reply about budget"}' THEN
    RAISE EXCEPTION 'raw_body was not stored as the original payload';
  END IF;
  IF v_payload ? 'type' IS NOT TRUE THEN
    RAISE EXCEPTION 'payload jsonb was not stored';
  END IF;
END
$$;

INSERT INTO public.webhook_dead_letters (
  source, reason, event_type, provider_event_id, raw_body, payload
)
VALUES (
  'ghl',
  'malformed_json',
  'unparsed',
  'evt-dead-1',
  'not-json',
  '{"_unparsed":true}'::jsonb
);

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_lead uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10';
  v_event uuid;
  v_seconds integer;
  v_n integer;
  v_run jsonb;
BEGIN
  INSERT INTO public.leads (
    id, org_id, first_name, last_name, status, opted_in_at
  ) VALUES (
    v_lead, v_org, 'Ingest', 'Probe', 'new', now() - interval '10 minutes'
  );

  INSERT INTO public.touches (
    org_id, lead_id, type, channel, direction, occurred_at
  ) VALUES (
    v_org, v_lead, 'human', 'call', 'outbound', now() - interval '4 minutes'
  );

  SELECT time_to_first_human_touch_seconds INTO v_seconds
  FROM public.leads WHERE id = v_lead;

  IF v_seconds IS NULL OR v_seconds < 300 OR v_seconds > 700 THEN
    RAISE EXCEPTION 'generated TTFT seconds out of range: %', v_seconds;
  END IF;

  INSERT INTO public.webhook_events (
    source, event_type, payload, raw_body, processed, received_at
  ) VALUES (
    'ghl',
    'InboundMessage',
    '{"keep":true}'::jsonb,
    '{"type":"InboundMessage","body":"keep this raw"}',
    true,
    now() - interval '20 days'
  )
  RETURNING id INTO v_event;

  INSERT INTO public.webhook_dead_letters (
    webhook_event_id, reason, raw_body
  ) VALUES (
    v_event, 'process_dead', '{"type":"InboundMessage","body":"keep this raw"}'
  );

  BEGIN
    INSERT INTO public.webhook_dead_letters (
      webhook_event_id, reason, raw_body
    ) VALUES (
      v_event, 'process_dead', 'duplicate'
    );
    RAISE EXCEPTION 'duplicate dead letter for the same webhook_event_id was allowed';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  v_run := public.run_data_retention(false);

  SELECT count(*) INTO v_n
  FROM public.webhook_events
  WHERE id = v_event
    AND payload = '{"purged":true}'::jsonb
    AND payload_purged_at IS NOT NULL
    AND raw_body = '{"type":"InboundMessage","body":"keep this raw"}';

  IF v_n <> 1 THEN
    RAISE EXCEPTION 'retention must tombstone payload jsonb and keep raw_body';
  END IF;

  SELECT count(*) INTO v_n
  FROM public.webhook_dead_letters
  WHERE webhook_event_id = v_event
    AND raw_body = '{"type":"InboundMessage","body":"keep this raw"}';

  IF v_n <> 1 THEN
    RAISE EXCEPTION 'dead-letter raw_body was lost during retention';
  END IF;
END
$$;
