-- Prompt 19: managed default, activity log is not updatable, setter cannot
-- write Advanced, halt still works when managed, takeover unlocks, DA writes
-- carry an operator label.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'managed'
  ) THEN
    RAISE EXCEPTION 'organizations.managed is missing';
  END IF;
  IF (SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'managed')
     NOT ILIKE '%true%' THEN
    RAISE EXCEPTION 'managed must default true for DA-installed orgs';
  END IF;
END
$$;

DO $$
DECLARE
  v_relrowsecurity boolean;
  v_upd integer;
  v_n integer;
BEGIN
  SELECT c.relrowsecurity INTO v_relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'settings_activity';
  IF v_relrowsecurity IS NOT TRUE THEN
    RAISE EXCEPTION 'settings_activity must have RLS';
  END IF;

  SELECT count(*) INTO v_upd
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'settings_activity'
    AND cmd IN ('UPDATE', 'DELETE', 'INSERT');
  IF v_upd <> 0 THEN
    RAISE EXCEPTION 'settings_activity must not have insert/update/delete policies';
  END IF;
END
$$;

INSERT INTO public.organizations (id, name, slug, timezone, managed)
VALUES (
  '19191919-1919-4191-8191-000000000019',
  'Managed Settings Org',
  'managed-settings-19',
  'America/New_York',
  true
)
ON CONFLICT (id) DO UPDATE SET managed = true, name = EXCLUDED.name;

INSERT INTO public.score_configs (org_id)
VALUES ('19191919-1919-4191-8191-000000000019')
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.follow_up_settings (org_id)
SELECT '19191919-1919-4191-8191-000000000019'
WHERE NOT EXISTS (
  SELECT 1 FROM public.follow_up_settings WHERE org_id = '19191919-1919-4191-8191-000000000019'
);

INSERT INTO auth.users (id, email)
VALUES (
  '19191919-1919-4191-8191-000000000001',
  'owner-managed-19@vistrial.local'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email, active)
VALUES (
  '19191919-1919-4191-8191-000000000011',
  '19191919-1919-4191-8191-000000000019',
  '19191919-1919-4191-8191-000000000001',
  'owner',
  'Managed Owner',
  'owner-managed-19@vistrial.local',
  true
)
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO auth.users (id, email)
VALUES (
  '19191919-1919-4191-8191-000000000002',
  'setter-managed-19@vistrial.local'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email, active)
VALUES (
  '19191919-1919-4191-8191-000000000012',
  '19191919-1919-4191-8191-000000000019',
  '19191919-1919-4191-8191-000000000002',
  'setter',
  'Managed Setter',
  'setter-managed-19@vistrial.local',
  true
)
ON CONFLICT (org_id, user_id) DO NOTHING;

DO $$
DECLARE
  v_org uuid := '19191919-1919-4191-8191-000000000019';
  v_ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '19191919-1919-4191-8191-000000000002', true);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.save_org_score_config(v_org, 25, 25, 25, 25, 70, 15, 14, 30, 'settings', NULL, 5);
    RESET ROLE;
    RAISE EXCEPTION 'setter must not save scoring';
  EXCEPTION
    WHEN insufficient_privilege OR others THEN
      IF SQLERRM LIKE '%setter must not%' THEN RAISE; END IF;
  END;
  RESET ROLE;
END
$$;

DO $$
DECLARE
  v_org uuid := '19191919-1919-4191-8191-000000000019';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '19191919-1919-4191-8191-000000000001', true);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.save_org_score_config(v_org, 25, 25, 25, 25, 70, 15, 14, 30, 'settings', NULL, 5);
    RESET ROLE;
    RAISE EXCEPTION 'managed owner must not save Advanced scoring';
  EXCEPTION
    WHEN insufficient_privilege OR others THEN
      IF SQLERRM LIKE '%managed owner must not%' THEN RAISE; END IF;
      IF SQLERRM NOT ILIKE '%managed%' AND SQLERRM NOT ILIKE '%not authorized%' THEN
        RESET ROLE;
        RAISE EXCEPTION 'managed owner scoring failed for the wrong reason: %', SQLERRM;
      END IF;
  END;
  RESET ROLE;
END
$$;

DO $$
DECLARE
  v_org uuid := '19191919-1919-4191-8191-000000000019';
  v_halted boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '19191919-1919-4191-8191-000000000001', true);
  SET ROLE authenticated;
  PERFORM public.halt_org_follow_up_sequences(v_org, '19191919-1919-4191-8191-000000000011');
  RESET ROLE;
  SELECT sequences_halted INTO v_halted FROM public.follow_up_settings WHERE org_id = v_org;
  IF v_halted IS NOT TRUE THEN
    RAISE EXCEPTION 'managed client must still be able to halt outbound';
  END IF;
END
$$;

DO $$
DECLARE
  v_org uuid := '19191919-1919-4191-8191-000000000019';
  v_managed boolean;
  v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '19191919-1919-4191-8191-000000000001', true);
  SET ROLE authenticated;
  PERFORM public.take_over_org_management(v_org);
  PERFORM public.save_org_score_config(v_org, 40, 20, 20, 20, 65, 15, 14, 30, 'settings', NULL, 5);
  RESET ROLE;

  SELECT managed INTO v_managed FROM public.organizations WHERE id = v_org;
  IF v_managed IS NOT FALSE THEN
    RAISE EXCEPTION 'takeover must unlock Advanced';
  END IF;

  SELECT count(*) INTO v_n
  FROM public.settings_activity
  WHERE org_id = v_org AND section = 'managed';
  IF v_n < 1 THEN
    RAISE EXCEPTION 'takeover must write the activity log';
  END IF;
END
$$;

DO $$
DECLARE
  v_org uuid := '19191919-1919-4191-8191-000000000019';
  v_id uuid;
  v_label text;
BEGIN
  INSERT INTO public.platform_admins (user_id)
  VALUES ('19191919-1919-4191-8191-000000000001')
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', '19191919-1919-4191-8191-000000000001', true);
  SET ROLE authenticated;
  v_id := public.log_settings_activity(
    v_org,
    'scoring',
    'DA changed ready threshold',
    jsonb_build_object('ready_threshold', 65),
    jsonb_build_object('ready_threshold', 70)
  );
  RESET ROLE;

  SELECT actor_label, actor_kind INTO v_label, v_label
  FROM public.settings_activity WHERE id = v_id;
  IF (SELECT actor_kind FROM public.settings_activity WHERE id = v_id) IS DISTINCT FROM 'da_operator' THEN
    RAISE EXCEPTION 'DA writes must be attributed as da_operator';
  END IF;
  IF (SELECT actor_label FROM public.settings_activity WHERE id = v_id) NOT ILIKE '%DA%' THEN
    RAISE EXCEPTION 'DA writes must name the operator, not land anonymously';
  END IF;

  DELETE FROM public.platform_admins WHERE user_id = '19191919-1919-4191-8191-000000000001';
END
$$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '19191919-1919-4191-8191-000000000001', true);
  SET ROLE authenticated;
  BEGIN
    UPDATE public.organizations
    SET managed = true
    WHERE id = '19191919-1919-4191-8191-000000000019';
    IF FOUND THEN
      RESET ROLE;
      RAISE EXCEPTION 'managed must not change through a direct update';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege OR others THEN
      IF SQLERRM LIKE '%managed must not%' THEN RAISE; END IF;
  END;
  RESET ROLE;
END
$$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '19191919-1919-4191-8191-000000000001', true);
  SET ROLE authenticated;
  BEGIN
    UPDATE public.settings_activity SET action = 'tampered' WHERE org_id = '19191919-1919-4191-8191-000000000019';
    IF FOUND THEN
      RESET ROLE;
      RAISE EXCEPTION 'activity log must not be updatable';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;
END
$$;
