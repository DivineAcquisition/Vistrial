-- Configuration at run time: opt-outs recorded per lead, and a visible
-- record of every agent that stopped because its configuration was incomplete.
-- Additive only; nothing existing changes behaviour until the app reads it.

-- ---------------------------------------------------------------------------
-- 1. Opt-outs. A reply that is exactly an opt-out word marks the lead, and
--    nothing more is sent to them until they text back in (START / UNSTOP).
-- ---------------------------------------------------------------------------

CREATE TABLE public.lead_opt_outs (
  lead_id uuid PRIMARY KEY REFERENCES public.leads (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  word text NOT NULL,
  channel text,
  config_version text
);

COMMENT ON TABLE public.lead_opt_outs IS
  'Leads who replied with an opt-out word (compliance.opt_out_words). Every send to them is blocked while a row exists; texting START or UNSTOP removes it.';

CREATE INDEX lead_opt_outs_org_idx ON public.lead_opt_outs (org_id);

ALTER TABLE public.lead_opt_outs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_opt_outs FROM anon, authenticated;
GRANT SELECT ON public.lead_opt_outs TO authenticated;
GRANT ALL ON public.lead_opt_outs TO service_role;

CREATE POLICY lead_opt_outs_select ON public.lead_opt_outs
  FOR SELECT TO authenticated USING (public.ws_lead_visible(org_id, lead_id));

-- ---------------------------------------------------------------------------
-- 2. Configuration stops. One open row per workspace and consumer; repeats
--    count up instead of piling up. Staff of the workspace can read them.
-- ---------------------------------------------------------------------------

CREATE TABLE public.config_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  consumer text NOT NULL,
  config_version text NOT NULL,
  reason text NOT NULL,
  problems jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_stopped_at timestamptz NOT NULL DEFAULT now(),
  last_stopped_at timestamptz NOT NULL DEFAULT now(),
  occurrences integer NOT NULL DEFAULT 1,
  notified_at timestamptz,
  resolved_at timestamptz,
  CONSTRAINT config_stops_consumer_check CHECK (consumer ~ '^[a-z_]+$')
);

COMMENT ON TABLE public.config_stops IS
  'An agent or job that refused to run because a setting it reads was missing or invalid. Open until the same consumer next runs cleanly.';

CREATE UNIQUE INDEX config_stops_one_open ON public.config_stops (org_id, consumer) WHERE resolved_at IS NULL;
CREATE INDEX config_stops_org_idx ON public.config_stops (org_id, last_stopped_at DESC);

ALTER TABLE public.config_stops ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.config_stops FROM anon, authenticated;
GRANT SELECT ON public.config_stops TO authenticated;
GRANT ALL ON public.config_stops TO service_role;

CREATE POLICY config_stops_select ON public.config_stops
  FOR SELECT TO authenticated USING (public.ws_is_staff(org_id));

/*
 * Record a stop. Returns the open stop's id and whether it is new (so the
 * caller alerts the Service Team once, not on every retry).
 */
CREATE OR REPLACE FUNCTION public.config_record_stop(
  p_org_id uuid,
  p_consumer text,
  p_config_version text,
  p_reason text,
  p_problems jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (stop_id uuid, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.config_stops
  SET last_stopped_at = now(), occurrences = occurrences + 1,
      config_version = p_config_version, reason = p_reason, problems = COALESCE(p_problems, '[]'::jsonb)
  WHERE org_id = p_org_id AND consumer = p_consumer AND resolved_at IS NULL
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, false;
    RETURN;
  END IF;

  INSERT INTO public.config_stops (org_id, consumer, config_version, reason, problems)
  VALUES (p_org_id, p_consumer, p_config_version, p_reason, COALESCE(p_problems, '[]'::jsonb))
  ON CONFLICT (org_id, consumer) WHERE resolved_at IS NULL DO UPDATE
    SET last_stopped_at = now(), occurrences = public.config_stops.occurrences + 1
  RETURNING id INTO v_id;

  PERFORM public.ws_log(p_org_id, 'config.agent_stopped', 'config_stops', v_id::text,
    jsonb_build_object('consumer', p_consumer, 'config_version', p_config_version, 'problems', COALESCE(p_problems, '[]'::jsonb)));
  RETURN QUERY SELECT v_id, true;
END;
$$;

-- The consumer ran cleanly again: close its open stop, if any.
CREATE OR REPLACE FUNCTION public.config_resolve_stop(p_org_id uuid, p_consumer text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.config_stops SET resolved_at = now()
  WHERE org_id = p_org_id AND consumer = p_consumer AND resolved_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.config_record_stop(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_resolve_stop(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.config_record_stop(uuid, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.config_resolve_stop(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The configuration gate for agents that run in a person's session (the
--    Operator, Ask Vistrial). They never hold the service-role key, and the
--    people they act for may not read configuration, so this answers only
--    "may this run?", the version, what is wrong, and the one line describing
--    the business that their prompts need. A stop is recorded here; the
--    Service Team is alerted by the notifications job.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.config_agent_gate(
  p_org_id uuid,
  p_consumer text,
  p_label text,
  p_sections text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_values jsonb;
  v_version text;
  v_problems jsonb;
  v_reason text;
BEGIN
  IF public.ws_end_user_request() AND public.ws_access(p_org_id) IS NULL THEN
    RAISE EXCEPTION 'Not a workspace you belong to.' USING ERRCODE = '42501';
  END IF;
  IF p_consumer !~ '^[a-z_]+$' OR NOT p_sections <@ (SELECT array_agg(DISTINCT section) FROM public.config_fields) THEN
    RAISE EXCEPTION 'Unknown configuration consumer.';
  END IF;

  v_values := public.config_effective_at(p_org_id) -> 'values';
  v_version := public.config_version_stamp(p_org_id);

  SELECT COALESCE(jsonb_agg(p ORDER BY p ->> 'key'), '[]'::jsonb) INTO v_problems
  FROM (
    SELECT jsonb_build_object('key', f.key, 'kind', 'missing',
             'message', format('"%s" is missing.', f.label)) AS p
    FROM public.config_fields f
    WHERE f.section = ANY (p_sections) AND f.required AND NOT f.workspace_only
      AND public.config_value_empty(f.field_type, v_values -> f.key)
    UNION ALL
    SELECT jsonb_build_object('key', f.key, 'kind', 'invalid',
             'message', public.config_validate_value(f.key, v_values -> f.key))
    FROM public.config_fields f
    WHERE f.section = ANY (p_sections)
      AND NOT public.config_value_empty(f.field_type, v_values -> f.key)
      AND public.config_validate_value(f.key, v_values -> f.key) IS NOT NULL
  ) problems;

  IF jsonb_array_length(v_problems) = 0 THEN
    UPDATE public.config_stops SET resolved_at = now()
    WHERE org_id = p_org_id AND consumer = p_consumer AND resolved_at IS NULL;
    RETURN jsonb_build_object(
      'ok', true,
      'version', v_version,
      'business_description', v_values ->> 'industry.business_description'
    );
  END IF;

  v_reason := format(
    '%s stopped because this workspace''s configuration needs attention: %s Fix it under Settings → Configuration.',
    left(COALESCE(NULLIF(btrim(p_label), ''), p_consumer), 80),
    (SELECT string_agg(e ->> 'message', ' ') FROM (SELECT e FROM jsonb_array_elements(v_problems) e LIMIT 3) x)
  );
  PERFORM public.config_record_stop(p_org_id, p_consumer, v_version, v_reason, v_problems);
  RETURN jsonb_build_object('ok', false, 'version', v_version, 'reason', v_reason, 'problems', v_problems);
END;
$$;

REVOKE ALL ON FUNCTION public.config_agent_gate(uuid, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.config_agent_gate(uuid, text, text, text[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Display settings for screens customers see (Forsight, the Stellar
--    portal). Only these few values, to anyone who belongs to the workspace;
--    the rest of the configuration stays with the Vistrial team.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.config_display_settings(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_values jsonb;
BEGIN
  IF public.ws_end_user_request() AND public.ws_access(p_org_id) IS NULL THEN
    RAISE EXCEPTION 'Not a workspace you belong to.' USING ERRCODE = '42501';
  END IF;
  v_values := public.config_effective_at(p_org_id) -> 'values';
  RETURN jsonb_build_object(
    'forsight_history_weeks', v_values -> 'sources.forsight_history_weeks',
    'forsight_quiet_days', v_values -> 'sources.forsight_quiet_days',
    'forsight_silent_days', v_values -> 'sources.forsight_silent_days',
    'forsight_long_silent_days', v_values -> 'sources.forsight_long_silent_days',
    'stellar_stage_labels', v_values -> 'sources.stellar_stage_labels'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.config_display_settings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.config_display_settings(uuid) TO authenticated, service_role;
