-- User-visible CRM copy uses LeadConnector.
-- Internal integration keys and existing CRM deep-link hosts stay unchanged.

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
          ELSE 'Lead arrived from LeadConnector'
        END
      WHEN e.event_type ILIKE '%contactupdate%' THEN 'Contact updated in LeadConnector'
      WHEN e.event_type ILIKE '%opportunity%' THEN 'Opportunity updated in LeadConnector'
      ELSE 'LeadConnector event received'
    END,
    'LeadConnector',
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
      WHEN t.direction = 'inbound' THEN 'LeadConnector'
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
    COALESCE(runner.display_name, 'LeadConnector'),
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
    COALESCE(runner.display_name, 'LeadConnector'),
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
      ELSE 'LeadConnector'
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
    'LeadConnector connection broken',
    'LeadConnector',
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

CREATE OR REPLACE FUNCTION public.activation_readiness(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  p public.business_profiles%ROWTYPE;
  sc public.score_configs%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_conn public.ghl_connections%ROWTYPE;
  v_hard jsonb := '[]'::jsonb;
  v_warn jsonb := '[]'::jsonb;
  v_ok boolean;
  v_detail text;
  v_scored bigint;
  v_mapped integer;
  v_members bigint;
  v_self boolean;
  v_declined boolean;
  v_examples integer;
  v_transcript integer;
  v_completeness jsonb;
  v_record public.activation_records%ROWTYPE;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO p FROM public.business_profiles WHERE org_id = p_org_id;
  SELECT * INTO sc FROM public.score_configs WHERE org_id = p_org_id;
  SELECT * INTO v_conn FROM public.ghl_connections WHERE org_id = p_org_id;
  SELECT * INTO v_run FROM public.baseline_runs
  WHERE org_id = p_org_id ORDER BY created_at DESC, id DESC LIMIT 1;
  SELECT * INTO v_record FROM public.activation_records WHERE org_id = p_org_id;
  v_completeness := public.business_profile_completeness(p_org_id);

  -- 1. CRM connected and verified.
  v_ok := v_conn.org_id IS NOT NULL AND v_conn.status = 'active' AND v_conn.location_id IS NOT NULL;
  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'key', 'crm_connected', 'ok', v_ok,
    'label', 'CRM connected and verified',
    'detail', CASE WHEN v_ok
      THEN 'Linked to ' || COALESCE(v_conn.location_name, v_conn.location_id) || '.'
      ELSE 'No active LeadConnector connection. Connect it on the integrations page.' END
  ));

  -- 2. Backfill resolved either way.
  SELECT EXISTS (SELECT 1 FROM public.self_reported_baselines WHERE org_id = p_org_id) INTO v_self;
  SELECT EXISTS (SELECT 1 FROM public.baseline_fallback_declines WHERE org_id = p_org_id) INTO v_declined;
  IF v_run.id IS NULL THEN
    v_ok := false;
    v_detail := 'The CRM history backfill has not run. It starts automatically once the CRM is connected.';
  ELSIF v_run.status IN ('queued', 'running') THEN
    v_ok := false;
    v_detail := 'The backfill is still running.';
  ELSIF v_run.status = 'failed' THEN
    v_ok := false;
    v_detail := 'The backfill failed. Re-run it or skip it, then answer with stated figures or decline them.';
  ELSIF v_run.grade IN ('usable', 'partial') THEN
    v_ok := true;
    v_detail := 'Graded ' || v_run.grade || '.';
  ELSIF v_self THEN
    v_ok := true;
    v_detail := 'Graded unusable. Prior figures were captured and are labelled self-reported everywhere.';
  ELSIF v_declined THEN
    v_ok := true;
    v_detail := 'Graded unusable and prior figures were explicitly declined. No baseline comparison will be shown.';
  ELSE
    v_ok := false;
    v_detail := 'Graded unusable. Capture the client-stated prior figures or record that they declined to give them.';
  END IF;
  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'key', 'backfill_resolved', 'ok', v_ok,
    'label', 'Baseline backfill resolved', 'detail', v_detail
  ));

  -- 3. Field mapping producing valid scores on real leads.
  SELECT count(*) INTO v_mapped FROM public.ghl_field_maps WHERE org_id = p_org_id;
  SELECT count(*) INTO v_scored
  FROM public.leads l
  WHERE l.org_id = p_org_id AND l.current_score IS NOT NULL;
  v_ok := v_mapped > 0 AND v_scored > 0;
  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'key', 'field_mapping_valid', 'ok', v_ok,
    'label', 'Field mapping produces scores on real leads',
    'detail', CASE
      WHEN v_mapped = 0 THEN 'No CRM fields are mapped, so no application answer ever reaches scoring.'
      WHEN v_scored = 0 THEN 'Fields are mapped but no real lead has produced a score yet.'
      ELSE v_scored || ' real leads currently carry a score from ' || v_mapped || ' mapped fields.' END
  ));

  -- 4. Scoring configuration saved and valid.
  v_ok := sc.org_id IS NOT NULL
    AND (sc.timeline_weight + sc.investment_capacity_weight + sc.decision_authority_weight + sc.pain_severity_weight) = 100
    AND EXISTS (SELECT 1 FROM public.score_field_maps m WHERE m.org_id = p_org_id)
    AND EXISTS (
      SELECT 1 FROM public.score_field_rules r
      JOIN public.score_field_maps m ON m.id = r.field_map_id
      WHERE m.org_id = p_org_id
    );
  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'key', 'scoring_valid', 'ok', v_ok,
    'label', 'Scoring configuration saved and valid',
    'detail', CASE WHEN v_ok
      THEN 'Weights total 100 and answer rules exist for the mapped fields.'
      ELSE 'Scoring has no saved answer rules, or the four weights do not total 100.' END
  ));

  -- 5. At least one active member who can work leads.
  SELECT count(*) INTO v_members
  FROM public.org_members
  WHERE org_id = p_org_id AND active AND role IN ('owner', 'admin', 'closer', 'setter');
  v_ok := v_members > 0;
  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'key', 'active_member', 'ok', v_ok,
    'label', 'At least one active member who can work leads',
    'detail', CASE WHEN v_ok THEN v_members || ' active members.' ELSE 'Nobody active can open the queue.' END
  ));

  -- Warnings. Each one has to be acknowledged, and the acknowledgement is kept.
  SELECT COALESCE(jsonb_array_length(vp.examples), 0) INTO v_examples
  FROM public.org_voice_profiles vp WHERE vp.org_id = p_org_id;
  IF COALESCE(v_examples, 0) = 0 THEN
    v_warn := v_warn || jsonb_build_array(jsonb_build_object(
      'key', 'no_voice_examples',
      'label', 'No voice examples',
      'detail', 'Drafts will read generic. The voice profile has nothing of yours to imitate.'
    ));
  END IF;

  SELECT count(*) INTO v_transcript FROM public.transcript_connections WHERE org_id = p_org_id;
  IF COALESCE(v_transcript, 0) = 0 THEN
    v_warn := v_warn || jsonb_build_array(jsonb_build_object(
      'key', 'no_transcript_source',
      'label', 'No transcript source',
      'detail', 'No extraction, no pre-call briefs, and no grounded follow-up. Everything downstream of a call stays empty.'
    ));
  END IF;

  IF (v_completeness ->> 'score')::integer < public.profile_completeness_min() THEN
    v_warn := v_warn || jsonb_build_array(jsonb_build_object(
      'key', 'profile_incomplete',
      'label', 'Business profile below the usable threshold',
      'detail', 'Completeness is ' || (v_completeness ->> 'score') || ' against a usable threshold of '
        || public.profile_completeness_min() || '.',
      'affects', (
        SELECT COALESCE(jsonb_agg(DISTINCT g ->> 'consumer'), '[]'::jsonb)
        FROM jsonb_array_elements(v_completeness -> 'gaps') g
      )
    ));
  END IF;

  IF v_run.grade = 'partial' THEN
    v_warn := v_warn || jsonb_build_array(jsonb_build_object(
      'key', 'backfill_partial',
      'label', 'Baseline graded partial',
      'detail', 'Every before-and-after figure carries a caveat.',
      'affects', to_jsonb(v_run.grade_reasons)
    ));
  END IF;

  RETURN jsonb_build_object(
    'activated_at', o.activated_at,
    'hard', v_hard,
    'blocked', EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_hard) h WHERE (h ->> 'ok')::boolean = false
    ),
    'warnings', v_warn,
    'completeness', v_completeness,
    'record', CASE WHEN v_record.org_id IS NULL THEN NULL ELSE jsonb_build_object(
      'activated_at', v_record.activated_at,
      'activated_by_member_id', v_record.activated_by_member_id,
      'warnings_acknowledged', to_jsonb(v_record.warnings_acknowledged),
      'requirements', v_record.requirements
    ) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_activation_gate(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_onb public.org_onboarding%ROWTYPE;
  v_conn public.ghl_connections%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_cfg public.score_configs%ROWTYPE;
  v_self public.self_reported_baselines%ROWTYPE;
  v_hard jsonb := '[]'::jsonb;
  v_warn jsonb := '[]'::jsonb;
  v_ok boolean;
  v_crm_ok boolean;
  v_backfill_ok boolean;
  v_map_ok boolean;
  v_score_ok boolean;
  v_member_ok boolean;
  v_fallback_ok boolean;
  v_member_count integer;
  v_voice_n integer := 0;
  v_transcript_connected boolean;
BEGIN
  IF NOT public.onboarding_manager_allowed(p_org_id) THEN
    RAISE EXCEPTION 'setup is owner/admin only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'organization not found';
  END IF;
  SELECT * INTO v_onb FROM public.org_onboarding WHERE org_id = p_org_id;
  SELECT * INTO v_conn FROM public.ghl_connections WHERE org_id = p_org_id;
  SELECT * INTO v_run FROM public.baseline_runs WHERE org_id = p_org_id
    ORDER BY created_at DESC, id DESC LIMIT 1;
  SELECT * INTO v_cfg FROM public.score_configs WHERE org_id = p_org_id;
  SELECT * INTO v_self FROM public.self_reported_baselines WHERE org_id = p_org_id;

  v_crm_ok := v_conn.status = 'active'
    AND v_conn.location_id IS NOT NULL
    AND v_conn.last_verified_at IS NOT NULL
    AND v_conn.last_verified_at >= now() - interval '1 hour';

  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'id', 'crm_verified',
    'ok', v_crm_ok,
    'label', 'CRM connected and verified in the last hour',
    'fix_step', 'crm',
    'detail', CASE
      WHEN v_conn.status IS DISTINCT FROM 'active' THEN 'Connect LeadConnector and pick a location.'
      WHEN v_conn.last_verified_at IS NULL OR v_conn.last_verified_at < now() - interval '1 hour'
        THEN 'Reconnect or re-verify the CRM token. Verification must be less than an hour old.'
      ELSE NULL
    END
  ));

  v_fallback_ok := v_onb.baseline_fallback IS NOT NULL
    OR v_self.org_id IS NOT NULL;
  IF v_run.status = 'completed' AND COALESCE(v_run.grade, 'unusable') IN ('usable', 'partial') THEN
    v_backfill_ok := true;
  ELSIF v_run.status IN ('completed', 'skipped') AND COALESCE(v_run.grade, 'unusable') = 'unusable' THEN
    v_backfill_ok := v_fallback_ok;
  ELSIF v_run.status = 'skipped' THEN
    v_backfill_ok := v_fallback_ok;
  ELSE
    v_backfill_ok := false;
  END IF;

  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'id', 'backfill_resolved',
    'ok', v_backfill_ok,
    'label', 'Baseline backfill completed, or graded unusable with a fallback chosen or declined',
    'fix_step', 'backfill',
    'detail', CASE
      WHEN v_run.id IS NULL OR v_run.status IN ('queued', 'running') THEN 'Wait for the CRM history pull to finish, or skip it and choose a fallback.'
      WHEN v_run.status = 'failed' THEN 'The history pull failed. Re-run it, or skip it and choose a fallback.'
      WHEN NOT v_backfill_ok THEN 'The history pull is unusable. Enter a self-reported baseline or decline the fallback.'
      ELSE NULL
    END
  ));

  v_map_ok := v_onb.field_maps_saved_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.readiness_scores rs
      JOIN public.leads l ON l.id = rs.lead_id AND l.org_id = rs.org_id
      WHERE rs.org_id = p_org_id
        AND NOT l.is_test
    );

  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'id', 'field_mapping',
    'ok', v_map_ok,
    'label', 'Field mapping saved and producing a valid score on at least one real lead',
    'fix_step', 'field_mapping',
    'detail', CASE
      WHEN v_onb.field_maps_saved_at IS NULL THEN 'Save the CRM field mapping, even if there are no custom fields to map.'
      ELSE 'Ingest at least one real lead and confirm it receives a readiness score.'
    END
  ));

  v_score_ok := v_cfg.org_id IS NOT NULL
    AND v_cfg.timeline_weight + v_cfg.investment_capacity_weight
        + v_cfg.decision_authority_weight + v_cfg.pain_severity_weight = 100
    AND v_cfg.ready_threshold BETWEEN 0 AND 100
    AND v_cfg.speed_to_lead_minutes > 0
    AND v_cfg.ghost_days_soft > 0
    AND v_cfg.ghost_days_hard > v_cfg.ghost_days_soft;

  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'id', 'scoring_config',
    'ok', v_score_ok,
    'label', 'Scoring configuration saved and valid',
    'fix_step', 'scoring',
    'detail', CASE WHEN v_score_ok THEN NULL ELSE 'Save scoring weights that sum to 100, with a ready threshold and ghost windows.' END
  ));

  SELECT count(*) INTO v_member_count
  FROM public.org_members
  WHERE org_id = p_org_id AND active = true;

  v_member_ok := v_member_count >= 1;
  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'id', 'worker_member',
    'ok', v_member_ok,
    'label', 'At least one active member who can work leads',
    'fix_step', 'team',
    'detail', CASE WHEN v_member_ok THEN NULL ELSE 'Invite or activate a teammate who can work the queue.' END
  ));

  SELECT CASE
    WHEN jsonb_typeof(examples) = 'array' THEN jsonb_array_length(examples)
    ELSE 0
  END INTO v_voice_n
  FROM public.org_voice_profiles
  WHERE org_id = p_org_id;
  v_voice_n := COALESCE(v_voice_n, 0);

  v_transcript_connected := EXISTS (
    SELECT 1 FROM public.transcript_connections WHERE org_id = p_org_id
  );

  v_warn := v_warn || jsonb_build_array(jsonb_build_object(
    'id', 'no_voice_examples',
    'applies', v_voice_n < 2,
    'label', 'No voice examples provided',
    'consequence', 'Follow-up drafts will read generic until two to five real messages are pasted.'
  ));
  v_warn := v_warn || jsonb_build_array(jsonb_build_object(
    'id', 'no_transcript_source',
    'applies', NOT v_transcript_connected AND v_onb.transcript_choice IS DISTINCT FROM 'connected',
    'label', 'No transcript recorder connected',
    'consequence', 'No extraction, pre-call briefs, or grounded follow-up until a recorder is connected or a transcript is pasted.'
  ));
  v_warn := v_warn || jsonb_build_array(jsonb_build_object(
    'id', 'thin_team',
    'applies', v_member_count < 2,
    'label', 'Fewer than two team members',
    'consequence', 'There is no coverage when the only operator is unavailable.'
  ));
  v_warn := v_warn || jsonb_build_array(jsonb_build_object(
    'id', 'wide_speed_to_lead',
    'applies', COALESCE(v_cfg.speed_to_lead_minutes, 15) > 60,
    'label', 'Speed-to-lead window is unusually wide',
    'consequence', 'The alarm will rarely fire. Leads can sit untouched for more than an hour before anyone is warned.'
  ));
  v_warn := v_warn || jsonb_build_array(jsonb_build_object(
    'id', 'partial_backfill',
    'applies', v_run.grade = 'partial',
    'label', 'Backfill graded partial',
    'consequence', 'The baseline comparison will carry a caveat. Treat the before-figure as directional, not exact.'
  ));

  SELECT bool_and((item->>'ok')::boolean) INTO v_ok
  FROM jsonb_array_elements(v_hard) item;

  RETURN jsonb_build_object(
    'org_id', p_org_id,
    'activated_at', o.activated_at,
    'can_activate', COALESCE(v_ok, false),
    'hard', v_hard,
    'warnings', v_warn,
    'member_count', v_member_count,
    'voice_example_count', v_voice_n,
    'transcript_choice', v_onb.transcript_choice,
    'baseline_fallback', v_onb.baseline_fallback,
    'last_visited_step', v_onb.last_visited_step
  );
END;
$$;

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
            'Check ghl_connections.status, last webhook_events.received_at for this org, then LeadConnector location webhooks.',
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
