-- Invite table, RLS, and atomic redeem.

INSERT INTO auth.users (id, email)
VALUES
  ('99999999-9999-4999-8999-999999999991', 'setter-a@vistrial.local'),
  ('99999999-9999-4999-8999-999999999992', 'invitee@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (
  id, org_id, user_id, role, display_name, email
)
VALUES (
  '99999999-9999-4999-8999-999999999993',
  '22222222-2222-4222-8222-222222222222',
  '99999999-9999-4999-8999-999999999991',
  'setter',
  'Setter A',
  'setter-a@vistrial.local'
)
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO public.org_invites (
  id, org_id, email, role, token, invited_by, expires_at
)
VALUES (
  '99999999-9999-4999-8999-999999999994',
  '22222222-2222-4222-8222-222222222222',
  'invitee@vistrial.local',
  'closer',
  'token-visible-to-owner-only',
  '33333333-3333-4333-8333-333333333333',
  now() + interval '7 days'
)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_count integer;
  v_result jsonb;
  v_member uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'org_invites' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'org_invites RLS is not enabled';
  END IF;

  -- Owner can read invites for their org.
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.org_invites
  WHERE token = 'token-visible-to-owner-only';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'owner should see the pending invite, got %', v_count;
  END IF;

  RESET ROLE;

  -- Setter cannot read invites.
  PERFORM set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999991', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.org_invites;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'setter saw % org_invites', v_count;
  END IF;

  BEGIN
    INSERT INTO public.org_invites (
      org_id, email, role, token, invited_by, expires_at
    )
    VALUES (
      '22222222-2222-4222-8222-222222222222',
      'blocked@vistrial.local',
      'setter',
      'token-setter-must-not-insert',
      '99999999-9999-4999-8999-999999999993',
      now() + interval '7 days'
    );
    RAISE EXCEPTION 'setter should not insert org_invites';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      NULL;
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'setter should not insert%' THEN
        RAISE;
      END IF;
      -- RLS rejection surfaces as insufficient_privilege or a generic error.
      NULL;
  END;

  RESET ROLE;

  -- Authenticated callers cannot execute redeem_org_invite.
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.redeem_org_invite('token-visible-to-owner-only', '11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'authenticated should not execute redeem_org_invite';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;

  -- Email mismatch is refused.
  v_result := public.redeem_org_invite(
    'token-visible-to-owner-only',
    '11111111-1111-4111-8111-111111111111'
  );
  IF v_result->>'ok' <> 'false' OR v_result->>'error' <> 'email_mismatch' THEN
    RAISE EXCEPTION 'expected email_mismatch, got %', v_result;
  END IF;

  -- Happy path, then a second redeem is rejected.
  v_result := public.redeem_org_invite(
    'token-visible-to-owner-only',
    '99999999-9999-4999-8999-999999999992'
  );
  IF v_result->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'expected successful redeem, got %', v_result;
  END IF;

  SELECT id INTO v_member
  FROM public.org_members
  WHERE user_id = '99999999-9999-4999-8999-999999999992'
    AND org_id = '22222222-2222-4222-8222-222222222222'
    AND active = true
    AND role = 'closer';

  IF v_member IS NULL THEN
    RAISE EXCEPTION 'redeem did not create an active closer membership';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.org_invites
    WHERE token = 'token-visible-to-owner-only' AND accepted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'accepted_at was not stamped';
  END IF;

  v_result := public.redeem_org_invite(
    'token-visible-to-owner-only',
    '99999999-9999-4999-8999-999999999992'
  );
  IF v_result->>'error' <> 'already_accepted' THEN
    RAISE EXCEPTION 'expected already_accepted, got %', v_result;
  END IF;

  -- Expired token.
  INSERT INTO public.org_invites (
    org_id, email, role, token, invited_by, expires_at
  )
  VALUES (
    '22222222-2222-4222-8222-222222222222',
    'invitee@vistrial.local',
    'setter',
    'token-expired',
    '33333333-3333-4333-8333-333333333333',
    now() - interval '1 day'
  );

  v_result := public.redeem_org_invite(
    'token-expired',
    '99999999-9999-4999-8999-999999999992'
  );
  IF v_result->>'error' <> 'expired' THEN
    RAISE EXCEPTION 'expected expired, got %', v_result;
  END IF;
END
$$;

RESET ROLE;
