-- Prompt 10: follow-up drafting, review, dispatch, bounded sequences.
-- Product choices (stated, not guessed):
--   * "Closed" is not a call_outcome. Default rules match held + next-step
--     language (paid/onboard/welcome/closed/signed/enroll) or lead status
--     closed_won. Cancelled calls produce no draft unless a rule matches.
--   * Leads have no timezone today. Column added (nullable). Quiet hours use
--     lead.timezone when set, otherwise the org timezone. Default window is
--     21:00–08:00 local, on by default.
--   * Drafts go stale after 5 days and cannot be sent without regeneration.
--   * Sequence default cap: 3 messages, 21 days. No NULL max, no unbounded path.
--   * Org-wide sequence stop is provisioned with settings, before any run.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.follow_up_branch AS ENUM (
  'closed',
  'follow_up_scheduled',
  'objection_hold',
  'no_show',
  'not_interested',
  'ghost_risk'
);

CREATE TYPE public.follow_up_draft_status AS ENUM (
  'pending',
  'approved',
  'sent',
  'rejected',
  'discarded',
  'expired',
  'failed'
);

CREATE TYPE public.follow_up_quality_failure AS ENUM (
  'banned_phrase',
  'unverified_quote',
  'ungrounded_topic',
  'no_lead_specific',
  'length',
  'greeting',
  'signoff'
);

CREATE TYPE public.follow_up_event_kind AS ENUM (
  'generated',
  'edited',
  'approved',
  'rejected',
  'sent',
  'failed',
  'regenerated',
  'discarded',
  'quality_failed'
);

CREATE TYPE public.follow_up_sequence_status AS ENUM (
  'active',
  'halted',
  'completed'
);

CREATE TYPE public.follow_up_halt_reason AS ENUM (
  'inbound_reply',
  'appointment_booked',
  'payment',
  'status_closed',
  'status_not_interested',
  'operator',
  'org_stop',
  'max_length',
  'max_duration',
  'new_call',
  'suppressed'
);

CREATE TYPE public.voice_formality AS ENUM ('casual', 'professional');
CREATE TYPE public.voice_emoji AS ENUM ('never', 'sparing', 'natural');
CREATE TYPE public.voice_suggestion_kind AS ENUM ('shorter', 'less_formal', 'drop_phrase');
CREATE TYPE public.voice_suggestion_status AS ENUM ('pending', 'accepted', 'dismissed');
CREATE TYPE public.follow_up_job_status AS ENUM ('pending', 'processed', 'dead');

-- ---------------------------------------------------------------------------
-- Lead timezone (quiet hours). Org timezone is the fallback.
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads
  ADD COLUMN timezone text;

COMMENT ON COLUMN public.leads.timezone IS
  'IANA timezone when known. Quiet hours use this; otherwise organizations.timezone.';

-- Sent follow-up body is stored on the outbound touch only. Inbound bodies
-- are never stored here.
ALTER TABLE public.touches
  ADD COLUMN outbound_body text;

ALTER TABLE public.touches
  ADD CONSTRAINT touches_outbound_body_direction CHECK (
    outbound_body IS NULL OR direction = 'outbound'
  );

COMMENT ON COLUMN public.touches.outbound_body IS
  'Body of a Vistrial-dispatched outbound message. Null for inbound and for CRM-originated outbound.';

-- ---------------------------------------------------------------------------
-- Settings (includes org-wide sequence stop)
-- ---------------------------------------------------------------------------

CREATE TABLE public.follow_up_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  sequences_halted boolean NOT NULL DEFAULT false,
  sequences_halted_at timestamptz,
  sequences_halted_by uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  max_sequence_length integer NOT NULL DEFAULT 3,
  max_sequence_duration_days integer NOT NULL DEFAULT 21,
  draft_stale_days integer NOT NULL DEFAULT 5,
  quiet_hours_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_start time NOT NULL DEFAULT time '21:00',
  quiet_hours_end time NOT NULL DEFAULT time '08:00',
  default_channel public.touch_channel NOT NULL DEFAULT 'sms',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follow_up_settings_max_length CHECK (
    max_sequence_length BETWEEN 1 AND 8
  ),
  CONSTRAINT follow_up_settings_max_duration CHECK (
    max_sequence_duration_days BETWEEN 1 AND 90
  ),
  CONSTRAINT follow_up_settings_stale_days CHECK (
    draft_stale_days BETWEEN 1 AND 14
  ),
  CONSTRAINT follow_up_settings_default_channel CHECK (
    default_channel IN ('sms', 'email')
  )
);

COMMENT ON TABLE public.follow_up_settings IS
  'Per-org follow-up policy. sequences_halted is the org-wide stop; it exists before any sequence can run.';

CREATE TABLE public.org_voice_profiles (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  formality public.voice_formality NOT NULL DEFAULT 'casual',
  use_contractions boolean NOT NULL DEFAULT true,
  use_greeting boolean NOT NULL DEFAULT false,
  use_signoff boolean NOT NULL DEFAULT false,
  greeting_text text,
  signoff_text text,
  sms_max_chars integer NOT NULL DEFAULT 240,
  email_max_chars integer NOT NULL DEFAULT 900,
  emoji_usage public.voice_emoji NOT NULL DEFAULT 'never',
  banned_words text[] NOT NULL DEFAULT '{}'::text[],
  examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_voice_sms_max CHECK (sms_max_chars BETWEEN 40 AND 480),
  CONSTRAINT org_voice_email_max CHECK (email_max_chars BETWEEN 120 AND 4000),
  CONSTRAINT org_voice_examples_is_array CHECK (jsonb_typeof(examples) = 'array'),
  CONSTRAINT org_voice_examples_cap CHECK (jsonb_array_length(examples) <= 5)
);

COMMENT ON TABLE public.org_voice_profiles IS
  'How this org writes. Examples (2–5 real sent messages) outweigh adjective settings.';

CREATE TABLE public.follow_up_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  priority integer NOT NULL,
  branch public.follow_up_branch NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  match jsonb NOT NULL,
  channel public.touch_channel NOT NULL DEFAULT 'sms',
  sequence_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follow_up_routing_org_priority UNIQUE (org_id, priority),
  CONSTRAINT follow_up_routing_match_object CHECK (jsonb_typeof(match) = 'object'),
  CONSTRAINT follow_up_routing_steps_array CHECK (jsonb_typeof(sequence_steps) = 'array'),
  CONSTRAINT follow_up_routing_channel CHECK (channel IN ('sms', 'email')),
  CONSTRAINT follow_up_routing_steps_cap CHECK (jsonb_array_length(sequence_steps) <= 8)
);

COMMENT ON TABLE public.follow_up_routing_rules IS
  'Ordered, per-org rules. App code evaluates match JSON; it does not hardcode branches.';

-- ---------------------------------------------------------------------------
-- Sequences, jobs, drafts, measurement
-- ---------------------------------------------------------------------------

CREATE TABLE public.follow_up_sequence_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  call_id uuid NOT NULL,
  branch public.follow_up_branch NOT NULL,
  status public.follow_up_sequence_status NOT NULL DEFAULT 'active',
  halt_reason public.follow_up_halt_reason,
  max_steps integer NOT NULL,
  max_until timestamptz NOT NULL,
  next_position integer NOT NULL DEFAULT 2,
  started_at timestamptz NOT NULL DEFAULT now(),
  halted_at timestamptz,
  completed_at timestamptz,
  last_sent_at timestamptz,
  last_sent_draft_id uuid,
  halted_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follow_up_sequence_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE,
  CONSTRAINT follow_up_sequence_call_org_fkey FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE CASCADE,
  CONSTRAINT follow_up_sequence_max_steps CHECK (max_steps BETWEEN 1 AND 8),
  CONSTRAINT follow_up_sequence_next_position CHECK (next_position >= 1),
  CONSTRAINT follow_up_sequence_halt_fields CHECK (
    (status = 'halted' AND halt_reason IS NOT NULL AND halted_at IS NOT NULL)
    OR (status <> 'halted' AND halt_reason IS NULL)
  )
);

CREATE UNIQUE INDEX follow_up_sequence_runs_lead_active
  ON public.follow_up_sequence_runs (lead_id)
  WHERE status = 'active';

CREATE INDEX follow_up_sequence_runs_org_status
  ON public.follow_up_sequence_runs (org_id, status);

CREATE TABLE public.follow_up_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  call_id uuid NOT NULL,
  extraction_id uuid,
  sequence_run_id uuid REFERENCES public.follow_up_sequence_runs (id) ON DELETE SET NULL,
  sequence_position integer NOT NULL DEFAULT 1,
  branch public.follow_up_branch NOT NULL,
  channel public.touch_channel NOT NULL,
  status public.follow_up_job_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  operator_instruction text,
  draft_id uuid,
  requested_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follow_up_jobs_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE,
  CONSTRAINT follow_up_jobs_call_org_fkey FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE CASCADE,
  CONSTRAINT follow_up_jobs_channel CHECK (channel IN ('sms', 'email')),
  CONSTRAINT follow_up_jobs_position CHECK (sequence_position BETWEEN 1 AND 8)
);

CREATE INDEX follow_up_jobs_claim_idx
  ON public.follow_up_jobs (next_attempt_at, id)
  WHERE status = 'pending';

CREATE TABLE public.follow_up_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  call_id uuid NOT NULL,
  extraction_id uuid,
  sequence_run_id uuid REFERENCES public.follow_up_sequence_runs (id) ON DELETE SET NULL,
  sequence_position integer NOT NULL DEFAULT 1,
  branch public.follow_up_branch NOT NULL,
  channel public.touch_channel NOT NULL,
  status public.follow_up_draft_status NOT NULL DEFAULT 'pending',
  generated_body text NOT NULL,
  generated_subject text,
  edited_body text NOT NULL,
  edited_subject text,
  sent_body text,
  sent_subject text,
  model_version text NOT NULL,
  generation_attempt integer NOT NULL DEFAULT 1,
  low_confidence boolean NOT NULL DEFAULT false,
  low_confidence_reason text,
  quality_failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  quotes_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  operator_instruction text,
  approved_at timestamptz,
  approved_by_member_id uuid REFERENCES public.org_members (id) ON DELETE RESTRICT,
  rejected_at timestamptz,
  rejected_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  rejected_reason text,
  discarded_reason text,
  failure_reason text,
  dispatch_id uuid REFERENCES public.ghl_dispatches (id) ON DELETE SET NULL,
  touch_id uuid,
  sent_at timestamptz,
  edit_distance integer,
  call_end_to_sent_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follow_up_drafts_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE,
  CONSTRAINT follow_up_drafts_call_org_fkey FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE CASCADE,
  CONSTRAINT follow_up_drafts_channel CHECK (channel IN ('sms', 'email')),
  CONSTRAINT follow_up_drafts_position CHECK (sequence_position BETWEEN 1 AND 8),
  CONSTRAINT follow_up_drafts_sent_requires_approval CHECK (
    status <> 'sent' OR (
      approved_by_member_id IS NOT NULL
      AND approved_at IS NOT NULL
      AND touch_id IS NOT NULL
      AND sent_body IS NOT NULL
    )
  ),
  CONSTRAINT follow_up_drafts_approved_requires_actor CHECK (
    status <> 'approved' OR (
      approved_by_member_id IS NOT NULL
      AND approved_at IS NOT NULL
      AND dispatch_id IS NOT NULL
    )
  ),
  CONSTRAINT follow_up_drafts_rejected_reason CHECK (
    status <> 'rejected' OR (rejected_reason IS NOT NULL AND rejected_by_member_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX follow_up_drafts_call_position_open
  ON public.follow_up_drafts (call_id, sequence_position)
  WHERE status IN ('pending', 'approved', 'failed', 'expired');

CREATE INDEX follow_up_drafts_org_status_idx
  ON public.follow_up_drafts (org_id, status, created_at);

CREATE INDEX follow_up_drafts_lead_idx
  ON public.follow_up_drafts (lead_id, status);

ALTER TABLE public.follow_up_jobs
  ADD CONSTRAINT follow_up_jobs_draft_fkey
  FOREIGN KEY (draft_id) REFERENCES public.follow_up_drafts (id) ON DELETE SET NULL;

ALTER TABLE public.follow_up_sequence_runs
  ADD CONSTRAINT follow_up_sequence_last_draft_fkey
  FOREIGN KEY (last_sent_draft_id) REFERENCES public.follow_up_drafts (id) ON DELETE SET NULL;

CREATE TABLE public.follow_up_quality_check_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  draft_id uuid REFERENCES public.follow_up_drafts (id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.follow_up_jobs (id) ON DELETE SET NULL,
  branch public.follow_up_branch NOT NULL,
  failure_type public.follow_up_quality_failure NOT NULL,
  attempt integer NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX follow_up_quality_failures_org_type_idx
  ON public.follow_up_quality_check_failures (org_id, failure_type, created_at DESC);

CREATE TABLE public.follow_up_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  draft_id uuid REFERENCES public.follow_up_drafts (id) ON DELETE SET NULL,
  sequence_run_id uuid REFERENCES public.follow_up_sequence_runs (id) ON DELETE SET NULL,
  kind public.follow_up_event_kind NOT NULL,
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX follow_up_events_org_kind_idx
  ON public.follow_up_events (org_id, kind, created_at DESC);

CREATE INDEX follow_up_events_draft_idx
  ON public.follow_up_events (draft_id, created_at);

CREATE TABLE public.follow_up_reply_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  draft_id uuid REFERENCES public.follow_up_drafts (id) ON DELETE SET NULL,
  sequence_run_id uuid REFERENCES public.follow_up_sequence_runs (id) ON DELETE SET NULL,
  branch public.follow_up_branch,
  sequence_position integer,
  inbound_touch_id uuid,
  replied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follow_up_reply_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.follow_up_reply_signals IS
  'Reply happened, for measurement. Inbound body is never stored.';

CREATE TABLE public.voice_profile_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind public.voice_suggestion_kind NOT NULL,
  phrase text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.voice_suggestion_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  CONSTRAINT voice_suggestions_org_kind_phrase UNIQUE (org_id, kind, phrase)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.follow_up_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_sequence_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_quality_check_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_reply_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_profile_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY follow_up_settings_select
  ON public.follow_up_settings FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY follow_up_settings_update
  ON public.follow_up_settings FOR UPDATE TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY org_voice_profiles_select
  ON public.org_voice_profiles FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY org_voice_profiles_update
  ON public.org_voice_profiles FOR UPDATE TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY follow_up_routing_select
  ON public.follow_up_routing_rules FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY follow_up_routing_write
  ON public.follow_up_routing_rules FOR ALL TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY follow_up_sequence_select
  ON public.follow_up_sequence_runs FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY follow_up_sequence_update
  ON public.follow_up_sequence_runs FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY follow_up_jobs_select
  ON public.follow_up_jobs FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY follow_up_drafts_select
  ON public.follow_up_drafts FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY follow_up_drafts_update
  ON public.follow_up_drafts FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY follow_up_drafts_insert
  ON public.follow_up_drafts FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY follow_up_quality_select
  ON public.follow_up_quality_check_failures FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY follow_up_events_select
  ON public.follow_up_events FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY follow_up_events_insert
  ON public.follow_up_events FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY follow_up_reply_select
  ON public.follow_up_reply_signals FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY voice_suggestions_select
  ON public.voice_profile_suggestions FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY voice_suggestions_write
  ON public.voice_profile_suggestions FOR ALL TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_up_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_voice_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_up_routing_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_up_sequence_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.follow_up_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.follow_up_drafts TO authenticated;
GRANT SELECT, INSERT ON public.follow_up_quality_check_failures TO authenticated;
GRANT SELECT, INSERT ON public.follow_up_events TO authenticated;
GRANT SELECT, INSERT ON public.follow_up_reply_signals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_profile_suggestions TO authenticated;

GRANT ALL ON public.follow_up_settings TO service_role;
GRANT ALL ON public.org_voice_profiles TO service_role;
GRANT ALL ON public.follow_up_routing_rules TO service_role;
GRANT ALL ON public.follow_up_sequence_runs TO service_role;
GRANT ALL ON public.follow_up_jobs TO service_role;
GRANT ALL ON public.follow_up_drafts TO service_role;
GRANT ALL ON public.follow_up_quality_check_failures TO service_role;
GRANT ALL ON public.follow_up_events TO service_role;
GRANT ALL ON public.follow_up_reply_signals TO service_role;
GRANT ALL ON public.voice_profile_suggestions TO service_role;

CREATE TRIGGER follow_up_settings_set_updated_at
  BEFORE UPDATE ON public.follow_up_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER org_voice_profiles_set_updated_at
  BEFORE UPDATE ON public.org_voice_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER follow_up_routing_set_updated_at
  BEFORE UPDATE ON public.follow_up_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER follow_up_drafts_set_updated_at
  BEFORE UPDATE ON public.follow_up_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Provision defaults. Org-wide stop row exists before any sequence run.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_default_follow_up_rules(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.follow_up_routing_rules (
    org_id, priority, branch, enabled, match, channel, sequence_steps
  )
  VALUES
    (
      p_org_id, 10, 'no_show', true,
      '{"all":[{"field":"call_outcome","op":"eq","value":"no_show"}]}'::jsonb,
      'sms',
      '[{"delayHours":0,"channel":"sms"},{"delayHours":24,"channel":"sms"},{"delayHours":72,"channel":"sms"}]'::jsonb
    ),
    (
      p_org_id, 20, 'closed', true,
      '{"all":[{"field":"call_outcome","op":"eq","value":"held"},{"field":"next_step_text","op":"matches","value":"paid|onboard|welcome|closed|signed|enroll"}]}'::jsonb,
      'email',
      '[{"delayHours":0,"channel":"email"}]'::jsonb
    ),
    (
      p_org_id, 25, 'closed', true,
      '{"all":[{"field":"lead_status","op":"eq","value":"closed_won"}]}'::jsonb,
      'email',
      '[{"delayHours":0,"channel":"email"}]'::jsonb
    ),
    (
      p_org_id, 30, 'not_interested', true,
      '{"all":[{"field":"next_step_text","op":"matches","value":"not interested|no thanks|don''t want|do not want|stop contacting|not a fit"}]}'::jsonb,
      'sms',
      '[{"delayHours":0,"channel":"sms"}]'::jsonb
    ),
    (
      p_org_id, 40, 'objection_hold', true,
      '{"all":[{"field":"stated_objection_state","op":"eq","value":"present"}]}'::jsonb,
      'sms',
      '[{"delayHours":0,"channel":"sms"},{"delayHours":48,"channel":"sms"},{"delayHours":120,"channel":"sms"}]'::jsonb
    ),
    (
      p_org_id, 50, 'follow_up_scheduled', true,
      '{"all":[{"field":"next_step_state","op":"eq","value":"present"},{"field":"call_outcome","op":"in","value":["held","rescheduled"]}]}'::jsonb,
      'sms',
      '[{"delayHours":0,"channel":"sms"}]'::jsonb
    ),
    (
      p_org_id, 60, 'ghost_risk', true,
      '{"all":[{"field":"call_outcome","op":"in","value":["held","rescheduled"]},{"field":"next_step_state","op":"neq","value":"present"}]}'::jsonb,
      'sms',
      '[{"delayHours":0,"channel":"sms"},{"delayHours":48,"channel":"sms"},{"delayHours":120,"channel":"sms"}]'::jsonb
    )
  ON CONFLICT (org_id, priority) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_org_follow_up()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.follow_up_settings (org_id) VALUES (NEW.id)
  ON CONFLICT (org_id) DO NOTHING;
  INSERT INTO public.org_voice_profiles (org_id) VALUES (NEW.id)
  ON CONFLICT (org_id) DO NOTHING;
  PERFORM public.seed_default_follow_up_rules(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_provision_follow_up
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.provision_org_follow_up();

INSERT INTO public.follow_up_settings (org_id)
SELECT id FROM public.organizations
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_voice_profiles (org_id)
SELECT id FROM public.organizations
ON CONFLICT (org_id) DO NOTHING;

SELECT public.seed_default_follow_up_rules(id) FROM public.organizations;

REVOKE ALL ON FUNCTION public.seed_default_follow_up_rules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_follow_up_rules(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Halt sequences. Called from triggers so no ingest path can miss it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.halt_follow_up_sequences_for_lead(
  p_org_id uuid,
  p_lead_id uuid,
  p_reason public.follow_up_halt_reason,
  p_actor uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL
    AND p_org_id NOT IN (SELECT public.user_org_ids())
    AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  UPDATE public.follow_up_sequence_runs
  SET
    status = 'halted',
    halt_reason = p_reason,
    halted_at = now(),
    halted_by_member_id = p_actor
  WHERE org_id = p_org_id
    AND lead_id = p_lead_id
    AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.follow_up_jobs
  SET status = 'dead', last_error = 'sequence_halted:' || p_reason::text
  WHERE org_id = p_org_id
    AND lead_id = p_lead_id
    AND status = 'pending';

  IF p_reason IN ('inbound_reply', 'suppressed', 'org_stop') THEN
    UPDATE public.follow_up_drafts
    SET
      status = 'discarded',
      discarded_reason = p_reason::text
    WHERE org_id = p_org_id
      AND lead_id = p_lead_id
      AND status IN ('pending', 'approved', 'expired');
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.halt_org_follow_up_sequences(
  p_org_id uuid,
  p_actor uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL
    AND NOT (
      public.user_has_org_role(p_org_id, 'owner', 'admin')
      OR public.is_platform_admin()
    ) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  UPDATE public.follow_up_settings
  SET
    sequences_halted = true,
    sequences_halted_at = now(),
    sequences_halted_by = p_actor
  WHERE org_id = p_org_id;

  UPDATE public.follow_up_sequence_runs
  SET
    status = 'halted',
    halt_reason = 'org_stop',
    halted_at = now(),
    halted_by_member_id = p_actor
  WHERE org_id = p_org_id
    AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.follow_up_jobs j
  SET status = 'dead', last_error = 'sequence_halted:org_stop'
  WHERE j.org_id = p_org_id
    AND j.status = 'pending'
    AND j.sequence_position > 1;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.halt_follow_up_sequences_for_lead(uuid, uuid, public.follow_up_halt_reason, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.halt_org_follow_up_sequences(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.halt_follow_up_sequences_for_lead(uuid, uuid, public.follow_up_halt_reason, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.halt_org_follow_up_sequences(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.follow_up_on_lead_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'call_booked' THEN
      PERFORM public.halt_follow_up_sequences_for_lead(NEW.org_id, NEW.id, 'appointment_booked');
    ELSIF NEW.status = 'closed_won' THEN
      PERFORM public.halt_follow_up_sequences_for_lead(NEW.org_id, NEW.id, 'status_closed');
    ELSIF NEW.status = 'closed_lost' THEN
      PERFORM public.halt_follow_up_sequences_for_lead(NEW.org_id, NEW.id, 'status_not_interested');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_halt_follow_up_sequences
  AFTER UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.follow_up_on_lead_status();

CREATE OR REPLACE FUNCTION public.follow_up_on_inbound_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft public.follow_up_drafts%ROWTYPE;
BEGIN
  IF NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;

  PERFORM public.halt_follow_up_sequences_for_lead(NEW.org_id, NEW.lead_id, 'inbound_reply');

  SELECT * INTO v_draft
  FROM public.follow_up_drafts
  WHERE org_id = NEW.org_id
    AND lead_id = NEW.lead_id
    AND status = 'sent'
  ORDER BY sent_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.follow_up_reply_signals (
      org_id, lead_id, draft_id, sequence_run_id, branch, sequence_position, inbound_touch_id, replied_at
    ) VALUES (
      NEW.org_id, NEW.lead_id, v_draft.id, v_draft.sequence_run_id, v_draft.branch,
      v_draft.sequence_position, NEW.id, NEW.occurred_at
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER touches_halt_follow_up_on_inbound
  AFTER INSERT ON public.touches
  FOR EACH ROW EXECUTE FUNCTION public.follow_up_on_inbound_touch();

CREATE OR REPLACE FUNCTION public.follow_up_on_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.halt_follow_up_sequences_for_lead(NEW.org_id, NEW.lead_id, 'payment');
  RETURN NEW;
END;
$$;

CREATE TRIGGER revenue_log_halt_follow_up
  AFTER INSERT ON public.revenue_log
  FOR EACH ROW EXECUTE FUNCTION public.follow_up_on_revenue();

-- ---------------------------------------------------------------------------
-- Claim helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_follow_up_job()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.follow_up_jobs j
  SET next_attempt_at = now() + interval '10 minutes'
  WHERE j.id = (
    SELECT e.id
    FROM public.follow_up_jobs e
    JOIN public.follow_up_settings s ON s.org_id = e.org_id
    WHERE e.status = 'pending'
      AND e.next_attempt_at <= now()
      AND (
        e.sequence_position = 1
        OR s.sequences_halted = false
      )
    ORDER BY e.next_attempt_at ASC, e.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING j.id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_follow_up_job() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_follow_up_job() TO service_role;

CREATE OR REPLACE FUNCTION public.expire_stale_follow_up_drafts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.follow_up_drafts
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_follow_up_drafts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_stale_follow_up_drafts() TO service_role;

-- ---------------------------------------------------------------------------
-- Queue + case file payloads include pending drafts (no bodies).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pending_follow_up_items(
  p_org_id uuid,
  p_lead_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(item ORDER BY created_at ASC, id ASC), '[]'::jsonb)
  FROM (
    SELECT
      jsonb_build_object(
        'id', d.id,
        'leadId', d.lead_id,
        'leadName', COALESCE(
          NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
          NULLIF(btrim(l.email), ''),
          'Unnamed lead'
        ),
        'callId', d.call_id,
        'branch', d.branch,
        'channel', d.channel,
        'status', d.status,
        'lowConfidence', d.low_confidence,
        'lowConfidenceReason', d.low_confidence_reason,
        'expiresAt', d.expires_at,
        'createdAt', d.created_at,
        'sequencePosition', d.sequence_position,
        'sequenceRunId', d.sequence_run_id,
        'stale', d.expires_at <= now(),
        'failureReason', d.failure_reason
      ) AS item,
      d.created_at,
      d.id
    FROM public.follow_up_drafts d
    JOIN public.leads l ON l.id = d.lead_id AND l.org_id = d.org_id
    WHERE d.org_id = p_org_id
      AND (p_lead_id IS NULL OR d.lead_id = p_lead_id)
      AND d.status IN ('pending', 'approved', 'failed', 'expired')
  ) t;
$$;

REVOKE ALL ON FUNCTION public.pending_follow_up_items(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_follow_up_items(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.load_org_queue(
  p_org_id uuid,
  p_assigned text DEFAULT NULL,
  p_track text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_score_min integer DEFAULT NULL,
  p_score_max integer DEFAULT NULL,
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
  v_assigned text;
  v_member uuid;
  v_limit integer;
  v_crm_status text;
  v_location text;
  v_lead_count bigint;
  v_alarm jsonb;
  v_queue jsonb;
  v_members jsonb;
  v_sources jsonb;
  v_unfiltered bigint;
  v_has_more boolean;
  v_cursor_u integer;
  v_cursor_s integer;
  v_cursor_t timestamptz;
  v_cursor_id uuid;
  v_rows jsonb;
  v_pending jsonb;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  v_member := public.user_member_id(p_org_id);
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

  v_assigned := NULLIF(p_assigned, '');
  IF v_assigned IS NULL THEN
    IF public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
      v_assigned := 'all';
    ELSE
      v_assigned := 'me_or_unassigned';
    END IF;
  END IF;

  IF p_cursor IS NOT NULL AND jsonb_typeof(p_cursor) = 'object' THEN
    v_cursor_u := NULLIF(p_cursor->>'u', '')::integer;
    v_cursor_s := NULLIF(p_cursor->>'s', '')::integer;
    v_cursor_t := NULLIF(p_cursor->>'t', '')::timestamptz;
    v_cursor_id := NULLIF(p_cursor->>'id', '')::uuid;
  END IF;

  SELECT c.status::text
  INTO v_crm_status
  FROM public.ghl_connections c
  WHERE c.org_id = p_org_id;

  SELECT o.ghl_location_id
  INTO v_location
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_crm_status IS NULL THEN
    v_crm_status := CASE WHEN v_location IS NOT NULL THEN 'active' ELSE 'missing' END;
  END IF;

  SELECT count(*) INTO v_lead_count
  FROM public.leads l
  WHERE l.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'displayName', m.display_name,
      'role', m.role
    ) ORDER BY m.display_name
  ), '[]'::jsonb)
  INTO v_members
  FROM public.org_members m
  WHERE m.org_id = p_org_id
    AND m.active = true;

  SELECT COALESCE(jsonb_agg(src ORDER BY src), '[]'::jsonb)
  INTO v_sources
  FROM (
    SELECT DISTINCT l.source AS src
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.source IS NOT NULL
      AND btrim(l.source) <> ''
  ) s;

  SELECT COALESCE(
    jsonb_agg(public.queue_row_to_json(q) ORDER BY q.opted_in_at ASC, q.id ASC),
    '[]'::jsonb
  )
  INTO v_alarm
  FROM public.queue_rows q
  WHERE q.org_id = p_org_id
    AND q.id IN (SELECT a.id FROM public.alarm_band_leads(p_org_id) a);

  SELECT count(*)
  INTO v_unfiltered
  FROM public.queue_rows q
  WHERE q.org_id = p_org_id
    AND q.status NOT IN ('closed_won', 'closed_lost', 'ghost')
    AND q.urgency_rank IS NOT NULL
    AND NOT q.in_alarm;

  SELECT COALESCE(
    jsonb_agg(
      public.queue_row_to_json(q)
      ORDER BY q.urgency_rank ASC, q.sort_score DESC, q.last_touch_at ASC NULLS FIRST, q.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT *
    FROM public.queue_rows q
    WHERE q.org_id = p_org_id
      AND NOT q.in_alarm
      AND q.status NOT IN ('closed_won', 'closed_lost', 'ghost')
      AND q.urgency_rank IS NOT NULL
      AND (
        v_assigned = 'all'
        OR (
          v_assigned = 'me'
          AND v_member IS NOT NULL
          AND (
            q.assigned_setter_id = v_member
            OR q.assigned_closer_id = v_member
          )
        )
        OR (
          v_assigned = 'unassigned'
          AND q.assigned_setter_id IS NULL
          AND q.assigned_closer_id IS NULL
        )
        OR (
          v_assigned = 'me_or_unassigned'
          AND (
            (
              v_member IS NOT NULL
              AND (
                q.assigned_setter_id = v_member
                OR q.assigned_closer_id = v_member
              )
            )
            OR (
              q.assigned_setter_id IS NULL
              AND q.assigned_closer_id IS NULL
            )
          )
        )
      )
      AND (
        p_track IS NULL
        OR p_track = ''
        OR (p_track = 'ready' AND q.lead_type = 'ready_track')
        OR (p_track = 'nurture' AND q.lead_type = 'nurture_track')
      )
      AND (
        p_status IS NULL
        OR p_status = ''
        OR q.status = p_status::public.lead_status
      )
      AND (
        p_source IS NULL
        OR p_source = ''
        OR q.source = p_source
      )
      AND (p_score_min IS NULL OR q.score >= p_score_min)
      AND (p_score_max IS NULL OR q.score <= p_score_max)
      AND (
        v_cursor_id IS NULL
        OR (q.urgency_rank, -q.sort_score, COALESCE(q.last_touch_at, '-infinity'::timestamptz), q.id)
          > (
            v_cursor_u,
            -COALESCE(v_cursor_s, 0),
            COALESCE(v_cursor_t, '-infinity'::timestamptz),
            v_cursor_id
          )
      )
    ORDER BY q.urgency_rank ASC, q.sort_score DESC, q.last_touch_at ASC NULLS FIRST, q.id ASC
    LIMIT v_limit + 1
  ) q;

  v_has_more := jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > v_limit;
  IF v_has_more THEN
    SELECT COALESCE(jsonb_agg(elem ORDER BY n), '[]'::jsonb)
    INTO v_queue
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(elem, n)
    WHERE n <= v_limit;
  ELSE
    v_queue := COALESCE(v_rows, '[]'::jsonb);
  END IF;

  v_pending := public.pending_follow_up_items(p_org_id, NULL);

  RETURN jsonb_build_object(
    'crmStatus', v_crm_status,
    'ghlLocationId', v_location,
    'orgLeadCount', v_lead_count,
    'unfilteredActionableCount', v_unfiltered,
    'alarm', COALESCE(v_alarm, '[]'::jsonb),
    'queue', COALESCE(v_queue, '[]'::jsonb),
    'pendingDrafts', COALESCE(v_pending, '[]'::jsonb),
    'hasMore', v_has_more,
    'members', COALESCE(v_members, '[]'::jsonb),
    'sources', COALESCE(v_sources, '[]'::jsonb)
  );
END;
$$;

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
  v_follow_ups jsonb;
  v_sequence jsonb;
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
  v_follow_ups := public.pending_follow_up_items(p_org_id, p_lead_id);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'branch', r.branch,
      'status', r.status,
      'haltReason', r.halt_reason,
      'nextPosition', r.next_position,
      'maxSteps', r.max_steps,
      'maxUntil', r.max_until,
      'startedAt', r.started_at
    ) ORDER BY r.started_at DESC
  ), '[]'::jsonb)
  INTO v_sequence
  FROM public.follow_up_sequence_runs r
  WHERE r.org_id = p_org_id AND r.lead_id = p_lead_id AND r.status = 'active';

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
    'timeline', COALESCE(v_timeline, jsonb_build_object('entries', '[]'::jsonb, 'hasMore', false)),
    'pendingFollowUps', COALESCE(v_follow_ups, '[]'::jsonb),
    'activeSequences', COALESCE(v_sequence, '[]'::jsonb)
  );
END;
$$;

ALTER TABLE public.follow_up_drafts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_up_drafts;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

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

