-- Transcripts, extraction, unmatched queue, corrections, token usage, brief cache.
-- Call evidence is stored on the call; audio is never stored.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.extraction_signal_state AS ENUM ('absent', 'unclear', 'present');

CREATE TYPE public.extraction_job_status AS ENUM ('pending', 'processed', 'dead');

CREATE TYPE public.unmatched_transcript_status AS ENUM ('open', 'assigned', 'discarded');

-- ---------------------------------------------------------------------------
-- Calls: recorder id for explicit matching. Never store audio.
-- ---------------------------------------------------------------------------

ALTER TABLE public.calls
  ADD COLUMN transcript_provider_id text;

COMMENT ON COLUMN public.calls.recording_url IS
  'Must remain unused. Vistrial stores no audio. Recorders keep their own files.';

COMMENT ON COLUMN public.calls.transcript_provider_id IS
  'Recorder meeting/call id used for exact matching. Unique per org when set.';

CREATE UNIQUE INDEX calls_org_transcript_provider_id_key
  ON public.calls (org_id, transcript_provider_id)
  WHERE transcript_provider_id IS NOT NULL;

CREATE INDEX calls_org_scheduled_at_idx
  ON public.calls (org_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

CREATE INDEX calls_org_occurred_at_idx
  ON public.calls (org_id, occurred_at)
  WHERE occurred_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Extraction: absent vs unclear vs present, token counts, model version
-- ---------------------------------------------------------------------------

ALTER TABLE public.call_extractions
  ADD COLUMN budget_signal_state public.extraction_signal_state NOT NULL DEFAULT 'absent',
  ADD COLUMN timeline_signal_state public.extraction_signal_state NOT NULL DEFAULT 'absent',
  ADD COLUMN decision_process_state public.extraction_signal_state NOT NULL DEFAULT 'absent',
  ADD COLUMN stated_objection_state public.extraction_signal_state NOT NULL DEFAULT 'absent',
  ADD COLUMN next_step_state public.extraction_signal_state NOT NULL DEFAULT 'absent',
  ADD COLUMN input_tokens integer,
  ADD COLUMN output_tokens integer;

ALTER TABLE public.call_extractions
  ADD CONSTRAINT call_extractions_token_counts_nonneg CHECK (
    (input_tokens IS NULL OR input_tokens >= 0)
    AND (output_tokens IS NULL OR output_tokens >= 0)
  );

ALTER TABLE public.call_extractions
  ADD CONSTRAINT call_extractions_id_org_key UNIQUE (id, org_id);

COMMENT ON COLUMN public.call_extractions.budget_signal_state IS
  'absent = never discussed. unclear = mentioned but not usable. present = stated.';

-- Members may correct extracted fields. Managers keep full write.
CREATE POLICY call_extractions_update_members
  ON public.call_extractions
  FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- ---------------------------------------------------------------------------
-- Recorder connections (webhook secret + optional pull key). Secrets stay
-- off the authenticated SELECT grant.
-- ---------------------------------------------------------------------------

CREATE TABLE public.transcript_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  source public.transcript_source NOT NULL,
  public_token text NOT NULL,
  webhook_secret_encrypted text,
  api_key_encrypted text,
  last_pull_at timestamptz,
  last_pull_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transcript_connections_org_source_key UNIQUE (org_id, source),
  CONSTRAINT transcript_connections_public_token_key UNIQUE (public_token),
  CONSTRAINT transcript_connections_source_not_manual CHECK (source <> 'manual')
);

COMMENT ON TABLE public.transcript_connections IS
  'Per-source recorder credentials. A sixth source is a normalizer plus a row here.';

COMMENT ON COLUMN public.transcript_connections.last_pull_error IS
  'Machine reason only. Never a transcript excerpt.';

CREATE INDEX transcript_connections_org_idx
  ON public.transcript_connections (org_id);

ALTER TABLE public.transcript_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY transcript_connections_managers
  ON public.transcript_connections
  FOR ALL
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

GRANT SELECT (
    id, org_id, source, public_token, last_pull_at, last_pull_error, created_at, updated_at
  ) ON public.transcript_connections TO authenticated;
GRANT ALL ON public.transcript_connections TO service_role;

-- ---------------------------------------------------------------------------
-- Unmatched transcripts: never auto-assigned. Operator attaches to a call.
-- ---------------------------------------------------------------------------

CREATE TABLE public.unmatched_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  source public.transcript_source NOT NULL,
  provider_event_id text,
  provider_call_id text,
  occurred_at timestamptz,
  scheduled_at timestamptz,
  duration_seconds integer,
  participant_emails text[] NOT NULL DEFAULT '{}'::text[],
  title text,
  raw_transcript text NOT NULL,
  webhook_event_id uuid REFERENCES public.webhook_events (id) ON DELETE SET NULL,
  status public.unmatched_transcript_status NOT NULL DEFAULT 'open',
  assigned_call_id uuid,
  assigned_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  assigned_at timestamptz,
  discarded_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  discarded_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unmatched_transcripts_assigned_call_org_fkey
    FOREIGN KEY (assigned_call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE SET NULL
);

COMMENT ON TABLE public.unmatched_transcripts IS
  'Transcripts that did not uniquely match a call. Never guess. Operator assigns or discards.';

CREATE INDEX unmatched_transcripts_org_open_idx
  ON public.unmatched_transcripts (org_id, received_at)
  WHERE status = 'open';

CREATE UNIQUE INDEX unmatched_transcripts_org_provider_event_key
  ON public.unmatched_transcripts (org_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

ALTER TABLE public.unmatched_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY unmatched_transcripts_select
  ON public.unmatched_transcripts
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY unmatched_transcripts_insert_members
  ON public.unmatched_transcripts
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY unmatched_transcripts_update_members
  ON public.unmatched_transcripts
  FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY unmatched_transcripts_delete_managers
  ON public.unmatched_transcripts
  FOR DELETE
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unmatched_transcripts TO authenticated;
GRANT ALL ON public.unmatched_transcripts TO service_role;

-- ---------------------------------------------------------------------------
-- Extraction jobs: retry, then dead-letter. last_error is a reason code.
-- ---------------------------------------------------------------------------

CREATE TABLE public.extraction_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  call_id uuid NOT NULL,
  status public.extraction_job_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  requested_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extraction_jobs_call_org_fkey FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE CASCADE,
  CONSTRAINT extraction_jobs_attempts_nonneg CHECK (attempt_count >= 0)
);

COMMENT ON COLUMN public.extraction_jobs.last_error IS
  'Reason code only (missing_api_key, invalid_json, anthropic_http). Never transcript text.';

CREATE UNIQUE INDEX extraction_jobs_one_pending_per_call
  ON public.extraction_jobs (call_id)
  WHERE status = 'pending';

CREATE INDEX extraction_jobs_pending_idx
  ON public.extraction_jobs (next_attempt_at, created_at)
  WHERE status = 'pending';

CREATE INDEX extraction_jobs_org_dead_idx
  ON public.extraction_jobs (org_id, created_at DESC)
  WHERE status = 'dead';

ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY extraction_jobs_select
  ON public.extraction_jobs
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

GRANT SELECT ON public.extraction_jobs TO authenticated;
GRANT ALL ON public.extraction_jobs TO service_role;

-- ---------------------------------------------------------------------------
-- Corrections: append-only, frequency is queryable
-- ---------------------------------------------------------------------------

CREATE TABLE public.extraction_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  extraction_id uuid NOT NULL,
  call_id uuid NOT NULL,
  field_name text NOT NULL,
  previous_value text,
  new_value text,
  actor_member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extraction_corrections_extraction_org_fkey
    FOREIGN KEY (extraction_id, org_id)
    REFERENCES public.call_extractions (id, org_id) ON DELETE CASCADE,
  CONSTRAINT extraction_corrections_call_org_fkey
    FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE CASCADE,
  CONSTRAINT extraction_corrections_field_name_check CHECK (
    field_name IN (
      'summary',
      'stated_objection',
      'stated_objection_state',
      'budget_signal',
      'budget_signal_state',
      'timeline_signal',
      'timeline_signal_state',
      'decision_process',
      'decision_process_state',
      'next_step_agreed',
      'next_step_state',
      'quotes'
    )
  )
);

CREATE INDEX extraction_corrections_org_field_idx
  ON public.extraction_corrections (org_id, field_name, created_at DESC);

CREATE INDEX extraction_corrections_extraction_idx
  ON public.extraction_corrections (extraction_id, created_at DESC);

ALTER TABLE public.extraction_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY extraction_corrections_select
  ON public.extraction_corrections
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY extraction_corrections_insert_members
  ON public.extraction_corrections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND actor_member_id = public.user_member_id(org_id)
  );

GRANT SELECT, INSERT ON public.extraction_corrections TO authenticated;
GRANT ALL ON public.extraction_corrections TO service_role;

CREATE TRIGGER extraction_corrections_forbid_delete
  BEFORE DELETE ON public.extraction_corrections
  FOR EACH ROW EXECUTE FUNCTION public.forbid_case_file_delete();

CREATE TRIGGER extraction_corrections_forbid_update
  BEFORE UPDATE ON public.extraction_corrections
  FOR EACH ROW EXECUTE FUNCTION public.forbid_case_file_delete();

-- ---------------------------------------------------------------------------
-- Token usage per extraction (cost per client, no content)
-- ---------------------------------------------------------------------------

CREATE TABLE public.extraction_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  call_id uuid NOT NULL,
  extraction_id uuid,
  model_version text NOT NULL,
  input_tokens integer NOT NULL,
  output_tokens integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extraction_usage_call_org_fkey FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE CASCADE,
  CONSTRAINT extraction_usage_tokens_nonneg CHECK (
    input_tokens >= 0 AND output_tokens >= 0
  )
);

CREATE INDEX extraction_usage_org_created_idx
  ON public.extraction_usage (org_id, created_at DESC);

ALTER TABLE public.extraction_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY extraction_usage_select_managers
  ON public.extraction_usage
  FOR SELECT
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

GRANT SELECT ON public.extraction_usage TO authenticated;
GRANT ALL ON public.extraction_usage TO service_role;

-- ---------------------------------------------------------------------------
-- Cached suggested openings. Brief body is assembled from stored rows.
-- ---------------------------------------------------------------------------

CREATE TABLE public.brief_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  cache_key text NOT NULL,
  opening_text text NOT NULL,
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brief_openings_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE,
  CONSTRAINT brief_openings_lead_cache_key UNIQUE (lead_id, cache_key)
);

ALTER TABLE public.brief_openings ENABLE ROW LEVEL SECURITY;

CREATE POLICY brief_openings_select
  ON public.brief_openings
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY brief_openings_write_members
  ON public.brief_openings
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brief_openings TO authenticated;
GRANT ALL ON public.brief_openings TO service_role;

-- Distinct objections per call: same type + verbatim is the same objection.
CREATE UNIQUE INDEX objections_call_type_verbatim_key
  ON public.objections (call_id, type, md5(verbatim))
  WHERE call_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Claim helpers for two-stage ingest and extraction (service_role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_transcript_webhook()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT e.id
  INTO v_id
  FROM public.webhook_events e
  WHERE e.source = 'transcript'
    AND e.processed = false
    AND e.status = 'pending'
    AND e.next_attempt_at <= now()
  ORDER BY e.received_at ASC, e.id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.webhook_events
  SET
    attempt_count = attempt_count + 1,
    next_attempt_at = now() + interval '10 minutes'
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_extraction_job()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.extraction_jobs j
  SET next_attempt_at = now() + interval '10 minutes'
  WHERE j.id = (
    SELECT e.id
    FROM public.extraction_jobs e
    WHERE e.status = 'pending'
      AND e.next_attempt_at <= now()
    ORDER BY e.next_attempt_at ASC, e.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING j.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_transcript_webhook() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_extraction_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_transcript_webhook() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_extraction_job() TO service_role;

-- ---------------------------------------------------------------------------
-- Case file calls: surface failed extraction as failed, not empty
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.load_org_case_file(
  p_org_id uuid,
  p_lead_id uuid,
  p_timeline_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_location text;
  v_crm_url text;
  v_setter_name text;
  v_closer_name text;
  v_score jsonb;
  v_history jsonb;
  v_objections jsonb;
  v_actions jsonb;
  v_calls jsonb;
  v_maps jsonb;
  v_revenue jsonb;
  v_members jsonb;
  v_timeline jsonb;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id AND org_id = p_org_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT o.ghl_location_id INTO v_location
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_location IS NOT NULL AND v_lead.ghl_contact_id IS NOT NULL THEN
    v_crm_url := 'https://app.gohighlevel.com/v2/location/'
      || v_location
      || '/conversations/all?contactId='
      || v_lead.ghl_contact_id;
  END IF;

  SELECT display_name INTO v_setter_name
  FROM public.org_members WHERE id = v_lead.assigned_setter_id;
  SELECT display_name INTO v_closer_name
  FROM public.org_members WHERE id = v_lead.assigned_closer_id;

  SELECT jsonb_build_object(
    'id', score.id,
    'total', score.total,
    'timeline', score.timeline_raw,
    'investmentCapacity', score.investment_capacity_raw,
    'decisionAuthority', score.decision_authority_raw,
    'painSeverity', score.pain_severity_raw,
    'reasoning', score.reasoning,
    'triggeredBy', score.triggered_by,
    'createdAt', score.created_at,
    'knownFactorCount', (
      (score.timeline_raw IS NOT NULL)::integer
      + (score.investment_capacity_raw IS NOT NULL)::integer
      + (score.decision_authority_raw IS NOT NULL)::integer
      + (score.pain_severity_raw IS NOT NULL)::integer
    ),
    'scoreConfidence', CASE
      WHEN score.id IS NULL THEN NULL
      WHEN (
        (score.timeline_raw IS NOT NULL)::integer
        + (score.investment_capacity_raw IS NOT NULL)::integer
        + (score.decision_authority_raw IS NOT NULL)::integer
        + (score.pain_severity_raw IS NOT NULL)::integer
      ) >= 4 THEN 'high'
      WHEN (
        (score.timeline_raw IS NOT NULL)::integer
        + (score.investment_capacity_raw IS NOT NULL)::integer
        + (score.decision_authority_raw IS NOT NULL)::integer
        + (score.pain_severity_raw IS NOT NULL)::integer
      ) = 3 THEN 'moderate'
      WHEN (
        (score.timeline_raw IS NOT NULL)::integer
        + (score.investment_capacity_raw IS NOT NULL)::integer
        + (score.decision_authority_raw IS NOT NULL)::integer
        + (score.pain_severity_raw IS NOT NULL)::integer
      ) = 2 THEN 'low'
      WHEN (
        (score.timeline_raw IS NOT NULL)::integer
        + (score.investment_capacity_raw IS NOT NULL)::integer
        + (score.decision_authority_raw IS NOT NULL)::integer
        + (score.pain_severity_raw IS NOT NULL)::integer
      ) = 1 THEN 'very_low'
      ELSE NULL
    END
  )
  INTO v_score
  FROM public.readiness_scores score
  WHERE score.lead_id = p_lead_id AND score.org_id = p_org_id
  ORDER BY score.created_at DESC, score.id DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC, id DESC), '[]'::jsonb)
  INTO v_history
  FROM (
    SELECT
      jsonb_build_object(
        'id', rs.id,
        'total', rs.total,
        'previousTotal', LAG(rs.total) OVER (ORDER BY rs.created_at, rs.id),
        'timeline', rs.timeline_raw,
        'investmentCapacity', rs.investment_capacity_raw,
        'decisionAuthority', rs.decision_authority_raw,
        'painSeverity', rs.pain_severity_raw,
        'reasoning', rs.reasoning,
        'triggeredBy', rs.triggered_by,
        'createdAt', rs.created_at,
        'scoredByName', scorer.display_name
      ) AS item,
      rs.created_at,
      rs.id
    FROM public.readiness_scores rs
    LEFT JOIN public.org_members scorer ON scorer.id = rs.scored_by_member_id
    WHERE rs.lead_id = p_lead_id AND rs.org_id = p_org_id
  ) h;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'type', o.type,
      'verbatim', o.verbatim,
      'callId', o.call_id,
      'callType', c.type,
      'callOccurredAt', c.occurred_at,
      'resolved', o.resolved,
      'resolvedAt', o.resolved_at,
      'resolvedNote', o.resolved_note,
      'createdAt', o.created_at
    ) ORDER BY o.resolved ASC, o.created_at DESC
  ), '[]'::jsonb)
  INTO v_objections
  FROM public.objections o
  LEFT JOIN public.calls c ON c.id = o.call_id
  WHERE o.lead_id = p_lead_id AND o.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', n.id,
      'actionText', n.action_text,
      'dueAt', n.due_at,
      'completedAt', n.completed_at,
      'ownerMemberId', n.owner_member_id,
      'ownerName', owner.display_name,
      'createdBy', n.created_by,
      'overdue', n.completed_at IS NULL AND n.due_at IS NOT NULL AND n.due_at < now()
    ) ORDER BY n.completed_at NULLS FIRST, n.due_at ASC NULLS LAST, n.created_at ASC
  ), '[]'::jsonb)
  INTO v_actions
  FROM public.next_actions n
  LEFT JOIN public.org_members owner ON owner.id = n.owner_member_id
  WHERE n.lead_id = p_lead_id AND n.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'type', c.type,
      'scheduledAt', c.scheduled_at,
      'occurredAt', c.occurred_at,
      'durationSeconds', c.duration_seconds,
      'outcome', c.outcome,
      'ranByMemberId', c.ran_by_member_id,
      'ranByName', runner.display_name,
      'hasTranscript', c.raw_transcript IS NOT NULL,
      'hasExtraction', ext.id IS NOT NULL,
      'extractionStatus', CASE
        WHEN job.status = 'dead' THEN 'failed'
        WHEN job.status = 'pending' THEN 'pending'
        WHEN ext.id IS NOT NULL THEN 'ready'
        ELSE 'none'
      END
    ) ORDER BY COALESCE(c.occurred_at, c.scheduled_at, c.created_at) DESC
  ), '[]'::jsonb)
  INTO v_calls
  FROM public.calls c
  LEFT JOIN public.org_members runner ON runner.id = c.ran_by_member_id
  LEFT JOIN public.call_extractions ext ON ext.call_id = c.id
  LEFT JOIN LATERAL (
    SELECT ej.status
    FROM public.extraction_jobs ej
    WHERE ej.call_id = c.id
    ORDER BY ej.created_at DESC
    LIMIT 1
  ) job ON true
  WHERE c.lead_id = p_lead_id AND c.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fieldName', m.field_name,
      'factor', m.factor
    ) ORDER BY m.field_name
  ), '[]'::jsonb)
  INTO v_maps
  FROM public.score_field_maps m
  WHERE m.org_id = p_org_id;

  IF public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'amountCents', r.amount_cents,
        'currency', r.currency,
        'paymentType', r.payment_type,
        'processor', r.processor,
        'occurredAt', r.occurred_at,
        'closedByName', closer.display_name
      ) ORDER BY r.occurred_at DESC
    ), '[]'::jsonb)
    INTO v_revenue
    FROM public.revenue_log r
    LEFT JOIN public.org_members closer ON closer.id = r.closed_by_member_id
    WHERE r.org_id = p_org_id AND r.lead_id = p_lead_id;
  ELSE
    v_revenue := NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', m.id, 'displayName', m.display_name, 'role', m.role)
    ORDER BY m.display_name
  ), '[]'::jsonb)
  INTO v_members
  FROM public.org_members m
  WHERE m.org_id = p_org_id AND m.active = true;

  v_timeline := public.load_org_case_timeline(p_org_id, p_lead_id, NULL, p_timeline_limit);

  RETURN jsonb_build_object(
    'lead', jsonb_build_object(
      'id', v_lead.id,
      'orgId', v_lead.org_id,
      'name', COALESCE(
        NULLIF(btrim(concat_ws(' ', v_lead.first_name, v_lead.last_name)), ''),
        NULLIF(btrim(v_lead.email), ''),
        'Unnamed lead'
      ),
      'firstName', v_lead.first_name,
      'lastName', v_lead.last_name,
      'email', v_lead.email,
      'phone', v_lead.phone,
      'source', v_lead.source,
      'campaign', v_lead.campaign,
      'status', v_lead.status,
      'leadType', v_lead.lead_type,
      'score', v_lead.current_score,
      'optedInAt', v_lead.opted_in_at,
      'lastTouchAt', v_lead.last_touch_at,
      'firstHumanTouchAt', v_lead.first_human_touch_at,
      'assignedSetterId', v_lead.assigned_setter_id,
      'assignedCloserId', v_lead.assigned_closer_id,
      'assignedSetterName', v_setter_name,
      'assignedCloserName', v_closer_name,
      'ghlContactId', v_lead.ghl_contact_id,
      'crmUrl', v_crm_url,
      'applicationAnswers', v_lead.application_answers
    ),
    'score', v_score,
    'scoreHistory', COALESCE(v_history, '[]'::jsonb),
    'objections', COALESCE(v_objections, '[]'::jsonb),
    'nextActions', COALESCE(v_actions, '[]'::jsonb),
    'calls', COALESCE(v_calls, '[]'::jsonb),
    'fieldMaps', COALESCE(v_maps, '[]'::jsonb),
    'revenue', v_revenue,
    'members', COALESCE(v_members, '[]'::jsonb),
    'timeline', COALESCE(v_timeline, jsonb_build_object('entries', '[]'::jsonb, 'hasMore', false))
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Call list + detail + pre-call brief (one round trip each)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.load_org_call_list(
  p_org_id uuid,
  p_cursor jsonb DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_rows jsonb;
  v_has_more boolean;
  v_crm_status text;
  v_org_count integer;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  IF p_cursor ? 'at' AND p_cursor ? 'id' THEN
    v_cursor_at := (p_cursor->>'at')::timestamptz;
    v_cursor_id := (p_cursor->>'id')::uuid;
  END IF;

  SELECT COALESCE(gc.status::text, 'missing')
  INTO v_crm_status
  FROM public.ghl_connections gc
  WHERE gc.org_id = p_org_id;

  v_crm_status := COALESCE(v_crm_status, 'missing');

  SELECT count(*)::integer INTO v_org_count
  FROM public.calls c
  WHERE c.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(item ORDER BY sort_at DESC, id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'id', c.id,
        'leadId', c.lead_id,
        'leadName', COALESCE(
          NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
          NULLIF(btrim(l.email), ''),
          'Unnamed lead'
        ),
        'type', c.type,
        'scheduledAt', c.scheduled_at,
        'occurredAt', c.occurred_at,
        'durationSeconds', c.duration_seconds,
        'outcome', c.outcome,
        'ranByName', runner.display_name,
        'hasTranscript', c.raw_transcript IS NOT NULL,
        'extractionStatus', CASE
          WHEN job.status = 'dead' THEN 'failed'
          WHEN job.status = 'pending' THEN 'pending'
          WHEN ext.id IS NOT NULL THEN 'ready'
          ELSE 'none'
        END
      ) AS item,
      COALESCE(c.occurred_at, c.scheduled_at, c.created_at) AS sort_at,
      c.id
    FROM public.calls c
    JOIN public.leads l ON l.id = c.lead_id AND l.org_id = c.org_id
    LEFT JOIN public.org_members runner ON runner.id = c.ran_by_member_id
    LEFT JOIN public.call_extractions ext ON ext.call_id = c.id
    LEFT JOIN LATERAL (
      SELECT ej.status
      FROM public.extraction_jobs ej
      WHERE ej.call_id = c.id
      ORDER BY ej.created_at DESC
      LIMIT 1
    ) job ON true
    WHERE c.org_id = p_org_id
      AND (
        v_cursor_id IS NULL
        OR (COALESCE(c.occurred_at, c.scheduled_at, c.created_at), c.id)
          < (v_cursor_at, v_cursor_id)
      )
    ORDER BY COALESCE(c.occurred_at, c.scheduled_at, c.created_at) DESC, c.id DESC
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
    'crmStatus', v_crm_status,
    'orgCallCount', v_org_count,
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'hasMore', v_has_more
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.load_org_call_detail(
  p_org_id uuid,
  p_call_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_call public.calls%ROWTYPE;
  v_lead public.leads%ROWTYPE;
  v_runner text;
  v_extraction jsonb;
  v_objections jsonb;
  v_job jsonb;
  v_score jsonb;
  v_corrections jsonb;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  SELECT * INTO v_call
  FROM public.calls
  WHERE id = p_call_id AND org_id = p_org_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = v_call.lead_id AND org_id = p_org_id;

  SELECT display_name INTO v_runner
  FROM public.org_members
  WHERE id = v_call.ran_by_member_id;

  SELECT jsonb_build_object(
    'id', e.id,
    'summary', e.summary,
    'statedObjection', e.stated_objection,
    'statedObjectionState', e.stated_objection_state,
    'budgetSignal', e.budget_signal,
    'budgetSignalState', e.budget_signal_state,
    'timelineSignal', e.timeline_signal,
    'timelineSignalState', e.timeline_signal_state,
    'decisionProcess', e.decision_process,
    'decisionProcessState', e.decision_process_state,
    'nextStepAgreed', e.next_step_agreed,
    'nextStepState', e.next_step_state,
    'quotes', e.quotes,
    'modelVersion', e.model_version,
    'extractedAt', e.extracted_at,
    'inputTokens', e.input_tokens,
    'outputTokens', e.output_tokens
  )
  INTO v_extraction
  FROM public.call_extractions e
  WHERE e.call_id = p_call_id AND e.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'type', o.type,
      'verbatim', o.verbatim,
      'resolved', o.resolved,
      'resolvedAt', o.resolved_at,
      'resolvedNote', o.resolved_note,
      'createdAt', o.created_at
    ) ORDER BY o.created_at ASC
  ), '[]'::jsonb)
  INTO v_objections
  FROM public.objections o
  WHERE o.call_id = p_call_id AND o.org_id = p_org_id;

  SELECT jsonb_build_object(
    'id', j.id,
    'status', j.status,
    'attemptCount', j.attempt_count,
    'lastError', j.last_error,
    'nextAttemptAt', j.next_attempt_at,
    'processedAt', j.processed_at
  )
  INTO v_job
  FROM public.extraction_jobs j
  WHERE j.call_id = p_call_id AND j.org_id = p_org_id
  ORDER BY j.created_at DESC
  LIMIT 1;

  SELECT jsonb_build_object(
    'id', rs.id,
    'total', rs.total,
    'previousTotal', prev.total,
    'timeline', rs.timeline_raw,
    'investmentCapacity', rs.investment_capacity_raw,
    'decisionAuthority', rs.decision_authority_raw,
    'painSeverity', rs.pain_severity_raw,
    'reasoning', rs.reasoning,
    'createdAt', rs.created_at
  )
  INTO v_score
  FROM public.readiness_scores rs
  LEFT JOIN LATERAL (
    SELECT p.total
    FROM public.readiness_scores p
    WHERE p.lead_id = rs.lead_id
      AND p.org_id = rs.org_id
      AND (p.created_at, p.id) < (rs.created_at, rs.id)
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 1
  ) prev ON true
  WHERE rs.call_id = p_call_id
    AND rs.org_id = p_org_id
    AND rs.triggered_by = 'call'
  ORDER BY rs.created_at DESC, rs.id DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'fieldName', c.field_name,
      'actorMemberId', c.actor_member_id,
      'actorName', actor.display_name,
      'createdAt', c.created_at
    ) ORDER BY c.created_at DESC
  ), '[]'::jsonb)
  INTO v_corrections
  FROM public.extraction_corrections c
  LEFT JOIN public.org_members actor ON actor.id = c.actor_member_id
  WHERE c.call_id = p_call_id AND c.org_id = p_org_id;

  RETURN jsonb_build_object(
    'call', jsonb_build_object(
      'id', v_call.id,
      'orgId', v_call.org_id,
      'leadId', v_call.lead_id,
      'type', v_call.type,
      'scheduledAt', v_call.scheduled_at,
      'occurredAt', v_call.occurred_at,
      'durationSeconds', v_call.duration_seconds,
      'outcome', v_call.outcome,
      'ranByMemberId', v_call.ran_by_member_id,
      'ranByName', v_runner,
      'transcriptSource', v_call.transcript_source,
      'transcriptArrivedAt', v_call.transcript_arrived_at,
      'rawTranscript', v_call.raw_transcript,
      'hasAudio', false
    ),
    'lead', jsonb_build_object(
      'id', v_lead.id,
      'name', COALESCE(
        NULLIF(btrim(concat_ws(' ', v_lead.first_name, v_lead.last_name)), ''),
        NULLIF(btrim(v_lead.email), ''),
        'Unnamed lead'
      )
    ),
    'extraction', v_extraction,
    'objections', COALESCE(v_objections, '[]'::jsonb),
    'job', v_job,
    'scoreChange', v_score,
    'corrections', COALESCE(v_corrections, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.load_org_precall_brief(
  p_org_id uuid,
  p_lead_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_setter text;
  v_closer text;
  v_score jsonb;
  v_objections jsonb;
  v_last_call jsonb;
  v_triage jsonb;
  v_quotes jsonb;
  v_no_shows integer;
  v_reschedules integer;
  v_inbound jsonb;
  v_opening jsonb;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id AND org_id = p_org_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT display_name INTO v_setter FROM public.org_members WHERE id = v_lead.assigned_setter_id;
  SELECT display_name INTO v_closer FROM public.org_members WHERE id = v_lead.assigned_closer_id;

  SELECT jsonb_build_object(
    'id', s.id,
    'total', s.total,
    'timeline', s.timeline_raw,
    'investmentCapacity', s.investment_capacity_raw,
    'decisionAuthority', s.decision_authority_raw,
    'painSeverity', s.pain_severity_raw,
    'triggeredBy', s.triggered_by,
    'createdAt', s.created_at
  )
  INTO v_score
  FROM public.readiness_scores s
  WHERE s.lead_id = p_lead_id AND s.org_id = p_org_id
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'type', o.type,
      'verbatim', o.verbatim,
      'callId', o.call_id,
      'callType', c.type,
      'callOccurredAt', COALESCE(c.occurred_at, c.scheduled_at)
    ) ORDER BY o.created_at DESC
  ), '[]'::jsonb)
  INTO v_objections
  FROM public.objections o
  LEFT JOIN public.calls c ON c.id = o.call_id
  WHERE o.lead_id = p_lead_id AND o.org_id = p_org_id AND o.resolved = false;

  SELECT jsonb_build_object(
    'id', c.id,
    'type', c.type,
    'occurredAt', c.occurred_at,
    'scheduledAt', c.scheduled_at,
    'summary', e.summary,
    'nextStepAgreed', e.next_step_agreed,
    'nextStepState', e.next_step_state
  )
  INTO v_last_call
  FROM public.calls c
  LEFT JOIN public.call_extractions e ON e.call_id = c.id
  WHERE c.lead_id = p_lead_id AND c.org_id = p_org_id
  ORDER BY COALESCE(c.occurred_at, c.scheduled_at, c.created_at) DESC
  LIMIT 1;

  SELECT jsonb_build_object(
    'id', c.id,
    'summary', e.summary,
    'timelineSignal', e.timeline_signal,
    'timelineSignalState', e.timeline_signal_state,
    'budgetSignal', e.budget_signal,
    'budgetSignalState', e.budget_signal_state,
    'decisionProcess', e.decision_process,
    'decisionProcessState', e.decision_process_state,
    'nextStepAgreed', e.next_step_agreed
  )
  INTO v_triage
  FROM public.calls c
  JOIN public.call_extractions e ON e.call_id = c.id
  WHERE c.lead_id = p_lead_id AND c.org_id = p_org_id AND c.type = 'triage'
  ORDER BY COALESCE(c.occurred_at, c.scheduled_at, c.created_at) DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(q.elem), '[]'::jsonb)
  INTO v_quotes
  FROM (
    SELECT elem
    FROM public.calls c
    JOIN public.call_extractions e ON e.call_id = c.id
    CROSS JOIN LATERAL jsonb_array_elements(e.quotes) AS elem
    WHERE c.lead_id = p_lead_id AND c.org_id = p_org_id
    ORDER BY COALESCE(c.occurred_at, c.scheduled_at, c.created_at) DESC
    LIMIT 3
  ) q;

  SELECT count(*)::integer INTO v_no_shows
  FROM public.calls
  WHERE lead_id = p_lead_id AND org_id = p_org_id AND outcome = 'no_show';

  SELECT count(*)::integer INTO v_reschedules
  FROM public.calls
  WHERE lead_id = p_lead_id AND org_id = p_org_id AND outcome = 'rescheduled';

  SELECT jsonb_build_object('at', t.occurred_at, 'channel', t.channel)
  INTO v_inbound
  FROM public.touches t
  WHERE t.lead_id = p_lead_id AND t.org_id = p_org_id AND t.direction = 'inbound'
  ORDER BY t.occurred_at DESC
  LIMIT 1;

  SELECT jsonb_build_object(
    'text', b.opening_text,
    'cacheKey', b.cache_key,
    'modelVersion', b.model_version
  )
  INTO v_opening
  FROM public.brief_openings b
  WHERE b.lead_id = p_lead_id AND b.org_id = p_org_id
  ORDER BY b.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'lead', jsonb_build_object(
      'id', v_lead.id,
      'name', COALESCE(
        NULLIF(btrim(concat_ws(' ', v_lead.first_name, v_lead.last_name)), ''),
        NULLIF(btrim(v_lead.email), ''),
        'Unnamed lead'
      ),
      'source', v_lead.source,
      'campaign', v_lead.campaign,
      'offerName', v_lead.offer_name,
      'leadType', v_lead.lead_type,
      'status', v_lead.status,
      'optedInAt', v_lead.opted_in_at,
      'assignedSetterName', v_setter,
      'assignedCloserName', v_closer,
      'applicationAnswers', v_lead.application_answers
    ),
    'score', v_score,
    'openObjections', COALESCE(v_objections, '[]'::jsonb),
    'lastCall', v_last_call,
    'triage', v_triage,
    'quotes', COALESCE(v_quotes, '[]'::jsonb),
    'noShowCount', COALESCE(v_no_shows, 0),
    'rescheduleCount', COALESCE(v_reschedules, 0),
    'lastInbound', v_inbound,
    'cachedOpening', v_opening
  );
END;
$$;

REVOKE ALL ON FUNCTION public.load_org_call_list(uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.load_org_call_detail(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.load_org_precall_brief(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_org_call_list(uuid, jsonb, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.load_org_call_detail(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.load_org_precall_brief(uuid, uuid)
  TO authenticated, service_role;

-- Spoken timeline phrases that form answers do not use. Existing orgs get the
-- same choices new orgs receive after provision_org_scoring.
INSERT INTO public.score_field_rules (org_id, field_map_id, kind, answer_value, score)
SELECT m.org_id, m.id, 'choice', v.answer, v.score
FROM public.score_field_maps m
CROSS JOIN (
  VALUES
    ('after q1', 30),
    ('q1', 30)
) AS v(answer, score)
WHERE m.field_name IN ('timeline', 'timeline_signal')
  AND NOT EXISTS (
    SELECT 1
    FROM public.score_field_rules r
    WHERE r.field_map_id = m.id
      AND lower(trim(r.answer_value)) = v.answer
  );

CREATE OR REPLACE FUNCTION public.provision_org_scoring()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.score_configs (org_id) VALUES (NEW.id)
  ON CONFLICT (org_id) DO NOTHING;
  PERFORM public.seed_default_score_maps(NEW.id);
  INSERT INTO public.score_field_rules (org_id, field_map_id, kind, answer_value, score)
  SELECT m.org_id, m.id, 'choice', v.answer, v.score
  FROM public.score_field_maps m
  CROSS JOIN (
    VALUES
      ('after q1', 30),
      ('q1', 30)
  ) AS v(answer, score)
  WHERE m.org_id = NEW.id
    AND m.field_name IN ('timeline', 'timeline_signal')
    AND NOT EXISTS (
      SELECT 1
      FROM public.score_field_rules r
      WHERE r.field_map_id = m.id
        AND lower(trim(r.answer_value)) = v.answer
    );
  RETURN NEW;
END;
$$;
