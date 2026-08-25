-- Prompt 14: production hardening and data lifecycle.
--
-- Product choices (stated, not guessed):
--   * Transcript retention defaults to 365 days, configurable per org,
--     bounded 30–1095. Indefinite retention is forbidden.
--   * Extractions and objections outlive transcripts. Purging a transcript
--     nulls raw_transcript / recording_url and sets transcript_purged_at.
--     The call row and call_extractions stay. Quote-integrity checks skip
--     purged calls so a deletion cannot orphan an extraction.
--   * Unmatched transcript bodies follow the same retention window.
--   * Raw webhook payloads: 14 days, then replaced with {"purged":true}.
--     Rows remain for idempotency metadata.
--   * Notification records: 90 days, then deleted.
--   * Leads, touches, calls, scores, revenue, baseline: life of the relationship.
--   * Offboarding grace: 30 days after inactive_at before scheduled deletion.
--   * Export is available to org owner/admin (their data) and platform admin.
--     Irreversible deletion and offboarding are platform-admin only so a
--     setter/admin cannot silently destroy history.
--   * Staging CRM writes: VISTRIAL_ENV=staging plus GHL_ALLOWED_LOCATION_IDS.
--     An empty allowlist in staging blocks every location. There is no
--     documented HighLevel location-id format that distinguishes sandbox
--     from production, so an allowlist is the only non-guessed control.
--   * Job-missed alert: last success older than interval + grace
--     (minute jobs +2m, hourly +10m, daily +2h). Not 2× interval — a daily
--     job that misses one run would otherwise wait two days to page.
--   * Extraction failure alert: >20% dead/failed over 24h with n >= 10.
--   * Draft rejection alert: >30% rejected over 7d with n >= 10.
--   * Lead quiet window: 6 hours when a CRM location is connected.
--   * Transcript quiet window: 48 hours when a transcript source is connected.
--   * ops_alerts.phase1_unused_pad is unused by application code. A later
--     migration drops it (two-phase destructive change).

-- ---------------------------------------------------------------------------
-- Org lifecycle and retention windows
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS transcript_retention_days integer NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS inactive_at timestamptz,
  ADD COLUMN IF NOT EXISTS offboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS delete_after date,
  ADD COLUMN IF NOT EXISTS offboard_reason text;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_transcript_retention_days_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_transcript_retention_days_check
  CHECK (transcript_retention_days BETWEEN 30 AND 1095);

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS transcript_purged_at timestamptz;

ALTER TABLE public.unmatched_transcripts
  ADD COLUMN IF NOT EXISTS transcript_purged_at timestamptz;

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS payload_purged_at timestamptz;

COMMENT ON COLUMN public.organizations.transcript_retention_days IS
  'Days to keep raw transcript text. Default 365. Extractions survive the purge.';
COMMENT ON COLUMN public.calls.transcript_purged_at IS
  'Set when raw_transcript and recording_url are cleared. Extraction rows stay.';

-- Purged transcripts must not fail quote-integrity checks.
CREATE OR REPLACE FUNCTION public.extraction_quotes_not_in_transcript()
RETURNS TABLE (
  extraction_id uuid,
  call_id uuid,
  org_id uuid,
  quote_text text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    e.id,
    e.call_id,
    e.org_id,
    trim(q.elem ->> 'text') AS quote_text
  FROM public.call_extractions e
  JOIN public.calls c ON c.id = e.call_id AND c.org_id = e.org_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(e.quotes) = 'array' THEN e.quotes
      ELSE '[]'::jsonb
    END
  ) AS q(elem)
  WHERE c.transcript_purged_at IS NULL
    AND trim(COALESCE(q.elem ->> 'text', '')) <> ''
    AND position(
      regexp_replace(lower(trim(q.elem ->> 'text')), '\s+', '', 'g')
      IN regexp_replace(lower(COALESCE(c.raw_transcript, '')), '\s+', '', 'g')
    ) = 0;
$$;

REVOKE ALL ON FUNCTION public.extraction_quotes_not_in_transcript() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extraction_quotes_not_in_transcript() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rate limiting (auth brute-force + public routes)
-- ---------------------------------------------------------------------------

CREATE TABLE public.rate_limit_buckets (
  bucket_key text NOT NULL,
  window_started_at timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_started_at)
);

COMMENT ON TABLE public.rate_limit_buckets IS
  'Sliding fixed windows for public routes and auth. Service-role only. No PII: keys are hashed.';

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window timestamptz;
  v_count integer;
BEGIN
  IF p_key IS NULL OR length(p_key) < 8 THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0);
  END IF;
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0);
  END IF;

  v_window := date_bin(
    make_interval(secs => p_window_seconds),
    now(),
    timestamptz '2000-01-01'
  );

  INSERT INTO public.rate_limit_buckets (bucket_key, window_started_at, hit_count)
  VALUES (p_key, v_window, 1)
  ON CONFLICT (bucket_key, window_started_at)
  DO UPDATE SET hit_count = public.rate_limit_buckets.hit_count + 1
  RETURNING hit_count INTO v_count;

  RETURN jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', GREATEST(p_limit - v_count, 0),
    'count', v_count,
    'windowStartedAt', v_window
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Job catalog + heartbeats (alert when a job does not run)
-- ---------------------------------------------------------------------------

CREATE TABLE public.ops_job_catalog (
  job_name text PRIMARY KEY,
  cron_expr text NOT NULL,
  interval_seconds integer NOT NULL,
  grace_seconds integer NOT NULL,
  check_first text NOT NULL,
  CONSTRAINT ops_job_catalog_interval_pos CHECK (interval_seconds > 0 AND grace_seconds >= 0)
);

CREATE TABLE public.ops_job_runs (
  job_name text PRIMARY KEY REFERENCES public.ops_job_catalog (job_name) ON DELETE CASCADE,
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  last_duration_ms integer,
  last_result jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES
  ('ghost-detector', '0 6 * * *', 86400, 7200, 'Open /api/cron/ghost-detector logs and ghost_detector_runs. Confirm CRON_SECRET and that Vercel Cron still lists this path.'),
  ('ghl-ingest', '* * * * *', 60, 120, 'Open webhook_events unprocessed count and /api/cron/ghl-ingest. Confirm the queue is moving and GHL signatures still verify.'),
  ('transcripts', '* * * * *', 60, 120, 'Open extraction_jobs pending and /api/cron/transcripts. Confirm transcript webhooks are 200ing.'),
  ('baseline-backfill', '* * * * *', 60, 120, 'Open baseline_runs in running/failed and /api/cron/baseline-backfill.'),
  ('reporting', '0 * * * *', 3600, 600, 'Open reporting_job_runs for the last hour and /api/cron/reporting.'),
  ('profile', '30 4 * * *', 86400, 7200, 'Open /api/cron/profile and profile_review_prompts freshness.'),
  ('notifications', '* * * * *', 60, 120, 'Open notifications queued older than a minute and /api/cron/notifications. Confirm Resend/Twilio/VAPID keys for this environment.'),
  ('ops-health', '* * * * *', 60, 180, 'Open /api/cron/ops-health. If this job is itself overdue, Cron is down — check Vercel Cron and CRON_SECRET first.'),
  ('retention', '15 3 * * *', 86400, 7200, 'Open retention_runs and /api/cron/retention. Confirm the last run was not stuck in dry-run.')
ON CONFLICT (job_name) DO UPDATE
  SET cron_expr = EXCLUDED.cron_expr,
      interval_seconds = EXCLUDED.interval_seconds,
      grace_seconds = EXCLUDED.grace_seconds,
      check_first = EXCLUDED.check_first;

-- Seed last_success_at = now() so a fresh deploy does not page before the first cron tick.
INSERT INTO public.ops_job_runs (job_name, last_success_at, updated_at)
SELECT job_name, now(), now() FROM public.ops_job_catalog
ON CONFLICT (job_name) DO NOTHING;

ALTER TABLE public.ops_job_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ops_job_catalog_select_da
  ON public.ops_job_catalog FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY ops_job_runs_select_da
  ON public.ops_job_runs FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON TABLE public.ops_job_catalog FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ops_job_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ops_job_catalog, public.ops_job_runs TO authenticated;
GRANT ALL ON TABLE public.ops_job_catalog, public.ops_job_runs TO service_role;

CREATE OR REPLACE FUNCTION public.record_ops_job_run(
  p_job_name text,
  p_ok boolean,
  p_error text DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_result jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ops_job_runs (
    job_name, last_started_at, last_success_at, last_failure_at, last_error, last_duration_ms, last_result, updated_at
  )
  VALUES (
    p_job_name,
    now(),
    CASE WHEN p_ok THEN now() ELSE NULL END,
    CASE WHEN p_ok THEN NULL ELSE now() END,
    CASE WHEN p_ok THEN NULL ELSE left(COALESCE(p_error, 'failed'), 500) END,
    p_duration_ms,
    p_result,
    now()
  )
  ON CONFLICT (job_name) DO UPDATE
    SET last_started_at = now(),
        last_success_at = CASE WHEN p_ok THEN now() ELSE public.ops_job_runs.last_success_at END,
        last_failure_at = CASE WHEN p_ok THEN public.ops_job_runs.last_failure_at ELSE now() END,
        last_error = CASE WHEN p_ok THEN NULL ELSE left(COALESCE(p_error, 'failed'), 500) END,
        last_duration_ms = COALESCE(p_duration_ms, public.ops_job_runs.last_duration_ms),
        last_result = COALESCE(p_result, public.ops_job_runs.last_result),
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_ops_job_run(text, boolean, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ops_job_run(text, boolean, text, integer, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Alerts (DA only) + HTTP error samples
-- ---------------------------------------------------------------------------

CREATE TABLE public.ops_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  org_id uuid,
  title text NOT NULL,
  check_first text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  fired_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  notify_count integer NOT NULL DEFAULT 1,
  phase1_unused_pad text,
  CONSTRAINT ops_alerts_severity_check CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT ops_alerts_org_fkey FOREIGN KEY (org_id) REFERENCES public.organizations (id) ON DELETE SET NULL
);

COMMENT ON COLUMN public.ops_alerts.phase1_unused_pad IS
  'Unused. Application never reads or writes this. Dropped in the following migration after this one is applied (two-phase).';
COMMENT ON COLUMN public.ops_alerts.check_first IS
  'The first place a DA operator should look. An alert without this is not shipped.';

CREATE INDEX ops_alerts_open_idx ON public.ops_alerts (fired_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX ops_alerts_org_idx ON public.ops_alerts (org_id, fired_at DESC);

CREATE TABLE public.ops_http_errors (
  route text NOT NULL,
  window_started_at timestamptz NOT NULL,
  error_count integer NOT NULL DEFAULT 0,
  sample_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (route, window_started_at)
);

CREATE TABLE public.ops_health_samples (
  sampled_at timestamptz PRIMARY KEY DEFAULT now(),
  app_ok boolean NOT NULL,
  db_ok boolean NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_http_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_health_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY ops_alerts_select_da
  ON public.ops_alerts FOR SELECT TO authenticated
  USING (public.is_platform_admin());
CREATE POLICY ops_http_errors_select_da
  ON public.ops_http_errors FOR SELECT TO authenticated
  USING (public.is_platform_admin());
CREATE POLICY ops_health_samples_select_da
  ON public.ops_health_samples FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON TABLE public.ops_alerts, public.ops_http_errors, public.ops_health_samples FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ops_alerts, public.ops_http_errors, public.ops_health_samples TO authenticated;
GRANT ALL ON TABLE public.ops_alerts, public.ops_http_errors, public.ops_health_samples TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_ops_alert(
  p_fingerprint text,
  p_kind text,
  p_severity text,
  p_org_id uuid,
  p_title text,
  p_check_first text,
  p_detail jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_resolved timestamptz;
BEGIN
  INSERT INTO public.ops_alerts (
    fingerprint, kind, severity, org_id, title, check_first, detail, fired_at, last_seen_at, resolved_at, notify_count
  )
  VALUES (
    p_fingerprint, p_kind, p_severity, p_org_id, p_title, p_check_first, COALESCE(p_detail, '{}'::jsonb),
    now(), now(), NULL, 1
  )
  ON CONFLICT (fingerprint) DO UPDATE
    SET last_seen_at = now(),
        title = EXCLUDED.title,
        check_first = EXCLUDED.check_first,
        detail = EXCLUDED.detail,
        severity = EXCLUDED.severity,
        resolved_at = NULL,
        notify_count = CASE
          WHEN public.ops_alerts.resolved_at IS NOT NULL THEN public.ops_alerts.notify_count + 1
          WHEN public.ops_alerts.last_seen_at < now() - interval '6 hours' THEN public.ops_alerts.notify_count + 1
          ELSE public.ops_alerts.notify_count
        END
  RETURNING id, resolved_at INTO v_id, v_resolved;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_ops_alert(p_fingerprint text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ops_alerts
  SET resolved_at = COALESCE(resolved_at, now())
  WHERE fingerprint = p_fingerprint
    AND resolved_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_ops_alert(text, text, text, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_ops_alert(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_ops_alert(text, text, text, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_ops_alert(text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_ops_http_sample(p_route text, p_is_error boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window timestamptz;
BEGIN
  v_window := date_bin(interval '1 hour', now(), timestamptz '2000-01-01');
  INSERT INTO public.ops_http_errors (route, window_started_at, error_count, sample_count)
  VALUES (p_route, v_window, CASE WHEN p_is_error THEN 1 ELSE 0 END, 1)
  ON CONFLICT (route, window_started_at)
  DO UPDATE SET
    error_count = public.ops_http_errors.error_count + CASE WHEN p_is_error THEN 1 ELSE 0 END,
    sample_count = public.ops_http_errors.sample_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ops_http_sample(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ops_http_sample(text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.sample_db_runtime()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'connectionsActive', count(*) FILTER (WHERE state = 'active'),
    'connectionsIdle', count(*) FILTER (WHERE state = 'idle'),
    'connectionsTotal', count(*),
    'slowQueries', count(*) FILTER (
      WHERE state = 'active'
        AND query_start < now() - interval '1 second'
        AND pid <> pg_backend_pid()
    )
  )
  FROM pg_stat_activity
  WHERE datname = current_database();
$$;

REVOKE ALL ON FUNCTION public.sample_db_runtime() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sample_db_runtime() TO service_role;

-- ---------------------------------------------------------------------------
-- Incidents
-- ---------------------------------------------------------------------------

CREATE TABLE public.ops_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  title text NOT NULL,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  cause text,
  impact text,
  prevention text,
  client_notified_at timestamptz,
  client_notified_by text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_incidents_status_check CHECK (status IN ('open', 'mitigating', 'resolved'))
);

COMMENT ON TABLE public.ops_incidents IS
  'Every incident records timeline, cause, impact, prevention, and who told the client.';

ALTER TABLE public.ops_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY ops_incidents_select_da
  ON public.ops_incidents FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON TABLE public.ops_incidents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ops_incidents TO authenticated;
GRANT ALL ON TABLE public.ops_incidents TO service_role;

-- ---------------------------------------------------------------------------
-- Restore drills (RTO evidence)
-- ---------------------------------------------------------------------------

CREATE TABLE public.ops_restore_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  duration_ms integer NOT NULL,
  source_label text NOT NULL,
  verified boolean NOT NULL,
  integrity jsonb NOT NULL DEFAULT '{}'::jsonb,
  rpo_minutes integer,
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ops_restore_drills ENABLE ROW LEVEL SECURITY;

CREATE POLICY ops_restore_drills_select_da
  ON public.ops_restore_drills FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON TABLE public.ops_restore_drills FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ops_restore_drills TO authenticated;
GRANT ALL ON TABLE public.ops_restore_drills TO service_role;

-- ---------------------------------------------------------------------------
-- Retention runs
-- ---------------------------------------------------------------------------

CREATE TABLE public.retention_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dry_run boolean NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  deleted jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text
);

ALTER TABLE public.retention_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY retention_runs_select_da
  ON public.retention_runs FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON TABLE public.retention_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.retention_runs TO authenticated;
GRANT ALL ON TABLE public.retention_runs TO service_role;

CREATE OR REPLACE FUNCTION public.run_data_retention(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_transcripts integer := 0;
  v_unmatched integer := 0;
  v_payloads integer := 0;
  v_notifications integer := 0;
  v_rate_buckets integer := 0;
  v_http integer := 0;
  v_health integer := 0;
  v_result jsonb;
BEGIN
  INSERT INTO public.retention_runs (dry_run) VALUES (p_dry_run) RETURNING id INTO v_run_id;

  -- Transcripts: clear body, keep extraction. Idempotent on transcript_purged_at.
  IF p_dry_run THEN
    SELECT count(*) INTO v_transcripts
    FROM public.calls c
    JOIN public.organizations o ON o.id = c.org_id
    WHERE c.transcript_purged_at IS NULL
      AND c.raw_transcript IS NOT NULL
      AND c.created_at < now() - make_interval(days => o.transcript_retention_days);
  ELSE
    UPDATE public.calls c
    SET raw_transcript = NULL,
        recording_url = NULL,
        transcript_purged_at = now()
    FROM public.organizations o
    WHERE o.id = c.org_id
      AND c.transcript_purged_at IS NULL
      AND c.raw_transcript IS NOT NULL
      AND c.created_at < now() - make_interval(days => o.transcript_retention_days);
    GET DIAGNOSTICS v_transcripts = ROW_COUNT;
  END IF;

  IF p_dry_run THEN
    SELECT count(*) INTO v_unmatched
    FROM public.unmatched_transcripts u
    JOIN public.organizations o ON o.id = u.org_id
    WHERE u.transcript_purged_at IS NULL
      AND u.raw_transcript IS NOT NULL
      AND u.raw_transcript <> ''
      AND u.received_at < now() - make_interval(days => o.transcript_retention_days);
  ELSE
    UPDATE public.unmatched_transcripts u
    SET raw_transcript = '',
        transcript_purged_at = now()
    FROM public.organizations o
    WHERE o.id = u.org_id
      AND u.transcript_purged_at IS NULL
      AND u.raw_transcript IS NOT NULL
      AND u.raw_transcript <> ''
      AND u.received_at < now() - make_interval(days => o.transcript_retention_days);
    GET DIAGNOSTICS v_unmatched = ROW_COUNT;
  END IF;

  -- Webhook payloads: 14 days.
  IF p_dry_run THEN
    SELECT count(*) INTO v_payloads
    FROM public.webhook_events
    WHERE payload_purged_at IS NULL
      AND received_at < now() - interval '14 days'
      AND payload <> '{"purged":true}'::jsonb;
  ELSE
    UPDATE public.webhook_events
    SET payload = '{"purged":true}'::jsonb,
        payload_purged_at = now()
    WHERE payload_purged_at IS NULL
      AND received_at < now() - interval '14 days'
      AND payload <> '{"purged":true}'::jsonb;
    GET DIAGNOSTICS v_payloads = ROW_COUNT;
  END IF;

  -- Notification records: 90 days. Keep da_console rows out of org retention? They still age out.
  IF p_dry_run THEN
    SELECT count(*) INTO v_notifications
    FROM public.notifications
    WHERE queued_at < now() - interval '90 days';
  ELSE
    DELETE FROM public.notifications
    WHERE queued_at < now() - interval '90 days';
    GET DIAGNOSTICS v_notifications = ROW_COUNT;
  END IF;

  -- Rate-limit and HTTP samples: 14 days.
  IF p_dry_run THEN
    SELECT count(*) INTO v_rate_buckets FROM public.rate_limit_buckets WHERE window_started_at < now() - interval '14 days';
    SELECT count(*) INTO v_http FROM public.ops_http_errors WHERE window_started_at < now() - interval '14 days';
    SELECT count(*) INTO v_health FROM public.ops_health_samples WHERE sampled_at < now() - interval '14 days';
  ELSE
    DELETE FROM public.rate_limit_buckets WHERE window_started_at < now() - interval '14 days';
    GET DIAGNOSTICS v_rate_buckets = ROW_COUNT;
    DELETE FROM public.ops_http_errors WHERE window_started_at < now() - interval '14 days';
    GET DIAGNOSTICS v_http = ROW_COUNT;
    DELETE FROM public.ops_health_samples WHERE sampled_at < now() - interval '14 days';
    GET DIAGNOSTICS v_health = ROW_COUNT;
  END IF;

  v_result := jsonb_build_object(
    'runId', v_run_id,
    'dryRun', p_dry_run,
    'transcriptsPurged', v_transcripts,
    'unmatchedPurged', v_unmatched,
    'webhookPayloadsPurged', v_payloads,
    'notificationsDeleted', v_notifications,
    'rateBucketsDeleted', v_rate_buckets,
    'httpSamplesDeleted', v_http,
    'healthSamplesDeleted', v_health
  );

  UPDATE public.retention_runs
  SET finished_at = now(), deleted = v_result
  WHERE id = v_run_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.run_data_retention(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_data_retention(boolean) TO service_role;

-- Org wipe is the one legal path that deletes append-only case-file history.
CREATE OR REPLACE FUNCTION public.forbid_readiness_score_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('vistrial.allow_org_wipe', true) = '1' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'readiness_scores is append-only';
END;
$$;

CREATE OR REPLACE FUNCTION public.forbid_case_file_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('vistrial.allow_org_wipe', true) = '1' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'case file history is not deleted';
END;
$$;

-- ---------------------------------------------------------------------------
-- Org row counts, export helper bits, deletion
-- ---------------------------------------------------------------------------

CREATE TABLE public.org_deletion_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  org_name text NOT NULL,
  org_slug text NOT NULL,
  confirmation_name text NOT NULL,
  reason text NOT NULL,
  actor_user_id uuid,
  actor_email text,
  counts_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  aggregates_recomputed boolean NOT NULL DEFAULT false,
  leftover jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'completed',
  CONSTRAINT org_deletion_records_status_check CHECK (status IN ('completed', 'failed'))
);

COMMENT ON TABLE public.org_deletion_records IS
  'Survives org deletion. No FK to organizations. Proof that a wipe happened, who did it, and that leftover counts were zero.';

ALTER TABLE public.org_deletion_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_deletion_records_select_da
  ON public.org_deletion_records FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON TABLE public.org_deletion_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.org_deletion_records TO authenticated;
GRANT ALL ON TABLE public.org_deletion_records TO service_role;

CREATE OR REPLACE FUNCTION public.org_scoped_row_counts(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.org_scoped_row_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_scoped_row_counts(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_org_data(
  p_org_id uuid,
  p_confirmation_name text,
  p_reason text,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_slug text;
  v_before jsonb;
  v_after jsonb;
  v_record_id uuid;
  v_webhook_ids uuid[];
  v_member_user_ids uuid[];
BEGIN
  IF p_confirmation_name IS NULL OR length(trim(p_confirmation_name)) = 0 THEN
    RAISE EXCEPTION 'confirmation_required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT name, slug INTO v_name, v_slug
  FROM public.organizations
  WHERE id = p_org_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'org_missing';
  END IF;

  IF trim(p_confirmation_name) IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'confirmation_mismatch';
  END IF;

  v_before := public.org_scoped_row_counts(p_org_id);

  SELECT coalesce(array_agg(user_id), '{}') INTO v_member_user_ids
  FROM public.org_members
  WHERE org_id = p_org_id;

  INSERT INTO public.org_deletion_records (
    org_id, org_name, org_slug, confirmation_name, reason, actor_user_id, actor_email, counts_before, status
  )
  VALUES (
    p_org_id, v_name, v_slug, trim(p_confirmation_name), trim(p_reason), p_actor_user_id, p_actor_email, v_before, 'completed'
  )
  RETURNING id INTO v_record_id;

  -- Tables whose org_id is ON DELETE SET NULL would otherwise leave rows behind
  -- that org_scoped_row_counts would no longer see. Delete them first.
  SELECT coalesce(array_agg(id), '{}') INTO v_webhook_ids
  FROM public.webhook_events
  WHERE org_id = p_org_id;
  DELETE FROM public.webhook_events WHERE org_id = p_org_id;
  IF to_regclass('public.staff_access_log') IS NOT NULL THEN
    DELETE FROM public.staff_access_log WHERE org_id = p_org_id;
  END IF;
  DELETE FROM public.ops_alerts WHERE org_id = p_org_id;
  -- Incidents stay with org_id nulled: they are the surviving DA audit, like
  -- org_deletion_records. That is intentional.

  -- Halt anything still queued, then wipe the tenant.
  PERFORM public.halt_org_follow_up_sequences(p_org_id, NULL);

  PERFORM set_config('vistrial.allow_org_wipe', '1', true);
  DELETE FROM public.organizations WHERE id = p_org_id;

  -- Members cascade with the org. Auth users that only existed for this
  -- workspace must not remain after a deletion the client was told was complete.
  DELETE FROM auth.users u
  WHERE u.id = ANY (v_member_user_ids)
    AND NOT EXISTS (SELECT 1 FROM public.org_members m WHERE m.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM public.platform_admins p WHERE p.user_id = u.id);

  PERFORM public.benchmark_refresh_cohorts();

  v_after := public.org_scoped_row_counts(p_org_id);

  IF v_after <> '{}'::jsonb THEN
    UPDATE public.org_deletion_records
    SET leftover = v_after,
        aggregates_recomputed = true,
        status = 'failed',
        completed_at = now()
    WHERE id = v_record_id;
    RAISE EXCEPTION 'deletion_incomplete %', v_after::text;
  END IF;

  UPDATE public.org_deletion_records
  SET leftover = '{}'::jsonb,
      aggregates_recomputed = true,
      completed_at = now(),
      status = 'completed'
  WHERE id = v_record_id;

  RETURN jsonb_build_object(
    'recordId', v_record_id,
    'orgId', p_org_id,
    'orgName', v_name,
    'countsBefore', v_before,
    'leftover', v_after,
    'webhookEventsRemoved', coalesce(array_length(v_webhook_ids, 1), 0),
    'aggregatesRecomputed', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_org_data(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_org_data(uuid, text, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_org_offboarded(
  p_org_id uuid,
  p_reason text,
  p_grace_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grace integer;
  v_delete_after date;
BEGIN
  v_grace := GREATEST(COALESCE(p_grace_days, 30), 1);
  v_delete_after := (now() AT TIME ZONE 'utc')::date + v_grace;

  PERFORM public.halt_org_follow_up_sequences(p_org_id, NULL);

  UPDATE public.organizations
  SET inactive_at = COALESCE(inactive_at, now()),
      offboarded_at = COALESCE(offboarded_at, now()),
      delete_after = COALESCE(delete_after, v_delete_after),
      offboard_reason = COALESCE(offboard_reason, p_reason)
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_missing';
  END IF;

  RETURN jsonb_build_object(
    'orgId', p_org_id,
    'deleteAfter', v_delete_after,
    'graceDays', v_grace
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_org_offboarded(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_org_offboarded(uuid, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Alert evaluation (jobs that did not run + per-client business health)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.evaluate_ops_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fired integer := 0;
  v_resolved integer := 0;
  r record;
  v_fp text;
  v_open text[];
  v_connected boolean;
  v_transcript_src boolean;
  v_last_lead timestamptz;
  v_last_transcript timestamptz;
  v_extract_n integer;
  v_extract_fail integer;
  v_draft_n integer;
  v_draft_rej integer;
  v_unprocessed integer;
  v_oldest interval;
  v_ingest_orgs integer;
  v_failing_jobs integer;
BEGIN
  v_open := ARRAY[]::text[];

  -- Missed jobs (including jobs that never failed — they simply stopped).
  FOR r IN
    SELECT
      c.job_name,
      c.check_first,
      c.interval_seconds,
      c.grace_seconds,
      j.last_success_at,
      j.last_error
    FROM public.ops_job_catalog c
    LEFT JOIN public.ops_job_runs j ON j.job_name = c.job_name
  LOOP
    IF r.last_success_at IS NULL
       OR r.last_success_at < now() - make_interval(secs => r.interval_seconds + r.grace_seconds)
    THEN
      v_fp := 'job_missed:' || r.job_name;
      PERFORM public.upsert_ops_alert(
        v_fp,
        'job_missed',
        'critical',
        NULL,
        'Job did not run: ' || r.job_name,
        r.check_first,
        jsonb_build_object(
          'jobName', r.job_name,
          'lastSuccessAt', r.last_success_at,
          'lastError', r.last_error
        )
      );
      v_open := v_open || v_fp;
      v_fired := v_fired + 1;
    ELSE
      PERFORM public.resolve_ops_alert('job_missed:' || r.job_name);
      v_resolved := v_resolved + 1;
    END IF;
  END LOOP;

  -- Global ingest backlog.
  SELECT count(*) FILTER (WHERE processed = false AND status = 'pending'),
         now() - min(received_at) FILTER (WHERE processed = false AND status = 'pending')
    INTO v_unprocessed, v_oldest
  FROM public.webhook_events;

  IF v_unprocessed > 0 AND v_oldest >= interval '30 minutes' THEN
    v_fp := 'ingest_backlog:global';
    PERFORM public.upsert_ops_alert(
      v_fp,
      'ingest_backlog',
      'critical',
      NULL,
      'Ingestion backlog across clients',
      'Open webhook_events where processed = false, then /api/cron/ghl-ingest and /api/health/ingestion.',
      jsonb_build_object(
        'unprocessed', v_unprocessed,
        'oldestAgeSeconds', EXTRACT(epoch FROM v_oldest)::integer
      )
    );
    v_open := v_open || v_fp;
    v_fired := v_fired + 1;
  ELSE
    PERFORM public.resolve_ops_alert('ingest_backlog:global');
  END IF;

  -- Per-client business health. Skip inactive/offboarded orgs.
  FOR r IN
    SELECT o.id, o.name, o.ghl_location_id, o.inactive_at
    FROM public.organizations o
    WHERE o.inactive_at IS NULL
  LOOP
    v_connected := r.ghl_location_id IS NOT NULL;
    SELECT EXISTS (
      SELECT 1 FROM public.transcript_connections t WHERE t.org_id = r.id
    ) INTO v_transcript_src;

    IF v_connected THEN
      SELECT max(created_at) INTO v_last_lead FROM public.leads WHERE org_id = r.id;
      IF v_last_lead IS NULL OR v_last_lead < now() - interval '6 hours' THEN
        -- Only fire when the CRM has been linked long enough that 6h of silence is abnormal:
        -- a brand-new org with zero leads is expected. Require at least one historical lead
        -- OR a processed webhook in the last 7 days, else skip (onboarding).
        SELECT count(*) INTO v_ingest_orgs
        FROM public.webhook_events
        WHERE org_id = r.id AND processed = true AND received_at > now() - interval '7 days';
        IF v_ingest_orgs > 0 OR v_last_lead IS NOT NULL THEN
          v_fp := 'no_leads:' || r.id::text;
          PERFORM public.upsert_ops_alert(
            v_fp,
            'no_leads',
            'warning',
            r.id,
            'No leads ingested for ' || r.name,
            'Check ghl_connections.status, last webhook_events.received_at for this org, then HighLevel location webhooks.',
            jsonb_build_object('orgName', r.name, 'lastLeadAt', v_last_lead)
          );
          v_open := v_open || v_fp;
          v_fired := v_fired + 1;
        END IF;
      ELSE
        PERFORM public.resolve_ops_alert('no_leads:' || r.id::text);
      END IF;
    END IF;

    IF v_transcript_src THEN
      SELECT max(transcript_arrived_at) INTO v_last_transcript
      FROM public.calls
      WHERE org_id = r.id AND transcript_arrived_at IS NOT NULL;
      IF v_last_transcript IS NULL OR v_last_transcript < now() - interval '48 hours' THEN
        v_fp := 'no_transcripts:' || r.id::text;
        PERFORM public.upsert_ops_alert(
          v_fp,
          'no_transcripts',
          'warning',
          r.id,
          'No transcripts for ' || r.name,
          'Check transcript_connections.last_pull_error and unmatched_transcripts. Confirm the recorder webhook still points at this environment.',
          jsonb_build_object('orgName', r.name, 'lastTranscriptAt', v_last_transcript)
        );
        v_open := v_open || v_fp;
        v_fired := v_fired + 1;
      ELSE
        PERFORM public.resolve_ops_alert('no_transcripts:' || r.id::text);
      END IF;
    END IF;

    SELECT
      count(*) FILTER (WHERE created_at > now() - interval '24 hours'),
      count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND status = 'dead')
    INTO v_extract_n, v_extract_fail
    FROM public.extraction_jobs
    WHERE org_id = r.id;

    IF v_extract_n >= 10 AND v_extract_fail::numeric / v_extract_n::numeric > 0.20 THEN
      v_fp := 'extraction_fail:' || r.id::text;
      PERFORM public.upsert_ops_alert(
        v_fp,
        'extraction_failure_rate',
        'critical',
        r.id,
        'Extraction failure rate high for ' || r.name,
        'Open extraction_jobs where status = dead for this org. Check ANTHROPIC_API_KEY and last_error codes (never transcript text).',
        jsonb_build_object('orgName', r.name, 'n', v_extract_n, 'failed', v_extract_fail)
      );
      v_open := v_open || v_fp;
      v_fired := v_fired + 1;
    ELSE
      PERFORM public.resolve_ops_alert('extraction_fail:' || r.id::text);
    END IF;

    SELECT
      count(*) FILTER (WHERE created_at > now() - interval '7 days' AND status IN ('approved', 'rejected', 'sent')),
      count(*) FILTER (WHERE created_at > now() - interval '7 days' AND status = 'rejected')
    INTO v_draft_n, v_draft_rej
    FROM public.follow_up_drafts
    WHERE org_id = r.id;

    IF v_draft_n >= 10 AND v_draft_rej::numeric / v_draft_n::numeric > 0.30 THEN
      v_fp := 'draft_reject:' || r.id::text;
      PERFORM public.upsert_ops_alert(
        v_fp,
        'draft_rejection_rate',
        'warning',
        r.id,
        'Draft rejection rate high for ' || r.name,
        'Open follow_up_drafts rejected in the last 7 days and the voice profile. This is an adoption conversation, not a silent retry.',
        jsonb_build_object('orgName', r.name, 'n', v_draft_n, 'rejected', v_draft_rej)
      );
      v_open := v_open || v_fp;
      v_fired := v_fired + 1;
    ELSE
      PERFORM public.resolve_ops_alert('draft_reject:' || r.id::text);
    END IF;
  END LOOP;

  -- Notification delivery failures (global).
  SELECT count(*) INTO v_failing_jobs
  FROM public.notifications
  WHERE status = 'dead'
    AND queued_at > now() - interval '24 hours'
    AND is_test = false;

  IF v_failing_jobs >= 5 THEN
    v_fp := 'notification_dead:global';
    PERFORM public.upsert_ops_alert(
      v_fp,
      'notification_delivery',
      'warning',
      NULL,
      'Notification dead letters in the last 24 hours',
      'Open the Operator dead-letter table. Check Resend/Twilio/VAPID for this environment only — never a shared key.',
      jsonb_build_object('dead24h', v_failing_jobs)
    );
    v_open := v_open || v_fp;
    v_fired := v_fired + 1;
  ELSE
    PERFORM public.resolve_ops_alert('notification_dead:global');
  END IF;

  -- Global model API error rate (extraction jobs). Latency is processed_at - created_at
  -- on the Operator console; this alert is the silent-failure page.
  SELECT
    count(*) FILTER (WHERE created_at > now() - interval '1 hour'),
    count(*) FILTER (WHERE created_at > now() - interval '1 hour' AND status = 'dead')
  INTO v_extract_n, v_extract_fail
  FROM public.extraction_jobs;

  IF v_extract_n >= 10 AND v_extract_fail::numeric / v_extract_n::numeric > 0.50 THEN
    v_fp := 'model_outage:extraction';
    PERFORM public.upsert_ops_alert(
      v_fp,
      'model_outage',
      'critical',
      NULL,
      'Model API error rate high (extraction)',
      'Open extraction_jobs where status = dead. Check Anthropic status and ANTHROPIC_API_KEY for this environment only.',
      jsonb_build_object('n', v_extract_n, 'failed', v_extract_fail)
    );
    v_open := v_open || v_fp;
    v_fired := v_fired + 1;
  ELSE
    PERFORM public.resolve_ops_alert('model_outage:extraction');
  END IF;

  RETURN jsonb_build_object(
    'fired', v_fired,
    'resolved', v_resolved,
    'openFingerprints', to_jsonb(v_open)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_ops_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_ops_alerts() TO service_role;
