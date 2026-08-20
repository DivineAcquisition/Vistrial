-- Platform super-admin outranks org isolation without breaking tenant RLS
-- for ordinary owners.

INSERT INTO auth.users (id, email)
VALUES (
  '99999999-9999-4999-8999-999999999999',
  'super-admin@vistrial.local'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.platform_admins (user_id)
VALUES ('99999999-9999-4999-8999-999999999999')
ON CONFLICT (user_id) DO NOTHING;

DO $$
DECLARE
  v_count integer;
  v_denied boolean;
BEGIN
  IF NOT (
    SELECT public.is_platform_admin_user('99999999-9999-4999-8999-999999999999')
  ) THEN
    RAISE EXCEPTION 'is_platform_admin_user should be true for the seeded super admin';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);
  SET ROLE authenticated;

  IF NOT public.is_platform_admin() THEN
    RESET ROLE;
    RAISE EXCEPTION 'is_platform_admin() should be true for the super admin JWT';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.leads
  WHERE org_id = '22222222-2222-4222-8222-222222222222';
  IF v_count = 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'super admin saw zero org A leads';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.leads
  WHERE org_id = '66666666-6666-4666-8666-666666666666';
  IF v_count = 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'super admin saw zero org B leads';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.org_members
  WHERE user_id = '99999999-9999-4999-8999-999999999999'
    AND role = 'owner'
    AND active;
  IF v_count < 2 THEN
    RESET ROLE;
    RAISE EXCEPTION 'super admin should be enrolled as owner in existing orgs, got %', v_count;
  END IF;

  RESET ROLE;

  -- Ordinary org A owner still cannot see org B.
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.leads
  WHERE org_id = '66666666-6666-4666-8666-666666666666';
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'org A owner saw % org B leads after super-admin enroll', v_count;
  END IF;

  -- Demoting a platform admin must fail even when another owner exists.
  v_denied := false;
  BEGIN
    UPDATE public.org_members
    SET role = 'admin'
    WHERE user_id = '99999999-9999-4999-8999-999999999999'
      AND org_id = '22222222-2222-4222-8222-222222222222';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%cannot be demoted%' THEN
        v_denied := true;
      ELSE
        RAISE;
      END IF;
  END;

  IF NOT v_denied THEN
    RAISE EXCEPTION 'platform admin membership was demoted';
  END IF;

  INSERT INTO public.organizations (id, name, slug)
  VALUES (
    'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'Org C',
    'org-c'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO v_count
  FROM public.org_members
  WHERE org_id = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    AND user_id = '99999999-9999-4999-8999-999999999999'
    AND role = 'owner'
    AND active;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'new org did not enroll the platform admin as owner';
  END IF;
END
$$;
