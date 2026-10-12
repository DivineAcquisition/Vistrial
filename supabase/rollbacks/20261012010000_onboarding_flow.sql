-- Rolls back 20261012010000_onboarding_flow.sql.
--
-- Removes the onboarding flow's tables, functions, guards and columns, and puts
-- back the Prompt 2 and Prompt 5 functions it replaced, exactly as they were.
-- Kept on purpose:
--   * the 'onboarding' notification type (Postgres cannot drop an enum value);
--   * organizations.business_address, platform_staff.can_create_workspaces and
--     case_files.depth are dropped, so copy them first if they hold data you
--     want (the block below saves them to vistrial_rollback_keep).
-- Run in one transaction.

BEGIN;

CREATE SCHEMA IF NOT EXISTS vistrial_rollback_keep;
REVOKE ALL ON SCHEMA vistrial_rollback_keep FROM PUBLIC, anon, authenticated;
DROP TABLE IF EXISTS vistrial_rollback_keep.onboarding_flow_20261012;
CREATE TABLE vistrial_rollback_keep.onboarding_flow_20261012 AS
SELECT 'organizations' AS source, id::text AS ref, jsonb_build_object('business_address', business_address) AS data
FROM public.organizations WHERE business_address IS NOT NULL
UNION ALL
SELECT 'workspace_onboarding_status', org_id::text, to_jsonb(w) FROM public.workspace_onboarding_status w
UNION ALL
SELECT 'workspace_onboarding_stages', org_id::text || ':' || stage_key, to_jsonb(s) FROM public.workspace_onboarding_stages s
UNION ALL
SELECT 'onboarding_checkins', id::text, to_jsonb(c) FROM public.onboarding_checkins c
UNION ALL
SELECT 'onboarding_feedback', id::text, to_jsonb(f) FROM public.onboarding_feedback f
UNION ALL
SELECT 'lead_import_marks', lead_id::text, to_jsonb(m) FROM public.lead_import_marks m;

-- Guards and triggers
DROP TRIGGER IF EXISTS organizations_onboarding_sync ON public.organizations;
DROP TRIGGER IF EXISTS organizations_onboarding_init ON public.organizations;
DROP TRIGGER IF EXISTS org_members_link_escalation_contacts ON public.org_members;
DROP TRIGGER IF EXISTS touches_reactivate_historic ON public.touches;
DROP TRIGGER IF EXISTS calls_reactivate_historic ON public.calls;
DROP TRIGGER IF EXISTS approval_items_historic_guard ON public.approval_items;
DROP TRIGGER IF EXISTS notifications_historic_guard ON public.notifications;
DROP TRIGGER IF EXISTS ghl_dispatches_sample_guard ON public.ghl_dispatches;
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sentry_clocks', 'sentry_alerts', 'relay_jobs', 'relay_drafts', 'follow_up_sequence_runs', 'follow_up_drafts'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_historic_guard', t);
    END IF;
  END LOOP;
END $$;

-- Functions added by the onboarding flow
DROP FUNCTION IF EXISTS public.onboarding_queue(text, boolean);
DROP FUNCTION IF EXISTS public.onboarding_case_file_counts(uuid);
DELETE FROM public.staff_saved_views WHERE page = 'onboarding';
ALTER TABLE public.staff_saved_views DROP CONSTRAINT IF EXISTS staff_saved_views_page_check;
ALTER TABLE public.staff_saved_views ADD CONSTRAINT staff_saved_views_page_check
  CHECK (page IN ('roster', 'queue', 'audit', 'data_requests'));
DROP FUNCTION IF EXISTS public.onboarding_customer_view(uuid);
DROP FUNCTION IF EXISTS public.onboarding_refresh(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.onboarding_status_refresh(uuid);
DROP FUNCTION IF EXISTS public.onboarding_compute(uuid);
DROP FUNCTION IF EXISTS public.onboarding_checks_compute(uuid);
DROP FUNCTION IF EXISTS public.onboarding_customer_state(text);
DROP FUNCTION IF EXISTS public.onboarding_stage_href(text);
DROP FUNCTION IF EXISTS public.onboarding_confirm_approach(uuid);
DROP FUNCTION IF EXISTS public.onboarding_request_approach_change(uuid, text);
DROP FUNCTION IF EXISTS public.onboarding_set_team_step(uuid, text);
DROP FUNCTION IF EXISTS public.onboarding_set_channel(uuid, text, boolean, text);
DROP FUNCTION IF EXISTS public.onboarding_request_crm_help(uuid, text);
DROP FUNCTION IF EXISTS public.onboarding_owner_confirm(uuid);
DROP FUNCTION IF EXISTS public.onboarding_member_flag(uuid, text);
DROP FUNCTION IF EXISTS public.onboarding_feedback_submit(uuid, integer, text, uuid);
DROP FUNCTION IF EXISTS public.onboarding_stage_check_version(uuid, text, integer);
DROP FUNCTION IF EXISTS public.onboarding_stage_skip(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.onboarding_stage_reopen(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.onboarding_stage_note(uuid, text, text, text, text, integer);
DROP FUNCTION IF EXISTS public.onboarding_config_review_signoff(uuid, text);
DROP FUNCTION IF EXISTS public.onboarding_accept_warning(uuid, text, text);
DROP FUNCTION IF EXISTS public.onboarding_revoke_acceptance(uuid, text);
DROP FUNCTION IF EXISTS public.onboarding_set_org_status(uuid, public.workspace_status, text);
DROP FUNCTION IF EXISTS public.onboarding_approve_go_live(uuid, text);
DROP FUNCTION IF EXISTS public.onboarding_activate_step(uuid, text, text);
DROP FUNCTION IF EXISTS public.onboarding_sentry_full_on(uuid, text);
DROP FUNCTION IF EXISTS public.onboarding_activation_pause(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.onboarding_move_back(uuid, text, text);
DROP FUNCTION IF EXISTS public.onboarding_resume(uuid, text);
DROP FUNCTION IF EXISTS public.onboarding_checkin_complete(uuid, text, jsonb, timestamptz);
DROP FUNCTION IF EXISTS public.onboarding_stage_definition_save(text, jsonb);
DROP FUNCTION IF EXISTS public.onboarding_settings_save(jsonb);
DROP FUNCTION IF EXISTS public.onboarding_template_defaults_save(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.onboarding_staff_details_save(uuid, jsonb);
DROP FUNCTION IF EXISTS public.set_staff_create_permission(uuid, boolean);
DROP FUNCTION IF EXISTS public.messaging_registration_save(uuid, text, text[], boolean);
DROP FUNCTION IF EXISTS public.messaging_registration_set_status(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.messaging_registration_ein(uuid, boolean);
DROP FUNCTION IF EXISTS public.email_domain_prepare(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.email_domain_ask_team(uuid);
DROP FUNCTION IF EXISTS public.email_domain_record_check(uuid, jsonb, boolean, uuid);
DROP FUNCTION IF EXISTS public.escalation_contacts_save(uuid, jsonb);
DROP FUNCTION IF EXISTS public.escalation_contact_test_sent(uuid);
DROP FUNCTION IF EXISTS public.escalation_contact_confirm(uuid);
DROP FUNCTION IF EXISTS public.escalation_contacts_link_member();
DROP FUNCTION IF EXISTS public.onboarding_import_write(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.onboarding_import_start(uuid, integer);
DROP FUNCTION IF EXISTS public.onboarding_import_control(uuid, text);
DROP FUNCTION IF EXISTS public.onboarding_import_problems_decide_kind(uuid, text, text);
DROP FUNCTION IF EXISTS public.onboarding_import_problem_decide(uuid, text);
DROP FUNCTION IF EXISTS public.lead_reactivate(uuid, text);
DROP FUNCTION IF EXISTS public.lead_import_marks_reactivate_on_activity();
DROP FUNCTION IF EXISTS public.onboarding_guard_lead_row();
DROP FUNCTION IF EXISTS public.onboarding_guard_approval_items();
DROP FUNCTION IF EXISTS public.onboarding_guard_notifications();
DROP FUNCTION IF EXISTS public.ghl_dispatches_sample_guard();
DROP FUNCTION IF EXISTS public.onboarding_sample_cleanup(uuid);
DROP FUNCTION IF EXISTS public.onboarding_sample_confirm(uuid, boolean, uuid);
DROP FUNCTION IF EXISTS public.onboarding_owner_invite(uuid, text, text);
DROP FUNCTION IF EXISTS public.organizations_onboarding_sync();
DROP FUNCTION IF EXISTS public.organizations_onboarding_init();
DROP FUNCTION IF EXISTS public.agent_activation_allows(uuid, text);
DROP FUNCTION IF EXISTS public.lead_is_historic(uuid);
DROP FUNCTION IF EXISTS public.historic_lead_ids(uuid);
DROP FUNCTION IF EXISTS public.onboarding_can_create_workspaces();
DROP FUNCTION IF EXISTS public.onboarding_require_staff(uuid);
DROP FUNCTION IF EXISTS public.onboarding_require_owner_or_staff(uuid);
DROP FUNCTION IF EXISTS public.onboarding_settings();
DROP FUNCTION IF EXISTS public.onboarding_actor_label(uuid);
DROP FUNCTION IF EXISTS public.create_workspace(text, text, text, text, uuid, text, uuid[], text, text, text);

-- Tables
DROP TABLE IF EXISTS public.onboarding_feedback;
DROP TABLE IF EXISTS public.onboarding_checkins;
DROP TABLE IF EXISTS public.onboarding_sample_runs;
DROP TABLE IF EXISTS public.workspace_escalation_contacts;
DROP TABLE IF EXISTS public.email_domain_setup;
DROP TABLE IF EXISTS public.messaging_registration_details;
DROP TABLE IF EXISTS public.onboarding_import_problems;
DROP TABLE IF EXISTS public.lead_import_marks;
DROP TABLE IF EXISTS public.onboarding_import_runs;
DROP TABLE IF EXISTS public.workspace_agent_activation;
DROP TABLE IF EXISTS public.onboarding_member_flags;
DROP TABLE IF EXISTS public.onboarding_reminders;
DROP TABLE IF EXISTS public.onboarding_events;
DROP TABLE IF EXISTS public.onboarding_check_acceptances;
DROP TABLE IF EXISTS public.onboarding_staff_details;
DROP TABLE IF EXISTS public.workspace_onboarding_stages;
DROP TABLE IF EXISTS public.onboarding_template_defaults;
DROP TABLE IF EXISTS public.onboarding_stage_definitions;

-- Columns
ALTER TABLE public.workspace_onboarding_status
  DROP CONSTRAINT IF EXISTS workspace_onboarding_status_phase,
  DROP CONSTRAINT IF EXISTS workspace_onboarding_status_waiting_on,
  DROP CONSTRAINT IF EXISTS workspace_onboarding_status_text_len,
  DROP COLUMN IF EXISTS phase, DROP COLUMN IF EXISTS current_stage, DROP COLUMN IF EXISTS waiting_on,
  DROP COLUMN IF EXISTS waiting_since, DROP COLUMN IF EXISTS stuck, DROP COLUMN IF EXISTS stuck_reason,
  DROP COLUMN IF EXISTS approach_confirmed_at, DROP COLUMN IF EXISTS approach_confirmed_by,
  DROP COLUMN IF EXISTS approach_adjust_requested_at, DROP COLUMN IF EXISTS approach_adjust_note,
  DROP COLUMN IF EXISTS texting_enabled, DROP COLUMN IF EXISTS texting_off_reason, DROP COLUMN IF EXISTS email_enabled,
  DROP COLUMN IF EXISTS email_off_reason, DROP COLUMN IF EXISTS crm_help_requested_at, DROP COLUMN IF EXISTS team_step_state,
  DROP COLUMN IF EXISTS config_review_signed_off_at, DROP COLUMN IF EXISTS config_review_signed_off_by,
  DROP COLUMN IF EXISTS config_review_version, DROP COLUMN IF EXISTS owner_confirmed_at, DROP COLUMN IF EXISTS owner_confirmed_by,
  DROP COLUMN IF EXISTS go_live_approved_at, DROP COLUMN IF EXISTS go_live_approved_by, DROP COLUMN IF EXISTS go_live_approved_by_label,
  DROP COLUMN IF EXISTS activation_paused_at, DROP COLUMN IF EXISTS activation_paused_reason, DROP COLUMN IF EXISTS sentry_watch_until,
  DROP COLUMN IF EXISTS settled_at, DROP COLUMN IF EXISTS paused_reason, DROP COLUMN IF EXISTS checks, DROP COLUMN IF EXISTS checks_at,
  DROP COLUMN IF EXISTS created_at;
DROP INDEX IF EXISTS public.workspace_onboarding_status_phase_idx;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_business_address_len, DROP COLUMN IF EXISTS business_address;
ALTER TABLE public.platform_staff DROP COLUMN IF EXISTS can_create_workspaces;
ALTER TABLE public.case_files DROP CONSTRAINT IF EXISTS case_files_depth, DROP COLUMN IF EXISTS depth;
DELETE FROM public.relay_jobs WHERE trigger = 'sample';
ALTER TABLE public.relay_jobs DROP CONSTRAINT IF EXISTS relay_jobs_trigger_check;
ALTER TABLE public.relay_jobs ADD CONSTRAINT relay_jobs_trigger_check CHECK (trigger IN ('after_call', 'missed_window'));
ALTER TABLE public.staff_support_settings
  DROP CONSTRAINT IF EXISTS staff_support_settings_onboarding,
  DROP COLUMN IF EXISTS onboarding_invite_reminder_days, DROP COLUMN IF EXISTS onboarding_nudge_every_days,
  DROP COLUMN IF EXISTS onboarding_nudge_max_per_step, DROP COLUMN IF EXISTS onboarding_stuck_customer_days,
  DROP COLUMN IF EXISTS onboarding_checkin_days, DROP COLUMN IF EXISTS onboarding_ai_case_file_limit,
  DROP COLUMN IF EXISTS onboarding_ai_rate_per_hour, DROP COLUMN IF EXISTS onboarding_ai_active_days,
  DROP COLUMN IF EXISTS onboarding_max_lookback_days, DROP COLUMN IF EXISTS onboarding_carrier_slow_days;
DELETE FROM public.ops_job_runs WHERE job_name = 'onboarding';
DELETE FROM public.ops_job_catalog WHERE job_name = 'onboarding';

-- Prompt 5's record, as it was
DROP POLICY IF EXISTS workspace_onboarding_status_select ON public.workspace_onboarding_status;
CREATE POLICY workspace_onboarding_status_select ON public.workspace_onboarding_status FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE OR REPLACE FUNCTION public.onboarding_status_compute(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  r public.messaging_readiness%ROWTYPE;
  v_crm text;
  v_members integer;
  v_invites integer;
  v_approvers integer;
  v_steps jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  SELECT * INTO r FROM public.messaging_readiness WHERE org_id = p_org_id;
  SELECT CASE
    WHEN bool_or(c.status = 'active') THEN 'active'
    WHEN bool_or(c.status = 'broken') THEN 'broken'
    WHEN count(*) > 0 THEN 'inactive'
  END INTO v_crm
  FROM public.ghl_connections c WHERE c.org_id = p_org_id;
  SELECT count(*) INTO v_members FROM public.org_members m WHERE m.org_id = p_org_id AND m.active AND m.seat = 'customer';
  SELECT count(*) INTO v_invites FROM public.org_invites i WHERE i.org_id = p_org_id AND i.accepted_at IS NULL AND i.expires_at > now();
  SELECT count(*) INTO v_approvers FROM public.org_members m
    WHERE m.org_id = p_org_id AND m.active AND m.seat = 'customer' AND m.last_seen_at IS NOT NULL
      AND (m.role = 'owner' OR (m.role IN ('member', 'client_viewer') AND m.can_approve));

  v_steps := jsonb_build_array(
    jsonb_build_object('key', 'approach', 'label', 'Choose your approach',
      'state', CASE WHEN o.industry_template_id IS NOT NULL THEN 'done' ELSE 'waiting_on_team' END,
      'why', 'Vistrial starts from a setup made for businesses like yours, so case files and follow-ups use your language.'),
    jsonb_build_object('key', 'crm', 'label', 'Connect your CRM',
      'state', CASE v_crm WHEN 'active' THEN 'done' WHEN 'broken' THEN 'waiting_on_customer' WHEN 'inactive' THEN 'in_progress' ELSE 'waiting_on_customer' END,
      'action', CASE WHEN v_crm IS DISTINCT FROM 'active' THEN jsonb_build_object('label', CASE WHEN v_crm = 'broken' THEN 'Reconnect your CRM' ELSE 'Connect your CRM' END, 'href', '/app/onboarding/connect') END,
      'why', 'Your leads, calls, and bookings come from your CRM. Nothing is written back to it.'),
    jsonb_build_object('key', 'messaging', 'label', 'Connect messaging',
      'state', CASE
        WHEN r.sender_number_confirmed_at IS NOT NULL AND r.sending_domain_confirmed_at IS NOT NULL THEN 'done'
        WHEN r.sender_number_confirmed_at IS NOT NULL OR r.sending_domain_confirmed_at IS NOT NULL THEN 'in_progress'
        ELSE 'waiting_on_team' END,
      'why', 'Your team confirms the number and email address your messages go out from, so drafts match what your CRM sends.'),
    jsonb_build_object('key', 'approvers', 'label', 'Set who approves messages',
      'state', CASE WHEN v_approvers > 0 THEN 'done' ELSE 'waiting_on_customer' END,
      'action', CASE WHEN v_approvers = 0 THEN jsonb_build_object('label', 'Choose approvers', 'href', '/app/settings/members') END,
      'why', 'Every message Vistrial drafts waits for a person to approve it before anyone sends it.'),
    jsonb_build_object('key', 'escalation', 'label', 'Set escalation contacts',
      'state', CASE WHEN NULLIF(btrim(COALESCE(o.owner_contact_phone, '')), '') IS NOT NULL OR NULLIF(btrim(COALESCE(o.owner_contact_email, '')), '') IS NOT NULL THEN 'done' ELSE 'waiting_on_customer' END,
      'action', CASE WHEN NULLIF(btrim(COALESCE(o.owner_contact_phone, '')), '') IS NULL AND NULLIF(btrim(COALESCE(o.owner_contact_email, '')), '') IS NULL THEN jsonb_build_object('label', 'Add a contact', 'href', '/app/settings/organization') END,
      'why', 'When a new lead waits too long, Vistrial needs someone to tell.'),
    jsonb_build_object('key', 'team', 'label', 'Invite your team',
      'state', CASE WHEN v_members > 1 THEN 'done' WHEN v_invites > 0 THEN 'in_progress' ELSE 'waiting_on_customer' END,
      'action', CASE WHEN v_members <= 1 THEN jsonb_build_object('label', 'Invite people', 'href', '/app/settings/members') END,
      'why', 'Setters and closers see their own leads and log what happened on each call.'),
    jsonb_build_object('key', 'test', 'label', 'Test with a sample lead',
      'state', CASE WHEN EXISTS (SELECT 1 FROM public.leads l WHERE l.org_id = p_org_id AND l.is_test) THEN 'done' ELSE 'waiting_on_team' END,
      'why', 'A practice lead shows the whole path, from arrival to case file to a drafted follow-up, before real leads depend on it.'),
    jsonb_build_object('key', 'go_live', 'label', 'Go live',
      'state', CASE WHEN o.status = 'active' THEN 'done' ELSE 'waiting_on_team' END,
      'why', 'Your team switches the workspace on once the steps above are done.')
  );
  RETURN v_steps;
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_status_refresh(p_org_id uuid)
RETURNS public.workspace_onboarding_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.workspace_onboarding_status%ROWTYPE;
  v_steps jsonb;
  v_overrides jsonb;
  v_live boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT overrides INTO v_overrides FROM public.workspace_onboarding_status WHERE org_id = p_org_id;
  v_overrides := COALESCE(v_overrides, '{}'::jsonb);
  SELECT COALESCE(jsonb_agg(
    CASE WHEN v_overrides ? (s->>'key') THEN
      s || jsonb_strip_nulls(jsonb_build_object(
        'state', v_overrides->(s->>'key')->>'state',
        'note', v_overrides->(s->>'key')->>'note',
        'eta', v_overrides->(s->>'key')->>'eta'))
    ELSE s END
  ), '[]'::jsonb) INTO v_steps
  FROM jsonb_array_elements(public.onboarding_status_compute(p_org_id)) s;

  SELECT status = 'active' INTO v_live FROM public.organizations WHERE id = p_org_id;

  INSERT INTO public.workspace_onboarding_status AS w (org_id, steps, overrides, live, went_live_at, refreshed_at, updated_at)
  VALUES (p_org_id, v_steps, v_overrides, COALESCE(v_live, false), CASE WHEN v_live THEN now() END, now(), now())
  ON CONFLICT (org_id) DO UPDATE
    SET steps = EXCLUDED.steps,
        live = EXCLUDED.live,
        went_live_at = CASE WHEN EXCLUDED.live AND w.went_live_at IS NULL THEN now() WHEN NOT EXCLUDED.live THEN NULL ELSE w.went_live_at END,
        live_seen_at = CASE WHEN EXCLUDED.live THEN w.live_seen_at END,
        refreshed_at = now(),
        updated_at = CASE WHEN w.steps IS DISTINCT FROM EXCLUDED.steps OR w.live IS DISTINCT FROM EXCLUDED.live THEN now() ELSE w.updated_at END
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_status_set_step(
  p_org_id uuid,
  p_key text,
  p_state text,
  p_note text DEFAULT NULL,
  p_eta text DEFAULT NULL
)
RETURNS public.workspace_onboarding_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.ws_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF p_key NOT IN ('approach', 'crm', 'messaging', 'approvers', 'escalation', 'team', 'test', 'go_live') THEN
    RAISE EXCEPTION 'Unknown step.' USING ERRCODE = '22023';
  END IF;
  IF p_state IS NOT NULL AND p_state NOT IN ('done', 'in_progress', 'waiting_on_customer', 'waiting_on_team') THEN
    RAISE EXCEPTION 'Unknown state.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.workspace_onboarding_status (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.workspace_onboarding_status
  SET overrides = CASE
    WHEN p_state IS NULL AND NULLIF(btrim(COALESCE(p_note, '')), '') IS NULL AND NULLIF(btrim(COALESCE(p_eta, '')), '') IS NULL THEN overrides - p_key
    ELSE overrides || jsonb_build_object(p_key, jsonb_strip_nulls(jsonb_build_object(
      'state', p_state,
      'note', left(NULLIF(btrim(COALESCE(p_note, '')), ''), 300),
      'eta', left(NULLIF(btrim(COALESCE(p_eta, '')), ''), 80))))
  END
  WHERE org_id = p_org_id;
  PERFORM public.ws_log(p_org_id, 'onboarding.step_updated', 'workspace_onboarding_status', p_org_id::text,
    jsonb_build_object('step', p_key, 'state', p_state), auth.uid());
  RETURN public.onboarding_status_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_live_seen(p_org_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.workspace_onboarding_status SET live_seen_at = now()
  WHERE org_id = p_org_id AND live AND p_org_id IN (SELECT public.user_org_ids());
$$;

REVOKE ALL ON FUNCTION public.onboarding_status_compute(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_status_compute(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.onboarding_status_refresh(uuid), public.onboarding_status_set_step(uuid, text, text, text, text),
  public.onboarding_live_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_status_refresh(uuid), public.onboarding_status_set_step(uuid, text, text, text, text),
  public.onboarding_live_seen(uuid) TO authenticated, service_role;

-- Prompt 2's workspace creation and organizations guard, as they were
CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name text,
  p_timezone text,
  p_slug text DEFAULT NULL,
  p_owner_email text DEFAULT NULL,
  p_template_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_id uuid;
  v_member uuid;
  v_email text := NULLIF(lower(btrim(COALESCE(p_owner_email, ''))), '');
  v_token text;
  v_template_version integer;
  v_ws public.config_layers%ROWTYPE;
BEGIN
  PERFORM public.ws_require_platform_admin();
  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'A workspace name is required.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_timezone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A timezone is required.';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+$' THEN
    RAISE EXCEPTION 'The owner email is not valid.';
  END IF;
  IF p_template_id IS NOT NULL THEN
    SELECT l.version INTO v_template_version
    FROM public.config_templates t
    JOIN public.config_layers l ON l.level = 'template' AND l.template_id = t.id
    WHERE t.id = p_template_id AND t.status = 'active';
    IF v_template_version IS NULL THEN
      RAISE EXCEPTION 'Choose an active template. Drafts and retired templates cannot be used for new workspaces.';
    END IF;
  END IF;

  v_base := trim(both '-' from lower(regexp_replace(COALESCE(NULLIF(btrim(p_slug), ''), v_name), '[^a-zA-Z0-9]+', '-', 'g')));
  IF v_base = '' THEN
    v_base := 'workspace';
  END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  END LOOP;

  INSERT INTO public.organizations (name, slug, timezone, status, owner_contact_email)
  VALUES (v_name, v_slug, btrim(p_timezone), 'onboarding', v_email)
  RETURNING id INTO v_id;

  IF p_template_id IS NOT NULL THEN
    UPDATE public.workspace_config_pins
    SET template_id = p_template_id, template_version = v_template_version
    WHERE org_id = v_id;
  END IF;
  IF v_email IS NOT NULL THEN
    SELECT * INTO v_ws FROM public.config_layers WHERE level = 'workspace' AND org_id = v_id;
    PERFORM public.config_write_layer(v_ws.id,
      v_ws.field_values || jsonb_build_object('identity.primary_contact', jsonb_build_object('email', v_email)),
      ARRAY[]::text[], 'create', 'Owner email from workspace creation.');
  END IF;
  PERFORM public.config_project_workspace(v_id);

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_member
    FROM public.org_members
    WHERE org_id = v_id AND user_id = auth.uid() AND seat = 'staff' AND active;
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    INSERT INTO public.org_invites (org_id, email, role, token, invited_by, expires_at, surface_access)
    VALUES (v_id, v_email, 'owner', v_token, v_member, now() + interval '14 days', 'operator');
  END IF;

  -- The organizations and org_invites audit triggers record the creation and the invite.
  RETURN jsonb_build_object('org_id', v_id, 'slug', v_slug, 'invite_token', v_token);
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace(text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, text, text, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.organizations_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed text[];
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF public.ws_end_user_request() AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Only a Platform Admin can change a workspace''s status.' USING ERRCODE = '42501';
    END IF;
    NEW.status_changed_at := now();
    NEW.status_changed_by := COALESCE(auth.uid(), NEW.status_changed_by);
    NEW.closed_at := CASE WHEN NEW.status = 'closed' THEN COALESCE(NEW.closed_at, now()) END;
    IF NEW.status = 'closed' AND NEW.delete_after IS NULL THEN
      NEW.delete_after := (now() + make_interval(days => NEW.closed_retention_days))::date;
    ELSIF NEW.status <> 'closed' AND OLD.status = 'closed' THEN
      NEW.delete_after := NULL;
    END IF;
  END IF;

  IF current_setting('vistrial.config_projecting', true) = '1' THEN
    RETURN NEW;
  END IF;
  IF NOT public.ws_end_user_request() OR public.ws_is_staff(NEW.id) THEN
    RETURN NEW;
  END IF;

  v_changed := public.ws_changed_columns(to_jsonb(OLD), to_jsonb(NEW));
  IF EXISTS (
    SELECT 1 FROM unnest(v_changed) c
    WHERE c NOT IN ('owner_contact_name', 'owner_contact_email', 'owner_contact_phone')
  ) THEN
    RAISE EXCEPTION 'Owners can change business contact details. Everything else is managed by the Vistrial team.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
