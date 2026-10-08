-- Configuration at run time: opt-outs recorded on the lead, and a visible
-- record of every agent that stopped because its configuration was incomplete.
-- Additive only; nothing existing changes behaviour until the app reads it.

-- ---------------------------------------------------------------------------
-- 1. Opt-outs. A reply that is exactly an opt-out word marks the lead, and
--    nothing more is sent to them until they text back in (START / UNSTOP).
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS opted_out_word text,
  ADD COLUMN IF NOT EXISTS opted_out_channel text;

COMMENT ON COLUMN public.leads.opted_out_at IS
  'When the lead replied with an opt-out word (compliance.opt_out_words). Every send to this lead is blocked while set.';

CREATE INDEX IF NOT EXISTS leads_opted_out_idx ON public.leads (org_id) WHERE opted_out_at IS NOT NULL;

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
