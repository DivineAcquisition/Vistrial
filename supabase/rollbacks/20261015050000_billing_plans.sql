-- Inverse of 20261015050000_billing_plans.sql.

DROP TRIGGER IF EXISTS billing_guard_case_file ON public.case_files;
DROP TRIGGER IF EXISTS billing_guard_invite ON public.org_invites;
DROP TRIGGER IF EXISTS billing_on_go_live ON public.workspace_onboarding_status;
DROP TRIGGER IF EXISTS billing_assign_new_workspace ON public.organizations;

DELETE FROM public.ops_job_runs WHERE job_name = 'billing';
DELETE FROM public.ops_job_catalog WHERE job_name = 'billing';

DROP FUNCTION IF EXISTS public.billing_notice(uuid);
DROP FUNCTION IF EXISTS public.billing_public_catalog();
DROP FUNCTION IF EXISTS public.billing_revenue();
DROP FUNCTION IF EXISTS public.billing_screen(uuid);
DROP FUNCTION IF EXISTS public.billing_usage_warnings();
DROP FUNCTION IF EXISTS public.billing_due_notices();
DROP FUNCTION IF EXISTS public.billing_advance(timestamptz);
DROP FUNCTION IF EXISTS public.billing_on_go_live();
DROP FUNCTION IF EXISTS public.billing_note_paid(uuid);
DROP FUNCTION IF EXISTS public.billing_note_failure(uuid);
DROP FUNCTION IF EXISTS public.billing_payment_exception(uuid);
DROP FUNCTION IF EXISTS public.billing_cancel(uuid, text);
DROP FUNCTION IF EXISTS public.billing_pause_workspace(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.billing_pause_path(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.billing_extend_grace(uuid, integer, text);
DROP FUNCTION IF EXISTS public.billing_request_credit(uuid, integer, text, text, uuid);
DROP FUNCTION IF EXISTS public.billing_correct_usage(uuid, text, integer, text);
DROP FUNCTION IF EXISTS public.billing_grant_override(uuid, text, integer, boolean, text, timestamptz);
DROP FUNCTION IF EXISTS public.billing_set_start(uuid, text, date, text);
DROP FUNCTION IF EXISTS public.billing_set_quote(uuid, integer, text, uuid);
DROP FUNCTION IF EXISTS public.billing_assign_plan(uuid, text, text, date);
DROP FUNCTION IF EXISTS public.entitlement_check(uuid, text);
DROP FUNCTION IF EXISTS public.billing_consume(uuid, text, integer, text, text);
DROP FUNCTION IF EXISTS public.billing_guard_case_file();
DROP FUNCTION IF EXISTS public.billing_guard_invite();
DROP FUNCTION IF EXISTS public.billing_assign_new_workspace();
DROP FUNCTION IF EXISTS public.billing_reconcile_compass(uuid);
DROP FUNCTION IF EXISTS public.billing_blocks_cost(uuid);
DROP FUNCTION IF EXISTS public.billing_used(uuid, text);
DROP FUNCTION IF EXISTS public.billing_feature(uuid, text);
DROP FUNCTION IF EXISTS public.billing_limit(uuid, text);
DROP FUNCTION IF EXISTS public.billing_active_admin_count();
DROP FUNCTION IF EXISTS public.billing_require_admin();
DROP FUNCTION IF EXISTS public.billing_write_audit(uuid, text, text, jsonb, boolean);
DROP FUNCTION IF EXISTS public.billing_latest_version(text);
DROP FUNCTION IF EXISTS public.billing_period_end(uuid);
DROP FUNCTION IF EXISTS public.billing_period_start(uuid);
DROP FUNCTION IF EXISTS public.billing_today();
DROP FUNCTION IF EXISTS public.billing_audit_freeze();

DROP TABLE IF EXISTS public.billing_notices;
DROP TABLE IF EXISTS public.billing_audit;
DROP TABLE IF EXISTS public.usage_ledger;
DROP TABLE IF EXISTS public.billing_overrides;
DROP TABLE IF EXISTS public.billing_accounts;
DROP TABLE IF EXISTS public.billing_plan_versions;
DROP TABLE IF EXISTS public.billing_plans;
DROP TABLE IF EXISTS public.billing_settings;
