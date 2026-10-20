-- Domain 2. Convex owns the shared event record, pause controls, and notifications.
-- Postgres keeps a one-way copy for SQL readers. Direct writes are refused
-- unless the rollback switch is postgres, or the replica flag is on.

CREATE TABLE IF NOT EXISTS public.live_record_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  owner text NOT NULL DEFAULT 'convex' CHECK (owner IN ('convex', 'postgres'))
);

INSERT INTO public.live_record_control (id, owner)
VALUES (true, 'convex')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.live_record_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seq bigint NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  workspace_id uuid NOT NULL,
  job text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('commit', 'replicate')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS live_record_outbox_pending_idx
  ON public.live_record_outbox (seq)
  WHERE delivered_at IS NULL;

ALTER TABLE public.live_record_outbox ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.live_record_outbox TO service_role;

CREATE TABLE IF NOT EXISTS public.lead_access_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  setter_member_id uuid,
  closer_member_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE INDEX IF NOT EXISTS lead_access_outbox_pending_idx
  ON public.lead_access_outbox (id)
  WHERE applied_at IS NULL;

ALTER TABLE public.lead_access_outbox ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.lead_access_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.leads_queue_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.assigned_setter_id IS NOT DISTINCT FROM OLD.assigned_setter_id
     AND NEW.assigned_closer_id IS NOT DISTINCT FROM OLD.assigned_closer_id THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.lead_access_outbox (lead_id, workspace_id, setter_member_id, closer_member_id)
  VALUES (NEW.id, NEW.org_id, NEW.assigned_setter_id, NEW.assigned_closer_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_queue_access ON public.leads;
CREATE TRIGGER leads_queue_access
  AFTER INSERT OR UPDATE OF assigned_setter_id, assigned_closer_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_queue_access();

CREATE OR REPLACE FUNCTION public.live_record_guard_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('vistrial.live_record_replica', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF (SELECT owner FROM public.live_record_control WHERE id) = 'postgres' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'This record is owned by Convex.' USING ERRCODE = '42501';
END;
$$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'agent_activity_runs',
    'agent_activity_steps',
    'agent_activity_events',
    'agent_activity_outputs',
    'agent_activity_staff',
    'agent_presence_controls',
    'platform_agent_halts',
    'notifications',
    'notification_preferences',
    'notification_mutes',
    'notification_escalations',
    'notification_presence',
    'notification_push_subscriptions',
    'notification_push_settings',
    'notification_team_channels',
    'notification_digest_log',
    'agent_events',
    'agent_escalations'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS live_record_guard_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER live_record_guard_%I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.live_record_guard_write()',
      tbl, tbl
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.live_record_replicate(p_table text, p_row jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table NOT IN (
    'agent_activity_runs', 'agent_activity_steps', 'agent_activity_events', 'agent_activity_outputs',
    'agent_activity_staff', 'agent_presence_controls', 'platform_agent_halts', 'notifications',
    'notification_preferences', 'notification_mutes', 'notification_escalations', 'notification_presence',
    'notification_push_subscriptions', 'notification_push_settings', 'notification_team_channels',
    'notification_digest_log', 'agent_events', 'agent_escalations'
  ) THEN
    RAISE EXCEPTION 'That table is not part of the activity copy.';
  END IF;
  PERFORM set_config('vistrial.live_record_replica', 'on', true);
  EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT DO NOTHING', p_table, p_table)
    USING p_row;
END;
$$;

REVOKE ALL ON FUNCTION public.live_record_replicate(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_record_replicate(text, jsonb) TO service_role;

-- Scribe's hourly cost limit is counted on the job that was claimed,
-- which stays in Postgres with Scribe. It is not read from the activity log.
ALTER TABLE public.extraction_jobs ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

UPDATE public.extraction_jobs
SET claimed_at = COALESCE(processed_at, created_at)
WHERE claimed_at IS NULL
  AND status <> 'pending'
  AND COALESCE(processed_at, created_at) > now() - interval '1 hour';

CREATE OR REPLACE FUNCTION public.scribe_claim_job()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org record;
  v_id uuid;
BEGIN
  FOR v_org IN
    WITH due AS (
      SELECT e.org_id, min(e.next_attempt_at) AS oldest
      FROM public.extraction_jobs e
      WHERE e.status = 'pending' AND e.next_attempt_at <= now()
      GROUP BY e.org_id
    ), served AS (
      SELECT e.org_id, count(*) AS n
      FROM public.extraction_jobs e
      WHERE e.claimed_at > now() - interval '1 hour'
      GROUP BY e.org_id
    )
    SELECT d.org_id, COALESCE(s.n, 0) AS n
    FROM due d
    LEFT JOIN served s ON s.org_id = d.org_id
    WHERE COALESCE(s.n, 0) < public.scribe_hourly_limit(d.org_id)
    ORDER BY COALESCE(s.n, 0) ASC, d.oldest ASC
    LIMIT 25
  LOOP
    UPDATE public.extraction_jobs j
    SET claimed_at = now(), next_attempt_at = now() + interval '10 minutes'
    WHERE j.id = (
      SELECT e.id FROM public.extraction_jobs e
      WHERE e.org_id = v_org.org_id AND e.status = 'pending' AND e.next_attempt_at <= now()
      ORDER BY e.next_attempt_at ASC, e.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING j.id INTO v_id;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_live_record_owner(p_owner text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_owner NOT IN ('convex', 'postgres') THEN
    RAISE EXCEPTION 'Unknown owner.';
  END IF;
  UPDATE public.live_record_control SET owner = p_owner WHERE id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_live_record_owner(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_live_record_owner(text) TO service_role;
