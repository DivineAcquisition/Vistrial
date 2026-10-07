-- Inverse of 20261007020000_workspace_isolation.sql.
--
-- Restores: user_org_ids / user_has_org_role and every guard to their earlier
-- text; platform_admins and stellar_da_operators as tables; Platform Admins as
-- owners in every workspace; each seat's and open invite's original role and
-- surface (from workspace_migration_role_map / _invite_map); the setter and
-- closer lead policies.
--
-- Keeps, on purpose:
--   * Copies of the activity log, the inbound holding area, assignments, and
--     platform staff in schema vistrial_rollback_keep, so a rollback never
--     destroys audit history.
--   * Row-level security on stellar_build_stage_mappings and the revoked anon
--     EXECUTE grants: security fixes, not part of the role model.
--   * The enum values 'member' and 'operator' (Postgres cannot drop enum
--     values). Seats holding them are mapped back to client_viewer and setter.
--   * The settings-tier columns (managed, last_seen_at, sample_preview), which
--     the hosted project had before this migration.

BEGIN;

-- 1. Keep the history.
CREATE SCHEMA IF NOT EXISTS vistrial_rollback_keep;
REVOKE ALL ON SCHEMA vistrial_rollback_keep FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_suffix text := to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS_US');
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workspace_activity_log', 'inbound_event_holds', 'workspace_assignments', 'platform_staff'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      -- One jsonb row per record: readable later, and tied to no type this
      -- rollback drops.
      EXECUTE format('CREATE TABLE vistrial_rollback_keep.%I AS SELECT to_jsonb(r) AS row FROM public.%I r', t || '_' || v_suffix, t);
    END IF;
  END LOOP;
END $$;

-- 2. Policies the migration added.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'ws\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS leads_update_operator ON public.leads;
DROP POLICY IF EXISTS placements_select ON public.placements;
DROP POLICY IF EXISTS approval_gate_changes_select ON public.approval_gate_changes;

-- 3. Triggers the migration added on existing tables.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname, t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
      AND (t.tgname LIKE '%\_ws\_staff\_write' OR t.tgname LIKE '%\_ws\_audit')
  LOOP
    EXECUTE format('DROP TRIGGER %I ON public.%I', r.tgname, r.relname);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS org_members_guard ON public.org_members;
DROP TRIGGER IF EXISTS org_members_audit ON public.org_members;
DROP TRIGGER IF EXISTS org_invites_guard ON public.org_invites;
DROP TRIGGER IF EXISTS org_invites_audit ON public.org_invites;
DROP TRIGGER IF EXISTS organizations_guard ON public.organizations;
DROP TRIGGER IF EXISTS organizations_audit ON public.organizations;
DROP TRIGGER IF EXISTS organizations_seat_platform_admins ON public.organizations;

-- 4. Original function bodies.
-- user_org_ids
CREATE OR REPLACE FUNCTION public.user_org_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT org_id
  FROM public.org_members
  WHERE user_id = auth.uid()
    AND active = true
  UNION
  SELECT id
  FROM public.organizations
  WHERE public.is_platform_admin();
$function$;
-- user_has_org_role
CREATE OR REPLACE FUNCTION public.user_has_org_role(p_org_id uuid, VARIADIC p_roles org_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND active = true
      AND role = ANY (p_roles)
  );
$function$;
-- user_member_id
CREATE OR REPLACE FUNCTION public.user_member_id(p_org_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id
  FROM public.org_members
  WHERE org_id = p_org_id
    AND user_id = auth.uid()
    AND active = true
  LIMIT 1
$function$;
-- is_platform_admin
CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = auth.uid()
  );
$function$;
-- is_platform_admin_user
CREATE OR REPLACE FUNCTION public.is_platform_admin_user(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = p_user_id
  );
$function$;
-- is_stellar_da_operator
CREATE OR REPLACE FUNCTION public.is_stellar_da_operator()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.stellar_da_operators WHERE user_id = auth.uid());
$function$;
-- profile_require_access
CREATE OR REPLACE FUNCTION public.profile_require_access(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  IF NOT public.reporting_caller_allowed(p_org_id) THEN
    RAISE EXCEPTION 'the business profile is owner/admin only' USING ERRCODE = '42501';
  END IF;
END;
$function$;
-- approval_gate_require_owner
CREATE OR REPLACE FUNCTION public.approval_gate_require_owner(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_org_role(p_org_id, 'owner') THEN
    RAISE EXCEPTION 'Only an owner can change approval settings.' USING ERRCODE = '42501';
  END IF;
END;
$function$;
-- redeem_org_invite
CREATE OR REPLACE FUNCTION public.redeem_org_invite(p_token text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite public.org_invites%ROWTYPE;
  v_user_email text;
  v_display_name text;
  v_member_id uuid;
BEGIN
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  SELECT * INTO v_invite
  FROM public.org_invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  IF v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  IF lower(v_invite.email) <> lower(v_user_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  v_display_name := split_part(v_user_email, '@', 1);

  INSERT INTO public.org_members (
    org_id, user_id, role, display_name, email, active, surface_access
  )
  VALUES (
    v_invite.org_id,
    p_user_id,
    v_invite.role,
    v_display_name,
    v_user_email,
    true,
    v_invite.surface_access
  )
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET active = true,
        role = EXCLUDED.role,
        email = EXCLUDED.email,
        surface_access = EXCLUDED.surface_access,
        display_name = CASE
          WHEN public.org_members.display_name = '' THEN EXCLUDED.display_name
          ELSE public.org_members.display_name
        END
  RETURNING id INTO v_member_id;

  UPDATE public.org_invites
  SET accepted_at = now()
  WHERE id = v_invite.id
    AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'member_id', v_member_id,
    'org_id', v_invite.org_id,
    'surface_access', v_invite.surface_access
  );
END;
$function$;
-- agent_run_visible
CREATE OR REPLACE FUNCTION public.agent_run_visible(p_run_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.agent_runs r
    WHERE r.id = p_run_id
      AND r.org_id IN (SELECT public.user_org_ids())
      AND (
        r.actor_user_id = auth.uid()
        OR public.user_has_org_role(r.org_id, 'owner', 'admin')
        OR public.is_platform_admin()
      )
  );
$function$;
-- operator_run_visible
CREATE OR REPLACE FUNCTION public.operator_run_visible(p_run_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.operator_runs r
    WHERE r.id = p_run_id
      AND r.org_id IN (SELECT public.user_org_ids())
      AND (
        r.user_id = auth.uid()
        OR public.user_has_org_role(r.org_id, 'owner', 'admin')
        OR public.is_platform_admin()
      )
  );
$function$;
-- sales_os_conversation_visible
CREATE OR REPLACE FUNCTION public.sales_os_conversation_visible(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales_os_conversations c
    WHERE c.id = p_conversation_id
      AND c.org_id IN (SELECT public.user_org_ids())
      AND (
        c.user_id = auth.uid()
        OR public.user_has_org_role(c.org_id, 'owner', 'admin')
      )
  );
$function$;
-- sales_os_destination_credential
CREATE OR REPLACE FUNCTION public.sales_os_destination_credential(p_destination_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.secret_ciphertext
  FROM public.sales_os_destinations d
  WHERE d.id = p_destination_id
    AND d.active
    AND d.org_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(d.org_id, 'owner', 'admin');
$function$;
-- halt_org_follow_up_sequences
CREATE OR REPLACE FUNCTION public.halt_org_follow_up_sequences(p_org_id uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL
    AND NOT (
      public.user_has_org_role(p_org_id, 'owner', 'admin')
      OR public.is_platform_admin()
    ) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  UPDATE public.follow_up_settings
  SET
    sequences_halted = true,
    sequences_halted_at = now(),
    sequences_halted_by = p_actor
  WHERE org_id = p_org_id;

  UPDATE public.follow_up_sequence_runs
  SET
    status = 'halted',
    halt_reason = 'org_stop',
    halted_at = now(),
    halted_by_member_id = p_actor
  WHERE org_id = p_org_id
    AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.follow_up_jobs j
  SET status = 'dead', last_error = 'sequence_halted:org_stop'
  WHERE j.org_id = p_org_id
    AND j.status = 'pending'
    AND j.sequence_position > 1;

  UPDATE public.follow_up_drafts
  SET
    status = 'discarded',
    discarded_reason = 'org_stop'
  WHERE org_id = p_org_id
    AND status IN ('pending', 'approved', 'expired');

  UPDATE public.ghl_dispatches
  SET
    status = 'failed',
    failure_reason = 'sequence_halted:org_stop',
    body_text = NULL,
    claimed_at = NULL
  WHERE org_id = p_org_id
    AND status = 'queued';

  RETURN v_count;
END;
$function$;
-- mark_approval_gate_reviewed
CREATE OR REPLACE FUNCTION public.mark_approval_gate_reviewed(p_org_id uuid, p_skipped boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor record;
  v_was timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'Only an owner or admin can finish this step.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.approval_gate_settings (org_id) VALUES (p_org_id)
  ON CONFLICT (org_id) DO NOTHING;
  SELECT reviewed_at INTO v_was FROM public.approval_gate_settings WHERE org_id = p_org_id FOR UPDATE;
  IF v_was IS NOT NULL THEN
    RETURN;
  END IF;
  UPDATE public.approval_gate_settings SET reviewed_at = now() WHERE org_id = p_org_id;

  SELECT * INTO v_actor FROM public.approval_gate_actor(p_org_id);
  INSERT INTO public.approval_gate_changes
    (org_id, actor_member_id, actor_user_id, actor_label, action_type, field, from_value, to_value)
  VALUES
    (p_org_id, v_actor.member_id, auth.uid(), v_actor.label, NULL, 'reviewed', NULL,
     CASE WHEN p_skipped THEN 'skipped' ELSE 'saved' END);
END;
$function$;
-- assign_org_lead
CREATE OR REPLACE FUNCTION public.assign_org_lead(p_org_id uuid, p_lead_id uuid, p_setter_id uuid, p_closer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_self uuid;
  v_old_setter uuid;
  v_old_closer uuid;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized to reassign leads';
  END IF;

  v_self := public.user_member_id(p_org_id);

  SELECT assigned_setter_id, assigned_closer_id
  INTO v_old_setter, v_old_closer
  FROM public.leads
  WHERE id = p_lead_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found';
  END IF;

  IF p_setter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE id = p_setter_id AND org_id = p_org_id AND active = true
  ) THEN
    RAISE EXCEPTION 'The setter must be an active member of this workspace.';
  END IF;

  IF p_closer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE id = p_closer_id AND org_id = p_org_id AND active = true
  ) THEN
    RAISE EXCEPTION 'The closer must be an active member of this workspace.';
  END IF;

  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    IF v_self IS NULL THEN
      RAISE EXCEPTION 'not authorized to reassign leads';
    END IF;
    IF p_setter_id IS DISTINCT FROM v_old_setter
      AND p_setter_id IS DISTINCT FROM v_self THEN
      RAISE EXCEPTION 'not authorized to reassign leads';
    END IF;
    IF p_closer_id IS DISTINCT FROM v_old_closer
      AND p_closer_id IS DISTINCT FROM v_self THEN
      RAISE EXCEPTION 'not authorized to reassign leads';
    END IF;
  END IF;

  UPDATE public.leads
  SET
    assigned_setter_id = p_setter_id,
    assigned_closer_id = p_closer_id
  WHERE id = p_lead_id
    AND org_id = p_org_id;
END;
$function$;
-- change_org_lead_status
CREATE OR REPLACE FUNCTION public.change_org_lead_status(p_org_id uuid, p_lead_id uuid, p_status lead_status, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;
  IF p_status = 'closed_won' THEN
    RAISE EXCEPTION 'closed_won follows a recorded payment';
  END IF;

  PERFORM set_config('vistrial.status_source', 'manual', true);
  PERFORM set_config('vistrial.status_note', COALESCE(p_note, ''), true);

  UPDATE public.leads
  SET status = p_status
  WHERE id = p_lead_id
    AND org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found';
  END IF;

  PERFORM set_config('vistrial.status_source', 'event', true);
  PERFORM set_config('vistrial.status_note', '', true);
END;
$function$;
-- load_org_case_timeline
CREATE OR REPLACE FUNCTION public.load_org_case_timeline(p_org_id uuid, p_lead_id uuid, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_rows jsonb;
  v_has_more boolean;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.leads WHERE id = p_lead_id AND org_id = p_org_id
  ) THEN
    RETURN NULL;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  IF p_cursor IS NOT NULL AND jsonb_typeof(p_cursor) = 'object' THEN
    v_cursor_at := NULLIF(p_cursor->>'at', '')::timestamptz;
    v_cursor_id := NULLIF(p_cursor->>'id', '')::uuid;
  END IF;

  SELECT COALESCE(jsonb_agg(page.elem ORDER BY page.at DESC, page.id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT stream.elem, stream.at, stream.id
    FROM (
      SELECT jsonb_build_object(
        'kind', 'touch',
        'id', t.id,
        'at', t.occurred_at,
        'touchType', t.type,
        'channel', t.channel,
        'direction', t.direction,
        'outcome', t.outcome,
        'actorName', actor.display_name,
        'note', t.summary
      ) AS elem,
      t.occurred_at AS at,
      t.id AS id
      FROM public.touches t
      LEFT JOIN public.org_members actor ON actor.id = t.actor_member_id
      WHERE t.org_id = p_org_id AND t.lead_id = p_lead_id

      UNION ALL

      SELECT jsonb_build_object(
        'kind', 'call',
        'id', c.id,
        'at', COALESCE(c.occurred_at, c.scheduled_at, c.created_at),
        'callType', c.type,
        'outcome', c.outcome,
        'actorName', runner.display_name,
        'durationSeconds', c.duration_seconds,
        'scheduledAt', c.scheduled_at,
        'occurredAt', c.occurred_at
      ),
      COALESCE(c.occurred_at, c.scheduled_at, c.created_at),
      c.id
      FROM public.calls c
      LEFT JOIN public.org_members runner ON runner.id = c.ran_by_member_id
      WHERE c.org_id = p_org_id AND c.lead_id = p_lead_id

      UNION ALL

      SELECT jsonb_build_object(
        'kind', 'status',
        'id', s.id,
        'at', s.created_at,
        'fromStatus', s.from_status,
        'toStatus', s.to_status,
        'source', s.source,
        'actorName', actor.display_name,
        'note', s.note,
        'supersedesManual', s.supersedes_manual
      ),
      s.created_at,
      s.id
      FROM (
        SELECT
          sc.*,
          (
            sc.source = 'event'
            AND LAG(sc.source) OVER (ORDER BY sc.created_at, sc.id) = 'manual'
          ) IS TRUE AS supersedes_manual
        FROM public.lead_status_changes sc
        WHERE sc.org_id = p_org_id AND sc.lead_id = p_lead_id
      ) s
      LEFT JOIN public.org_members actor ON actor.id = s.actor_member_id

      UNION ALL

      SELECT jsonb_build_object(
        'kind', 'activity',
        'id', a.id,
        'at', a.occurred_at,
        'category', a.category,
        'activityKind', a.kind,
        'headline', a.headline,
        'actorName', a.actor_label,
        'result', a.result,
        'resultReason', a.result_reason,
        'retryable', a.retryable,
        'retryKind', a.retry_kind,
        'retryId', a.retry_id,
        'detail', a.detail - 'outboundBody' - 'emailSubject' - 'outbound_body'
      ),
      a.occurred_at,
      a.id
      FROM public.activity_stream_source(p_org_id, NULL, NULL) a
      WHERE a.lead_id = p_lead_id
        AND a.kind NOT IN (
          'reply_received',
          'outcome_logged',
          'appointment_booked',
          'appointment_noshow',
          'appointment_rescheduled',
          'appointment_cancelled',
          'call_completed',
          'status_changed',
          'contact_updated',
          'opportunity_updated',
          'webhook_other',
          'ghost_job',
          'job_ran'
        )
    ) stream
    WHERE v_cursor_id IS NULL
      OR (stream.at, stream.id) < (v_cursor_at, v_cursor_id)
    ORDER BY stream.at DESC, stream.id DESC
    LIMIT v_limit + 1
  ) page;

  v_has_more := jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > v_limit;
  IF v_has_more THEN
    SELECT COALESCE(jsonb_agg(elem ORDER BY n), '[]'::jsonb)
    INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(elem, n)
    WHERE n <= v_limit;
  END IF;

  RETURN jsonb_build_object(
    'entries', COALESCE(v_rows, '[]'::jsonb),
    'hasMore', v_has_more
  );
END;
$function$;
-- skip_baseline_backfill
CREATE OR REPLACE FUNCTION public.skip_baseline_backfill(p_org_id uuid, p_member_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run uuid;
  v_status public.baseline_run_status;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);

  SELECT id, status INTO v_run, v_status
  FROM public.baseline_runs
  WHERE org_id = p_org_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_run IS NOT NULL AND v_status IN ('queued', 'running', 'failed') THEN
    UPDATE public.baseline_runs
    SET
      status = 'skipped',
      grade = 'unusable',
      grade_reasons = ARRAY['explicitly skipped by an admin'],
      finished_at = now(),
      triggered_by_member_id = COALESCE(triggered_by_member_id, p_member_id),
      progress = jsonb_build_object('phase', 'skipped')
    WHERE id = v_run;
  ELSE
    INSERT INTO public.baseline_runs (
      org_id, status, grade, grade_reasons, lookback_days,
      window_start, window_end, triggered_by_member_id, finished_at, progress
    )
    SELECT
      p_org_id,
      'skipped',
      'unusable',
      ARRAY['explicitly skipped by an admin'],
      o.baseline_lookback_days,
      now() - make_interval(days => o.baseline_lookback_days),
      now(),
      p_member_id,
      now(),
      jsonb_build_object('phase', 'skipped')
    FROM public.organizations o
    WHERE o.id = p_org_id;
  END IF;

  -- Skipping resolves the backfill. It does not activate. An unusable grade
  -- still has to be answered with stated figures or an explicit decline.
  RETURN (SELECT activated_at FROM public.organizations WHERE id = p_org_id);
END;
$function$;
-- decline_baseline_fallback
CREATE OR REPLACE FUNCTION public.decline_baseline_fallback(p_org_id uuid, p_member_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  INSERT INTO public.baseline_fallback_declines (org_id, declined_by_member_id, note)
  VALUES (p_org_id, p_member_id, nullif(trim(COALESCE(p_note, '')), ''))
  ON CONFLICT (org_id) DO UPDATE
    SET declined_at = now(),
        declined_by_member_id = EXCLUDED.declined_by_member_id,
        note = EXCLUDED.note;
END;
$function$;
-- load_calibration_report
CREATE OR REPLACE FUNCTION public.load_calibration_report(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_holdout jsonb;
  v_all jsonb;
  v_hold jsonb;
  v_cfg public.score_configs%ROWTYPE;
  v_pending jsonb;
  v_voice jsonb;
  v_mature integer;
  v_well boolean;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO v_cfg FROM public.score_configs WHERE org_id = p_org_id;
  v_holdout := public.calibration_holdout_state(p_org_id);
  v_all := public.calibration_band_curve(p_org_id, false);
  v_hold := public.calibration_band_curve(p_org_id, true);
  SELECT count(*)::integer INTO v_mature
  FROM public.calibration_mature_resolved(p_org_id);

  v_well := COALESCE((v_holdout ->> 'enabled')::boolean, false)
    AND NOT COALESCE((v_holdout ->> 'too_small')::boolean, true)
    AND COALESCE((v_hold ->> 'monotonic')::boolean, false)
    AND COALESCE((v_hold ->> 'shown_count')::integer, 0) >= 2;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'kind', s.kind,
    'status', s.status,
    'sample_n', s.sample_n,
    'evidence_sentence', s.evidence_sentence,
    'withheld_reason', s.withheld_reason,
    'payload', s.payload,
    'created_at', s.created_at,
    'applied_at', s.applied_at,
    'applied_by_member_id', s.applied_by_member_id
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  INTO v_pending
  FROM public.calibration_suggestions s
  WHERE s.org_id = p_org_id
    AND s.status IN ('pending', 'withheld')
    AND s.created_at > now() - interval '30 days';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'kind', v.kind,
    'phrase', v.phrase,
    'evidence', v.evidence,
    'status', v.status
  ) ORDER BY v.created_at DESC), '[]'::jsonb)
  INTO v_voice
  FROM public.voice_profile_suggestions v
  WHERE v.org_id = p_org_id AND v.status = 'pending';

  RETURN jsonb_build_object(
    'holdout', v_holdout,
    'mature_resolved_n', COALESCE(v_mature, 0),
    'min_n', public.reporting_diag_min(),
    'current_weights', jsonb_build_object(
      'timeline', v_cfg.timeline_weight,
      'investment_capacity', v_cfg.investment_capacity_weight,
      'decision_authority', v_cfg.decision_authority_weight,
      'pain_severity', v_cfg.pain_severity_weight,
      'ready_threshold', v_cfg.ready_threshold
    ),
    'all_leads_curve', v_all,
    'holdout_curve', v_hold,
    'factor_validity_all', public.calibration_factor_validity(p_org_id, false),
    'factor_validity_holdout', public.calibration_factor_validity(p_org_id, true),
    'threshold', public.calibration_threshold_placement(p_org_id),
    'extraction', public.calibration_extraction_report(p_org_id),
    'drafts', public.calibration_draft_report(p_org_id),
    'cross_client', public.calibration_cross_client_context(p_org_id),
    'suggestions', v_pending,
    'voice_suggestions', v_voice,
    'well_calibrated', v_well,
    'working_plain', CASE
      WHEN v_well THEN
        'The score is lining up with who actually closes on the holdout sample. Leave the weights.'
      ELSE NULL
    END,
    'honesty', 'A higher score among leads that closed is association, not proof the score caused the close.',
    'all_leads_caveat', CASE
      WHEN COALESCE((v_holdout ->> 'too_small')::boolean, true) THEN
        'The all-leads curve is biased by who got called first. It is shown so you can see the distortion. It is not validation.'
      ELSE
        'The gap between the holdout curve and the all-leads curve is how much calling-by-score is shaping the picture.'
    END
  );
END;
$function$;
-- preview_score_config_change
CREATE OR REPLACE FUNCTION public.preview_score_config_change(p_org_id uuid, p_timeline integer, p_investment integer, p_authority integer, p_pain integer, p_threshold integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cur public.score_configs%ROWTYPE;
  v_cross jsonb := '[]'::jsonb;
  v_position jsonb := '[]'::jsonb;
  v_open integer := 0;
  rec record;
  v_new integer;
  v_old_ready boolean;
  v_new_ready boolean;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  IF p_timeline + p_investment + p_authority + p_pain <> 100 THEN
    RAISE EXCEPTION 'weights must add to 100';
  END IF;
  IF p_threshold < 0 OR p_threshold > 100 THEN
    RAISE EXCEPTION 'threshold out of range';
  END IF;
  SELECT * INTO v_cur FROM public.score_configs WHERE org_id = p_org_id;

  FOR rec IN
    SELECT
      l.id,
      COALESCE(NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''), NULLIF(btrim(l.email), ''), 'Unnamed lead') AS name,
      l.current_score,
      l.lead_type,
      l.is_holdout,
      s.timeline_raw,
      s.investment_capacity_raw,
      s.decision_authority_raw,
      s.pain_severity_raw
    FROM public.leads l
    LEFT JOIN LATERAL (
      SELECT timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw
      FROM public.readiness_scores rs
      WHERE rs.lead_id = l.id AND rs.org_id = l.org_id
      ORDER BY rs.created_at DESC, rs.id DESC
      LIMIT 1
    ) s ON true
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.status NOT IN ('closed_won', 'closed_lost', 'ghost')
    ORDER BY l.opted_in_at DESC
  LOOP
    v_open := v_open + 1;
    v_new := public.calibration_recompute_total(
      rec.timeline_raw, rec.investment_capacity_raw, rec.decision_authority_raw, rec.pain_severity_raw,
      p_timeline, p_investment, p_authority, p_pain
    );
    v_old_ready := COALESCE(rec.is_holdout, false)
      OR rec.lead_type = 'ready_track'
      OR (rec.current_score IS NOT NULL AND rec.current_score >= v_cur.ready_threshold);
    v_new_ready := COALESCE(rec.is_holdout, false)
      OR (v_new IS NOT NULL AND v_new >= p_threshold);
    IF v_old_ready IS DISTINCT FROM v_new_ready THEN
      v_cross := v_cross || jsonb_build_array(jsonb_build_object(
        'lead_id', rec.id,
        'name', rec.name,
        'current_score', rec.current_score,
        'proposed_score', v_new,
        'direction', CASE WHEN v_new_ready THEN 'onto_ready' ELSE 'off_ready' END
      ));
    ELSIF v_new IS NOT NULL AND rec.current_score IS NOT NULL AND v_new <> rec.current_score THEN
      v_position := v_position || jsonb_build_array(jsonb_build_object(
        'lead_id', rec.id,
        'name', rec.name,
        'current_score', rec.current_score,
        'proposed_score', v_new
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'open_leads', v_open,
    'threshold_moves', v_cross,
    'threshold_move_count', jsonb_array_length(v_cross),
    'score_moves', v_position,
    'score_move_count', jsonb_array_length(v_position),
    'plain',
      (jsonb_array_length(v_cross))::text
      || ' open leads would move across the ready line. '
      || (jsonb_array_length(v_position))::text
      || ' would change score without crossing it. Existing score history is not rewritten.'
  );
END;
$function$;
-- calibration_cross_client_context
CREATE OR REPLACE FUNCTION public.calibration_cross_client_context(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
  v_min integer := public.benchmark_min_cohort();
  v_rows jsonb;
  v_opted_out boolean;
  v_self_n integer;
  v_self_k integer;
  v_median numeric;
  v_contrast text;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT
    public.profile_cohort_key(p.offer_type, p.price_point_cents, p.monthly_lead_volume),
    p.aggregate_opt_out
  INTO v_key, v_opted_out
  FROM public.business_profiles p
  WHERE p.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metric', b.metric,
    'median_value', b.median_value,
    'org_count', b.org_count,
    'sample_n', b.sample_n
  ) ORDER BY b.metric), '[]'::jsonb)
  INTO v_rows
  FROM public.calibration_benchmarks b
  WHERE b.cohort_key = v_key
    AND b.org_count >= v_min
    AND b.sample_n >= public.reporting_diag_min();

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE r.closed)::integer
  INTO v_self_n, v_self_k
  FROM public.calibration_mature_resolved(p_org_id) r
  WHERE r.is_holdout AND r.score IS NOT NULL;

  SELECT b.median_value INTO v_median
  FROM public.calibration_benchmarks b
  WHERE b.cohort_key = v_key
    AND b.metric = 'holdout_close_rate'
  LIMIT 1;

  IF v_key IS NOT NULL
     AND COALESCE(v_self_n, 0) >= public.reporting_diag_min()
     AND v_median IS NOT NULL
     AND abs((v_self_k::numeric / v_self_n) - v_median) >= 0.10 THEN
    v_contrast :=
      'This workspace''s holdout close rate sits apart from the median of similar businesses. That is context about the market, not a recommendation to change this workspace''s scoring.';
  END IF;

  RETURN jsonb_build_object(
    'opted_out', COALESCE(v_opted_out, false),
    'min_orgs', v_min,
    'rows', v_rows,
    'contrast', v_contrast,
    'plain',
      'Figures from similar businesses are context. They are not a reason to change this workspace''s scoring. Only this workspace''s holdout curve can justify a weight change.'
  );
END;
$function$;
-- org_scoped_row_counts
CREATE OR REPLACE FUNCTION public.org_scoped_row_counts(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_out jsonb := '{}'::jsonb;
  r record;
  v_n bigint;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> 'org_deletion_records'
    ORDER BY 1
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', r.table_name)
      INTO v_n
      USING p_org_id;
    IF v_n > 0 THEN
      v_out := v_out || jsonb_build_object(r.table_name, v_n);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$function$;
-- stellar_da_list_placements
CREATE OR REPLACE FUNCTION public.stellar_da_list_placements()
 RETURNS TABLE(placement_id uuid, org_id uuid, org_name text, setter_member_id uuid, setter_name text, agreement_status placement_agreement_status, build_stage placement_build_stage, build_stage_updated_at timestamp with time zone, started_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_stellar_da_operator() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM public.record_stellar_da_access(NULL, 'list', 'placements');

  RETURN QUERY
  SELECT
    p.id,
    p.org_id,
    o.name,
    p.setter_member_id,
    m.display_name,
    p.agreement_status,
    p.build_stage,
    p.build_stage_updated_at,
    p.started_at
  FROM public.placements p
  JOIN public.organizations o ON o.id = p.org_id
  LEFT JOIN public.org_members m ON m.id = p.setter_member_id
  WHERE p.ended_at IS NULL
    AND o.product IN ('stellar', 'both')
  ORDER BY o.name;
END;
$function$;
-- stellar_da_get_placement
CREATE OR REPLACE FUNCTION public.stellar_da_get_placement(p_org_id uuid)
 RETURNS TABLE(placement_id uuid, org_id uuid, org_name text, setter_member_id uuid, setter_name text, agreement_status placement_agreement_status, agreement_document_url text, agreement_signed_at timestamp with time zone, build_stage placement_build_stage, build_stage_updated_at timestamp with time zone, started_at timestamp with time zone, ended_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_stellar_da_operator() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM public.record_stellar_da_access(p_org_id, 'read', 'placement');

  RETURN QUERY
  SELECT
    p.id,
    p.org_id,
    o.name,
    p.setter_member_id,
    m.display_name,
    p.agreement_status,
    p.agreement_document_url,
    p.agreement_signed_at,
    p.build_stage,
    p.build_stage_updated_at,
    p.started_at,
    p.ended_at
  FROM public.placements p
  JOIN public.organizations o ON o.id = p.org_id
  LEFT JOIN public.org_members m ON m.id = p.setter_member_id
  WHERE p.org_id = p_org_id
  ORDER BY p.started_at DESC;
END;
$function$;
-- enroll_platform_admin_in_orgs
CREATE OR REPLACE FUNCTION public.enroll_platform_admin_in_orgs(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_name text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'platform admin user % does not exist', p_user_id;
  END IF;

  v_name := COALESCE(NULLIF(split_part(v_email, '@', 1), ''), 'Super admin');

  INSERT INTO public.org_members (org_id, user_id, role, display_name, email, active)
  SELECT o.id, p_user_id, 'owner', v_name, v_email, true
  FROM public.organizations o
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET role = 'owner',
        active = true,
        email = EXCLUDED.email;
END;
$function$;
-- enroll_platform_admin_row
CREATE OR REPLACE FUNCTION public.enroll_platform_admin_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.enroll_platform_admin_in_orgs(NEW.user_id);
  RETURN NEW;
END;
$function$;
-- enroll_platform_admins_on_new_org
CREATE OR REPLACE FUNCTION public.enroll_platform_admins_on_new_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin record;
  v_email text;
  v_name text;
BEGIN
  FOR v_admin IN SELECT user_id FROM public.platform_admins LOOP
    SELECT email INTO v_email FROM auth.users WHERE id = v_admin.user_id;
    IF v_email IS NULL THEN
      CONTINUE;
    END IF;
    v_name := COALESCE(NULLIF(split_part(v_email, '@', 1), ''), 'Super admin');
    INSERT INTO public.org_members (org_id, user_id, role, display_name, email, active)
    VALUES (NEW.id, v_admin.user_id, 'owner', v_name, v_email, true)
    ON CONFLICT (org_id, user_id) DO UPDATE
      SET role = 'owner',
          active = true,
          email = EXCLUDED.email;
  END LOOP;
  RETURN NEW;
END;
$function$;
-- protect_platform_admin_membership
CREATE OR REPLACE FUNCTION public.protect_platform_admin_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = NEW.user_id
  ) THEN
    IF NEW.active IS DISTINCT FROM TRUE
      OR NEW.role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Platform admins cannot be demoted or deactivated';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Hosted-project text for the four whose bodies differ from the repo.

CREATE OR REPLACE FUNCTION public.request_jwt_role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    CASE
      WHEN NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NULL THEN 'service_role'
      ELSE 'authenticated'
    END
  );
$function$;

CREATE OR REPLACE FUNCTION public.reporting_caller_allowed(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN auth.uid() IS NOT NULL THEN
        public.user_has_org_role(
          p_org_id,
          VARIADIC ARRAY['owner'::public.org_role, 'admin'::public.org_role]
        )
      ELSE
        COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        OR current_user IN ('postgres', 'service_role', 'supabase_admin')
    END;
$function$;

CREATE OR REPLACE FUNCTION public.org_advanced_writable(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_platform_admin()
    OR (
      public.user_has_org_role(p_org_id, 'owner', 'admin')
      AND EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = p_org_id AND o.managed = false
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.assert_advanced_writable(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.request_jwt_role() = 'service_role' THEN
    RETURN;
  END IF;
  IF public.is_platform_admin() THEN
    RETURN;
  END IF;
  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id AND managed) THEN
    RAISE EXCEPTION 'advanced settings are managed' USING ERRCODE = '42501';
  END IF;
END;
$function$;


-- 5. The activity stream wrapper.
DROP FUNCTION IF EXISTS public.load_org_activity(
  uuid, uuid, uuid, text, text, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb
);
ALTER FUNCTION public.load_org_activity_unguarded(
  uuid, uuid, uuid, text, text, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb
) RENAME TO load_org_activity;
GRANT EXECUTE ON FUNCTION public.load_org_activity(
  uuid, uuid, uuid, text, text, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb
) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.take_over_org_management(uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.take_over_org_management(uuid) TO authenticated;
  END IF;
  IF to_regprocedure('public.owner_delete_org(uuid, text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.owner_delete_org(uuid, text) TO authenticated;
  END IF;
  IF to_regprocedure('public.set_org_managed(uuid, boolean)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.set_org_managed(uuid, boolean) TO authenticated;
  END IF;
END $$;

-- 6. Seats and invites back to their original roles.
ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_seat_role_check;
ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_can_approve_member_only;
ALTER TABLE public.org_invites DROP CONSTRAINT IF EXISTS org_invites_role_invitable;

UPDATE public.org_members m
SET role = r.old_role, surface_access = r.old_surface_access, active = r.old_active
FROM public.workspace_migration_role_map r
WHERE r.member_id = m.id;

-- Seats created after the migration. Platform Admins were owners everywhere;
-- other staff seats have no earlier meaning and go inactive; new customer
-- roles map to their nearest earlier equivalent.
UPDATE public.org_members m
SET role = 'owner', active = true
FROM public.platform_staff ps
WHERE ps.user_id = m.user_id AND ps.role = 'platform_admin'
  AND NOT EXISTS (SELECT 1 FROM public.workspace_migration_role_map r WHERE r.member_id = m.id);
UPDATE public.org_members m
SET active = false
WHERE m.seat = 'staff' AND m.role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM public.workspace_migration_role_map r WHERE r.member_id = m.id);
UPDATE public.org_members SET role = 'client_viewer' WHERE role = 'member';
UPDATE public.org_members SET role = 'setter' WHERE role = 'operator';
UPDATE public.org_members SET surface_access = 'operator'
WHERE surface_access = 'portal' AND role NOT IN ('owner', 'admin');

UPDATE public.org_invites i SET role = r.old_role
FROM public.workspace_migration_invite_map r WHERE r.invite_id = i.id;
UPDATE public.org_invites SET role = 'admin' WHERE role IN ('owner', 'member', 'client_viewer');
UPDATE public.org_invites SET role = 'setter' WHERE role = 'operator';
UPDATE public.org_invites SET surface_access = 'operator'
WHERE surface_access = 'portal' AND role <> 'admin';

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_portal_role_check
  CHECK (surface_access = 'operator' OR role IN ('owner'::public.org_role, 'admin'::public.org_role));
ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_role_invitable
  CHECK (role = ANY (ARRAY['admin', 'closer', 'setter']::public.org_role[]));
ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_portal_role_check
  CHECK (surface_access = 'operator' OR role = 'admin'::public.org_role);

-- 7. platform_admins and stellar_da_operators as tables again.
DROP VIEW IF EXISTS public.platform_admins;
DROP VIEW IF EXISTS public.stellar_da_operators;

CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.platform_admins IS
  'DA operators. Enrolled as owner in every org. Not an org_role — it outranks owner.';
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_admins_select ON public.platform_admins FOR SELECT TO authenticated USING (true);
REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_admins TO authenticated;
GRANT ALL ON TABLE public.platform_admins TO service_role;
INSERT INTO public.platform_admins (user_id, created_at)
SELECT user_id, created_at FROM public.platform_staff WHERE role = 'platform_admin' AND active;

CREATE TABLE public.stellar_da_operators (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text
);
COMMENT ON TABLE public.stellar_da_operators IS
  'Standing cross-org read access for DA staff running Stellar placements. Distinct from platform_admins: holding a row here grants no org_members row anywhere. Never a backdoor membership.';
ALTER TABLE public.stellar_da_operators ENABLE ROW LEVEL SECURITY;
CREATE POLICY stellar_da_operators_select ON public.stellar_da_operators FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());
REVOKE ALL ON TABLE public.stellar_da_operators FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.stellar_da_operators TO authenticated;
GRANT ALL ON TABLE public.stellar_da_operators TO service_role;
INSERT INTO public.stellar_da_operators (user_id, granted_by, granted_at, note)
SELECT user_id, created_by, created_at, 'Restored from platform_staff'
FROM public.platform_staff WHERE role = 'service_team' AND active;

CREATE TRIGGER platform_admins_enroll
  AFTER INSERT ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.enroll_platform_admin_row();
CREATE TRIGGER organizations_enroll_platform_admins
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.enroll_platform_admins_on_new_org();
CREATE TRIGGER org_members_protect_platform_admin
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.protect_platform_admin_membership();

REVOKE ALL ON FUNCTION public.enroll_platform_admin_in_orgs(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enroll_platform_admin_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enroll_platform_admins_on_new_org() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_platform_admin_membership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_platform_admin_in_orgs(uuid) TO service_role;

-- 8. Policies as they were.
CREATE POLICY leads_update_assigned_setter ON public.leads FOR UPDATE TO authenticated
  USING (public.user_has_org_role(org_id, 'setter') AND assigned_setter_id = public.user_member_id(org_id))
  WITH CHECK (public.user_has_org_role(org_id, 'setter') AND assigned_setter_id = public.user_member_id(org_id));
CREATE POLICY leads_update_assigned_closer ON public.leads FOR UPDATE TO authenticated
  USING (public.user_has_org_role(org_id, 'closer') AND assigned_closer_id = public.user_member_id(org_id))
  WITH CHECK (public.user_has_org_role(org_id, 'closer') AND assigned_closer_id = public.user_member_id(org_id));
CREATE POLICY placements_select ON public.placements FOR SELECT TO authenticated
  USING (
    public.user_has_org_role(org_id, 'owner', 'admin', 'client_viewer')
    OR (public.user_has_org_role(org_id, 'setter') AND setter_member_id = public.user_member_id(org_id))
  );
CREATE POLICY approval_gate_changes_select ON public.approval_gate_changes FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner'));

-- Row-level security on the build-stage mappings stays on; its policy moves
-- off the helper this rollback removes.
DROP POLICY IF EXISTS stellar_build_stage_mappings_select ON public.stellar_build_stage_mappings;
CREATE POLICY stellar_build_stage_mappings_select ON public.stellar_build_stage_mappings
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- 9. Tables, columns, and types the migration added.
DROP TABLE IF EXISTS public.workspace_activity_log;
DROP TABLE IF EXISTS public.inbound_event_holds;
DROP TABLE IF EXISTS public.workspace_assignments;
DROP TABLE IF EXISTS public.platform_staff;
DROP TABLE IF EXISTS public.workspace_migration_review;
DROP TABLE IF EXISTS public.workspace_migration_role_map;
DROP TABLE IF EXISTS public.workspace_migration_invite_map;

DROP INDEX IF EXISTS public.org_members_user_active_idx;
ALTER TABLE public.org_members
  DROP COLUMN IF EXISTS seat,
  DROP COLUMN IF EXISTS can_approve,
  DROP COLUMN IF EXISTS deactivated_at,
  DROP COLUMN IF EXISTS deactivated_by;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_closed_retention_days_range,
  DROP CONSTRAINT IF EXISTS organizations_closed_at_matches_status,
  DROP CONSTRAINT IF EXISTS organizations_owner_contact_email_format,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS status_changed_at,
  DROP COLUMN IF EXISTS status_changed_by,
  DROP COLUMN IF EXISTS status_reason,
  DROP COLUMN IF EXISTS closed_at,
  DROP COLUMN IF EXISTS closed_retention_days,
  DROP COLUMN IF EXISTS industry_template_id,
  DROP COLUMN IF EXISTS owner_contact_name,
  DROP COLUMN IF EXISTS owner_contact_email,
  DROP COLUMN IF EXISTS owner_contact_phone,
  DROP COLUMN IF EXISTS is_platform_workspace;


-- Platform Admins hold an owner seat in every workspace again.
SELECT public.enroll_platform_admin_in_orgs(user_id) FROM public.platform_admins;

-- 11. Functions the migration added (after the tables whose policies used them).
DROP FUNCTION IF EXISTS public.ws_end_user_request();
DROP FUNCTION IF EXISTS public.is_platform_staff();
DROP FUNCTION IF EXISTS public.is_platform_staff_user(uuid);
DROP FUNCTION IF EXISTS public.platform_staff_role();
DROP FUNCTION IF EXISTS public.user_staff_org_ids();
DROP FUNCTION IF EXISTS public.closed_org_ids();
DROP FUNCTION IF EXISTS public.user_customer_seats();
DROP FUNCTION IF EXISTS public.user_operator_org_ids();
DROP FUNCTION IF EXISTS public.user_worker_org_ids();
DROP FUNCTION IF EXISTS public.user_owner_org_ids();
DROP FUNCTION IF EXISTS public.user_approver_org_ids();
DROP FUNCTION IF EXISTS public.ws_access(uuid);
DROP FUNCTION IF EXISTS public.ws_is_staff(uuid);
DROP FUNCTION IF EXISTS public.ws_require_staff(uuid);
DROP FUNCTION IF EXISTS public.ws_can_approve(uuid);
DROP FUNCTION IF EXISTS public.ws_automation_allowed(uuid);
DROP FUNCTION IF EXISTS public.operator_visible_lead_ids();
DROP FUNCTION IF EXISTS public.ws_lead_visible(uuid, uuid);
DROP FUNCTION IF EXISTS public.ws_can_work_lead(uuid, uuid);
DROP FUNCTION IF EXISTS public.sync_staff_seat(uuid, uuid);
DROP FUNCTION IF EXISTS public.sync_staff_seats_for_user(uuid);
DROP FUNCTION IF EXISTS public.workspace_assignments_sync();
DROP FUNCTION IF EXISTS public.workspace_assignments_guard();
DROP FUNCTION IF EXISTS public.platform_staff_sync();
DROP FUNCTION IF EXISTS public.organizations_seat_platform_admins();
DROP FUNCTION IF EXISTS public.workspace_activity_log_immutable();
DROP FUNCTION IF EXISTS public.ws_actor(uuid, uuid);
DROP FUNCTION IF EXISTS public.ws_log(uuid, text, text, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.log_workspace_activity(uuid, uuid, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.ws_changed_columns(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.ws_audit_config();
DROP FUNCTION IF EXISTS public.ws_guard_staff_write();
DROP FUNCTION IF EXISTS public.ws_audit_people_action();
DROP FUNCTION IF EXISTS public.org_members_guard();
DROP FUNCTION IF EXISTS public.org_members_audit();
DROP FUNCTION IF EXISTS public.org_invites_guard();
DROP FUNCTION IF EXISTS public.org_invites_audit();
DROP FUNCTION IF EXISTS public.workspace_assignments_audit();
DROP FUNCTION IF EXISTS public.platform_staff_audit();
DROP FUNCTION IF EXISTS public.organizations_guard();
DROP FUNCTION IF EXISTS public.organizations_audit();
DROP FUNCTION IF EXISTS public.ws_require_platform_admin();
DROP FUNCTION IF EXISTS public.assign_staff_to_workspace(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.end_staff_assignment(uuid, uuid);
DROP FUNCTION IF EXISTS public.set_workspace_status(uuid, public.workspace_status, text);
DROP FUNCTION IF EXISTS public.upsert_platform_staff(uuid, public.platform_role, boolean, boolean, text);
DROP FUNCTION IF EXISTS public.deactivate_user_everywhere(uuid);
DROP FUNCTION IF EXISTS public.review_inbound_event_hold(uuid, text, text);

-- 12. Types, once nothing uses them.
DROP TYPE IF EXISTS public.workspace_status;
DROP TYPE IF EXISTS public.platform_role;
DROP TYPE IF EXISTS public.member_seat;

COMMIT;
