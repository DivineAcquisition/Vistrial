-- Prompt 19: settings tiers, managed mode, activity log.
-- Advanced is owner/admin. Managed orgs keep Advanced read-only for the client
-- unless a platform admin writes, or the owner takes over.

-- ---------------------------------------------------------------------------
-- Managed mode. DA-installed orgs default on. Self-serve would insert false.
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS managed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS managed_taken_over_at timestamptz,
  ADD COLUMN IF NOT EXISTS managed_taken_over_by uuid REFERENCES public.org_members (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.organizations.managed IS
  'When true, DA manages Advanced settings. The client still controls team, notifications, voice examples, business hours, and the org-wide stop.';

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.org_members.last_seen_at IS
  'Last time this member used the product in this workspace. Stamped on a throttle, not every request.';

ALTER TABLE public.org_voice_profiles
  ADD COLUMN IF NOT EXISTS sample_preview jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.org_voice_profiles.sample_preview IS
  'Last sample draft shown on Workspace after a voice save: lead name, body, generated_at.';

-- ---------------------------------------------------------------------------
-- Activity log. Read-only for clients. Writes go through log_settings_activity.
-- ---------------------------------------------------------------------------

CREATE TABLE public.settings_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  actor_user_id uuid,
  actor_label text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('member', 'da_operator', 'system')),
  section text NOT NULL CHECK (section IN (
    'organization',
    'members',
    'scoring',
    'integrations',
    'follow_up',
    'data',
    'activation',
    'managed',
    'agent',
    'notifications'
  )),
  action text NOT NULL,
  from_value jsonb,
  to_value jsonb
);

CREATE INDEX settings_activity_org_created_idx
  ON public.settings_activity (org_id, created_at DESC);

CREATE INDEX settings_activity_org_section_idx
  ON public.settings_activity (org_id, section, created_at DESC);

CREATE INDEX settings_activity_org_actor_idx
  ON public.settings_activity (org_id, actor_member_id, created_at DESC);

COMMENT ON TABLE public.settings_activity IS
  'Who changed configuration, from what to what. Never edited. Answers why the queue looks different.';

ALTER TABLE public.settings_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY settings_activity_select
  ON public.settings_activity
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_org_role(org_id, 'owner', 'admin')
    OR public.is_platform_admin()
  );

REVOKE ALL ON TABLE public.settings_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.settings_activity TO authenticated;
GRANT ALL ON TABLE public.settings_activity TO service_role;

CREATE OR REPLACE FUNCTION public.org_advanced_writable(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR (
      public.user_has_org_role(p_org_id, 'owner', 'admin')
      AND EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = p_org_id AND o.managed = false
      )
    );
$$;

COMMENT ON FUNCTION public.org_advanced_writable(uuid) IS
  'True when the current user may change Advanced settings for this org. Platform admins always can. Clients can when the org is not managed.';

CREATE OR REPLACE FUNCTION public.request_jwt_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    CASE
      WHEN NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NULL THEN 'service_role'
      ELSE 'authenticated'
    END
  );
$$;

COMMENT ON FUNCTION public.request_jwt_role() IS
  'JWT role for Advanced guards. Empty JWT (seed, jobs, SQL console) is treated as service_role.';

REVOKE ALL ON FUNCTION public.request_jwt_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_jwt_role() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_advanced_writable(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.log_settings_activity(
  p_org_id uuid,
  p_section text,
  p_action text,
  p_from jsonb DEFAULT NULL,
  p_to jsonb DEFAULT NULL,
  p_actor_label text DEFAULT NULL,
  p_actor_kind text DEFAULT NULL,
  p_actor_member_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_kind text;
  v_label text;
  v_member uuid;
  v_user uuid;
  v_display text;
BEGIN
  IF p_section IS NULL OR p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'activity log requires a section and an action';
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR public.user_has_org_role(p_org_id, 'owner', 'admin')
    OR public.request_jwt_role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'not authorized to write the activity log' USING ERRCODE = '42501';
  END IF;

  v_user := COALESCE(p_actor_user_id, auth.uid());
  v_member := COALESCE(p_actor_member_id, public.user_member_id(p_org_id));
  v_kind := COALESCE(NULLIF(btrim(p_actor_kind), ''), CASE
    WHEN public.is_platform_admin() THEN 'da_operator'
    WHEN v_member IS NOT NULL THEN 'member'
    ELSE 'system'
  END);

  IF v_kind NOT IN ('member', 'da_operator', 'system') THEN
    RAISE EXCEPTION 'invalid actor kind';
  END IF;

  IF v_member IS NOT NULL THEN
    SELECT display_name INTO v_display FROM public.org_members WHERE id = v_member;
  END IF;

  v_label := NULLIF(btrim(COALESCE(p_actor_label, '')), '');
  IF v_label IS NULL THEN
    v_label := COALESCE(NULLIF(btrim(COALESCE(v_display, '')), ''), 'Unknown actor');
    IF v_kind = 'da_operator' THEN
      v_label := v_label || ' (DA)';
    END IF;
  END IF;

  INSERT INTO public.settings_activity (
    org_id, actor_member_id, actor_user_id, actor_label, actor_kind, section, action, from_value, to_value
  ) VALUES (
    p_org_id, v_member, v_user, v_label, v_kind, p_section, btrim(p_action), p_from, p_to
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_settings_activity(uuid, text, text, jsonb, jsonb, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_settings_activity(uuid, text, text, jsonb, jsonb, text, text, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.org_advanced_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_advanced_writable(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assert_advanced_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_advanced_writable(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Take over management (owner). Unlock Advanced. Recorded.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.take_over_org_management(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid;
  v_was boolean;
BEGIN
  IF NOT public.user_has_org_role(p_org_id, 'owner') AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'only an owner can take over management' USING ERRCODE = '42501';
  END IF;

  SELECT managed INTO v_was FROM public.organizations WHERE id = p_org_id;
  IF v_was IS DISTINCT FROM true THEN
    RETURN;
  END IF;

  v_member := public.user_member_id(p_org_id);

  PERFORM set_config('vistrial.allow_managed_change', '1', true);

  UPDATE public.organizations
  SET
    managed = false,
    managed_taken_over_at = now(),
    managed_taken_over_by = v_member,
    updated_at = now()
  WHERE id = p_org_id;

  PERFORM public.log_settings_activity(
    p_org_id,
    'managed',
    'Took over Advanced settings. This workspace is now responsible for scoring, routing, and contact rules.',
    jsonb_build_object('managed', true),
    jsonb_build_object('managed', false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.take_over_org_management(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.take_over_org_management(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_org_managed(p_org_id uuid, p_managed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'only DA staff can mark a workspace as managed' USING ERRCODE = '42501';
  END IF;

  SELECT managed INTO v_was FROM public.organizations WHERE id = p_org_id;

  PERFORM set_config('vistrial.allow_managed_change', '1', true);

  UPDATE public.organizations
  SET
    managed = p_managed,
    managed_taken_over_at = CASE WHEN p_managed THEN NULL ELSE COALESCE(managed_taken_over_at, now()) END,
    managed_taken_over_by = CASE WHEN p_managed THEN NULL ELSE managed_taken_over_by END,
    updated_at = now()
  WHERE id = p_org_id;

  PERFORM public.log_settings_activity(
    p_org_id,
    'managed',
    CASE WHEN p_managed THEN 'Marked this workspace as managed by DA.' ELSE 'Released managed mode.' END,
    jsonb_build_object('managed', v_was),
    jsonb_build_object('managed', p_managed),
    NULL,
    'da_operator'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_org_managed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_org_managed(uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Last-seen stamp, throttled.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_member_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.org_members
  SET last_seen_at = now()
  WHERE user_id = auth.uid()
    AND active
    AND (last_seen_at IS NULL OR last_seen_at < now() - interval '5 minutes');
END;
$$;

REVOKE ALL ON FUNCTION public.touch_member_last_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_member_last_seen() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Gate Advanced RPCs. Halt is intentionally not gated.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_org_score_config(
  p_org_id uuid,
  p_timeline integer,
  p_investment integer,
  p_authority integer,
  p_pain integer,
  p_threshold integer,
  p_speed integer,
  p_ghost_soft integer,
  p_ghost_hard integer,
  p_source public.score_config_source DEFAULT 'settings',
  p_suggestion_id uuid DEFAULT NULL,
  p_holdout_percent numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_source public.score_config_source;
  v_suggestion uuid;
BEGIN
  PERFORM public.assert_advanced_writable(p_org_id);
  IF p_timeline + p_investment + p_authority + p_pain <> 100 THEN
    RAISE EXCEPTION 'weights must add to 100';
  END IF;
  IF p_timeline < 0 OR p_investment < 0 OR p_authority < 0 OR p_pain < 0
     OR p_timeline > 100 OR p_investment > 100 OR p_authority > 100 OR p_pain > 100 THEN
    RAISE EXCEPTION 'weights must be between 0 and 100';
  END IF;
  IF p_threshold < 0 OR p_threshold > 100 THEN
    RAISE EXCEPTION 'ready threshold must be between 0 and 100';
  END IF;
  IF p_speed < 1 OR p_speed > 24 * 60 THEN
    RAISE EXCEPTION 'speed-to-lead minutes must be between 1 and 1440';
  END IF;
  IF p_ghost_soft < 1 OR p_ghost_hard < 1 OR p_ghost_soft >= p_ghost_hard THEN
    RAISE EXCEPTION 'the approaching-ghost window must be shorter than the ghost window';
  END IF;
  IF p_holdout_percent IS NOT NULL AND (p_holdout_percent < 0 OR p_holdout_percent > 20) THEN
    RAISE EXCEPTION 'holdout percent must be between 0 and 20';
  END IF;

  IF current_setting('vistrial.allow_calibration_apply', true) = '1' THEN
    v_source := 'calibration_apply';
    v_suggestion := p_suggestion_id;
  ELSE
    v_source := 'settings';
    v_suggestion := NULL;
  END IF;

  PERFORM set_config('vistrial.actor_member_id', COALESCE(public.user_member_id(p_org_id)::text, ''), true);
  PERFORM set_config('vistrial.score_config_source', v_source::text, true);
  PERFORM set_config('vistrial.score_suggestion_id', COALESCE(v_suggestion::text, ''), true);

  UPDATE public.score_configs
  SET
    timeline_weight = p_timeline,
    investment_capacity_weight = p_investment,
    decision_authority_weight = p_authority,
    pain_severity_weight = p_pain,
    ready_threshold = p_threshold,
    speed_to_lead_minutes = p_speed,
    ghost_days_soft = p_ghost_soft,
    ghost_days_hard = p_ghost_hard,
    updated_at = now()
  WHERE org_id = p_org_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'scoring config missing';
  END IF;

  IF p_holdout_percent IS NOT NULL THEN
    UPDATE public.organizations
    SET holdout_percent = p_holdout_percent, updated_at = now()
    WHERE id = p_org_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_org_score_maps(p_org_id uuid, p_maps jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_map jsonb;
  v_rule jsonb;
  v_map_id uuid;
BEGIN
  PERFORM public.assert_advanced_writable(p_org_id);

  IF jsonb_typeof(p_maps) <> 'array' THEN
    RAISE EXCEPTION 'score maps payload must be an array';
  END IF;

  DELETE FROM public.score_field_maps WHERE org_id = p_org_id;

  FOR v_map IN SELECT value FROM jsonb_array_elements(p_maps)
  LOOP
    INSERT INTO public.score_field_maps (org_id, field_name, factor)
    VALUES (
      p_org_id,
      trim(v_map->>'field_name'),
      (v_map->>'factor')::public.score_factor
    )
    RETURNING id INTO v_map_id;

    IF v_map ? 'rules' AND jsonb_typeof(v_map->'rules') = 'array' THEN
      FOR v_rule IN SELECT value FROM jsonb_array_elements(v_map->'rules')
      LOOP
        INSERT INTO public.score_field_rules (
          org_id, field_map_id, kind, answer_value, range_min, range_max, score
        )
        VALUES (
          p_org_id,
          v_map_id,
          (v_rule->>'kind')::public.score_mapping_kind,
          NULLIF(trim(COALESCE(v_rule->>'answer_value', '')), ''),
          CASE WHEN v_rule->>'range_min' IS NULL OR v_rule->>'range_min' = '' THEN NULL ELSE (v_rule->>'range_min')::numeric END,
          CASE WHEN v_rule->>'range_max' IS NULL OR v_rule->>'range_max' = '' THEN NULL ELSE (v_rule->>'range_max')::numeric END,
          (v_rule->>'score')::integer
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_calibration_suggestion(p_org_id uuid, p_suggestion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.calibration_suggestions%ROWTYPE;
  v_cfg public.score_configs%ROWTYPE;
  v_prop jsonb;
  v_scores_before bigint;
  v_scores_after bigint;
BEGIN
  PERFORM public.assert_advanced_writable(p_org_id);

  SELECT * INTO v_row
  FROM public.calibration_suggestions
  WHERE id = p_suggestion_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'suggestion missing';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'suggestion is not pending';
  END IF;
  IF v_row.kind NOT IN ('weights', 'threshold') THEN
    RAISE EXCEPTION 'this suggestion is not a config change';
  END IF;

  SELECT * INTO v_cfg FROM public.score_configs WHERE org_id = p_org_id;
  SELECT count(*) INTO v_scores_before FROM public.readiness_scores WHERE org_id = p_org_id;

  v_prop := COALESCE(v_row.payload -> 'proposed', '{}'::jsonb);

  PERFORM set_config('vistrial.allow_calibration_apply', '1', true);

  PERFORM public.save_org_score_config(
    p_org_id,
    COALESCE((v_prop ->> 'timeline')::integer, v_cfg.timeline_weight),
    COALESCE((v_prop ->> 'investment_capacity')::integer, v_cfg.investment_capacity_weight),
    COALESCE((v_prop ->> 'decision_authority')::integer, v_cfg.decision_authority_weight),
    COALESCE((v_prop ->> 'pain_severity')::integer, v_cfg.pain_severity_weight),
    COALESCE((v_prop ->> 'ready_threshold')::integer, v_cfg.ready_threshold),
    v_cfg.speed_to_lead_minutes,
    v_cfg.ghost_days_soft,
    v_cfg.ghost_days_hard,
    'calibration_apply',
    p_suggestion_id
  );

  PERFORM set_config('vistrial.allow_calibration_apply', '', true);

  UPDATE public.calibration_suggestions
  SET
    status = 'applied',
    applied_at = now(),
    applied_by_member_id = public.user_member_id(p_org_id)
  WHERE id = p_suggestion_id;

  SELECT count(*) INTO v_scores_after FROM public.readiness_scores WHERE org_id = p_org_id;
  IF v_scores_after <> v_scores_before THEN
    RAISE EXCEPTION 'applying a suggestion must not write score history';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'suggestion_id', p_suggestion_id,
    'scores_unchanged', true
  );
END;
$$;

-- DA-created orgs stay managed (column default). create_client_org needs no change.

-- ---------------------------------------------------------------------------
-- Owner-initiated org deletion uses the existing delete_org_data engine.
-- Authenticated owners call this wrapper; it still requires the typed name.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.owner_delete_org(p_org_id uuid, p_confirmation_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.user_has_org_role(p_org_id, 'owner') THEN
    RAISE EXCEPTION 'only an owner can delete this workspace' USING ERRCODE = '42501';
  END IF;

  v_result := public.delete_org_data(
    p_org_id,
    p_confirmation_name,
    'owner_requested',
    auth.uid(),
    NULL
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_delete_org(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_delete_org(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dismiss_calibration_suggestion(p_org_id uuid, p_suggestion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_advanced_writable(p_org_id);
  UPDATE public.calibration_suggestions
  SET
    status = 'dismissed',
    dismissed_at = now(),
    dismissed_by_member_id = public.user_member_id(p_org_id)
  WHERE id = p_suggestion_id AND org_id = p_org_id AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_org_holdout_percent(p_org_id uuid, p_percent numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_advanced_writable(p_org_id);
  IF p_percent < 0 OR p_percent > 20 THEN
    RAISE EXCEPTION 'holdout percent must be between 0 and 20';
  END IF;
  UPDATE public.organizations
  SET holdout_percent = p_percent, updated_at = now()
  WHERE id = p_org_id;
END;
$$;

-- Direct table writes must not bypass managed mode.
CREATE OR REPLACE FUNCTION public.guard_org_advanced_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.managed IS DISTINCT FROM OLD.managed
     OR NEW.managed_taken_over_at IS DISTINCT FROM OLD.managed_taken_over_at
     OR NEW.managed_taken_over_by IS DISTINCT FROM OLD.managed_taken_over_by THEN
    IF current_setting('vistrial.allow_managed_change', true) IS DISTINCT FROM '1'
       AND NOT public.is_platform_admin()
       AND public.request_jwt_role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'managed mode can only change through take_over_org_management or set_org_managed'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.holdout_percent IS DISTINCT FROM OLD.holdout_percent
     OR NEW.sales_cycle_days IS DISTINCT FROM OLD.sales_cycle_days
     OR NEW.baseline_lookback_days IS DISTINCT FROM OLD.baseline_lookback_days
     OR NEW.transcript_retention_days IS DISTINCT FROM OLD.transcript_retention_days
     OR NEW.call_coaching_embargo_hours IS DISTINCT FROM OLD.call_coaching_embargo_hours
     OR NEW.operator_agent_batch_cap IS DISTINCT FROM OLD.operator_agent_batch_cap
     OR NEW.sms_emergencies_enabled IS DISTINCT FROM OLD.sms_emergencies_enabled THEN
    PERFORM public.assert_advanced_writable(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_guard_advanced ON public.organizations;
CREATE TRIGGER organizations_guard_advanced
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_advanced_columns();

CREATE OR REPLACE FUNCTION public.guard_advanced_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  v_org := COALESCE(NEW.org_id, OLD.org_id);
  PERFORM public.assert_advanced_writable(v_org);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS score_configs_guard_advanced ON public.score_configs;
CREATE TRIGGER score_configs_guard_advanced
  BEFORE UPDATE ON public.score_configs
  FOR EACH ROW EXECUTE FUNCTION public.guard_advanced_org_id();

DROP TRIGGER IF EXISTS ghl_field_maps_guard_advanced ON public.ghl_field_maps;
CREATE TRIGGER ghl_field_maps_guard_advanced
  BEFORE INSERT OR UPDATE OR DELETE ON public.ghl_field_maps
  FOR EACH ROW EXECUTE FUNCTION public.guard_advanced_org_id();

CREATE OR REPLACE FUNCTION public.guard_follow_up_settings_advanced()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.max_sequence_length IS DISTINCT FROM OLD.max_sequence_length
     OR NEW.max_sequence_duration_days IS DISTINCT FROM OLD.max_sequence_duration_days
     OR NEW.draft_stale_days IS DISTINCT FROM OLD.draft_stale_days
     OR NEW.quiet_hours_enabled IS DISTINCT FROM OLD.quiet_hours_enabled
     OR NEW.quiet_hours_start IS DISTINCT FROM OLD.quiet_hours_start
     OR NEW.quiet_hours_end IS DISTINCT FROM OLD.quiet_hours_end
     OR NEW.default_channel IS DISTINCT FROM OLD.default_channel THEN
    PERFORM public.assert_advanced_writable(NEW.org_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follow_up_settings_guard_advanced ON public.follow_up_settings;
CREATE TRIGGER follow_up_settings_guard_advanced
  BEFORE UPDATE ON public.follow_up_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_follow_up_settings_advanced();

CREATE OR REPLACE FUNCTION public.guard_voice_profile_advanced()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.formality IS DISTINCT FROM OLD.formality
     OR NEW.use_contractions IS DISTINCT FROM OLD.use_contractions
     OR NEW.use_greeting IS DISTINCT FROM OLD.use_greeting
     OR NEW.use_signoff IS DISTINCT FROM OLD.use_signoff
     OR NEW.greeting_text IS DISTINCT FROM OLD.greeting_text
     OR NEW.signoff_text IS DISTINCT FROM OLD.signoff_text
     OR NEW.sms_max_chars IS DISTINCT FROM OLD.sms_max_chars
     OR NEW.email_max_chars IS DISTINCT FROM OLD.email_max_chars
     OR NEW.emoji_usage IS DISTINCT FROM OLD.emoji_usage
     OR NEW.banned_words IS DISTINCT FROM OLD.banned_words THEN
    PERFORM public.assert_advanced_writable(NEW.org_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_voice_profiles_guard_advanced ON public.org_voice_profiles;
CREATE TRIGGER org_voice_profiles_guard_advanced
  BEFORE UPDATE ON public.org_voice_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_voice_profile_advanced();

CREATE OR REPLACE FUNCTION public.guard_team_channels_advanced()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_advanced_writable(COALESCE(NEW.org_id, OLD.org_id));
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_team_channels_guard_advanced ON public.notification_team_channels;
CREATE TRIGGER notification_team_channels_guard_advanced
  BEFORE INSERT OR UPDATE OR DELETE ON public.notification_team_channels
  FOR EACH ROW EXECUTE FUNCTION public.guard_team_channels_advanced();

