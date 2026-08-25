-- Prompt 21: live activity stream derived from existing records.
-- Domain history tables (assignment, track) fill gaps where a timestamp/actor
-- was missing. There is no parallel event log.

-- ---------------------------------------------------------------------------
-- Record fixes
-- ---------------------------------------------------------------------------

ALTER TABLE public.objections
  ADD COLUMN IF NOT EXISTS resolved_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL;

ALTER TABLE public.follow_up_events
  ADD COLUMN IF NOT EXISTS lead_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'follow_up_events_lead_org_fkey'
  ) THEN
    ALTER TABLE public.follow_up_events
      ADD CONSTRAINT follow_up_events_lead_org_fkey
      FOREIGN KEY (lead_id, org_id)
      REFERENCES public.leads (id, org_id)
      ON DELETE CASCADE;
  END IF;
END
$$;

UPDATE public.follow_up_events e
SET lead_id = d.lead_id
FROM public.follow_up_drafts d
WHERE e.draft_id = d.id AND e.lead_id IS NULL;

UPDATE public.follow_up_events e
SET lead_id = s.lead_id
FROM public.follow_up_sequence_runs s
WHERE e.sequence_run_id = s.id AND e.lead_id IS NULL;

CREATE TABLE IF NOT EXISTS public.lead_assignment_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  field text NOT NULL CHECK (field IN ('assigned_setter_id', 'assigned_closer_id')),
  from_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  to_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT lead_assignment_changes_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.lead_assignment_changes IS
  'Append-only assignment history. The activity stream reads this; nothing is written in the request path beyond this trigger.';

CREATE INDEX IF NOT EXISTS lead_assignment_changes_org_time_idx
  ON public.lead_assignment_changes (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_assignment_changes_lead_time_idx
  ON public.lead_assignment_changes (lead_id, created_at DESC);

ALTER TABLE public.lead_assignment_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_assignment_changes_select ON public.lead_assignment_changes;
CREATE POLICY lead_assignment_changes_select
  ON public.lead_assignment_changes
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

GRANT SELECT ON public.lead_assignment_changes TO authenticated;
GRANT SELECT, INSERT ON public.lead_assignment_changes TO service_role;

CREATE OR REPLACE FUNCTION public.record_lead_assignment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := public.user_member_id(NEW.org_id);

  IF NEW.assigned_setter_id IS DISTINCT FROM OLD.assigned_setter_id THEN
    INSERT INTO public.lead_assignment_changes (
      org_id, lead_id, field, from_member_id, to_member_id, actor_member_id
    ) VALUES (
      NEW.org_id, NEW.id, 'assigned_setter_id',
      OLD.assigned_setter_id, NEW.assigned_setter_id, v_actor
    );
  END IF;

  IF NEW.assigned_closer_id IS DISTINCT FROM OLD.assigned_closer_id THEN
    INSERT INTO public.lead_assignment_changes (
      org_id, lead_id, field, from_member_id, to_member_id, actor_member_id
    ) VALUES (
      NEW.org_id, NEW.id, 'assigned_closer_id',
      OLD.assigned_closer_id, NEW.assigned_closer_id, v_actor
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_record_assignment_change ON public.leads;
CREATE TRIGGER leads_record_assignment_change
  AFTER UPDATE OF assigned_setter_id, assigned_closer_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.record_lead_assignment_change();

CREATE TABLE IF NOT EXISTS public.lead_type_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  from_type public.lead_type,
  to_type public.lead_type,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT lead_type_changes_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.lead_type_changes IS
  'Append-only ready/nurture track history. Derived into the activity stream.';

CREATE INDEX IF NOT EXISTS lead_type_changes_org_time_idx
  ON public.lead_type_changes (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_type_changes_lead_time_idx
  ON public.lead_type_changes (lead_id, created_at DESC);

ALTER TABLE public.lead_type_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_type_changes_select ON public.lead_type_changes;
CREATE POLICY lead_type_changes_select
  ON public.lead_type_changes
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

GRANT SELECT ON public.lead_type_changes TO authenticated;
GRANT SELECT, INSERT ON public.lead_type_changes TO service_role;

CREATE OR REPLACE FUNCTION public.record_lead_type_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_type IS NOT DISTINCT FROM OLD.lead_type THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.lead_type_changes (org_id, lead_id, from_type, to_type)
  VALUES (NEW.org_id, NEW.id, OLD.lead_type, NEW.lead_type);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_record_type_change ON public.leads;
CREATE TRIGGER leads_record_type_change
  AFTER UPDATE OF lead_type ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.record_lead_type_change();

DROP TRIGGER IF EXISTS lead_assignment_changes_forbid_delete ON public.lead_assignment_changes;
CREATE TRIGGER lead_assignment_changes_forbid_delete
  BEFORE DELETE ON public.lead_assignment_changes
  FOR EACH ROW EXECUTE FUNCTION public.forbid_case_file_delete();

DROP TRIGGER IF EXISTS lead_type_changes_forbid_delete ON public.lead_type_changes;
CREATE TRIGGER lead_type_changes_forbid_delete
  BEFORE DELETE ON public.lead_type_changes
  FOR EACH ROW EXECUTE FUNCTION public.forbid_case_file_delete();

-- Hosted already has this table from settings-tiers. Local main did not.
CREATE TABLE IF NOT EXISTS public.settings_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  actor_user_id uuid,
  actor_label text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind = ANY (ARRAY['member'::text, 'da_operator'::text, 'system'::text])),
  section text NOT NULL CHECK (section = ANY (ARRAY[
    'organization'::text, 'members'::text, 'scoring'::text, 'integrations'::text,
    'follow_up'::text, 'data'::text, 'activation'::text, 'managed'::text,
    'agent'::text, 'notifications'::text
  ])),
  action text NOT NULL,
  from_value jsonb,
  to_value jsonb
);

CREATE INDEX IF NOT EXISTS settings_activity_org_created_idx
  ON public.settings_activity (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS settings_activity_org_section_idx
  ON public.settings_activity (org_id, section, created_at DESC);
CREATE INDEX IF NOT EXISTS settings_activity_org_actor_idx
  ON public.settings_activity (org_id, actor_member_id, created_at DESC);

ALTER TABLE public.settings_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_activity_select ON public.settings_activity;
CREATE POLICY settings_activity_select
  ON public.settings_activity
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_org_role(org_id, VARIADIC ARRAY['owner'::public.org_role, 'admin'::public.org_role])
    OR public.is_platform_admin()
  );

GRANT SELECT ON public.settings_activity TO authenticated;
GRANT ALL ON public.settings_activity TO service_role;

CREATE INDEX IF NOT EXISTS follow_up_events_lead_time_idx
  ON public.follow_up_events (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS follow_up_events_org_created_idx
  ON public.follow_up_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_status_changes_org_time_idx
  ON public.lead_status_changes (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ghl_dispatches_org_created_idx
  ON public.ghl_dispatches (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS extraction_jobs_org_created_idx
  ON public.extraction_jobs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS operator_run_steps_org_started_idx
  ON public.operator_run_steps (org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS operator_run_confirmations_org_created_idx
  ON public.operator_run_confirmations (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS follow_up_jobs_org_created_idx
  ON public.follow_up_jobs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS follow_up_sequence_runs_org_started_idx
  ON public.follow_up_sequence_runs (org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS unmatched_transcripts_org_received_idx
  ON public.unmatched_transcripts (org_id, received_at DESC);
CREATE INDEX IF NOT EXISTS calls_org_created_idx
  ON public.calls (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reporting_job_runs_org_started_idx
  ON public.reporting_job_runs (org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS objections_org_resolved_idx
  ON public.objections (org_id, resolved_at DESC)
  WHERE resolved;
CREATE INDEX IF NOT EXISTS next_actions_org_created_idx
  ON public.next_actions (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS readiness_scores_org_created_idx
  ON public.readiness_scores (org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Helpers: plain language, never stack traces or identifiers as the line
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activity_lead_label(p_first text, p_last text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(btrim(concat_ws(' ', p_first, p_last)), ''), 'Unnamed lead');
$$;

CREATE OR REPLACE FUNCTION public.activity_plain_reason(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN NULL
    WHEN p_text ~* E'(stack|exception|\\n\\s+at |password|token|bearer |sqlstate)' THEN
      'Something failed. The technical detail was withheld.'
    WHEN p_text = 'missing_api_key' THEN 'The extraction key is missing.'
    WHEN p_text = 'invalid_json' THEN 'Extraction returned something we could not read.'
    WHEN p_text = 'anthropic_http' THEN 'The extraction model could not be reached.'
    WHEN char_length(p_text) > 220 THEN left(p_text, 217) || '…'
    ELSE p_text
  END;
$$;

CREATE OR REPLACE FUNCTION public.activity_channel_label(p_channel text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_channel
    WHEN 'sms' THEN 'text'
    WHEN 'email' THEN 'email'
    WHEN 'call' THEN 'call'
    WHEN 'dm' THEN 'direct message'
    WHEN 'voicemail' THEN 'voicemail'
    ELSE COALESCE(p_channel, 'message')
  END;
$$;

CREATE OR REPLACE FUNCTION public.activity_synth_id(p_seed text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5(p_seed)::uuid;
$$;

CREATE OR REPLACE FUNCTION public.activity_scalar_json(p_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    WHEN jsonb_typeof(p_value) IN ('string', 'number', 'boolean') THEN p_value
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.activity_lead_label(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activity_plain_reason(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activity_channel_label(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activity_synth_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activity_scalar_json(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activity_lead_label(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activity_plain_reason(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activity_channel_label(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activity_synth_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activity_scalar_json(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Derived stream. Reading only. Never written from observed request paths.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activity_stream_source(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  org_id uuid,
  id uuid,
  occurred_at timestamptz,
  category text,
  kind text,
  headline text,
  actor_label text,
  actor_kind text,
  actor_user_id uuid,
  integration text,
  lead_id uuid,
  lead_name text,
  href text,
  result text,
  result_reason text,
  retryable boolean,
  retry_kind text,
  retry_id uuid,
  is_sync_noise boolean,
  detail jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NOT NULL AND p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RETURN;
  END IF;
  IF p_org_id IS NULL AND NOT public.is_platform_admin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH leads_named AS (
    SELECT
      l.id,
      l.org_id,
      l.ghl_contact_id,
      l.source,
      l.first_human_touch_at,
      public.activity_lead_label(l.first_name, l.last_name) AS lead_name
    FROM public.leads l
    WHERE p_org_id IS NULL OR l.org_id = p_org_id
  )
  SELECT
    e.org_id,
    e.id,
    e.received_at,
    CASE WHEN e.status IN ('dead', 'rejected') THEN 'inbound' ELSE 'inbound' END,
    CASE
      WHEN e.status = 'rejected' THEN 'webhook_rejected'
      WHEN e.status = 'dead' THEN 'webhook_failed'
      WHEN e.event_type ILIKE '%contactcreate%' THEN 'lead_received'
      WHEN e.event_type ILIKE '%contactupdate%' THEN 'contact_updated'
      WHEN e.event_type ILIKE '%opportunity%' THEN 'opportunity_updated'
      ELSE 'webhook_other'
    END,
    CASE
      WHEN e.status = 'rejected' THEN 'Webhook rejected'
      WHEN e.status = 'dead' THEN 'Webhook processing failed'
      WHEN e.event_type ILIKE '%contactcreate%' THEN
        CASE
          WHEN ln.source IS NOT NULL AND char_length(ln.source) BETWEEN 1 AND 40
            THEN 'Lead arrived from ' || ln.source
          ELSE 'Lead arrived from GoHighLevel'
        END
      WHEN e.event_type ILIKE '%contactupdate%' THEN 'Contact updated in GoHighLevel'
      WHEN e.event_type ILIKE '%opportunity%' THEN 'Opportunity updated in GoHighLevel'
      ELSE 'GoHighLevel event received'
    END,
    'GoHighLevel',
    'integration',
    NULL::uuid,
    'gohighlevel',
    ln.id,
    ln.lead_name,
    CASE WHEN ln.id IS NOT NULL THEN '/app/cases/' || ln.id::text ELSE '/app/settings/integrations' END,
    CASE
      WHEN e.status IN ('dead', 'rejected') THEN 'failed'
      WHEN e.status = 'pending' THEN 'running'
      ELSE 'succeeded'
    END,
    public.activity_plain_reason(e.error_text),
    false,
    NULL::text,
    NULL::uuid,
    e.status NOT IN ('dead', 'rejected') AND (
      e.event_type ILIKE '%contactupdate%' OR e.event_type ILIKE '%opportunity%'
    ),
    jsonb_build_object(
      'eventType', CASE
        WHEN e.event_type ILIKE '%contactcreate%' THEN 'Lead created'
        WHEN e.event_type ILIKE '%contactupdate%' THEN 'Contact updated'
        WHEN e.event_type ILIKE '%opportunity%' THEN 'Opportunity updated'
        WHEN e.status = 'rejected' THEN 'Rejected'
        WHEN e.status = 'dead' THEN 'Failed after retries'
        ELSE 'Inbound event'
      END
    )
  FROM public.webhook_events e
  LEFT JOIN leads_named ln
    ON ln.org_id = e.org_id
    AND ln.ghl_contact_id IS NOT NULL
    AND e.contact_key IS NOT NULL
    AND ln.ghl_contact_id = split_part(e.contact_key, ':', 2)
  WHERE (p_org_id IS NULL OR e.org_id = p_org_id)
    AND e.org_id IS NOT NULL
    AND (
      e.status IN ('dead', 'rejected')
      OR e.event_type ILIKE '%contactcreate%'
      OR e.event_type ILIKE '%contactupdate%'
      OR e.event_type ILIKE '%opportunity%'
    )
    AND (p_from IS NULL OR e.received_at >= p_from)
    AND (p_to IS NULL OR e.received_at <= p_to)

  UNION ALL

  SELECT
    t.org_id, t.id, t.occurred_at,
    CASE WHEN t.direction = 'inbound' THEN 'inbound' ELSE 'user' END,
    CASE WHEN t.direction = 'inbound' THEN 'reply_received' ELSE 'outcome_logged' END,
    CASE
      WHEN t.direction = 'inbound' THEN 'Reply received on ' || public.activity_channel_label(t.channel::text)
      ELSE COALESCE('Outcome logged · ' || replace(t.outcome::text, '_', ' '), 'Outcome logged')
    END,
    CASE
      WHEN t.direction = 'inbound' THEN 'GoHighLevel'
      ELSE COALESCE(actor.display_name, 'A teammate')
    END,
    CASE WHEN t.direction = 'inbound' THEN 'integration' ELSE 'person' END,
    actor.user_id,
    CASE WHEN t.direction = 'inbound' THEN 'gohighlevel' ELSE NULL END,
    t.lead_id,
    ln.lead_name,
    '/app/cases/' || t.lead_id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object(
      'channel', public.activity_channel_label(t.channel::text),
      'direction', t.direction::text,
      'outcome', t.outcome::text,
      'outboundBody', CASE WHEN t.direction = 'outbound' THEN t.outbound_body ELSE NULL END
    )
  FROM public.touches t
  LEFT JOIN public.org_members actor ON actor.id = t.actor_member_id
  LEFT JOIN leads_named ln ON ln.id = t.lead_id
  WHERE (p_org_id IS NULL OR t.org_id = p_org_id)
    AND (t.direction = 'inbound' OR t.type = 'human')
    AND (p_from IS NULL OR t.occurred_at >= p_from)
    AND (p_to IS NULL OR t.occurred_at <= p_to)

  UNION ALL

  SELECT
    c.org_id,
    public.activity_synth_id(c.id::text || ':booked'),
    c.scheduled_at,
    'inbound',
    'appointment_booked',
    'Appointment booked',
    COALESCE(runner.display_name, 'GoHighLevel'),
    CASE WHEN runner.id IS NULL THEN 'integration' ELSE 'person' END,
    runner.user_id,
    CASE WHEN runner.id IS NULL THEN 'gohighlevel' ELSE NULL END,
    c.lead_id,
    ln.lead_name,
    '/app/cases/' || c.lead_id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object('callType', c.type::text, 'scheduledAt', c.scheduled_at)
  FROM public.calls c
  LEFT JOIN public.org_members runner ON runner.id = c.ran_by_member_id
  LEFT JOIN leads_named ln ON ln.id = c.lead_id
  WHERE (p_org_id IS NULL OR c.org_id = p_org_id)
    AND c.scheduled_at IS NOT NULL
    AND (p_from IS NULL OR c.scheduled_at >= p_from)
    AND (p_to IS NULL OR c.scheduled_at <= p_to)

  UNION ALL

  SELECT
    c.org_id, c.id, COALESCE(c.occurred_at, c.scheduled_at, c.created_at),
    CASE
      WHEN c.outcome IN ('no_show', 'rescheduled', 'cancelled') THEN 'inbound'
      ELSE 'system'
    END,
    CASE c.outcome
      WHEN 'no_show' THEN 'appointment_noshow'
      WHEN 'rescheduled' THEN 'appointment_rescheduled'
      WHEN 'cancelled' THEN 'appointment_cancelled'
      ELSE 'call_completed'
    END,
    CASE c.outcome
      WHEN 'no_show' THEN 'Appointment marked as no-show'
      WHEN 'rescheduled' THEN 'Appointment rescheduled'
      WHEN 'cancelled' THEN 'Appointment cancelled'
      ELSE 'Call completed'
    END,
    COALESCE(runner.display_name, 'GoHighLevel'),
    CASE WHEN runner.id IS NULL THEN 'integration' ELSE 'person' END,
    runner.user_id,
    CASE WHEN runner.id IS NULL THEN 'gohighlevel' ELSE NULL END,
    c.lead_id,
    ln.lead_name,
    '/app/cases/' || c.lead_id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object(
      'callType', c.type::text,
      'outcome', c.outcome::text,
      'durationSeconds', c.duration_seconds
    )
  FROM public.calls c
  LEFT JOIN public.org_members runner ON runner.id = c.ran_by_member_id
  LEFT JOIN leads_named ln ON ln.id = c.lead_id
  WHERE (p_org_id IS NULL OR c.org_id = p_org_id)
    AND (c.occurred_at IS NOT NULL OR c.outcome IS NOT NULL)
    AND (p_from IS NULL OR COALESCE(c.occurred_at, c.scheduled_at, c.created_at) >= p_from)
    AND (p_to IS NULL OR COALESCE(c.occurred_at, c.scheduled_at, c.created_at) <= p_to)

  UNION ALL

  SELECT
    c.org_id,
    public.activity_synth_id(c.id::text || ':transcript'),
    c.transcript_arrived_at,
    'inbound',
    'transcript_matched',
    'Transcript received and matched to a call',
    'Call recording',
    'integration',
    NULL,
    NULL,
    c.lead_id,
    ln.lead_name,
    '/app/cases/' || c.lead_id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object('matched', true)
  FROM public.calls c
  LEFT JOIN leads_named ln ON ln.id = c.lead_id
  WHERE (p_org_id IS NULL OR c.org_id = p_org_id)
    AND c.transcript_arrived_at IS NOT NULL
    AND (p_from IS NULL OR c.transcript_arrived_at >= p_from)
    AND (p_to IS NULL OR c.transcript_arrived_at <= p_to)

  UNION ALL

  SELECT
    u.org_id, u.id, u.received_at,
    'inbound',
    'transcript_unmatched',
    'Transcript received · unmatched, waiting in the queue',
    'Call recording',
    'integration',
    NULL, NULL,
    NULL, NULL,
    '/app/calls',
    CASE WHEN u.status = 'open' THEN 'running' ELSE 'succeeded' END,
    NULL, false, NULL, NULL, false,
    jsonb_build_object('status', u.status::text, 'matched', false)
  FROM public.unmatched_transcripts u
  WHERE (p_org_id IS NULL OR u.org_id = p_org_id)
    AND (p_from IS NULL OR u.received_at >= p_from)
    AND (p_to IS NULL OR u.received_at <= p_to)

  UNION ALL

  SELECT
    r.org_id, r.id, r.occurred_at,
    'inbound',
    'payment_recorded',
    'Payment recorded',
    COALESCE(closer.display_name, 'Revenue'),
    CASE WHEN closer.id IS NULL THEN 'integration' ELSE 'person' END,
    closer.user_id,
    NULL,
    r.lead_id,
    ln.lead_name,
    CASE WHEN r.lead_id IS NOT NULL THEN '/app/cases/' || r.lead_id::text ELSE '/app/reporting' END,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object('amountCents', r.amount_cents, 'paymentType', r.payment_type::text)
  FROM public.revenue_log r
  LEFT JOIN public.org_members closer ON closer.id = r.closed_by_member_id
  LEFT JOIN leads_named ln ON ln.id = r.lead_id
  WHERE (p_org_id IS NULL OR r.org_id = p_org_id)
    AND (p_from IS NULL OR r.occurred_at >= p_from)
    AND (p_to IS NULL OR r.occurred_at <= p_to)

  UNION ALL

  SELECT
    s.org_id, s.id, s.created_at,
    CASE WHEN s.triggered_by = 'manual' THEN 'user' ELSE 'system' END,
    CASE WHEN s.triggered_by = 'manual' THEN 'score_overridden' ELSE 'lead_scored' END,
    CASE
      WHEN s.triggered_by = 'manual' THEN 'Score overridden · ' || s.total::text
      ELSE 'Scored ' || s.total::text
    END,
    CASE
      WHEN s.triggered_by = 'manual' THEN COALESCE(scorer.display_name, 'A teammate')
      ELSE COALESCE(scorer.display_name, 'Vistrial scoring')
    END,
    CASE WHEN scorer.id IS NULL THEN 'scoring' ELSE 'person' END,
    scorer.user_id,
    NULL,
    s.lead_id,
    ln.lead_name,
    '/app/cases/' || s.lead_id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object(
      'total', s.total,
      'timeline', s.timeline_raw,
      'investmentCapacity', s.investment_capacity_raw,
      'decisionAuthority', s.decision_authority_raw,
      'painSeverity', s.pain_severity_raw,
      'reasoning', s.reasoning,
      'triggeredBy', CASE s.triggered_by
        WHEN 'manual' THEN 'Manual override'
        WHEN 'intake' THEN 'Intake'
        WHEN 'call' THEN 'Call'
        ELSE 'Event'
      END
    )
  FROM public.readiness_scores s
  LEFT JOIN public.org_members scorer ON scorer.id = s.scored_by_member_id
  LEFT JOIN leads_named ln ON ln.id = s.lead_id
  WHERE (p_org_id IS NULL OR s.org_id = p_org_id)
    AND (p_from IS NULL OR s.created_at >= p_from)
    AND (p_to IS NULL OR s.created_at <= p_to)

  UNION ALL

  SELECT
    tc.org_id, tc.id, tc.created_at,
    'system',
    'track_changed',
    CASE
      WHEN tc.to_type = 'ready_track' THEN 'Moved to Ready'
      WHEN tc.to_type = 'nurture_track' THEN 'Moved to Nurture'
      ELSE 'Track changed'
    END,
    'Vistrial scoring',
    'scoring',
    NULL, NULL,
    tc.lead_id,
    ln.lead_name,
    '/app/cases/' || tc.lead_id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object('fromTrack', tc.from_type::text, 'toTrack', tc.to_type::text)
  FROM public.lead_type_changes tc
  LEFT JOIN leads_named ln ON ln.id = tc.lead_id
  WHERE (p_org_id IS NULL OR tc.org_id = p_org_id)
    AND (p_from IS NULL OR tc.created_at >= p_from)
    AND (p_to IS NULL OR tc.created_at <= p_to)

  UNION ALL

  SELECT
    a.org_id, a.id, a.created_at,
    'user',
    'assignment_changed',
    CASE a.field
      WHEN 'assigned_setter_id' THEN
        CASE
          WHEN a.to_member_id IS NULL THEN 'Setter unassigned'
          ELSE 'Assigned to ' || COALESCE(dest.display_name, 'a setter')
        END
      ELSE
        CASE
          WHEN a.to_member_id IS NULL THEN 'Closer unassigned'
          ELSE 'Closer set to ' || COALESCE(dest.display_name, 'a closer')
        END
    END,
    COALESCE(actor.display_name, 'Workspace'),
    CASE WHEN actor.id IS NULL THEN 'scoring' ELSE 'person' END,
    actor.user_id,
    NULL,
    a.lead_id,
    ln.lead_name,
    '/app/cases/' || a.lead_id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object(
      'field', CASE a.field WHEN 'assigned_setter_id' THEN 'Setter' ELSE 'Closer' END,
      'fromName', src.display_name,
      'toName', dest.display_name
    )
  FROM public.lead_assignment_changes a
  LEFT JOIN public.org_members actor ON actor.id = a.actor_member_id
  LEFT JOIN public.org_members src ON src.id = a.from_member_id
  LEFT JOIN public.org_members dest ON dest.id = a.to_member_id
  LEFT JOIN leads_named ln ON ln.id = a.lead_id
  WHERE (p_org_id IS NULL OR a.org_id = p_org_id)
    AND (p_from IS NULL OR a.created_at >= p_from)
    AND (p_to IS NULL OR a.created_at <= p_to)

  UNION ALL

  SELECT
    sc.org_id, sc.id, sc.created_at,
    CASE WHEN sc.source = 'manual' THEN 'user' ELSE 'system' END,
    'status_changed',
    'Status changed to ' || replace(sc.to_status::text, '_', ' '),
    CASE
      WHEN sc.source = 'manual' THEN COALESCE(actor.display_name, 'A teammate')
      ELSE 'GoHighLevel'
    END,
    CASE WHEN sc.source = 'manual' THEN 'person' ELSE 'integration' END,
    actor.user_id,
    CASE WHEN sc.source = 'manual' THEN NULL ELSE 'gohighlevel' END,
    sc.lead_id,
    ln.lead_name,
    '/app/cases/' || sc.lead_id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object(
      'fromStatus', sc.from_status::text,
      'toStatus', sc.to_status::text,
      'source', sc.source::text,
      'note', sc.note
    )
  FROM public.lead_status_changes sc
  LEFT JOIN public.org_members actor ON actor.id = sc.actor_member_id
  LEFT JOIN leads_named ln ON ln.id = sc.lead_id
  WHERE (p_org_id IS NULL OR sc.org_id = p_org_id)
    AND (p_from IS NULL OR sc.created_at >= p_from)
    AND (p_to IS NULL OR sc.created_at <= p_to)

  UNION ALL

  SELECT * FROM (
    SELECT DISTINCT ON (n.org_id, n.subject_ids[1])
      n.org_id,
      n.id,
      n.queued_at,
      'system',
      'speed_to_lead_opened',
      'Speed-to-lead breach opened',
      'Vistrial coverage',
      'scoring',
      NULL::uuid,
      NULL::text,
      n.subject_ids[1],
      ln.lead_name,
      CASE
        WHEN n.subject_ids[1] IS NOT NULL THEN '/app/cases/' || n.subject_ids[1]::text
        ELSE '/app/queue?breached=1'
      END,
      'running',
      NULL::text, false, NULL::text, NULL::uuid, false,
      jsonb_build_object('kind', 'speed_to_lead')
    FROM public.notifications n
    LEFT JOIN leads_named ln ON ln.id = n.subject_ids[1]
    WHERE (p_org_id IS NULL OR n.org_id = p_org_id)
      AND n.event_type = 'speed_to_lead'
      AND n.is_test = false
      AND n.subject_ids[1] IS NOT NULL
      AND (p_from IS NULL OR n.queued_at >= p_from)
      AND (p_to IS NULL OR n.queued_at <= p_to)
    ORDER BY n.org_id, n.subject_ids[1], n.queued_at ASC
  ) stl

  UNION ALL

  SELECT
    l.org_id,
    public.activity_synth_id(l.id::text || ':stl_cleared'),
    l.first_human_touch_at,
    'system',
    'speed_to_lead_cleared',
    'Speed-to-lead breach cleared',
    'Vistrial coverage',
    'scoring',
    NULL, NULL,
    l.id,
    public.activity_lead_label(l.first_name, l.last_name),
    '/app/cases/' || l.id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object('kind', 'speed_to_lead_cleared')
  FROM public.leads l
  WHERE (p_org_id IS NULL OR l.org_id = p_org_id)
    AND l.first_human_touch_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.org_id = l.org_id
        AND n.event_type = 'speed_to_lead'
        AND n.is_test = false
        AND n.subject_ids[1] = l.id
        AND n.queued_at <= l.first_human_touch_at
    )
    AND (p_from IS NULL OR l.first_human_touch_at >= p_from)
    AND (p_to IS NULL OR l.first_human_touch_at <= p_to)

  UNION ALL

  SELECT
    na.org_id, na.id, na.created_at,
    'system',
    'ghost_reached',
    'Ghost threshold reached',
    'Vistrial scoring',
    'scoring',
    NULL, NULL,
    na.lead_id,
    ln.lead_name,
    '/app/cases/' || na.lead_id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object('kind', 'ghost_reengagement')
  FROM public.next_actions na
  LEFT JOIN leads_named ln ON ln.id = na.lead_id
  WHERE (p_org_id IS NULL OR na.org_id = p_org_id)
    AND na.kind = 'ghost_reengagement'
    AND (p_from IS NULL OR na.created_at >= p_from)
    AND (p_to IS NULL OR na.created_at <= p_to)

  UNION ALL

  SELECT
    g.org_id, g.id, g.ran_at,
    'system',
    'ghost_job',
    'Ghost check ran · ' || g.changed_count::text || ' of ' || g.evaluated_count::text || ' reached the threshold',
    'Vistrial jobs',
    'scoring',
    NULL, NULL,
    NULL, NULL,
    '/app/queue',
    'succeeded',
    NULL, false, NULL, NULL,
    g.changed_count = 0,
    jsonb_build_object('evaluated', g.evaluated_count, 'changed', g.changed_count)
  FROM public.ghost_detector_runs g
  WHERE (p_org_id IS NULL OR g.org_id = p_org_id)
    AND (p_from IS NULL OR g.ran_at >= p_from)
    AND (p_to IS NULL OR g.ran_at <= p_to)

  UNION ALL

  SELECT
    j.org_id, j.id, COALESCE(j.processed_at, j.created_at),
    'system',
    CASE
      WHEN j.status = 'dead' THEN 'extraction_failed'
      WHEN j.status = 'pending' THEN 'extraction_running'
      ELSE 'extraction_completed'
    END,
    CASE
      WHEN j.status = 'dead' THEN 'Extraction failed'
      WHEN j.status = 'pending' THEN 'Extraction running'
      ELSE 'Extraction completed'
    END,
    COALESCE(req.display_name, 'Vistrial extraction'),
    CASE WHEN req.id IS NULL THEN 'scoring' ELSE 'person' END,
    req.user_id,
    NULL,
    c.lead_id,
    ln.lead_name,
    CASE WHEN c.lead_id IS NOT NULL THEN '/app/cases/' || c.lead_id::text ELSE '/app/calls' END,
    CASE
      WHEN j.status = 'dead' THEN 'failed'
      WHEN j.status = 'pending' THEN 'running'
      ELSE 'succeeded'
    END,
    public.activity_plain_reason(j.last_error),
    false, NULL, NULL, false,
    jsonb_build_object('attemptCount', j.attempt_count)
  FROM public.extraction_jobs j
  LEFT JOIN public.calls c ON c.id = j.call_id AND c.org_id = j.org_id
  LEFT JOIN public.org_members req ON req.id = j.requested_by_member_id
  LEFT JOIN leads_named ln ON ln.id = c.lead_id
  WHERE (p_org_id IS NULL OR j.org_id = p_org_id)
    AND (p_from IS NULL OR COALESCE(j.processed_at, j.created_at) >= p_from)
    AND (p_to IS NULL OR COALESCE(j.processed_at, j.created_at) <= p_to)

  UNION ALL

  SELECT
    d.org_id, d.id, COALESCE(d.sent_at, d.created_at),
    CASE WHEN d.status = 'failed' THEN 'system' ELSE 'system' END,
    CASE
      WHEN d.status = 'failed' THEN 'dispatch_failed'
      WHEN d.status = 'queued' THEN 'dispatch_queued'
      WHEN d.status = 'suppressed' THEN 'dispatch_failed'
      ELSE 'dispatch_sent'
    END,
    CASE
      WHEN d.status = 'failed' THEN 'Dispatch failed'
      WHEN d.status = 'queued' THEN 'Dispatch queued'
      WHEN d.status = 'suppressed' THEN 'Dispatch suppressed · contact opted out'
      ELSE 'Message dispatched on ' || public.activity_channel_label(d.channel::text)
    END,
    COALESCE(actor.display_name, 'Vistrial follow-up'),
    CASE WHEN actor.id IS NULL THEN 'scoring' ELSE 'person' END,
    actor.user_id,
    'gohighlevel',
    d.lead_id,
    ln.lead_name,
    '/app/cases/' || d.lead_id::text,
    CASE
      WHEN d.status IN ('failed', 'suppressed') THEN 'failed'
      WHEN d.status = 'queued' THEN 'running'
      ELSE 'succeeded'
    END,
    public.activity_plain_reason(d.failure_reason),
    d.status = 'failed'
      AND d.idempotency_key LIKE 'follow-up:%'
      AND substr(d.idempotency_key, 11) ~ '^[0-9a-fA-F-]{36}$',
    CASE
      WHEN d.status = 'failed' AND d.idempotency_key LIKE 'follow-up:%' THEN 'dispatch'
      ELSE NULL
    END,
    CASE
      WHEN d.status = 'failed'
        AND d.idempotency_key LIKE 'follow-up:%'
        AND substr(d.idempotency_key, 11) ~ '^[0-9a-fA-F-]{36}$'
      THEN substr(d.idempotency_key, 11)::uuid
      ELSE NULL
    END,
    false,
    jsonb_build_object(
      'channel', public.activity_channel_label(d.channel::text),
      'outboundBody', d.body_text,
      'emailSubject', d.email_subject
    )
  FROM public.ghl_dispatches d
  LEFT JOIN public.org_members actor ON actor.id = d.actor_member_id
  LEFT JOIN leads_named ln ON ln.id = d.lead_id
  WHERE (p_org_id IS NULL OR d.org_id = p_org_id)
    AND (p_from IS NULL OR COALESCE(d.sent_at, d.created_at) >= p_from)
    AND (p_to IS NULL OR COALESCE(d.sent_at, d.created_at) <= p_to)

  UNION ALL

  SELECT
    e.org_id, e.id, e.created_at,
    CASE
      WHEN e.kind IN ('approved', 'rejected', 'edited', 'discarded') THEN 'user'
      WHEN e.kind IN ('failed', 'enqueue_failed', 'quality_failed') THEN 'system'
      ELSE 'system'
    END,
    CASE e.kind
      WHEN 'generated' THEN 'draft_generated'
      WHEN 'approved' THEN 'draft_approved'
      WHEN 'rejected' THEN 'draft_rejected'
      WHEN 'edited' THEN 'draft_edited'
      WHEN 'sent' THEN 'dispatch_sent'
      WHEN 'failed' THEN 'dispatch_failed'
      WHEN 'enqueue_failed' THEN 'draft_failed'
      WHEN 'quality_failed' THEN 'draft_failed'
      WHEN 'regenerated' THEN 'draft_generated'
      ELSE 'draft_generated'
    END,
    CASE e.kind
      WHEN 'generated' THEN 'Follow-up draft generated'
      WHEN 'approved' THEN 'Draft approved and dispatched'
      WHEN 'rejected' THEN 'Draft rejected'
      WHEN 'edited' THEN 'Draft edited'
      WHEN 'sent' THEN 'Follow-up sent'
      WHEN 'failed' THEN 'Follow-up dispatch failed'
      WHEN 'enqueue_failed' THEN 'Follow-up could not be queued'
      WHEN 'quality_failed' THEN 'Follow-up draft failed a quality check'
      WHEN 'regenerated' THEN 'Follow-up draft regenerated'
      WHEN 'discarded' THEN 'Draft discarded'
      ELSE 'Follow-up event'
    END,
    COALESCE(actor.display_name, 'Vistrial follow-up'),
    CASE WHEN actor.id IS NULL THEN 'scoring' ELSE 'person' END,
    actor.user_id,
    NULL,
    COALESCE(e.lead_id, d.lead_id, s.lead_id),
    ln.lead_name,
    CASE
      WHEN COALESCE(e.lead_id, d.lead_id, s.lead_id) IS NOT NULL
      THEN '/app/cases/' || COALESCE(e.lead_id, d.lead_id, s.lead_id)::text
      ELSE '/app/queue'
    END,
    CASE
      WHEN e.kind IN ('failed', 'enqueue_failed', 'quality_failed') THEN 'failed'
      ELSE 'succeeded'
    END,
    CASE
      WHEN e.kind IN ('failed', 'enqueue_failed', 'quality_failed')
        AND jsonb_typeof(e.payload->'reason') = 'string'
      THEN public.activity_plain_reason(e.payload->>'reason')
      ELSE NULL
    END,
    e.kind = 'failed' AND d.id IS NOT NULL,
    CASE WHEN e.kind = 'failed' AND d.id IS NOT NULL THEN 'dispatch' ELSE NULL END,
    CASE WHEN e.kind = 'failed' THEN d.id ELSE NULL END,
    false,
    jsonb_build_object(
      'kind', e.kind::text,
      'outboundBody', CASE WHEN e.kind IN ('generated', 'approved', 'sent', 'edited') THEN d.generated_body ELSE NULL END
    )
  FROM public.follow_up_events e
  LEFT JOIN public.org_members actor ON actor.id = e.actor_member_id
  LEFT JOIN public.follow_up_drafts d ON d.id = e.draft_id
  LEFT JOIN public.follow_up_sequence_runs s ON s.id = e.sequence_run_id
  LEFT JOIN leads_named ln ON ln.id = COALESCE(e.lead_id, d.lead_id, s.lead_id)
  WHERE (p_org_id IS NULL OR e.org_id = p_org_id)
    AND e.kind IS DISTINCT FROM 'sent'
    AND (p_from IS NULL OR e.created_at >= p_from)
    AND (p_to IS NULL OR e.created_at <= p_to)

  UNION ALL

  SELECT
    r.org_id, r.id, r.started_at,
    'system',
    'sequence_started',
    'Follow-up sequence started',
    'Vistrial follow-up',
    'scoring',
    NULL, NULL,
    r.lead_id,
    ln.lead_name,
    '/app/cases/' || r.lead_id::text,
    'running',
    NULL, false, NULL, NULL, false,
    jsonb_build_object('branch', r.branch::text, 'maxSteps', r.max_steps)
  FROM public.follow_up_sequence_runs r
  LEFT JOIN leads_named ln ON ln.id = r.lead_id
  WHERE (p_org_id IS NULL OR r.org_id = p_org_id)
    AND (p_from IS NULL OR r.started_at >= p_from)
    AND (p_to IS NULL OR r.started_at <= p_to)

  UNION ALL

  SELECT
    r.org_id,
    public.activity_synth_id(r.id::text || ':halted'),
    r.halted_at,
    'system',
    'sequence_halted',
    'Follow-up sequence halted',
    COALESCE(halted_by.display_name, 'Vistrial follow-up'),
    CASE WHEN halted_by.id IS NULL THEN 'scoring' ELSE 'person' END,
    halted_by.user_id,
    NULL,
    r.lead_id,
    ln.lead_name,
    '/app/cases/' || r.lead_id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object('reason', replace(r.halt_reason::text, '_', ' '))
  FROM public.follow_up_sequence_runs r
  LEFT JOIN public.org_members halted_by ON halted_by.id = r.halted_by_member_id
  LEFT JOIN leads_named ln ON ln.id = r.lead_id
  WHERE (p_org_id IS NULL OR r.org_id = p_org_id)
    AND r.status = 'halted'
    AND r.halted_at IS NOT NULL
    AND (p_from IS NULL OR r.halted_at >= p_from)
    AND (p_to IS NULL OR r.halted_at <= p_to)

  UNION ALL

  SELECT
    r.org_id,
    public.activity_synth_id(r.id::text || ':completed'),
    r.completed_at,
    'system',
    'sequence_completed',
    'Follow-up sequence completed',
    'Vistrial follow-up',
    'scoring',
    NULL, NULL,
    r.lead_id,
    ln.lead_name,
    '/app/cases/' || r.lead_id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object('branch', r.branch::text)
  FROM public.follow_up_sequence_runs r
  LEFT JOIN leads_named ln ON ln.id = r.lead_id
  WHERE (p_org_id IS NULL OR r.org_id = p_org_id)
    AND r.status = 'completed'
    AND r.completed_at IS NOT NULL
    AND (p_from IS NULL OR r.completed_at >= p_from)
    AND (p_to IS NULL OR r.completed_at <= p_to)

  UNION ALL

  SELECT
    j.org_id, j.id, COALESCE(j.processed_at, j.created_at),
    'system',
    CASE
      WHEN j.status = 'dead' THEN 'job_failed'
      WHEN j.sequence_position > 1 THEN 'sequence_advanced'
      ELSE 'job_ran'
    END,
    CASE
      WHEN j.status = 'dead' THEN 'Follow-up job did not run'
      WHEN j.sequence_position > 1 THEN 'Sequence advanced to message ' || j.sequence_position::text
      ELSE 'Follow-up job ran'
    END,
    'Vistrial jobs',
    'scoring',
    NULL, NULL,
    j.lead_id,
    ln.lead_name,
    '/app/cases/' || j.lead_id::text,
    CASE WHEN j.status = 'dead' THEN 'failed' WHEN j.status = 'pending' THEN 'running' ELSE 'succeeded' END,
    public.activity_plain_reason(j.last_error),
    false, NULL, NULL,
    j.status = 'processed' AND j.sequence_position = 1,
    jsonb_build_object('position', j.sequence_position, 'branch', j.branch::text)
  FROM public.follow_up_jobs j
  LEFT JOIN leads_named ln ON ln.id = j.lead_id
  WHERE (p_org_id IS NULL OR j.org_id = p_org_id)
    AND (p_from IS NULL OR COALESCE(j.processed_at, j.created_at) >= p_from)
    AND (p_to IS NULL OR COALESCE(j.processed_at, j.created_at) <= p_to)

  UNION ALL

  SELECT
    o.org_id, o.id, o.resolved_at,
    'user',
    'objection_resolved',
    'Objection resolved',
    COALESCE(resolver.display_name, 'A teammate'),
    'person',
    resolver.user_id,
    NULL,
    o.lead_id,
    ln.lead_name,
    '/app/cases/' || o.lead_id::text,
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object('type', replace(o.type::text, '_', ' '), 'note', o.resolved_note)
  FROM public.objections o
  LEFT JOIN public.org_members resolver ON resolver.id = o.resolved_by_member_id
  LEFT JOIN leads_named ln ON ln.id = o.lead_id
  WHERE (p_org_id IS NULL OR o.org_id = p_org_id)
    AND o.resolved
    AND o.resolved_at IS NOT NULL
    AND (p_from IS NULL OR o.resolved_at >= p_from)
    AND (p_to IS NULL OR o.resolved_at <= p_to)

  UNION ALL

  SELECT
    r.org_id, r.id, r.created_at,
    'agent',
    'agent_run_started',
    'Agent run started · ' || left(r.request_text, 80),
    COALESCE(m.display_name, 'Operator agent'),
    'person',
    r.user_id,
    NULL,
    ol.lead_id,
    ln.lead_name,
    CASE
      WHEN ol.lead_id IS NOT NULL THEN '/app/cases/' || ol.lead_id::text
      ELSE '/app/queue'
    END,
    CASE
      WHEN r.status IN ('failed', 'cancelled') THEN 'failed'
      WHEN r.status IN ('running', 'awaiting_confirmation') THEN 'running'
      ELSE 'succeeded'
    END,
    CASE WHEN r.status = 'failed' THEN public.activity_plain_reason(r.stop_reason) ELSE NULL END,
    false, NULL, NULL, false,
    jsonb_build_object('request', left(r.request_text, 280), 'status', r.status)
  FROM public.operator_runs r
  LEFT JOIN public.org_members m ON m.id = r.member_id
  LEFT JOIN LATERAL (
    SELECT x.lead_id FROM public.operator_run_leads x
    WHERE x.run_id = r.id AND x.org_id = r.org_id
    ORDER BY x.lead_id LIMIT 1
  ) ol ON true
  LEFT JOIN leads_named ln ON ln.id = ol.lead_id
  WHERE (p_org_id IS NULL OR r.org_id = p_org_id)
    AND (p_from IS NULL OR r.created_at >= p_from)
    AND (p_to IS NULL OR r.created_at <= p_to)

  UNION ALL

  SELECT
    s.org_id, s.id, s.started_at,
    'agent',
    'agent_tool',
    'Agent tool · ' || s.label,
    COALESCE(m.display_name, 'Operator agent'),
    'person',
    r.user_id,
    NULL,
    ol.lead_id,
    ln.lead_name,
    CASE
      WHEN ol.lead_id IS NOT NULL THEN '/app/cases/' || ol.lead_id::text
      ELSE '/app/queue'
    END,
    CASE
      WHEN s.state = 'failed' THEN 'failed'
      WHEN s.state = 'running' THEN 'running'
      ELSE 'succeeded'
    END,
    public.activity_plain_reason(s.error_kind),
    false, NULL, NULL, false,
    jsonb_build_object('label', s.label, 'summary', s.result_summary, 'state', s.state)
  FROM public.operator_run_steps s
  JOIN public.operator_runs r ON r.id = s.run_id AND r.org_id = s.org_id
  LEFT JOIN public.org_members m ON m.id = r.member_id
  LEFT JOIN LATERAL (
    SELECT x.lead_id FROM public.operator_run_leads x
    WHERE x.run_id = s.run_id AND x.org_id = s.org_id
    ORDER BY x.lead_id LIMIT 1
  ) ol ON true
  LEFT JOIN leads_named ln ON ln.id = ol.lead_id
  WHERE (p_org_id IS NULL OR s.org_id = p_org_id)
    AND (p_from IS NULL OR s.started_at >= p_from)
    AND (p_to IS NULL OR s.started_at <= p_to)

  UNION ALL

  SELECT
    c.org_id, c.id, COALESCE(c.decided_at, c.created_at),
    'agent',
    'agent_write_decided',
    CASE c.decision
      WHEN 'confirmed' THEN 'Agent write confirmed'
      WHEN 'cancelled' THEN 'Agent write cancelled'
      WHEN 'adjusted' THEN 'Agent write adjusted'
      ELSE 'Agent write awaiting confirmation'
    END,
    COALESCE(decider.display_name, m.display_name, 'Operator agent'),
    'person',
    COALESCE(decider.user_id, r.user_id),
    NULL,
    ol.lead_id,
    ln.lead_name,
    CASE
      WHEN ol.lead_id IS NOT NULL THEN '/app/cases/' || ol.lead_id::text
      ELSE '/app/queue'
    END,
    CASE
      WHEN c.decision = 'cancelled' THEN 'failed'
      WHEN c.decision = 'pending' THEN 'running'
      ELSE 'succeeded'
    END,
    NULL, false, NULL, NULL, false,
    jsonb_build_object(
      'writeKind', replace(c.write_kind, '_', ' '),
      'decision', c.decision,
      'recordCount', c.record_count
    )
  FROM public.operator_run_confirmations c
  JOIN public.operator_runs r ON r.id = c.run_id AND r.org_id = c.org_id
  LEFT JOIN public.org_members m ON m.id = r.member_id
  LEFT JOIN public.org_members decider ON decider.id = c.decided_by
  LEFT JOIN LATERAL (
    SELECT x.lead_id FROM public.operator_run_leads x
    WHERE x.run_id = c.run_id AND x.org_id = c.org_id
    ORDER BY x.lead_id LIMIT 1
  ) ol ON true
  LEFT JOIN leads_named ln ON ln.id = ol.lead_id
  WHERE (p_org_id IS NULL OR c.org_id = p_org_id)
    AND (p_from IS NULL OR COALESCE(c.decided_at, c.created_at) >= p_from)
    AND (p_to IS NULL OR COALESCE(c.decided_at, c.created_at) <= p_to)

  UNION ALL

  SELECT
    sa.org_id, sa.id, sa.created_at,
    CASE WHEN sa.actor_kind = 'da_operator' THEN 'operator' ELSE 'user' END,
    'settings_changed',
    'Settings changed · ' || replace(sa.section, '_', ' ') || ' · ' || sa.action,
    CASE
      WHEN sa.actor_kind = 'system' THEN COALESCE(NULLIF(sa.actor_label, 'system'), 'Workspace')
      ELSE sa.actor_label
    END,
    CASE
      WHEN sa.actor_kind = 'da_operator' THEN 'person'
      WHEN sa.actor_kind = 'member' THEN 'person'
      ELSE 'scoring'
    END,
    sa.actor_user_id,
    NULL, NULL, NULL,
    '/app/settings',
    'succeeded',
    NULL, false, NULL, NULL, false,
    jsonb_build_object(
      'section', sa.section,
      'action', sa.action,
      'fromValue', public.activity_scalar_json(sa.from_value),
      'toValue', public.activity_scalar_json(sa.to_value),
      'actorKind', sa.actor_kind
    )
  FROM public.settings_activity sa
  WHERE (p_org_id IS NULL OR sa.org_id = p_org_id)
    AND (p_from IS NULL OR sa.created_at >= p_from)
    AND (p_to IS NULL OR sa.created_at <= p_to)

  UNION ALL

  SELECT
    gc.org_id, gc.id, COALESCE(gc.last_verified_at, gc.updated_at, gc.created_at),
    'inbound',
    'connection_broken',
    'GoHighLevel connection broken',
    'GoHighLevel',
    'integration',
    NULL,
    'gohighlevel',
    NULL, NULL,
    '/app/settings/integrations',
    'failed',
    public.activity_plain_reason(gc.last_refresh_error),
    false, NULL, NULL, false,
    jsonb_build_object('status', gc.status::text)
  FROM public.ghl_connections gc
  WHERE (p_org_id IS NULL OR gc.org_id = p_org_id)
    AND gc.status = 'broken'
    AND (p_from IS NULL OR COALESCE(gc.last_verified_at, gc.updated_at, gc.created_at) >= p_from)
    AND (p_to IS NULL OR COALESCE(gc.last_verified_at, gc.updated_at, gc.created_at) <= p_to)

  UNION ALL

  SELECT
    rj.org_id, rj.id, rj.started_at,
    'system',
    CASE WHEN rj.status = 'failed' THEN 'job_failed' ELSE 'job_ran' END,
    'Reporting job ran · ' || replace(rj.job_kind::text, '_', ' '),
    'Vistrial jobs',
    'scoring',
    NULL, NULL,
    NULL, NULL,
    '/app/reporting',
    CASE WHEN rj.status = 'failed' THEN 'failed' WHEN rj.status = 'running' THEN 'running' ELSE 'succeeded' END,
    public.activity_plain_reason(rj.error_text),
    false, NULL, NULL,
    rj.status <> 'failed',
    jsonb_build_object('processed', rj.processed_count, 'jobKind', rj.job_kind::text)
  FROM public.reporting_job_runs rj
  WHERE (p_org_id IS NULL OR rj.org_id = p_org_id)
    AND rj.org_id IS NOT NULL
    AND (p_from IS NULL OR rj.started_at >= p_from)
    AND (p_to IS NULL OR rj.started_at <= p_to);
END;
$$;

CREATE OR REPLACE FUNCTION public.load_org_activity(
  p_org_id uuid,
  p_lead_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_integration text DEFAULT NULL,
  p_failures_only boolean DEFAULT false,
  p_include_sync_noise boolean DEFAULT false,
  p_include_routine boolean DEFAULT false,
  p_q text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 40,
  p_cursor jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_manager boolean;
  v_rows jsonb;
  v_has_more boolean;
  v_q text;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  v_manager := public.user_has_org_role(p_org_id, 'owner', 'admin');
  IF NOT v_manager THEN
    RAISE EXCEPTION 'not authorized for the full activity stream';
  END IF;

  IF p_lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.leads WHERE id = p_lead_id AND org_id = p_org_id
  ) THEN
    RETURN jsonb_build_object('events', '[]'::jsonb, 'hasMore', false);
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 80);
  v_q := NULLIF(btrim(COALESCE(p_q, '')), '');
  IF p_cursor IS NOT NULL AND jsonb_typeof(p_cursor) = 'object' THEN
    v_cursor_at := NULLIF(p_cursor->>'at', '')::timestamptz;
    v_cursor_id := NULLIF(p_cursor->>'id', '')::uuid;
  END IF;

  SELECT COALESCE(jsonb_agg(page.elem ORDER BY page.occurred_at DESC, page.id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'id', s.id,
        'orgId', s.org_id,
        'occurredAt', s.occurred_at,
        'category', s.category,
        'kind', s.kind,
        'headline', s.headline,
        'actorLabel', s.actor_label,
        'actorKind', s.actor_kind,
        'actorUserId', s.actor_user_id,
        'integration', s.integration,
        'leadId', s.lead_id,
        'leadName', s.lead_name,
        'href', s.href,
        'result', s.result,
        'resultReason', s.result_reason,
        'retryable', s.retryable,
        'retryKind', s.retry_kind,
        'retryId', s.retry_id,
        'isSyncNoise', s.is_sync_noise,
        'detail', COALESCE(s.detail, '{}'::jsonb)
      ) AS elem,
      s.occurred_at,
      s.id
    FROM public.activity_stream_source(p_org_id, p_from, p_to) s
    WHERE (p_lead_id IS NULL OR s.lead_id = p_lead_id)
      AND (p_actor_user_id IS NULL OR s.actor_user_id = p_actor_user_id)
      AND (p_category IS NULL OR s.category = p_category)
      AND (p_integration IS NULL OR s.integration = p_integration)
      AND (NOT COALESCE(p_failures_only, false) OR s.result = 'failed')
      AND (COALESCE(p_include_sync_noise, false) OR NOT s.is_sync_noise)
      AND (
        COALESCE(p_include_routine, false)
        OR p_category IS NOT NULL
        OR s.category IN ('user', 'agent', 'operator')
        OR s.result = 'failed'
        OR s.kind IN (
          'lead_received',
          'dispatch_sent',
          'dispatch_failed',
          'dispatch_queued',
          'speed_to_lead_opened',
          'speed_to_lead_cleared',
          'ghost_reached',
          'connection_broken'
        )
        -- Sync noise is a separate toggle from routine system work.
        OR (COALESCE(p_include_sync_noise, false) AND s.is_sync_noise)
      )
      AND (v_q IS NULL OR s.lead_name ILIKE '%' || v_q || '%')
      AND (v_cursor_id IS NULL OR (s.occurred_at, s.id) < (v_cursor_at, v_cursor_id))
    ORDER BY s.occurred_at DESC, s.id DESC
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
    'events', COALESCE(v_rows, '[]'::jsonb),
    'hasMore', v_has_more
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.load_ops_activity(
  p_org_id uuid DEFAULT NULL,
  p_failures_only boolean DEFAULT false,
  p_include_sync_noise boolean DEFAULT false,
  p_include_routine boolean DEFAULT false,
  p_q text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 40,
  p_cursor jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_from timestamptz;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_cursor_fail integer;
  v_rows jsonb;
  v_has_more boolean;
  v_q text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 80);
  v_from := COALESCE(p_from, now() - interval '14 days');
  v_q := NULLIF(btrim(COALESCE(p_q, '')), '');
  v_cursor_fail := 1;
  IF p_cursor IS NOT NULL AND jsonb_typeof(p_cursor) = 'object' THEN
    v_cursor_at := NULLIF(p_cursor->>'at', '')::timestamptz;
    v_cursor_id := NULLIF(p_cursor->>'id', '')::uuid;
    v_cursor_fail := CASE WHEN p_cursor->>'failed' IN ('1', 'true') THEN 1 ELSE 0 END;
  END IF;

  SELECT COALESCE(jsonb_agg(page.elem ORDER BY page.fail DESC, page.occurred_at DESC, page.id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'id', s.id,
        'orgId', s.org_id,
        'orgName', o.name,
        'occurredAt', s.occurred_at,
        'category', s.category,
        'kind', s.kind,
        'headline', s.headline,
        'actorLabel', s.actor_label,
        'actorKind', s.actor_kind,
        'actorUserId', s.actor_user_id,
        'integration', s.integration,
        'leadId', s.lead_id,
        'leadName', s.lead_name,
        'href', s.href,
        'result', s.result,
        'resultReason', s.result_reason,
        'retryable', s.retryable,
        'retryKind', s.retry_kind,
        'retryId', s.retry_id,
        'isSyncNoise', s.is_sync_noise,
        'detail', COALESCE(s.detail, '{}'::jsonb)
      ) AS elem,
      s.occurred_at,
      s.id,
      (s.result = 'failed')::int AS fail
    FROM public.activity_stream_source(p_org_id, v_from, p_to) s
    JOIN public.organizations o ON o.id = s.org_id
    WHERE (p_org_id IS NULL OR s.org_id = p_org_id)
      AND (NOT COALESCE(p_failures_only, false) OR s.result = 'failed')
      AND (COALESCE(p_include_sync_noise, false) OR NOT s.is_sync_noise)
      AND (
        COALESCE(p_include_routine, false)
        OR s.category IN ('user', 'agent', 'operator')
        OR s.result = 'failed'
        OR s.kind IN (
          'lead_received',
          'dispatch_sent',
          'dispatch_failed',
          'dispatch_queued',
          'speed_to_lead_opened',
          'speed_to_lead_cleared',
          'ghost_reached',
          'connection_broken'
        )
        OR (COALESCE(p_include_sync_noise, false) AND s.is_sync_noise)
      )
      AND (
        v_q IS NULL
        OR s.lead_name ILIKE '%' || v_q || '%'
        OR o.name ILIKE '%' || v_q || '%'
      )
      AND (
        v_cursor_id IS NULL
        OR (s.result = 'failed')::int < v_cursor_fail
        OR (
          (s.result = 'failed')::int = v_cursor_fail
          AND (s.occurred_at, s.id) < (v_cursor_at, v_cursor_id)
        )
      )
    ORDER BY (s.result = 'failed') DESC, s.occurred_at DESC, s.id DESC
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
    'events', COALESCE(v_rows, '[]'::jsonb),
    'hasMore', v_has_more
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activity_stream_source(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.load_org_activity(uuid, uuid, uuid, text, text, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.load_ops_activity(uuid, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.activity_stream_source(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.load_org_activity(uuid, uuid, uuid, text, text, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.load_ops_activity(uuid, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.load_org_case_timeline(
  p_org_id uuid,
  p_lead_id uuid,
  p_cursor jsonb DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

      UNION ALL

      SELECT jsonb_build_object(
        'kind', 'activity',
        'id', a.id,
        'at', a.occurred_at,
        'category', a.category,
        'activityKind', a.kind,
        'headline', a.headline,
        'actorName', a.actor_label,
        'result', a.result,
        'resultReason', a.result_reason,
        'retryable', a.retryable,
        'retryKind', a.retry_kind,
        'retryId', a.retry_id,
        'detail', a.detail
      ),
      a.occurred_at,
      a.id
      FROM public.activity_stream_source(p_org_id, NULL, NULL) a
      WHERE a.lead_id = p_lead_id
        AND a.kind NOT IN (
          'reply_received',
          'outcome_logged',
          'appointment_booked',
          'appointment_noshow',
          'appointment_rescheduled',
          'appointment_cancelled',
          'call_completed',
          'status_changed',
          'contact_updated',
          'opportunity_updated',
          'webhook_other',
          'ghost_job',
          'job_ran'
        )
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

-- Realtime: same postgres_changes mechanism as the queue. Do not publish tables
-- whose rows carry payloads, tokens, transcripts, or inbound message bodies.
ALTER TABLE public.ghl_dispatches REPLICA IDENTITY FULL;
ALTER TABLE public.readiness_scores REPLICA IDENTITY FULL;
ALTER TABLE public.lead_status_changes REPLICA IDENTITY FULL;
ALTER TABLE public.lead_assignment_changes REPLICA IDENTITY FULL;
ALTER TABLE public.lead_type_changes REPLICA IDENTITY FULL;
ALTER TABLE public.extraction_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.operator_runs REPLICA IDENTITY FULL;
ALTER TABLE public.follow_up_sequence_runs REPLICA IDENTITY FULL;
ALTER TABLE public.follow_up_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.revenue_log REPLICA IDENTITY FULL;
ALTER TABLE public.settings_activity REPLICA IDENTITY FULL;
ALTER TABLE public.ghost_detector_runs REPLICA IDENTITY FULL;
ALTER TABLE public.next_actions REPLICA IDENTITY FULL;

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
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
    END LOOP;
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.load_org_case_timeline(uuid, uuid, jsonb, integer)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_lead_assignment_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_lead_type_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_lead_assignment_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_lead_type_change() TO service_role;
