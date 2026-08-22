-- Reconcile the hosted 20260822010000 onboarding objects with the business
-- profile that actually ships.
--
-- 20260822010000 is on the Vistrial project and now in this repo so
-- schema_migrations matches. Its five tables (org_onboarding, golive_runs,
-- activation_events, activation_timestamp_changes, staff_access_log) have no
-- reader in the application. Leaving them next to activation_records would
-- keep two activation histories with only one wired up.
--
-- What stays from that migration, because the rest of the system reads it:
--   * leads.is_test and the queue/reporting filters that honor it
--   * organizations_guard_activated_at / mark_org_activated, so activated_at
--     still cannot be patched by a client UPDATE
--   * the org_invites role check that lets setters and closers be invited
--
-- activate_org and change_activation_timestamp from 20260822120000 already
-- set vistrial.allow_activation_change before they write organizations.

-- ---------------------------------------------------------------------------
-- Drop the unused setup/DA surface
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS organizations_ensure_onboarding ON public.organizations;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_golive_run_fkey;
ALTER TABLE public.leads DROP COLUMN IF EXISTS golive_run_id;

DROP TABLE IF EXISTS public.golive_runs;
DROP TABLE IF EXISTS public.activation_events;
DROP TABLE IF EXISTS public.activation_timestamp_changes;
DROP TABLE IF EXISTS public.staff_access_log;
DROP TABLE IF EXISTS public.org_onboarding;

DROP FUNCTION IF EXISTS public.ensure_org_onboarding();
DROP FUNCTION IF EXISTS public.activate_org(uuid, uuid, text[], boolean, text, text);
DROP FUNCTION IF EXISTS public.change_activation_timestamp(uuid, uuid, text, timestamptz, text);
DROP FUNCTION IF EXISTS public.evaluate_activation_gate(uuid);
DROP FUNCTION IF EXISTS public.load_org_setup_state(uuid);
DROP FUNCTION IF EXISTS public.first_week_health(uuid);
DROP FUNCTION IF EXISTS public.golive_inspect_lead(uuid, uuid);
DROP FUNCTION IF EXISTS public.onboarding_manager_allowed(uuid);
DROP FUNCTION IF EXISTS public.staff_console_allowed();
DROP FUNCTION IF EXISTS public.log_staff_access(text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.staff_org_overview();
DROP FUNCTION IF EXISTS public.create_client_org(text, text, text, text);

DROP TYPE IF EXISTS public.onboarding_step;
DROP TYPE IF EXISTS public.transcript_choice;
DROP TYPE IF EXISTS public.baseline_fallback;
DROP TYPE IF EXISTS public.golive_run_status;

-- ---------------------------------------------------------------------------
-- One activate_org, one change_activation_timestamp, the wired tables exist
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_left text;
  v_count integer;
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

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activation_records'
  ) THEN
    RAISE EXCEPTION 'activation_records is the live activation table and is missing';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'activate_org';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one activate_org, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'change_activation_timestamp';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one change_activation_timestamp, found %', v_count;
  END IF;

  IF to_regprocedure('public.activate_org(uuid, uuid, public.activation_warning[])') IS NULL THEN
    RAISE EXCEPTION 'the wired activate_org(uuid, uuid, activation_warning[]) is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'organizations_guard_activated_at' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'organizations_guard_activated_at must remain so activated_at cannot be patched';
  END IF;
END
$$;
