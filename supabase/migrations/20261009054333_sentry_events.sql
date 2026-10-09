-- Sentry events: a lead that no longer needs a person loses its alert at once,
-- and a human touch marks the clock so the next sweep looks at it first.

ALTER TABLE public.sentry_clocks ADD COLUMN IF NOT EXISTS dirty_at timestamptz;
ALTER TABLE public.sentry_workspaces ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;
ALTER TABLE public.sentry_alerts ADD COLUMN IF NOT EXISTS notified_at timestamptz;
ALTER TABLE public.sentry_alerts ADD COLUMN IF NOT EXISTS unacknowledged_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS sentry_clocks_dirty_idx ON public.sentry_clocks (org_id, dirty_at) WHERE dirty_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sentry_withdraw_lead(p_org_id uuid, p_lead_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sentry_alerts
  SET status = 'withdrawn', resolved_at = now(), withdraw_reason = p_reason
  WHERE org_id = p_org_id AND lead_id = p_lead_id AND status IN ('open', 'acknowledged', 'snoozed');
  UPDATE public.sentry_clocks
  SET state = 'not_applicable', reason = p_reason, deadline_at = NULL, overdue_minutes = 0, dirty_at = NULL, updated_at = now()
  WHERE org_id = p_org_id AND lead_id = p_lead_id;
  UPDATE public.notifications
  SET status = 'cancelled', error_text = 'sentry_withdrawn', updated_at = now()
  WHERE org_id = p_org_id AND subject_kind = 'sentry' AND status = 'queued' AND p_lead_id = ANY (subject_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.sentry_withdraw_lead(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sentry_withdraw_lead(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.sentry_on_lead_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.merged_into IS NOT NULL AND OLD.merged_into IS NULL THEN
    PERFORM public.sentry_withdraw_lead(NEW.org_id, NEW.id, 'This lead was merged.');
  ELSIF NEW.do_not_contact AND NOT COALESCE(OLD.do_not_contact, false) THEN
    PERFORM public.sentry_withdraw_lead(NEW.org_id, NEW.id, 'Marked do not contact.');
  ELSIF NEW.status IN ('closed_won', 'closed_lost') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.sentry_withdraw_lead(NEW.org_id, NEW.id, 'This lead is closed.');
  ELSIF NEW.status IS DISTINCT FROM OLD.status
    OR NEW.assigned_setter_id IS DISTINCT FROM OLD.assigned_setter_id
    OR NEW.assigned_closer_id IS DISTINCT FROM OLD.assigned_closer_id
    OR (OLD.do_not_contact AND NOT NEW.do_not_contact)
    OR (OLD.merged_into IS NOT NULL AND NEW.merged_into IS NULL) THEN
    UPDATE public.sentry_clocks SET dirty_at = now() WHERE org_id = NEW.org_id AND lead_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sentry_lead_change ON public.leads;
CREATE TRIGGER sentry_lead_change
  AFTER UPDATE OF do_not_contact, status, merged_into, assigned_setter_id, assigned_closer_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.sentry_on_lead_change();

CREATE OR REPLACE FUNCTION public.sentry_on_opt_out()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sentry_withdraw_lead(NEW.org_id, NEW.lead_id, 'This lead opted out.');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sentry_opt_out ON public.lead_opt_outs;
CREATE TRIGGER sentry_opt_out
  AFTER INSERT ON public.lead_opt_outs
  FOR EACH ROW EXECUTE FUNCTION public.sentry_on_opt_out();

-- Only a person's touch can resolve a clock, so automated sends are ignored here.
CREATE OR REPLACE FUNCTION public.sentry_on_human_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'human' THEN
    UPDATE public.sentry_clocks SET dirty_at = now() WHERE org_id = NEW.org_id AND lead_id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sentry_human_touch ON public.touches;
CREATE TRIGGER sentry_human_touch
  AFTER INSERT ON public.touches
  FOR EACH ROW EXECUTE FUNCTION public.sentry_on_human_touch();

-- New workspaces start in practice. Moving to live stays an explicit owner step.
CREATE OR REPLACE FUNCTION public.sentry_practice_for_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.sentry_workspaces (org_id, mode, watch_from, activated_at, updated_at)
  VALUES (NEW.id, 'practice', now(), now(), now())
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sentry_new_org ON public.organizations;
CREATE TRIGGER sentry_new_org
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.sentry_practice_for_new_org();

REVOKE ALL ON FUNCTION public.sentry_on_lead_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sentry_on_opt_out() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sentry_on_human_touch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sentry_practice_for_new_org() FROM PUBLIC, anon, authenticated;

-- Live mode needs an active workspace. Onboarding workspaces stay in practice.
CREATE OR REPLACE FUNCTION public.set_sentry_mode(p_org_id uuid, p_mode text, p_watch_from timestamptz, p_preview boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_status text;
BEGIN
  IF p_mode NOT IN ('off', 'practice', 'live') THEN
    RAISE EXCEPTION 'Unknown mode.' USING ERRCODE = '22023';
  END IF;
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_platform_admin() OR p_org_id IN (SELECT public.user_staff_org_ids()) OR public.user_has_org_role(p_org_id, VARIADIC ARRAY['owner'::org_role])) THEN
    RAISE EXCEPTION 'Only an owner or the Vistrial team can change Sentry.' USING ERRCODE = '42501';
  END IF;
  SELECT status::text INTO v_status FROM public.organizations WHERE id = p_org_id;
  IF p_mode = 'live' AND v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Sentry stays in practice until onboarding is finished.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.leads l
  WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL
    AND l.created_at >= COALESCE(p_watch_from, now())
    AND l.first_human_touch_at IS NULL
    AND l.do_not_contact IS FALSE
    AND l.status NOT IN ('closed_won', 'closed_lost')
    AND NOT EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.org_id = l.org_id AND o.lead_id = l.id);
  IF p_preview THEN
    RETURN jsonb_build_object('wouldAlert', v_count);
  END IF;
  INSERT INTO public.sentry_workspaces (org_id, mode, watch_from, activated_by, activated_at, updated_at)
  VALUES (p_org_id, p_mode, COALESCE(p_watch_from, now()), auth.uid(), now(), now())
  ON CONFLICT (org_id) DO UPDATE
  SET mode = EXCLUDED.mode, watch_from = EXCLUDED.watch_from, activated_by = EXCLUDED.activated_by, activated_at = EXCLUDED.activated_at, pause_reason = NULL, updated_at = now();
  PERFORM public.ws_log(p_org_id, 'sentry.mode', 'sentry_workspaces', p_org_id::text, jsonb_build_object('mode', p_mode, 'watch_from', p_watch_from), auth.uid());
  RETURN jsonb_build_object('wouldAlert', v_count, 'mode', p_mode);
END;
$$;
