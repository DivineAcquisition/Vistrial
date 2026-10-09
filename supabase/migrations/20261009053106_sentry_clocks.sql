-- Sentry: one stored response clock per lead, one open alert, and a
-- per-workspace practice or live switch. Sentry never writes to a CRM.

CREATE TABLE IF NOT EXISTS public.sentry_workspaces (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'practice', 'live')),
  watch_from timestamptz,
  activated_by uuid,
  activated_at timestamptz,
  pause_reason text,
  last_sweep_at timestamptz,
  scan_after uuid,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sentry_clocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('first_touch', 'follow_up')),
  state text NOT NULL CHECK (state IN ('on_time', 'at_risk', 'missed', 'paused', 'not_applicable', 'resolved')),
  started_at timestamptz NOT NULL,
  deadline_at timestamptz,
  resolved_at timestamptz,
  window_minutes integer,
  elapsed_minutes integer,
  overdue_minutes integer,
  reason text,
  config_version text,
  manual boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, lead_id)
);

CREATE INDEX IF NOT EXISTS sentry_clocks_state_idx ON public.sentry_clocks (org_id, state);

CREATE TABLE IF NOT EXISTS public.sentry_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  clock_id uuid REFERENCES public.sentry_clocks (id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('nudge', 'escalation')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'snoozed', 'withdrawn', 'resolved')),
  title text NOT NULL,
  body text NOT NULL,
  snoozed_until timestamptz,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  withdraw_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sentry_alerts_one_open
  ON public.sentry_alerts (lead_id)
  WHERE status IN ('open', 'acknowledged', 'snoozed');

CREATE TABLE IF NOT EXISTS public.sentry_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  clock_id uuid,
  metric text NOT NULL,
  seconds integer,
  met boolean,
  detail text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sentry_measurements_org_idx ON public.sentry_measurements (org_id, metric, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.sentry_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'relay_unavailable' CHECK (status IN ('relay_unavailable', 'requested')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, lead_id)
);

