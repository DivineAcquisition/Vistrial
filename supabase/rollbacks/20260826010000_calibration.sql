-- Roll back Prompt 16 calibration.

DROP TRIGGER IF EXISTS score_configs_snapshot ON public.score_configs;
DROP TRIGGER IF EXISTS leads_assign_holdout ON public.leads;

DROP FUNCTION IF EXISTS public.load_ops_calibration();
DROP FUNCTION IF EXISTS public.load_calibration_report(uuid);
DROP FUNCTION IF EXISTS public.refresh_calibration_benchmarks();
DROP FUNCTION IF EXISTS public.calibration_cross_client_context(uuid);
DROP FUNCTION IF EXISTS public.run_extraction_sample_audit(uuid, integer);
DROP FUNCTION IF EXISTS public.update_org_holdout_percent(uuid, numeric);
DROP FUNCTION IF EXISTS public.dismiss_calibration_suggestion(uuid, uuid);
DROP FUNCTION IF EXISTS public.apply_calibration_suggestion(uuid, uuid);
DROP FUNCTION IF EXISTS public.save_org_score_config(uuid, integer, integer, integer, integer, integer, integer, integer, integer, public.score_config_source, uuid);
DROP FUNCTION IF EXISTS public.refresh_calibration_suggestions(uuid);
DROP FUNCTION IF EXISTS public.calibration_historical_effect(uuid, integer, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.calibration_profile_shift(uuid);
DROP FUNCTION IF EXISTS public.calibration_draft_report(uuid);
DROP FUNCTION IF EXISTS public.calibration_extraction_report(uuid);
DROP FUNCTION IF EXISTS public.preview_score_config_change(uuid, integer, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.calibration_threshold_placement(uuid);
DROP FUNCTION IF EXISTS public.calibration_factor_validity(uuid, boolean);
DROP FUNCTION IF EXISTS public.calibration_band_curve(uuid, boolean);
DROP FUNCTION IF EXISTS public.calibration_holdout_state(uuid);
DROP FUNCTION IF EXISTS public.calibration_mature_resolved(uuid);
DROP FUNCTION IF EXISTS public.calibration_recompute_total(integer, integer, integer, integer, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.calibration_band_lo(text);
DROP FUNCTION IF EXISTS public.calibration_score_band(integer);
DROP FUNCTION IF EXISTS public.snapshot_score_config();
DROP FUNCTION IF EXISTS public.assign_lead_holdout();

DROP TABLE IF EXISTS public.calibration_benchmarks;
ALTER TABLE public.score_config_versions DROP CONSTRAINT IF EXISTS score_config_versions_suggestion_fkey;
DROP TABLE IF EXISTS public.extraction_audits;
DROP TABLE IF EXISTS public.calibration_suggestions;
DROP TABLE IF EXISTS public.score_config_versions;

DROP TYPE IF EXISTS public.calibration_suggestion_status;
DROP TYPE IF EXISTS public.calibration_suggestion_kind;
DROP TYPE IF EXISTS public.score_config_source;

DELETE FROM public.ops_job_runs WHERE job_name = 'calibration';
DELETE FROM public.ops_job_catalog WHERE job_name = 'calibration';

-- Restore score sync and protected-column guard from Prompt 7 / audit hardening.
CREATE OR REPLACE FUNCTION public.sync_lead_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold integer;
BEGIN
  SELECT ready_threshold
  INTO v_threshold
  FROM public.score_configs
  WHERE org_id = NEW.org_id;

  PERFORM set_config('vistrial.allow_score_cache', '1', true);

  UPDATE public.leads
  SET
    current_score = NEW.total,
    lead_type = CASE
      WHEN v_threshold IS NOT NULL AND NEW.total >= v_threshold
        THEN 'ready_track'::public.lead_type
      ELSE 'nurture_track'::public.lead_type
    END
  WHERE id = NEW.lead_id
    AND org_id = NEW.org_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_lead_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self uuid;
BEGIN
  IF current_setting('vistrial.allow_score_cache', true) IS DISTINCT FROM '1' THEN
    IF NEW.current_score IS DISTINCT FROM OLD.current_score
      OR NEW.lead_type IS DISTINCT FROM OLD.lead_type THEN
      RAISE EXCEPTION 'leads.current_score and lead_type are trigger-maintained';
    END IF;
  END IF;

  IF current_setting('vistrial.allow_touch_times', true) IS DISTINCT FROM '1' THEN
    IF NEW.first_human_touch_at IS DISTINCT FROM OLD.first_human_touch_at
      OR NEW.last_touch_at IS DISTINCT FROM OLD.last_touch_at THEN
      RAISE EXCEPTION 'leads touch timestamps are trigger-maintained';
    END IF;
  END IF;

  IF NEW.assigned_setter_id IS DISTINCT FROM OLD.assigned_setter_id
    OR NEW.assigned_closer_id IS DISTINCT FROM OLD.assigned_closer_id THEN
    IF auth.uid() IS NOT NULL
      AND NOT public.user_has_org_role(NEW.org_id, 'owner', 'admin') THEN
      v_self := public.user_member_id(NEW.org_id);
      IF v_self IS NULL THEN
        RAISE EXCEPTION 'not authorized to reassign leads';
      END IF;
      IF NEW.assigned_setter_id IS DISTINCT FROM OLD.assigned_setter_id
        AND NEW.assigned_setter_id IS DISTINCT FROM v_self THEN
        RAISE EXCEPTION 'not authorized to reassign leads';
      END IF;
      IF NEW.assigned_closer_id IS DISTINCT FROM OLD.assigned_closer_id
        AND NEW.assigned_closer_id IS DISTINCT FROM v_self THEN
        RAISE EXCEPTION 'not authorized to reassign leads';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_holdout_stamped;
ALTER TABLE public.leads DROP COLUMN IF EXISTS holdout_assigned_at;
ALTER TABLE public.leads DROP COLUMN IF EXISTS is_holdout;

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_holdout_percent_range;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS holdout_percent;
