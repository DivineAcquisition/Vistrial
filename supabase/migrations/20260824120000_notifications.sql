-- Prompt 13: notifications and escalation.
-- Product choices (stated, not guessed):
--   * Working hours did not exist. Org default is 08:00–18:00 Monday–Friday.
--     Evaluated in the member timezone when set, otherwise the org timezone.
--     Members may override hours, days, and timezone. Follow-up quiet hours
--     stay a send-deferral for prospect messages and are not reused here.
--   * Hourly cap is 8 interrupt notifications per user per hour. Overflow is
--     one summary. The prompt required a cap and did not name the number.
--   * Mute is required to have an end. Maximum 7 days.
--   * Unmatched-transcript digest goes to admin. Push escalation if 5+ open
--     or the oldest is 24 hours old.
--   * In-app is the inbox over these rows, not a second simultaneous send.
--     One interrupt channel per event (push, email, sms, or team).
--   * DA console rows (channel da_console) are staff-only. Clients never see
--     job-failure noise.
--   * SMS default off at the org. Twilio when configured; otherwise delivery
--     fails visibly rather than logging a fake send.
--   * Lead copy is first_name only, or "a lead". No email, phone, transcript,
--     or extracted fields in any body.
--   * SMS for emergencies is not simultaneous with the first push. If the org
--     has turned SMS on, SMS fires one hour later if the condition still holds.
--   * call_starting_soon is not sent outside working hours (the prompt forbids
--     waking anyone except the two emergencies). If the call would start before
--     the next working period, the reminder is skipped rather than deferred.

CREATE TYPE public.notification_event_type AS ENUM (
  'speed_to_lead',
  'unassigned_ready',
  'approaching_ghost',
  'pending_draft',
  'call_starting_soon',
  'unmatched_transcript',
  'ingestion_stalled',
  'crm_broken',
  'job_failure',
  'adoption_warning',
  'daily_brief',
  'hourly_summary',
  'test_send'
);

CREATE TYPE public.notification_channel AS ENUM (
  'push',
  'email',
  'sms',
  'team',
  'da_console'
);

CREATE TYPE public.notification_status AS ENUM (
  'queued',
  'sent',
  'delivered',
  'opened',
  'acted',
  'cancelled',
  'failed',
  'dead',
  'skipped'
);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS working_hours_start time NOT NULL DEFAULT time '08:00',
  ADD COLUMN IF NOT EXISTS working_hours_end time NOT NULL DEFAULT time '18:00',
  ADD COLUMN IF NOT EXISTS working_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  ADD COLUMN IF NOT EXISTS sms_emergencies_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS working_hours_start time,
  ADD COLUMN IF NOT EXISTS working_hours_end time,
  ADD COLUMN IF NOT EXISTS working_days smallint[];

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_working_days_valid
  CHECK (working_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[] AND cardinality(working_days) BETWEEN 1 AND 7);

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_working_days_valid
  CHECK (working_days IS NULL OR (working_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[] AND cardinality(working_days) BETWEEN 1 AND 7));

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  event_type public.notification_event_type NOT NULL,
  channel public.notification_channel NOT NULL,
  recipient_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  recipient_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  actor_user_id uuid,
  subject_kind text,
  subject_ids uuid[] NOT NULL DEFAULT '{}',
  title text NOT NULL,
  body text NOT NULL,
  href text NOT NULL,
  dedupe_key text NOT NULL,
  batch_key text,
  escalation_step smallint NOT NULL DEFAULT 1,
  is_emergency boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  status public.notification_status NOT NULL DEFAULT 'queued',
  queued_at timestamptz NOT NULL DEFAULT now(),
  send_after timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  acted_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  provider_id text,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_org_required CHECK (org_id IS NOT NULL OR channel = 'da_console')
);

-- Only one queued row per dedupe key. A sent row must not block a later cycle
-- of the same event (ingestion stalls, then recovers, then stalls again).
CREATE UNIQUE INDEX notifications_queued_dedupe
  ON public.notifications (dedupe_key)
  WHERE status = 'queued';

CREATE INDEX notifications_dedupe_idx
  ON public.notifications (dedupe_key);

CREATE INDEX notifications_deliver_idx
  ON public.notifications (status, send_after)
  WHERE status = 'queued';

CREATE INDEX notifications_recipient_idx
  ON public.notifications (recipient_user_id, queued_at DESC);

CREATE INDEX notifications_org_event_idx
  ON public.notifications (org_id, event_type, queued_at DESC);

CREATE INDEX notifications_org_status_idx
  ON public.notifications (org_id, status, queued_at DESC);

CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE CASCADE,
  event_type public.notification_event_type NOT NULL,
  channel public.notification_channel NOT NULL,
  enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_unique UNIQUE (member_id, event_type, channel)
);

CREATE TABLE public.notification_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE CASCADE,
  muted_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_mutes_member UNIQUE (member_id),
  CONSTRAINT notification_mutes_has_end CHECK (muted_until > created_at)
);

CREATE TABLE public.notification_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  event_type public.notification_event_type NOT NULL,
  subject_id uuid NOT NULL,
  step smallint NOT NULL,
  fired_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_escalations_unique UNIQUE (org_id, event_type, subject_id, step)
);

CREATE TABLE public.notification_presence (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  path text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

CREATE TABLE public.notification_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_push_endpoint UNIQUE (endpoint)
);

CREATE INDEX notification_push_user_idx
  ON public.notification_push_subscriptions (user_id);

CREATE TABLE public.notification_team_channels (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  slack_webhook_encrypted text,
  teams_webhook_encrypted text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_digest_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  sent_on date NOT NULL,
  CONSTRAINT notification_digest_unique UNIQUE (org_id, user_id, kind, sent_on)
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_team_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_digest_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    (
      channel <> 'da_console'
      AND org_id IN (SELECT public.user_org_ids())
      AND (
        recipient_user_id = auth.uid()
        OR public.user_has_org_role(org_id, 'owner', 'admin')
      )
    )
    OR (channel = 'da_console' AND public.is_platform_admin())
  );

CREATE POLICY notifications_update_own
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

CREATE POLICY notification_preferences_select
  ON public.notification_preferences
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY notification_preferences_write_own
  ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING (
    member_id IN (SELECT id FROM public.org_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.org_members
      WHERE user_id = auth.uid() AND org_id = notification_preferences.org_id
    )
  );

CREATE POLICY notification_mutes_select
  ON public.notification_mutes
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY notification_mutes_write_own
  ON public.notification_mutes
  FOR ALL
  TO authenticated
  USING (
    member_id IN (SELECT id FROM public.org_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.org_members
      WHERE user_id = auth.uid() AND org_id = notification_mutes.org_id
    )
  );

CREATE POLICY notification_presence_own
  ON public.notification_presence
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND org_id IN (SELECT public.user_org_ids()));

CREATE POLICY notification_push_own
  ON public.notification_push_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY notification_team_channels_select
  ON public.notification_team_channels
  FOR SELECT
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY notification_team_channels_write
  ON public.notification_team_channels
  FOR ALL
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY notification_escalations_select
  ON public.notification_escalations
  FOR SELECT
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin') OR public.is_platform_admin());

CREATE POLICY notification_digest_log_select
  ON public.notification_digest_log
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_has_org_role(org_id, 'owner', 'admin')
    OR public.is_platform_admin()
  );

CREATE OR REPLACE FUNCTION public.claim_notification()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.notifications
  WHERE status = 'queued'
    AND send_after <= now()
    AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes')
  ORDER BY send_after
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.notifications
  SET
    claimed_at = now(),
    attempt_count = attempt_count + 1,
    updated_at = now()
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification() TO service_role;

COMMENT ON TABLE public.notifications IS
  'Queued and delivered notifications. One row per recipient per channel per event. Inbox reads this table.';
COMMENT ON COLUMN public.notifications.body IS
  'Lock-screen safe. First name or a count. Never contact details, message content, transcripts, or extractions.';
COMMENT ON TABLE public.notification_mutes IS
  'Temporary mute. muted_until is required. There is no permanent silent mute.';

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_mutes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_presence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_team_channels TO authenticated;
GRANT SELECT ON public.notification_escalations TO authenticated;
GRANT SELECT ON public.notification_digest_log TO authenticated;

GRANT ALL ON public.notifications TO service_role;
GRANT ALL ON public.notification_preferences TO service_role;
GRANT ALL ON public.notification_mutes TO service_role;
GRANT ALL ON public.notification_escalations TO service_role;
GRANT ALL ON public.notification_presence TO service_role;
GRANT ALL ON public.notification_push_subscriptions TO service_role;
GRANT ALL ON public.notification_team_channels TO service_role;
GRANT ALL ON public.notification_digest_log TO service_role;

GRANT USAGE ON TYPE public.notification_event_type TO authenticated, service_role;
GRANT USAGE ON TYPE public.notification_channel TO authenticated, service_role;
GRANT USAGE ON TYPE public.notification_status TO authenticated, service_role;
