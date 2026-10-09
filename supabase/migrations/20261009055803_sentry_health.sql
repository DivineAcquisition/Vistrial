-- Sentry across workspaces for the Vistrial team, and the scenario check's
-- stored history. Neither holds lead names or message content.

CREATE TABLE IF NOT EXISTS public.sentry_quality_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_slug text NOT NULL,
  config_hash text,
  scenarios integer NOT NULL DEFAULT 0,
  passed_count integer NOT NULL DEFAULT 0,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  passed boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sentry_quality_runs_recent_idx ON public.sentry_quality_runs (template_slug, created_at DESC);

ALTER TABLE public.sentry_quality_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sentry_quality_runs_select ON public.sentry_quality_runs;
CREATE POLICY sentry_quality_runs_select ON public.sentry_quality_runs FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.user_staff_org_ids()));
GRANT SELECT ON public.sentry_quality_runs TO authenticated;
GRANT ALL ON public.sentry_quality_runs TO service_role;

-- Security invoker: every row still passes the caller's own row security, so
-- a Service Team member sees only the workspaces assigned to them.
CREATE OR REPLACE FUNCTION public.sentry_response_health()
RETURNS TABLE (
  org_id uuid,
  name text,
  org_status text,
  mode text,
  last_sweep_at timestamptz,
  last_error text,
  watched bigint,
  on_time bigint,
  at_risk bigint,
  missed bigint,
  open_alerts bigint,
  oldest_open_alert_at timestamptz,
  first_touches bigint,
  median_first_touch_seconds double precision,
  within_window_percent double precision,
  gaps bigint,
  gaps_met_percent double precision
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.user_staff_org_ids())) THEN
    RAISE EXCEPTION 'Only the Vistrial team can see response health across workspaces.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH scope AS (
    SELECT o.id, o.name, o.status::text AS status
    FROM public.organizations o
    WHERE public.is_platform_admin() OR o.id IN (SELECT public.user_staff_org_ids())
  ),
  clocks AS (
    SELECT c.org_id,
      count(*) AS watched,
      count(*) FILTER (WHERE c.state IN ('on_time', 'paused', 'resolved')) AS on_time,
      count(*) FILTER (WHERE c.state = 'at_risk') AS at_risk,
      count(*) FILTER (WHERE c.state = 'missed') AS missed
    FROM public.sentry_clocks c
    WHERE c.org_id IN (SELECT id FROM scope)
    GROUP BY c.org_id
  ),
  alerts AS (
    SELECT a.org_id, count(*) AS open_alerts, min(a.created_at) AS oldest
    FROM public.sentry_alerts a
    WHERE a.org_id IN (SELECT id FROM scope) AND a.status IN ('open', 'acknowledged', 'snoozed')
    GROUP BY a.org_id
  ),
  measured AS (
    SELECT m.org_id,
      count(*) FILTER (WHERE m.metric = 'time_to_first_touch') AS first_touches,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY m.seconds) FILTER (WHERE m.metric = 'time_to_first_touch') AS median_first,
      100.0 * count(*) FILTER (WHERE m.metric = 'time_to_first_touch' AND m.met)
        / NULLIF(count(*) FILTER (WHERE m.metric = 'time_to_first_touch' AND m.met IS NOT NULL), 0) AS within_pct,
      count(*) FILTER (WHERE m.metric = 'gap') AS gaps,
      100.0 * count(*) FILTER (WHERE m.metric = 'gap' AND m.met)
        / NULLIF(count(*) FILTER (WHERE m.metric = 'gap' AND m.met IS NOT NULL), 0) AS gaps_pct
    FROM public.sentry_measurements m
    WHERE m.org_id IN (SELECT id FROM scope) AND m.recorded_at >= now() - interval '30 days'
    GROUP BY m.org_id
  )
  SELECT s.id, s.name, s.status, COALESCE(w.mode, 'off'), w.last_sweep_at, w.last_error,
    COALESCE(c.watched, 0), COALESCE(c.on_time, 0), COALESCE(c.at_risk, 0), COALESCE(c.missed, 0),
    COALESCE(a.open_alerts, 0), a.oldest,
    COALESCE(m.first_touches, 0), m.median_first, m.within_pct, COALESCE(m.gaps, 0), m.gaps_pct
  FROM scope s
  LEFT JOIN public.sentry_workspaces w ON w.org_id = s.id
  LEFT JOIN clocks c ON c.org_id = s.id
  LEFT JOIN alerts a ON a.org_id = s.id
  LEFT JOIN measured m ON m.org_id = s.id
  ORDER BY COALESCE(c.missed, 0) DESC, s.name;
END;
$$;

REVOKE ALL ON FUNCTION public.sentry_response_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sentry_response_health() TO authenticated, service_role;
