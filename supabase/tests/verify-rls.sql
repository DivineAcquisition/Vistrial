-- RLS checks. Requires seed + a second org created below.

INSERT INTO auth.users (id, email)
VALUES (
  '55555555-5555-4555-8555-555555555555',
  'owner-b@vistrial.local'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug)
VALUES (
  '66666666-6666-4666-8666-666666666666',
  'Org B',
  'org-b'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES (
  '77777777-7777-4777-8777-777777777777',
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  'owner',
  'Org B Owner',
  'owner-b@vistrial.local'
)
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO public.leads (id, org_id, first_name, last_name, status)
VALUES (
  '88888888-8888-4888-8888-888888888888',
  '66666666-6666-4666-8666-666666666666',
  'OrgB',
  'Lead',
  'new'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.webhook_events (source, event_type, payload)
VALUES ('ghl', 'contact.create', '{"probe":true}'::jsonb);

DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.leads
  WHERE org_id = '66666666-6666-4666-8666-666666666666';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'org A user saw % org B leads', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.webhook_events;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'authenticated user saw % webhook_events', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.leads
  WHERE org_id = '22222222-2222-4222-8222-222222222222';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'org A user saw zero of their own leads';
  END IF;
END
$$;

RESET ROLE;
