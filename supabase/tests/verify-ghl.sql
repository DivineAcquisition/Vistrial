-- GHL ingestion constraints and token-column isolation.

INSERT INTO public.organizations (id, name, slug, ghl_location_id, holdout_percent)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Org Claim A',
  'org-claim-a',
  'ghl_loc_claimed',
  0
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.organizations (id, name, slug, ghl_location_id, holdout_percent)
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'Org Claim B',
      'org-claim-b',
      'ghl_loc_claimed',
      0
    );
    RAISE EXCEPTION 'duplicate ghl_location_id was allowed';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END
$$;

INSERT INTO public.webhook_events (source, event_type, payload, provider_event_id)
VALUES ('ghl', 'ContactCreate', '{"type":"ContactCreate"}'::jsonb, 'evt-dup-1');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.webhook_events (source, event_type, payload, provider_event_id)
    VALUES ('ghl', 'ContactCreate', '{"type":"ContactCreate"}'::jsonb, 'evt-dup-1');
    RAISE EXCEPTION 'duplicate provider_event_id was allowed';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END
$$;

INSERT INTO public.webhook_events (
  source, event_type, payload, status, processed, attempt_count, error_text
)
VALUES (
  'ghl',
  'ContactCreate',
  '{"type":"ContactCreate"}'::jsonb,
  'dead',
  true,
  8,
  'unresolved_org'
);

DO $$
DECLARE
  v_pending integer;
BEGIN
  SELECT count(*) INTO v_pending
  FROM public.webhook_events
  WHERE processed = false AND status = 'dead';
  IF v_pending <> 0 THEN
    RAISE EXCEPTION 'dead events still look unprocessed';
  END IF;
END
$$;

INSERT INTO public.ghl_connections (
  org_id,
  location_id,
  location_name,
  access_token_encrypted,
  refresh_token_encrypted,
  status
)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  'ghl_loc_dev_northstar',
  'Northstar',
  'v1.cipher.access',
  'v1.cipher.refresh',
  'active'
)
ON CONFLICT (org_id) DO NOTHING;

DO $$
DECLARE
  v_has_token boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;

  BEGIN
    PERFORM access_token_encrypted FROM public.ghl_connections LIMIT 1;
    v_has_token := true;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_has_token := false;
  END;

  RESET ROLE;

  IF v_has_token THEN
    RAISE EXCEPTION 'authenticated role could read access_token_encrypted';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;
  PERFORM last_setup_error FROM public.ghl_connections LIMIT 1;
  RESET ROLE;
END
$$;

INSERT INTO public.ghl_field_maps (org_id, ghl_field_id, answer_key)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  'ghl_cf_timeline',
  'timeline'
)
ON CONFLICT DO NOTHING;
