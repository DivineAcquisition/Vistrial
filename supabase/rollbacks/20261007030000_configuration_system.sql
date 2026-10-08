-- Inverse of 20261007030000_configuration_system.sql.
--
-- One transaction. The configuration history is kept as JSON rows in
-- vistrial_rollback_keep (timestamped), the legacy settings rows are restored
-- exactly as they were before the migration (from config_migration_legacy),
-- the four functions the migration replaced get their previous bodies back,
-- and everything the migration added is removed.
--
-- Workspaces created after the migration keep their legacy rows as the
-- projection last wrote them.

BEGIN;

CREATE SCHEMA IF NOT EXISTS vistrial_rollback_keep;
REVOKE ALL ON SCHEMA vistrial_rollback_keep FROM PUBLIC;
DO $$
DECLARE
  v_suffix text := to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS_US');
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['config_templates', 'config_layers', 'config_versions', 'workspace_config_pins',
                           'config_review_notices', 'config_readiness', 'config_migration_legacy'] LOOP
    EXECUTE format('CREATE TABLE vistrial_rollback_keep.%I AS SELECT to_jsonb(x) AS row_data FROM public.%I x', t || '_' || v_suffix, t);
  END LOOP;
END $$;

-- 1. Stop capturing, stamping, and creating configuration before touching legacy rows.
DROP TRIGGER IF EXISTS organizations_config_init ON public.organizations;
DROP TRIGGER IF EXISTS organizations_config_capture ON public.organizations;
DROP TRIGGER IF EXISTS score_configs_config_capture ON public.score_configs;
DROP TRIGGER IF EXISTS follow_up_settings_config_capture ON public.follow_up_settings;
DROP TRIGGER IF EXISTS org_voice_profiles_config_capture ON public.org_voice_profiles;
DROP TRIGGER IF EXISTS approval_gate_settings_config_capture ON public.approval_gate_settings;
DROP TRIGGER IF EXISTS approval_gate_actions_config_capture ON public.approval_gate_actions;
DROP TRIGGER IF EXISTS business_profiles_config_capture ON public.business_profiles;
DROP TRIGGER IF EXISTS config_versions_immutable ON public.config_versions;
DROP TRIGGER IF EXISTS agent_runs_config_stamp ON public.agent_runs;
DROP TRIGGER IF EXISTS operator_runs_config_stamp ON public.operator_runs;
DROP TRIGGER IF EXISTS follow_up_jobs_config_stamp ON public.follow_up_jobs;
DROP TRIGGER IF EXISTS follow_up_drafts_config_stamp ON public.follow_up_drafts;
DROP TRIGGER IF EXISTS extraction_jobs_config_stamp ON public.extraction_jobs;
DROP TRIGGER IF EXISTS call_extractions_config_stamp ON public.call_extractions;
DROP TRIGGER IF EXISTS readiness_scores_config_stamp ON public.readiness_scores;
DROP TRIGGER IF EXISTS ghost_detector_runs_config_stamp ON public.ghost_detector_runs;
DROP TRIGGER IF EXISTS approval_items_config_stamp ON public.approval_items;
DROP TRIGGER IF EXISTS sales_os_messages_config_stamp ON public.sales_os_messages;
DROP TRIGGER IF EXISTS sales_os_executions_config_stamp ON public.sales_os_executions;
DROP TRIGGER IF EXISTS ghl_dispatches_config_stamp ON public.ghl_dispatches;
ALTER TABLE public.agent_runs DROP COLUMN IF EXISTS config_version;
ALTER TABLE public.operator_runs DROP COLUMN IF EXISTS config_version;
ALTER TABLE public.follow_up_jobs DROP COLUMN IF EXISTS config_version;
ALTER TABLE public.follow_up_drafts DROP COLUMN IF EXISTS config_version;
ALTER TABLE public.extraction_jobs DROP COLUMN IF EXISTS config_version;
ALTER TABLE public.call_extractions DROP COLUMN IF EXISTS config_version;
ALTER TABLE public.readiness_scores DROP COLUMN IF EXISTS config_version;
ALTER TABLE public.ghost_detector_runs DROP COLUMN IF EXISTS config_version;
ALTER TABLE public.approval_items DROP COLUMN IF EXISTS config_version;
ALTER TABLE public.sales_os_messages DROP COLUMN IF EXISTS config_version;
ALTER TABLE public.sales_os_executions DROP COLUMN IF EXISTS config_version;
ALTER TABLE public.ghl_dispatches DROP COLUMN IF EXISTS config_version;

-- 2. Restore the legacy settings rows as they were before the migration.
UPDATE public.score_configs s
SET timeline_weight = r.timeline_weight, investment_capacity_weight = r.investment_capacity_weight,
    decision_authority_weight = r.decision_authority_weight, pain_severity_weight = r.pain_severity_weight,
    ready_threshold = r.ready_threshold, speed_to_lead_minutes = r.speed_to_lead_minutes,
    ghost_days_soft = r.ghost_days_soft, ghost_days_hard = r.ghost_days_hard
FROM public.config_migration_legacy l
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.score_configs, l.row_data) r
WHERE l.table_name = 'score_configs' AND l.org_id = s.org_id
  AND (s.timeline_weight, s.investment_capacity_weight, s.decision_authority_weight, s.pain_severity_weight,
       s.ready_threshold, s.speed_to_lead_minutes, s.ghost_days_soft, s.ghost_days_hard)
  IS DISTINCT FROM (r.timeline_weight, r.investment_capacity_weight, r.decision_authority_weight, r.pain_severity_weight,
       r.ready_threshold, r.speed_to_lead_minutes, r.ghost_days_soft, r.ghost_days_hard);

UPDATE public.follow_up_settings s
SET max_sequence_length = r.max_sequence_length, max_sequence_duration_days = r.max_sequence_duration_days,
    draft_stale_days = r.draft_stale_days, quiet_hours_enabled = r.quiet_hours_enabled,
    quiet_hours_start = r.quiet_hours_start, quiet_hours_end = r.quiet_hours_end, updated_at = r.updated_at
FROM public.config_migration_legacy l
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.follow_up_settings, l.row_data) r
WHERE l.table_name = 'follow_up_settings' AND l.org_id = s.org_id
  AND (s.max_sequence_length, s.max_sequence_duration_days, s.draft_stale_days, s.quiet_hours_enabled, s.quiet_hours_start, s.quiet_hours_end)
  IS DISTINCT FROM (r.max_sequence_length, r.max_sequence_duration_days, r.draft_stale_days, r.quiet_hours_enabled, r.quiet_hours_start, r.quiet_hours_end);

UPDATE public.org_voice_profiles s
SET formality = r.formality, use_contractions = r.use_contractions, use_greeting = r.use_greeting, greeting_text = r.greeting_text,
    use_signoff = r.use_signoff, signoff_text = r.signoff_text, sms_max_chars = r.sms_max_chars, email_max_chars = r.email_max_chars,
    emoji_usage = r.emoji_usage, banned_words = r.banned_words, examples = r.examples
FROM public.config_migration_legacy l
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.org_voice_profiles, l.row_data) r
WHERE l.table_name = 'org_voice_profiles' AND l.org_id = s.org_id
  AND (s.formality, s.use_contractions, s.use_greeting, s.greeting_text, s.use_signoff, s.signoff_text,
       s.sms_max_chars, s.email_max_chars, s.emoji_usage, s.banned_words, s.examples)
  IS DISTINCT FROM (r.formality, r.use_contractions, r.use_greeting, r.greeting_text, r.use_signoff, r.signoff_text,
       r.sms_max_chars, r.email_max_chars, r.emoji_usage, r.banned_words, r.examples);

-- Gate rows: the app treated a missing row as "use the defaults". Remove rows
-- the projection created; restore the ones that existed.
DELETE FROM public.approval_gate_settings g
WHERE g.org_id IN (SELECT org_id FROM public.config_migration_legacy WHERE table_name = 'organizations')
  AND NOT EXISTS (SELECT 1 FROM public.config_migration_legacy l WHERE l.table_name = 'approval_gate_settings' AND l.org_id = g.org_id);
UPDATE public.approval_gate_settings s
SET quiet_hours_start = r.quiet_hours_start, quiet_hours_end = r.quiet_hours_end,
    daily_send_limit_per_lead = r.daily_send_limit_per_lead, queue_wait_limit_minutes = r.queue_wait_limit_minutes,
    reviewed_at = r.reviewed_at
FROM public.config_migration_legacy l
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.approval_gate_settings, l.row_data) r
WHERE l.table_name = 'approval_gate_settings' AND l.org_id = s.org_id;

DELETE FROM public.approval_gate_actions a
WHERE a.org_id IN (SELECT org_id FROM public.config_migration_legacy WHERE table_name = 'organizations');
INSERT INTO public.approval_gate_actions
SELECT r.* FROM public.config_migration_legacy l
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.approval_gate_actions, l.row_data) r
WHERE l.table_name = 'approval_gate_actions';

UPDATE public.organizations o
SET timezone = l.row_data ->> 'timezone',
    working_hours_start = (l.row_data ->> 'working_hours_start')::time,
    working_hours_end = (l.row_data ->> 'working_hours_end')::time,
    working_days = ARRAY(SELECT jsonb_array_elements_text(l.row_data -> 'working_days')::smallint),
    transcript_retention_days = (l.row_data ->> 'transcript_retention_days')::int,
    owner_contact_name = l.row_data ->> 'owner_contact_name',
    owner_contact_email = l.row_data ->> 'owner_contact_email',
    owner_contact_phone = l.row_data ->> 'owner_contact_phone'
FROM public.config_migration_legacy l
WHERE l.table_name = 'organizations' AND l.org_id = o.id
  AND (o.timezone, o.working_hours_start, o.working_hours_end, o.working_days, o.transcript_retention_days,
       o.owner_contact_name, o.owner_contact_email, o.owner_contact_phone)
  IS DISTINCT FROM (l.row_data ->> 'timezone', (l.row_data ->> 'working_hours_start')::time, (l.row_data ->> 'working_hours_end')::time,
       ARRAY(SELECT jsonb_array_elements_text(l.row_data -> 'working_days')::smallint), (l.row_data ->> 'transcript_retention_days')::int,
       l.row_data ->> 'owner_contact_name', l.row_data ->> 'owner_contact_email', l.row_data ->> 'owner_contact_phone');

-- 3. The functions the migration replaced, as they were.
DROP FUNCTION IF EXISTS public.create_workspace(text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.ws_guard_staff_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.org_id ELSE NEW.org_id END;
BEGIN
  IF public.ws_end_user_request() AND NOT public.ws_is_staff(v_org) THEN
    RAISE EXCEPTION 'This setting is managed by the Vistrial team.' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.organizations_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_workspace_status(p_org_id uuid, p_status workspace_status, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.ws_require_platform_admin();
  UPDATE public.organizations
  SET status = p_status,
      status_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace not found';
  END IF;
  IF p_status IN ('paused', 'closed') THEN
    PERFORM public.halt_org_follow_up_sequences(p_org_id, NULL);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_workspace(p_name text, p_timezone text, p_slug text DEFAULT NULL::text, p_owner_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_id uuid;
  v_member uuid;
  v_email text := NULLIF(lower(btrim(COALESCE(p_owner_email, ''))), '');
  v_token text;
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
$function$
;

REVOKE ALL ON FUNCTION public.create_workspace(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_workspace_status(uuid, public.workspace_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_workspace_status(uuid, public.workspace_status, text) TO authenticated, service_role;

-- 4. Functions the migration added (before the tables whose row types they use).
DROP FUNCTION IF EXISTS public.config_capture_from_legacy_table();
DROP FUNCTION IF EXISTS public.config_capture_from_organizations();
DROP FUNCTION IF EXISTS public.config_capture_from_profile();
DROP FUNCTION IF EXISTS public.config_capture_legacy(uuid, jsonb, text, text);
DROP FUNCTION IF EXISTS public.config_check_values(config_layers, jsonb, text[]);
DROP FUNCTION IF EXISTS public.config_create_template(text, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.config_decide_notice(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.config_diff(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.config_effective(uuid);
DROP FUNCTION IF EXISTS public.config_effective_at(uuid, integer, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.config_fanout(text, uuid, integer);
DROP FUNCTION IF EXISTS public.config_hours_from_legacy(time without time zone, time without time zone, smallint[]);
DROP FUNCTION IF EXISTS public.config_init_workspace();
DROP FUNCTION IF EXISTS public.config_is_stricter(text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.config_layer_at(uuid, integer);
DROP FUNCTION IF EXISTS public.config_legacy_banned_terms();
DROP FUNCTION IF EXISTS public.config_looks_like_secret(jsonb);
DROP FUNCTION IF EXISTS public.config_missing_required(jsonb, boolean);
DROP FUNCTION IF EXISTS public.config_owner_set_hours(uuid, jsonb, integer);
DROP FUNCTION IF EXISTS public.config_owner_view(uuid);
DROP FUNCTION IF EXISTS public.config_platform_layer();
DROP FUNCTION IF EXISTS public.config_profile_labels();
DROP FUNCTION IF EXISTS public.config_project_workspace(uuid);
DROP FUNCTION IF EXISTS public.config_record_push(text, uuid, integer, jsonb, text);
DROP FUNCTION IF EXISTS public.config_record_readiness(uuid, text, boolean, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.config_require_writer(config_layers);
DROP FUNCTION IF EXISTS public.config_resolve(jsonb, jsonb, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.config_rollback_layer(uuid, integer, text);
DROP FUNCTION IF EXISTS public.config_save_layer(uuid, integer, jsonb, text[], text[], text[], text);
DROP FUNCTION IF EXISTS public.config_seed_platform(jsonb, text[], jsonb, text);
DROP FUNCTION IF EXISTS public.config_seed_template(text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.config_set_auto_accept(uuid, boolean);
DROP FUNCTION IF EXISTS public.config_set_template_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.config_stamp_row();
DROP FUNCTION IF EXISTS public.config_switch_template(uuid, uuid, text[], boolean, text);
DROP FUNCTION IF EXISTS public.config_time_minutes(jsonb);
DROP FUNCTION IF EXISTS public.config_time_text(time without time zone);
DROP FUNCTION IF EXISTS public.config_update_template_details(uuid, text, text);
DROP FUNCTION IF EXISTS public.config_validate_value(text, jsonb);
DROP FUNCTION IF EXISTS public.config_value_empty(text, jsonb);
DROP FUNCTION IF EXISTS public.config_values_from_legacy(uuid);
DROP FUNCTION IF EXISTS public.config_values_from_profile(business_profiles, text[]);
DROP FUNCTION IF EXISTS public.config_version_stamp(uuid);
DROP FUNCTION IF EXISTS public.config_versions_immutable();
DROP FUNCTION IF EXISTS public.config_window_minutes(jsonb);
DROP FUNCTION IF EXISTS public.config_write_layer(uuid, jsonb, text[], text, text, uuid[]);
DROP FUNCTION IF EXISTS public.ws_has_template_access();

-- 5. Tables the migration added (their history was kept above).
DROP TABLE IF EXISTS public.config_review_notices;
DROP TABLE IF EXISTS public.config_readiness;
DROP TABLE IF EXISTS public.workspace_config_pins;
DROP TABLE IF EXISTS public.config_versions;
DROP TABLE IF EXISTS public.config_layers;
DROP TABLE IF EXISTS public.config_templates;
DROP TABLE IF EXISTS public.config_fields;
DROP TABLE IF EXISTS public.config_migration_legacy;

COMMIT;
