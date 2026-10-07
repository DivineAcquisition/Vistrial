-- Platform Admins reach every workspace through staff seats, never through
-- owner rows, and ordinary owners stay inside their own workspace.

INSERT INTO auth.users (id, email)
VALUES (
  '99999999-9999-4999-8999-999999999999',
  'super-admin@vistrial.local'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.platform_staff (user_id, role, display_name, email)
VALUES ('99999999-9999-4999-8999-999999999999', 'platform_admin', 'Super Admin', 'super-admin@vistrial.local')
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

  -- A staff seat in every workspace, and never an owner row.
  SELECT count(*) INTO v_count
  FROM public.org_members
  WHERE user_id = '99999999-9999-4999-8999-999999999999'
    AND seat = 'staff' AND role = 'admin' AND active;
  IF v_count < (SELECT count(*) FROM public.organizations) THEN
    RESET ROLE;
    RAISE EXCEPTION 'super admin should hold a staff seat in every workspace, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.org_members
  WHERE user_id = '99999999-9999-4999-8999-999999999999' AND role = 'owner';
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'super admin must not be enrolled as owner anywhere, got %', v_count;
  END IF;

  RESET ROLE;

  -- Ordinary org A owner still cannot see org B.
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.leads
  WHERE org_id = '66666666-6666-4666-8666-666666666666';
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'org A owner saw % org B leads', v_count;
  END IF;

  -- An owner cannot touch a staff seat in their own workspace.
  v_denied := false;
  BEGIN
    UPDATE public.org_members
    SET active = false
    WHERE user_id = '99999999-9999-4999-8999-999999999999'
      AND org_id = '22222222-2222-4222-8222-222222222222';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%managed by the Vistrial team%' THEN
        v_denied := true;
      ELSE
        RESET ROLE;
        RAISE;
      END IF;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'an owner was able to deactivate a staff seat';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', false);

  INSERT INTO public.organizations (id, name, slug, holdout_percent)
  VALUES (
    'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'Org C',
    'org-c',
    0
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO v_count
  FROM public.org_members
  WHERE org_id = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    AND user_id = '99999999-9999-4999-8999-999999999999'
    AND seat = 'staff'
    AND active;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'a new workspace did not seat the platform admin';
  END IF;

  -- Deactivating the platform admin removes every staff seat at once.
  UPDATE public.platform_staff
  SET active = false, deactivated_at = now()
  WHERE user_id = '99999999-9999-4999-8999-999999999999';

  SELECT count(*) INTO v_count
  FROM public.org_members
  WHERE user_id = '99999999-9999-4999-8999-999999999999' AND active;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'deactivated platform admin kept % active seats', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.leads;
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'deactivated platform admin still sees % leads', v_count;
  END IF;

  -- Restore for later checks.
  UPDATE public.platform_staff
  SET active = true, deactivated_at = NULL
  WHERE user_id = '99999999-9999-4999-8999-999999999999';
  PERFORM set_config('request.jwt.claim.sub', '', false);
END
$$;
