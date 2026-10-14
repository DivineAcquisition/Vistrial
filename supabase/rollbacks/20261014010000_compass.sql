-- Rolls back 20261014010000_compass.sql.
--
-- Removes Compass's tables, functions, policies, guards and columns, and puts
-- back the functions it replaced exactly as they were before it (taken from a
-- database built with every earlier migration).
-- Kept on purpose:
--   * the relay_drafts 'sample' trigger value: the onboarding sample draft
--     needs it (it was missing before Compass, a Prompt 10 bug). Only the
--     'compass_request' value is removed, with the rows that used it;
--   * the industry.compass_questions configuration field and its template
--     values: nothing reads them once Compass is gone, and the configuration
--     history keeps every version;
--   * Compass conversations, messages, shares, usage, feedback, pins, limits
--     and help articles are copied to vistrial_rollback_keep before their
--     tables are dropped, so nothing is lost by running this.
-- Compass's activation stage goes back to 'coming_soon'. Run in one transaction.

BEGIN;

CREATE SCHEMA IF NOT EXISTS vistrial_rollback_keep;
REVOKE ALL ON SCHEMA vistrial_rollback_keep FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compass_conversations', 'compass_messages', 'compass_shares', 'compass_usage', 'compass_feedback',
    'compass_pins', 'compass_platform_settings', 'compass_workspace_limits', 'help_articles'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TABLE IF EXISTS vistrial_rollback_keep.%I', t || '_20261014');
      EXECUTE format('CREATE TABLE vistrial_rollback_keep.%I AS SELECT * FROM public.%I', t || '_20261014', t);
    END IF;
  END LOOP;
END $$;
DROP TABLE IF EXISTS vistrial_rollback_keep.compass_columns_20261014;
CREATE TABLE vistrial_rollback_keep.compass_columns_20261014 AS
SELECT 'org_members' AS source, id::text AS ref, jsonb_build_object('can_see_transcripts', can_see_transcripts) AS data
FROM public.org_members WHERE can_see_transcripts
UNION ALL
SELECT 'relay_jobs', id::text, to_jsonb(j) FROM public.relay_jobs j WHERE j.trigger = 'compass_request' OR j.requested_by_user IS NOT NULL
UNION ALL
SELECT 'sales_os_conversations', id::text, jsonb_build_object('text_deleted_at', text_deleted_at)
FROM public.sales_os_conversations WHERE text_deleted_at IS NOT NULL;

-- Tables (their policies, triggers and the pin cap go with them)
DROP TABLE IF EXISTS public.compass_messages;
DROP TABLE IF EXISTS public.compass_shares;
DROP TABLE IF EXISTS public.compass_usage;
DROP TABLE IF EXISTS public.compass_feedback;
DROP TABLE IF EXISTS public.compass_pins;
DROP TABLE IF EXISTS public.compass_conversations;
DROP TABLE IF EXISTS public.compass_platform_settings;
DROP TABLE IF EXISTS public.compass_workspace_limits;
DROP TABLE IF EXISTS public.help_articles;

-- Transcript permission
DROP TRIGGER IF EXISTS org_members_transcript_grant_guard ON public.org_members;
DROP POLICY IF EXISTS transcript_passages_member_grant ON public.transcript_passages;

-- Old conversations go back to the earlier visibility rule
DROP POLICY IF EXISTS sales_os_tool_calls_select ON public.sales_os_tool_calls;
CREATE POLICY sales_os_tool_calls_select ON public.sales_os_tool_calls FOR SELECT TO authenticated
  USING (public.sales_os_conversation_visible(conversation_id));

-- Relay: Compass requests leave
DELETE FROM public.relay_drafts WHERE trigger = 'compass_request';
DELETE FROM public.relay_jobs WHERE trigger = 'compass_request';
ALTER TABLE public.relay_jobs DROP CONSTRAINT IF EXISTS relay_jobs_trigger_check;
ALTER TABLE public.relay_jobs ADD CONSTRAINT relay_jobs_trigger_check
  CHECK (trigger IN ('after_call', 'missed_window', 'sample'));
ALTER TABLE public.relay_drafts DROP CONSTRAINT IF EXISTS relay_drafts_trigger_check;
ALTER TABLE public.relay_drafts ADD CONSTRAINT relay_drafts_trigger_check
  CHECK (trigger IN ('after_call', 'missed_window', 'follow_up', 'sample'));
ALTER TABLE public.relay_jobs
  DROP COLUMN IF EXISTS requested_by_user,
  DROP COLUMN IF EXISTS requested_by_member,
  DROP COLUMN IF EXISTS requested_by_label;

-- Functions Compass added
DROP FUNCTION IF EXISTS public.call_transcript_texts(uuid,uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.case_quotes_visible(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_availability(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_case_file(uuid,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_consume(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_conversation_is_mine(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_create_next_action(uuid,uuid,text,timestamp with time zone) CASCADE;
DROP FUNCTION IF EXISTS public.compass_effective_limits(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_find_leads(uuid,jsonb,integer) CASCADE;
DROP FUNCTION IF EXISTS public.compass_is_mine(uuid,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_lead_allowed(uuid,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_lead_transcript(uuid,uuid,integer) CASCADE;
DROP FUNCTION IF EXISTS public.compass_legacy_delete(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_may_request_draft(uuid,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_metric_breakdown(uuid,text,timestamp with time zone,timestamp with time zone,jsonb,text) CASCADE;
DROP FUNCTION IF EXISTS public.compass_metric_leads(uuid,text,timestamp with time zone,timestamp with time zone,jsonb,integer) CASCADE;
DROP FUNCTION IF EXISTS public.compass_metric_summary(uuid,text[],timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.compass_pins_cap() CASCADE;
DROP FUNCTION IF EXISTS public.compass_platform_usage(timestamp with time zone,timestamp with time zone) CASCADE;
DROP FUNCTION IF EXISTS public.compass_purge() CASCADE;
DROP FUNCTION IF EXISTS public.compass_quality_review(integer) CASCADE;
DROP FUNCTION IF EXISTS public.compass_record_action(uuid,text,uuid,jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.compass_request_draft(uuid,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_scope_filters(uuid,jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.compass_set_enabled(uuid,boolean,text) CASCADE;
DROP FUNCTION IF EXISTS public.compass_settings_save(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.compass_share(uuid,integer,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_shared_conversation(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_shared_list() CASCADE;
DROP FUNCTION IF EXISTS public.compass_unshare(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.compass_workspace_limits_save(uuid,integer,integer,integer,text) CASCADE;
DROP FUNCTION IF EXISTS public.compass_workspace_usage(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.help_article_delete(text) CASCADE;
DROP FUNCTION IF EXISTS public.help_article_save(text,text,text,text,text,text,integer,boolean) CASCADE;
DROP FUNCTION IF EXISTS public.org_members_transcript_grant_guard() CASCADE;
DROP FUNCTION IF EXISTS public.sales_os_tool_call_visible(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.ws_can_see_transcripts(uuid) CASCADE;

-- Functions Compass replaced, as they were
CREATE OR REPLACE FUNCTION public.org_members_grants_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role NOT IN ('member', 'client_viewer') THEN
    NEW.can_see_money := false;
    NEW.can_export := false;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.org_members_grants_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.can_see_money IS DISTINCT FROM OLD.can_see_money THEN
    PERFORM public.ws_log(NEW.org_id, 'member.money_permission_changed', 'org_members', NEW.id::text,
      jsonb_build_object('granted', NEW.can_see_money, 'name', NEW.display_name), auth.uid());
  END IF;
  IF NEW.can_export IS DISTINCT FROM OLD.can_export THEN
    PERFORM public.ws_log(NEW.org_id, 'member.export_permission_changed', 'org_members', NEW.id::text,
      jsonb_build_object('granted', NEW.can_export, 'name', NEW.display_name), auth.uid());
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.portal_member_flag(p_org_id uuid, p_flag text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT CASE p_flag WHEN 'money' THEN m.can_see_money WHEN 'export' THEN m.can_export WHEN 'approve' THEN m.can_approve END
    FROM public.org_members m
    WHERE m.org_id = p_org_id AND m.user_id = auth.uid() AND m.active AND m.seat = 'customer'
      AND m.role IN ('member', 'client_viewer')
    LIMIT 1
  ), false);
$function$
;

CREATE OR REPLACE FUNCTION public.case_meaning_search(p_org_id uuid, p_embedding extensions.vector, p_limit integer DEFAULT 12)
 RETURNS TABLE(lead_id uuid, passage_id uuid, call_id uuid, speaker text, excerpt text, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT e.lead_id, p.id, p.call_id, p.speaker,
    CASE
      WHEN p_org_id IN (SELECT public.user_staff_org_ids())
        OR public.is_platform_admin()
        OR public.user_has_org_role(p_org_id, VARIADIC ARRAY['owner'::org_role, 'operator'::org_role, 'setter'::org_role, 'closer'::org_role])
      THEN left(p.body, 180)
      ELSE NULL
    END,
    1 - (e.embedding <=> p_embedding)
  FROM public.scribe_embeddings e
  JOIN public.transcript_passages p ON p.id = e.passage_id AND p.org_id = e.org_id
  JOIN public.leads l ON l.id = e.lead_id AND l.org_id = e.org_id
  WHERE e.org_id = p_org_id
    AND p_org_id IN (SELECT public.user_org_ids())
    AND l.merged_into IS NULL
    AND (
      p_org_id NOT IN (SELECT public.user_operator_org_ids())
      OR e.lead_id IN (SELECT public.operator_visible_lead_ids())
    )
  ORDER BY e.embedding <=> p_embedding
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 25);
$function$
;

CREATE OR REPLACE FUNCTION public.sales_os_conversation_visible(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales_os_conversations c
    WHERE c.id = p_conversation_id
      AND c.org_id IN (SELECT public.user_org_ids())
      AND (
        c.user_id = auth.uid()
        OR c.org_id IN (SELECT public.user_staff_org_ids())
      OR (c.org_id IN (SELECT public.user_owner_org_ids()) AND NOT public.is_platform_staff_user(c.user_id))
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.sales_os_forbid_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Sales OS records are never deleted.' USING ERRCODE = '42501';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_activity_visible(p_org_id uuid, p_lead_id uuid, p_agent_id text, p_actor_member_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    CASE public.ws_access(p_org_id)
      WHEN 'platform_admin' THEN true
      WHEN 'service_team' THEN true
      WHEN 'owner' THEN p_agent_id <> 'compass' OR p_actor_member_id = public.user_member_id(p_org_id)
      WHEN 'member' THEN p_agent_id <> 'compass' OR p_actor_member_id = public.user_member_id(p_org_id)
      WHEN 'operator' THEN
        (p_agent_id = 'compass' AND p_actor_member_id = public.user_member_id(p_org_id))
        OR (
          p_agent_id <> 'compass'
          AND p_lead_id IS NOT NULL
          AND p_lead_id IN (SELECT public.operator_visible_lead_ids())
        )
      ELSE false
    END,
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.onboarding_activate_step(p_org_id uuid, p_agent_id text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  h public.workspace_onboarding_status%ROWTYPE;
  a public.workspace_agent_activation%ROWTYPE;
  v_before text;
  v_stage text;
  v_watch_days integer;
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  SELECT * INTO h FROM public.workspace_onboarding_status WHERE org_id = p_org_id FOR UPDATE;
  IF h.phase NOT IN ('activating', 'live') THEN
    RAISE EXCEPTION 'Go-live has not been approved for this workspace.' USING ERRCODE = '22023';
  END IF;
  IF h.activation_paused_at IS NOT NULL THEN
    RAISE EXCEPTION 'Activation is paused. Resume it first.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM public.workspace_agent_activation WHERE org_id = p_org_id AND agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown agent.' USING ERRCODE = '22023';
  END IF;
  IF a.stage <> 'off' THEN
    RAISE EXCEPTION 'This step is already done.' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(x.agent_id, ', ' ORDER BY x.step_order) INTO v_before
  FROM public.workspace_agent_activation x
  WHERE x.org_id = p_org_id AND x.step_order < a.step_order AND x.stage = 'off';
  IF v_before IS NOT NULL THEN
    RAISE EXCEPTION 'Switch on % first. Agents go on in order.', v_before USING ERRCODE = '22023';
  END IF;

  v_stage := CASE p_agent_id WHEN 'scribe' THEN 'on' WHEN 'sentry' THEN 'watch' WHEN 'relay' THEN 'drafts_only' ELSE 'coming_soon' END;
  UPDATE public.workspace_agent_activation
  SET stage = v_stage, activated_at = now(), activated_by = auth.uid(), activated_by_label = public.onboarding_actor_label(p_org_id),
      note = left(NULLIF(btrim(COALESCE(p_note, '')), ''), 300), updated_at = now()
  WHERE org_id = p_org_id AND agent_id = p_agent_id;

  IF p_agent_id = 'sentry' THEN
    SELECT COALESCE(td.sentry_watch_days, 1) INTO v_watch_days
    FROM public.organizations o LEFT JOIN public.onboarding_template_defaults td ON td.template_id = o.industry_template_id
    WHERE o.id = p_org_id;
    -- Watch only: Sentry records what it would have alerted, tells nobody, and
    -- only watches leads that arrive from now on.
    INSERT INTO public.sentry_workspaces (org_id, mode, watch_from, activated_by, activated_at, updated_at)
    VALUES (p_org_id, 'practice', now(), auth.uid(), now(), now())
    ON CONFLICT (org_id) DO UPDATE SET mode = 'practice', watch_from = now(), activated_by = auth.uid(), activated_at = now(), updated_at = now();
    UPDATE public.workspace_onboarding_status
    SET sentry_watch_until = now() + make_interval(days => COALESCE(v_watch_days, 1)), updated_at = now()
    WHERE org_id = p_org_id;
  END IF;

  IF p_agent_id = 'compass' THEN
    UPDATE public.workspace_onboarding_status SET phase = 'live', updated_at = now() WHERE org_id = p_org_id AND phase = 'activating';
    INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key) VALUES (p_org_id, 'owner', 'live', 'go_live');
  ELSE
    INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key, detail)
    VALUES (p_org_id, 'owner', 'agent_on', 'go_live', jsonb_build_object('agent', p_agent_id, 'stage', v_stage));
  END IF;
  PERFORM public.ws_log(p_org_id, 'onboarding.agent_activated', 'workspace_agent_activation', p_agent_id,
    jsonb_build_object('agent', p_agent_id, 'stage', v_stage, 'note', left(p_note, 300)), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.portal_assert_results(p_org_id uuid, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.portal_can_see_results(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(p_filters->>'person', '') IS NOT NULL AND NOT public.portal_can_see_people(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.config_profile_labels()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT $cfg${"signals":{"has_budget":"They can afford it","existing_revenue":"They already have revenue","urgent_timeline":"They want to start soon","sole_decision_maker":"They can decide alone","has_team":"They have a team behind them","clear_pain":"The problem is costing them now","tried_alternatives":"They have tried other things","right_industry":"They are in a market you serve","other":"Something else"},"disqualifiers":{"no_budget":"No budget at all","pre_revenue":"Pre-revenue","wrong_industry":"An industry you do not serve","needs_partner_approval":"Cannot decide without a partner","seeking_employment":"Looking for a job, not a service","out_of_geography":"Outside the places you work","competitor":"A competitor","other":"Something else"},"channels":{"meta_ads":"Facebook or Instagram ads","google_ads":"Google ads","youtube_ads":"YouTube ads","tiktok_ads":"TikTok ads","organic_social":"Organic social","email_list":"Your email list","referral":"Referrals","affiliate":"Affiliates or partners","webinar":"Webinars or masterclasses","cold_outbound":"Cold outbound","podcast":"Podcast","seo":"Search and content","events":"Live events","other":"Something else"},"offer_types":{"coaching":"Coaching","consulting":"Consulting","agency_service":"Agency service","course":"Course or programme","software":"Software","done_for_you":"Done-for-you delivery","other":"Something else"},"objection_types":{"price":"Price","timing":"Timing","spouse_partner":"Needs a partner's agreement","trust":"Trust","fit":"Fit","competitor":"Looking at someone else","other":"Something else"}}$cfg$::jsonb $function$
;

CREATE OR REPLACE FUNCTION public.config_legacy_banned_terms()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT ARRAY['I hope this message finds you well', 'I hope you''re doing well', 'I wanted to reach out', 'just circling back', 'circling back', 'touching base', 'following up on our conversation', 'as we discussed', 'leverage', 'utilize', 'synergy', 'streamline', 'robust', 'seamless', 'journey', 'solution']::text[] $function$
;

-- Triggers on org_members, as they were (they watched two grants, not three)
DROP TRIGGER IF EXISTS org_members_grants_guard ON public.org_members;
CREATE TRIGGER org_members_grants_guard BEFORE INSERT OR UPDATE OF role, can_see_money, can_export ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_grants_guard();
DROP TRIGGER IF EXISTS org_members_grants_audit ON public.org_members;
CREATE TRIGGER org_members_grants_audit AFTER UPDATE OF can_see_money, can_export ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_grants_audit();

-- Columns
ALTER TABLE public.org_members DROP COLUMN IF EXISTS can_see_transcripts;
ALTER TABLE public.sales_os_conversations DROP COLUMN IF EXISTS text_deleted_at;

-- Activation: Compass is a placeholder again
UPDATE public.workspace_agent_activation SET stage = 'coming_soon' WHERE agent_id = 'compass';

COMMIT;
