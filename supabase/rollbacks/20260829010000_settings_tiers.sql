-- Reverse Prompt 19 settings tiers. Restores scoring RPCs to the
-- Prompt 16 bodies (authorization via user_has_org_role only).

DROP TRIGGER IF EXISTS organizations_guard_advanced ON public.organizations;
DROP TRIGGER IF EXISTS score_configs_guard_advanced ON public.score_configs;
DROP TRIGGER IF EXISTS ghl_field_maps_guard_advanced ON public.ghl_field_maps;
DROP TRIGGER IF EXISTS follow_up_settings_guard_advanced ON public.follow_up_settings;
DROP TRIGGER IF EXISTS org_voice_profiles_guard_advanced ON public.org_voice_profiles;
DROP TRIGGER IF EXISTS notification_team_channels_guard_advanced ON public.notification_team_channels;

DROP FUNCTION IF EXISTS public.guard_org_advanced_columns();
DROP FUNCTION IF EXISTS public.guard_advanced_org_id();
DROP FUNCTION IF EXISTS public.guard_follow_up_settings_advanced();
DROP FUNCTION IF EXISTS public.guard_voice_profile_advanced();
DROP FUNCTION IF EXISTS public.guard_team_channels_advanced();

DROP FUNCTION IF EXISTS public.owner_delete_org(uuid, text);
DROP FUNCTION IF EXISTS public.set_org_managed(uuid, boolean);
DROP FUNCTION IF EXISTS public.take_over_org_management(uuid);
DROP FUNCTION IF EXISTS public.touch_member_last_seen();
DROP FUNCTION IF EXISTS public.log_settings_activity(uuid, text, text, jsonb, jsonb, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.assert_advanced_writable(uuid);
DROP FUNCTION IF EXISTS public.org_advanced_writable(uuid);

DROP TABLE IF EXISTS public.settings_activity;

ALTER TABLE public.org_voice_profiles DROP COLUMN IF EXISTS sample_preview;
ALTER TABLE public.org_members DROP COLUMN IF EXISTS last_seen_at;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS managed_taken_over_by;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS managed_taken_over_at;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS managed;

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
  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'not authorized to change scoring settings';
  END IF;
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
  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'not authorized to replace score maps';
  END IF;

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
  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'not authorized to apply a scoring suggestion';
  END IF;

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

CREATE OR REPLACE FUNCTION public.dismiss_calibration_suggestion(p_org_id uuid, p_suggestion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
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
  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'not authorized to change the holdout';
  END IF;
  IF p_percent < 0 OR p_percent > 20 THEN
    RAISE EXCEPTION 'holdout percent must be between 0 and 20';
  END IF;
  UPDATE public.organizations
  SET holdout_percent = p_percent, updated_at = now()
  WHERE id = p_org_id;
END;
$$;
