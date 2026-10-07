-- Prompt S1 on the workspace model: Stellar placements.
-- A client member sees only their own workspace's placement. A DA-placed
-- setter is Service Team assigned to that workspace and sees its placement
-- through their staff seat. DA operators reach placements only through the
-- logged RPCs, and only for workspaces they are assigned to.

DO $$
DECLARE
  v_org_a uuid := 'aaaa1111-1111-4111-8111-111111111111';
  v_org_b uuid := 'bbbb1111-1111-4111-8111-111111111111';
  v_setter_user uuid := 'aaaa2222-2222-4222-8222-222222222221';
  v_member_user uuid := 'aaaa2222-2222-4222-8222-222222222222';
  v_other_org_setter_user uuid := 'bbbb2222-2222-4222-8222-222222222221';
  v_da_operator_user uuid := 'aaaa3333-3333-4333-8333-333333333331';
  v_unassigned_staff_user uuid := 'aaaa3333-3333-4333-8333-333333333332';
  v_setter_member uuid;
  v_other_setter_member uuid;
  v_count integer;
  v_denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', false);

  INSERT INTO auth.users (id, email) VALUES
    (v_setter_user, 'setter-a@stellar.test'),
    (v_member_user, 'viewer-a@stellar.test'),
    (v_other_org_setter_user, 'setter-b@stellar.test'),
    (v_da_operator_user, 'da@stellar.test'),
    (v_unassigned_staff_user, 'da-unassigned@stellar.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (id, name, slug, product, holdout_percent)
  VALUES
    (v_org_a, 'Stellar Test Org A', 'stellar-test-org-a', 'stellar', 0),
    (v_org_b, 'Stellar Test Org B', 'stellar-test-org-b', 'stellar', 0)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.score_configs (org_id) VALUES (v_org_a), (v_org_b)
  ON CONFLICT (org_id) DO NOTHING;

  INSERT INTO public.org_members (org_id, user_id, role, display_name, email)
  VALUES (v_org_a, v_member_user, 'member', 'Viewer A', 'viewer-a@stellar.test')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  INSERT INTO public.platform_staff (user_id, role, display_name, email) VALUES
    (v_setter_user, 'service_team', 'Setter A', 'setter-a@stellar.test'),
    (v_other_org_setter_user, 'service_team', 'Setter B', 'setter-b@stellar.test'),
    (v_da_operator_user, 'service_team', 'DA Operator', 'da@stellar.test'),
    (v_unassigned_staff_user, 'service_team', 'DA Unassigned', 'da-unassigned@stellar.test')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.workspace_assignments (org_id, user_id) VALUES
    (v_org_a, v_setter_user),
    (v_org_b, v_other_org_setter_user),
    (v_org_a, v_da_operator_user);

  SELECT id INTO v_setter_member FROM public.org_members
  WHERE org_id = v_org_a AND user_id = v_setter_user AND seat = 'staff';
  SELECT id INTO v_other_setter_member FROM public.org_members
  WHERE org_id = v_org_b AND user_id = v_other_org_setter_user AND seat = 'staff';
  IF v_setter_member IS NULL OR v_other_setter_member IS NULL THEN
    RAISE EXCEPTION 'assigning a setter did not create their staff seat';
  END IF;

  INSERT INTO public.placements (
    org_id, setter_member_id, agreement_status, agreement_signed_at, build_stage
  )
  VALUES
    (v_org_a, v_setter_member, 'signed', now() - interval '10 days', 'testing'),
    (v_org_b, v_other_setter_member, 'draft', NULL, 'getting_set_up')
  ON CONFLICT DO NOTHING;

  -- A client member sees only their own workspace's placement.
  PERFORM set_config('request.jwt.claim.sub', v_member_user::text, false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.placements;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'a client member should see exactly 1 placement, saw %', v_count;
  END IF;

  -- The placed setter sees their workspace's placement and never another's.
  PERFORM set_config('request.jwt.claim.sub', v_setter_user::text, false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.placements WHERE org_id = v_org_a;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'setter should see their own workspace''s placement, saw %', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_setter_user::text, false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.placements WHERE org_id = v_org_b;
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'setter should never see another workspace''s placement, saw %', v_count;
  END IF;

  -- The DA operator reaches only assigned workspaces, through the logged RPC.
  PERFORM set_config('request.jwt.claim.sub', v_da_operator_user::text, false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.stellar_da_list_placements();
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'stellar_da_list_placements should return only assigned workspaces, saw %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.stellar_da_access_log
  WHERE user_id = v_da_operator_user AND action = 'list' AND resource = 'placements';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'da operator read via stellar_da_list_placements was not logged';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_da_operator_user::text, false);
  SET ROLE authenticated;
  v_denied := false;
  BEGIN
    PERFORM public.stellar_da_get_placement(v_org_b);
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
    RAISE EXCEPTION 'a da operator read an unassigned workspace''s placement';
  END IF;

  -- Staff with no assignment see nothing at all.
  PERFORM set_config('request.jwt.claim.sub', v_unassigned_staff_user::text, false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.stellar_da_list_placements();
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'unassigned staff listed % placements', v_count;
  END IF;

  -- A customer cannot call the DA RPC.
  PERFORM set_config('request.jwt.claim.sub', v_member_user::text, false);
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
    RAISE EXCEPTION 'a customer was able to call stellar_da_list_placements';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', false);
END
$$;
