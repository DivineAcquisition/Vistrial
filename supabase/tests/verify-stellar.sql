-- Prompt S1: Stellar foundation RLS.
-- client_viewer sees only its own org's placements; a setter sees only the
-- placement assigned to them; a da_operator has no org_members row anywhere
-- and reaches placements only through the logged RPCs.

DO $$
DECLARE
  v_org_a uuid := 'aaaa1111-1111-4111-8111-111111111111';
  v_org_b uuid := 'bbbb1111-1111-4111-8111-111111111111';
  v_setter_user uuid := 'aaaa2222-2222-4222-8222-222222222221';
  v_client_viewer_user uuid := 'aaaa2222-2222-4222-8222-222222222222';
  v_other_org_setter_user uuid := 'bbbb2222-2222-4222-8222-222222222221';
  v_da_operator_user uuid := 'aaaa3333-3333-4333-8333-333333333331';
  v_setter_member uuid;
  v_other_setter_member uuid;
  v_count integer;
  v_denied boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_setter_user, 'setter-a@stellar.test'),
    (v_client_viewer_user, 'viewer-a@stellar.test'),
    (v_other_org_setter_user, 'setter-b@stellar.test'),
    (v_da_operator_user, 'da@stellar.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (id, name, slug, product, holdout_percent)
  VALUES
    (v_org_a, 'Stellar Test Org A', 'stellar-test-org-a', 'stellar', 0),
    (v_org_b, 'Stellar Test Org B', 'stellar-test-org-b', 'stellar', 0)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.score_configs (org_id) VALUES (v_org_a), (v_org_b)
  ON CONFLICT (org_id) DO NOTHING;

  INSERT INTO public.org_members (org_id, user_id, role, display_name, email)
  VALUES
    (v_org_a, v_setter_user, 'setter', 'Setter A', 'setter-a@stellar.test'),
    (v_org_a, v_client_viewer_user, 'client_viewer', 'Viewer A', 'viewer-a@stellar.test'),
    (v_org_b, v_other_org_setter_user, 'setter', 'Setter B', 'setter-b@stellar.test')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  SELECT id INTO v_setter_member FROM public.org_members
  WHERE org_id = v_org_a AND user_id = v_setter_user;
  SELECT id INTO v_other_setter_member FROM public.org_members
  WHERE org_id = v_org_b AND user_id = v_other_org_setter_user;

  INSERT INTO public.placements (
    org_id, setter_member_id, agreement_status, agreement_signed_at, build_stage
  )
  VALUES
    (v_org_a, v_setter_member, 'signed', now() - interval '10 days', 'testing'),
    (v_org_b, v_other_setter_member, 'draft', NULL, 'getting_set_up')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.stellar_da_operators (user_id) VALUES (v_da_operator_user)
  ON CONFLICT (user_id) DO NOTHING;

  -- client_viewer sees only their own org's placement.
  PERFORM set_config('request.jwt.claim.sub', v_client_viewer_user::text, false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.placements;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'client_viewer should see exactly 1 placement, saw %', v_count;
  END IF;

  -- The setter sees only the placement they are assigned to (same as the
  -- client_viewer check here since there is one placement per org, but
  -- exercises the setter branch of the policy independently).
  PERFORM set_config('request.jwt.claim.sub', v_setter_user::text, false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.placements WHERE org_id = v_org_a;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'setter should see their own assigned placement, saw %', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_setter_user::text, false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.placements WHERE org_id = v_org_b;
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'setter should never see another org''s placement, saw %', v_count;
  END IF;

  -- da_operator has no org_members row anywhere: direct table access sees 0
  -- rows, but the logged RPC returns every active placement.
  PERFORM set_config('request.jwt.claim.sub', v_da_operator_user::text, false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.org_members WHERE user_id = v_da_operator_user;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'da_operator must not hold any org_members row (backdoor membership), found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.placements;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'da_operator direct table access should see 0 rows (no standing membership), saw %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.stellar_da_list_placements();
  IF v_count < 2 THEN
    RESET ROLE;
    RAISE EXCEPTION 'stellar_da_list_placements should return every active placement, saw %', v_count;
  END IF;

  RESET ROLE;

  SELECT count(*) INTO v_count
  FROM public.stellar_da_access_log
  WHERE user_id = v_da_operator_user AND action = 'list' AND resource = 'placements';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'da_operator read via stellar_da_list_placements was not logged';
  END IF;

  -- A non-operator cannot call the DA RPC.
  PERFORM set_config('request.jwt.claim.sub', v_setter_user::text, false);
  SET ROLE authenticated;
  v_denied := false;
  BEGIN
    PERFORM public.stellar_da_list_placements();
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%not authorized%' THEN
        v_denied := true;
      ELSE
        RESET ROLE;
        RAISE;
      END IF;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'a non-operator was able to call stellar_da_list_placements';
  END IF;
END
$$;
