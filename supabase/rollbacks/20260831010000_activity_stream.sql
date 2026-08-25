-- Rollback Prompt 21 activity stream.

DROP FUNCTION IF EXISTS public.load_ops_activity(uuid, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb);
DROP FUNCTION IF EXISTS public.load_org_activity(uuid, uuid, uuid, text, text, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb);
DROP INDEX IF EXISTS public.readiness_scores_org_created_idx;
DROP FUNCTION IF EXISTS public.activity_stream_source(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.activity_lead_label(text, text);
DROP FUNCTION IF EXISTS public.activity_plain_reason(text);
DROP FUNCTION IF EXISTS public.activity_channel_label(text);
DROP FUNCTION IF EXISTS public.activity_synth_id(text);
DROP FUNCTION IF EXISTS public.activity_scalar_json(jsonb);

DROP TRIGGER IF EXISTS leads_record_assignment_change ON public.leads;
DROP TRIGGER IF EXISTS leads_record_type_change ON public.leads;
DROP TRIGGER IF EXISTS lead_assignment_changes_forbid_delete ON public.lead_assignment_changes;
DROP TRIGGER IF EXISTS lead_type_changes_forbid_delete ON public.lead_type_changes;
DROP FUNCTION IF EXISTS public.record_lead_assignment_change();
DROP FUNCTION IF EXISTS public.record_lead_type_change();

DROP TABLE IF EXISTS public.lead_assignment_changes;
DROP TABLE IF EXISTS public.lead_type_changes;

ALTER TABLE public.follow_up_events DROP CONSTRAINT IF EXISTS follow_up_events_lead_org_fkey;
ALTER TABLE public.follow_up_events DROP COLUMN IF EXISTS lead_id;
ALTER TABLE public.objections DROP COLUMN IF EXISTS resolved_by_member_id;

DROP INDEX IF EXISTS public.follow_up_events_lead_time_idx;
DROP INDEX IF EXISTS public.follow_up_events_org_created_idx;
DROP INDEX IF EXISTS public.lead_status_changes_org_time_idx;
DROP INDEX IF EXISTS public.ghl_dispatches_org_created_idx;
DROP INDEX IF EXISTS public.extraction_jobs_org_created_idx;
DROP INDEX IF EXISTS public.operator_run_steps_org_started_idx;
DROP INDEX IF EXISTS public.operator_run_confirmations_org_created_idx;
DROP INDEX IF EXISTS public.follow_up_jobs_org_created_idx;
DROP INDEX IF EXISTS public.follow_up_sequence_runs_org_started_idx;
DROP INDEX IF EXISTS public.unmatched_transcripts_org_received_idx;
DROP INDEX IF EXISTS public.calls_org_created_idx;
DROP INDEX IF EXISTS public.reporting_job_runs_org_started_idx;
DROP INDEX IF EXISTS public.objections_org_resolved_idx;
DROP INDEX IF EXISTS public.next_actions_org_created_idx;

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY[
      'ghl_dispatches',
      'readiness_scores',
      'lead_status_changes',
      'lead_assignment_changes',
      'lead_type_changes',
      'extraction_jobs',
      'operator_runs',
      'follow_up_sequence_runs',
      'follow_up_jobs',
      'revenue_log',
      'settings_activity',
      'ghost_detector_runs'
    ]
    LOOP
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
      EXCEPTION
        WHEN undefined_object THEN NULL;
        WHEN undefined_table THEN NULL;
      END;
    END LOOP;
  END IF;
END
$$;

-- Restore the pre-stream case timeline.
CREATE OR REPLACE FUNCTION public.load_org_case_timeline(
  p_org_id uuid,
  p_lead_id uuid,
  p_cursor jsonb DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_rows jsonb;
  v_has_more boolean;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.leads WHERE id = p_lead_id AND org_id = p_org_id
  ) THEN
    RETURN NULL;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  IF p_cursor IS NOT NULL AND jsonb_typeof(p_cursor) = 'object' THEN
    v_cursor_at := NULLIF(p_cursor->>'at', '')::timestamptz;
    v_cursor_id := NULLIF(p_cursor->>'id', '')::uuid;
  END IF;

  SELECT COALESCE(jsonb_agg(page.elem ORDER BY page.at DESC, page.id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT stream.elem, stream.at, stream.id
    FROM (
      SELECT jsonb_build_object(
        'kind', 'touch',
        'id', t.id,
        'at', t.occurred_at,
        'touchType', t.type,
        'channel', t.channel,
        'direction', t.direction,
        'outcome', t.outcome,
        'actorName', actor.display_name,
        'note', t.summary,
        'outboundBody', CASE WHEN t.direction = 'outbound' THEN t.outbound_body ELSE NULL END
      ) AS elem,
      t.occurred_at AS at,
      t.id AS id
      FROM public.touches t
      LEFT JOIN public.org_members actor ON actor.id = t.actor_member_id
      WHERE t.org_id = p_org_id AND t.lead_id = p_lead_id

      UNION ALL

      SELECT jsonb_build_object(
        'kind', 'call',
        'id', c.id,
        'at', COALESCE(c.occurred_at, c.scheduled_at, c.created_at),
        'callType', c.type,
        'outcome', c.outcome,
        'actorName', runner.display_name,
        'durationSeconds', c.duration_seconds,
        'scheduledAt', c.scheduled_at,
        'occurredAt', c.occurred_at
      ),
      COALESCE(c.occurred_at, c.scheduled_at, c.created_at),
      c.id
      FROM public.calls c
      LEFT JOIN public.org_members runner ON runner.id = c.ran_by_member_id
      WHERE c.org_id = p_org_id AND c.lead_id = p_lead_id

      UNION ALL

      SELECT jsonb_build_object(
        'kind', 'status',
        'id', s.id,
        'at', s.created_at,
        'fromStatus', s.from_status,
        'toStatus', s.to_status,
        'source', s.source,
        'actorName', actor.display_name,
        'note', s.note,
        'supersedesManual', s.supersedes_manual
      ),
      s.created_at,
      s.id
      FROM (
        SELECT
          sc.*,
          (
            sc.source = 'event'
            AND LAG(sc.source) OVER (ORDER BY sc.created_at, sc.id) = 'manual'
          ) IS TRUE AS supersedes_manual
        FROM public.lead_status_changes sc
        WHERE sc.org_id = p_org_id AND sc.lead_id = p_lead_id
      ) s
      LEFT JOIN public.org_members actor ON actor.id = s.actor_member_id
    ) stream
    WHERE v_cursor_id IS NULL
      OR (stream.at, stream.id) < (v_cursor_at, v_cursor_id)
    ORDER BY stream.at DESC, stream.id DESC
    LIMIT v_limit + 1
  ) page;

  v_has_more := jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > v_limit;
  IF v_has_more THEN
    SELECT COALESCE(jsonb_agg(elem ORDER BY n), '[]'::jsonb)
    INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(elem, n)
    WHERE n <= v_limit;
  END IF;

  RETURN jsonb_build_object(
    'entries', COALESCE(v_rows, '[]'::jsonb),
    'hasMore', v_has_more
  );
END;
$$;
