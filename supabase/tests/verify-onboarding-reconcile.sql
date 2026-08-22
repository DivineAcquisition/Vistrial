-- After every migration, the hosted leftover and the live gate must not
-- coexist. The application reads activation_records, not the five tables
-- 20260822010000 created.

DO $$
DECLARE
  v_left text;
  v_count integer;
  v_args text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_left
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN (
      'org_onboarding',
      'golive_runs',
      'activation_events',
      'activation_timestamp_changes',
      'staff_access_log'
    );
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'orphaned onboarding tables still present: %', v_left;
  END IF;

  IF to_regclass('public.activation_records') IS NULL THEN
    RAISE EXCEPTION 'activation_records missing';
  END IF;
  IF to_regclass('public.activation_changes') IS NULL THEN
    RAISE EXCEPTION 'activation_changes missing';
  END IF;
  IF to_regclass('public.business_profiles') IS NULL THEN
    RAISE EXCEPTION 'business_profiles missing';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'activate_org';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one activate_org, found %', v_count;
  END IF;

  SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'activate_org';
  IF v_args NOT LIKE '%p_acknowledged%activation_warning[]%' THEN
    RAISE EXCEPTION 'activate_org identity is %, not the wired gate', v_args;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (
    'evaluate_activation_gate',
    'load_org_setup_state',
    'first_week_health',
    'log_staff_access',
    'staff_org_overview',
    'create_client_org',
    'ensure_org_onboarding',
    'golive_inspect_lead'
  );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'unused hosted-onboarding functions still present: %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'golive_run_id'
  ) THEN
    RAISE EXCEPTION 'leads.golive_run_id should have been dropped with golive_runs';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'is_test'
  ) THEN
    RAISE EXCEPTION 'leads.is_test must stay; queue and reporting filter on it';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'organizations_guard_activated_at' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'organizations_guard_activated_at was dropped; activated_at can be patched';
  END IF;

  -- A client UPDATE of activated_at is still refused. The RPC is the only door.
  BEGIN
    UPDATE public.organizations
    SET activated_at = now()
    WHERE id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1);
    RAISE EXCEPTION 'a direct UPDATE of activated_at should have been refused';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%activation timestamp changes go through change_activation_timestamp%' THEN
        RAISE;
      END IF;
  END;
END
$$;
