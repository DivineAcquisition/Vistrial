-- Prompt 10: the onboarding flow.
--
-- One record per workspace that every screen reads; stages that move back
-- when the real state breaks; who can see and change what; historic leads
-- protected from alerts, clocks and drafts; the sample lead never sends and is
-- removed; go-live blocked while any check fails; staged activation in order.
-- IDs use the 0b0a0000-0000-4000-8000- prefix.

CREATE FUNCTION pg_temp.q(p_user uuid, p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v jsonb;
  v_hint text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user::text, ''), true);
  IF p_user IS NULL THEN
    SET LOCAL ROLE anon;
  ELSE
    SET LOCAL ROLE authenticated;
  END IF;
  BEGIN
    EXECUTE 'SELECT to_jsonb((' || p_sql || '))' INTO v;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    v := jsonb_build_object('error', SQLERRM, 'hint', COALESCE(v_hint, ''));
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RETURN jsonb_build_object('failed', v);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN v;
END;
$$;

CREATE FUNCTION pg_temp.fails(p_user uuid, p_sql text)
RETURNS boolean
LANGUAGE sql
AS $$ SELECT pg_temp.q(p_user, p_sql) ? 'failed' $$;

CREATE FUNCTION pg_temp.err(p_user uuid, p_sql text)
RETURNS text
LANGUAGE sql
AS $$ SELECT CASE WHEN r ? 'failed' THEN (r -> 'failed' ->> 'error') || ' ' || (r -> 'failed' ->> 'hint') ELSE '' END
      FROM (SELECT pg_temp.q(p_user, p_sql) AS r) x $$;

CREATE FUNCTION pg_temp.check(p_ok boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'onboarding check failed: %', p_message;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.stage(p_org uuid, p_key text)
RETURNS text
LANGUAGE sql
AS $$ SELECT status FROM public.workspace_onboarding_stages WHERE org_id = p_org AND stage_key = p_key $$;

SELECT set_config('request.jwt.claim.sub', '', false);

-- ---------------------------------------------------------------------------
-- Fixture: a Platform Admin, Service Team A (W1), Service Team B (W2), and
-- W1's Owner, Member, and Operator.
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('0b0a0000-0000-4000-8000-0000000000ad', 'onb-admin@vistrial.test'),
  ('0b0a0000-0000-4000-8000-0000000000a1', 'onb-staff-a@vistrial.test'),
  ('0b0a0000-0000-4000-8000-0000000000a2', 'onb-staff-b@vistrial.test'),
  ('0b0a0000-0000-4000-8000-0000000000b1', 'owner@onb-one.test'),
  ('0b0a0000-0000-4000-8000-0000000000b2', 'member@onb-one.test'),
  ('0b0a0000-0000-4000-8000-0000000000b3', 'operator@onb-one.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.platform_staff (user_id, role, display_name, email) VALUES
  ('0b0a0000-0000-4000-8000-0000000000ad', 'platform_admin', 'Onb Admin', 'onb-admin@vistrial.test'),
  ('0b0a0000-0000-4000-8000-0000000000a1', 'service_team', 'Onb Staff A', 'onb-staff-a@vistrial.test'),
  ('0b0a0000-0000-4000-8000-0000000000a2', 'service_team', 'Onb Staff B', 'onb-staff-b@vistrial.test');

SELECT pg_temp.check(
  NOT pg_temp.fails('0b0a0000-0000-4000-8000-0000000000ad',
    $q$SELECT public.config_set_template_status((SELECT id FROM public.config_templates WHERE slug = 'med-spa'), 'active')$q$),
  'the Platform Admin could not activate Med Spa');

-- ---------------------------------------------------------------------------
-- Creating a workspace: Platform Admin, and Service Team only with permission.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(e = '', 'the Platform Admin could not create a workspace: ' || e)
FROM pg_temp.err('0b0a0000-0000-4000-8000-0000000000ad',
  $q$public.create_workspace('Onb One', 'America/Denver', 'onb-one', 'owner@onb-one.test',
     (SELECT id FROM public.config_templates WHERE slug = 'med-spa'), 'Pat Owner',
     ARRAY['0b0a0000-0000-4000-8000-0000000000a1']::uuid[], 'price_abc12345', 'Growth', 'Met at the expo')$q$) e;

SELECT pg_temp.check(
  pg_temp.fails('0b0a0000-0000-4000-8000-0000000000a2',
    $q$public.create_workspace('Onb Two', 'America/Denver', 'onb-two', 'owner@onb-two.test', (SELECT id FROM public.config_templates WHERE slug = 'med-spa'))$q$),
  'Service Team created a workspace without permission');
SELECT pg_temp.check(
  pg_temp.fails('0b0a0000-0000-4000-8000-0000000000a1',
    $q$public.set_staff_create_permission('0b0a0000-0000-4000-8000-0000000000a2', true)$q$),
  'Service Team granted the create permission');
SELECT pg_temp.check(
  NOT pg_temp.fails('0b0a0000-0000-4000-8000-0000000000ad',
    $q$public.set_staff_create_permission('0b0a0000-0000-4000-8000-0000000000a2', true)$q$),
  'the Platform Admin could not grant the create permission');
SELECT pg_temp.check(e = '', 'permitted Service Team could not create a workspace: ' || e)
FROM pg_temp.err('0b0a0000-0000-4000-8000-0000000000a2',
  $q$public.create_workspace('Onb Two', 'America/Denver', 'onb-two', 'owner@onb-two.test', (SELECT id FROM public.config_templates WHERE slug = 'med-spa'))$q$) e;

CREATE TEMP TABLE w AS
SELECT (SELECT id FROM public.organizations WHERE slug = 'onb-one') AS w1,
       (SELECT id FROM public.organizations WHERE slug = 'onb-two') AS w2;
GRANT SELECT ON w TO authenticated, anon;

SELECT pg_temp.check(
  EXISTS (SELECT 1 FROM public.workspace_assignments a, w WHERE a.org_id = w2 AND a.user_id = '0b0a0000-0000-4000-8000-0000000000a2' AND a.ended_at IS NULL)
  AND EXISTS (SELECT 1 FROM public.workspace_activity_log l, w WHERE l.org_id = w2 AND l.action = 'workspace.created_by_service_team')
  AND EXISTS (SELECT 1 FROM public.workspace_activity_log l WHERE l.action = 'staff.create_workspaces_granted'),
  'a Service Team creation was not assigned to its creator or not logged');

SELECT pg_temp.check(
  (SELECT count(*) FROM public.workspace_onboarding_stages s, w WHERE s.org_id = w1) = 16
  AND (SELECT jsonb_array_length(steps) FROM public.workspace_onboarding_status s, w WHERE s.org_id = w1) = 16
  AND (SELECT phase FROM public.workspace_onboarding_status s, w WHERE s.org_id = w1) = 'setup',
  'a new workspace did not get its 16-stage record');
SELECT pg_temp.check(
  (SELECT intended_price_id = 'price_abc12345' AND internal_note = 'Met at the expo' FROM public.onboarding_staff_details d, w WHERE d.org_id = w1),
  'the plan and internal note were not recorded');
SELECT pg_temp.check(
  (SELECT expires_at BETWEEN now() + interval '6 days' AND now() + interval '8 days' FROM public.org_invites i, w WHERE i.org_id = w1 AND i.role = 'owner'),
  'the Owner invitation does not expire in 7 days');
SELECT pg_temp.check(
  (SELECT bool_and(stage = 'off') AND count(*) = 4 FROM public.workspace_agent_activation a, w WHERE a.org_id = w1),
  'a new workspace did not start with every agent off');
SELECT pg_temp.check(
  NOT (SELECT public.agent_activation_allows(w1, 'relay') FROM w) AND NOT (SELECT public.agent_activation_allows(w1, 'scribe') FROM w),
  'agents may act in a workspace that has not gone live');
SELECT pg_temp.check(pg_temp.stage(w1, 'owner_account') = 'waiting_on_customer', 'owner_account was ' || pg_temp.stage(w1, 'owner_account')) FROM w;

-- Owner invitation: resend (refused straight away), change email, cancel.
SELECT pg_temp.check(
  pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_owner_invite(%L, 'resend')$q$, w1)) LIKE '%a moment ago%',
  'an invitation could be resent immediately') FROM w;
SELECT pg_temp.check(
  pg_temp.fails('0b0a0000-0000-4000-8000-0000000000a2', format($q$public.onboarding_owner_invite(%L, 'change', 'x@onb-one.test')$q$, w1)),
  'Service Team B changed W1''s invitation') FROM w;
SELECT pg_temp.check(e = '', 'staff could not change the Owner email: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_owner_invite(%L, 'change', 'owner@onb-one.test')$q$, w1)) e;
SELECT pg_temp.check(
  (SELECT count(*) FROM public.org_invites i, w WHERE i.org_id = w1 AND i.role = 'owner' AND i.accepted_at IS NULL) = 1,
  'changing the email left two invitations');

-- People join W1 (the accept flow inserts these rows).
INSERT INTO public.org_members (org_id, user_id, role, display_name, email, phone)
SELECT w1, '0b0a0000-0000-4000-8000-0000000000b1'::uuid, 'owner'::public.org_role, 'Pat Owner', 'owner@onb-one.test', '+13035550100' FROM w
UNION ALL SELECT w1, '0b0a0000-0000-4000-8000-0000000000b2', 'member', 'Mo Member', 'member@onb-one.test', NULL FROM w
UNION ALL SELECT w1, '0b0a0000-0000-4000-8000-0000000000b3', 'operator', 'Op Erator', 'operator@onb-one.test', NULL FROM w;
UPDATE public.org_invites SET accepted_at = now() FROM w WHERE org_id = w1 AND role = 'owner';
UPDATE public.org_members SET last_seen_at = now() FROM w WHERE org_id = w1 AND seat = 'customer';

SELECT pg_temp.check(pg_temp.stage(w1, 'owner_account') = 'done', 'owner_account did not complete on first sign-in')
FROM w, LATERAL (SELECT public.onboarding_refresh(w1)) r;

-- ---------------------------------------------------------------------------
-- Role visibility, at the data layer
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(NOT pg_temp.fails('0b0a0000-0000-4000-8000-0000000000b1', format('public.onboarding_customer_view(%L)', w1)),
  'the Owner could not read their setup') FROM w;
SELECT pg_temp.check(
  (pg_temp.q('0b0a0000-0000-4000-8000-0000000000b2', format('public.onboarding_customer_view(%L)', w1)) ->> 'access') = 'member',
  'the Member could not read the progress card') FROM w;
SELECT pg_temp.check(pg_temp.fails('0b0a0000-0000-4000-8000-0000000000b3', format('public.onboarding_customer_view(%L)', w1)),
  'an Operator read setup') FROM w;
SELECT pg_temp.check(pg_temp.fails('0b0a0000-0000-4000-8000-0000000000b3', format('public.onboarding_refresh(%L)', w1)),
  'an Operator refreshed setup') FROM w;
SELECT pg_temp.check(
  (pg_temp.q('0b0a0000-0000-4000-8000-0000000000b3', format('(SELECT count(*) FROM public.workspace_onboarding_status WHERE org_id = %L)', w1)))::int = 0,
  'an Operator read the onboarding record') FROM w;
SELECT pg_temp.check(pg_temp.fails('0b0a0000-0000-4000-8000-0000000000b2', format($q$public.onboarding_confirm_approach(%L)$q$, w1)),
  'a Member changed setup') FROM w;
SELECT pg_temp.check(
  (pg_temp.q('0b0a0000-0000-4000-8000-0000000000b1', format('(SELECT count(*) FROM public.workspace_onboarding_stages WHERE org_id = %L)', w1)))::int = 0,
  'a customer read the staff stage table (staff notes)') FROM w;
SELECT pg_temp.check(
  (pg_temp.q('0b0a0000-0000-4000-8000-0000000000b1', format('(SELECT count(*) FROM public.onboarding_staff_details WHERE org_id = %L)', w1)))::int = 0,
  'a customer read internal staff details') FROM w;
SELECT pg_temp.check(
  (pg_temp.q('0b0a0000-0000-4000-8000-0000000000a2', format('(SELECT count(*) FROM public.workspace_onboarding_stages WHERE org_id = %L)', w1)))::int = 0
  AND (pg_temp.q('0b0a0000-0000-4000-8000-0000000000a2', format('(SELECT count(*) FROM public.workspace_onboarding_status WHERE org_id = %L)', w1)))::int = 0,
  'Service Team B read W1''s onboarding') FROM w;
SELECT pg_temp.check(
  (pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format('(SELECT count(*) FROM public.workspace_onboarding_stages WHERE org_id = %L)', w1)))::int = 16,
  'Service Team A could not read W1''s stages') FROM w;
SELECT pg_temp.check(pg_temp.fails('0b0a0000-0000-4000-8000-0000000000a2', format($q$public.onboarding_stage_skip(%L, 'team', 'x')$q$, w1)),
  'Service Team B skipped a W1 stage') FROM w;
SELECT pg_temp.check(pg_temp.fails('0b0a0000-0000-4000-8000-0000000000a2', format('public.onboarding_refresh(%L)', w1)),
  'Service Team B refreshed W1') FROM w;
SELECT pg_temp.check(pg_temp.fails(NULL, format('public.onboarding_customer_view(%L)', w1)),
  'a signed-out visitor read setup') FROM w;
SELECT pg_temp.check(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND (p.proname LIKE 'onboarding%' OR p.proname IN ('escalation_contacts_save', 'escalation_contact_confirm', 'messaging_registration_save',
        'messaging_registration_set_status', 'messaging_registration_ein', 'email_domain_prepare', 'email_domain_ask_team',
        'email_domain_record_check', 'lead_reactivate', 'lead_is_historic', 'historic_lead_ids', 'agent_activation_allows',
        'create_workspace', 'set_staff_create_permission'))),
  'an onboarding function is callable by signed-out visitors');
SELECT pg_temp.check(
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
      AND c.relname IN ('onboarding_stage_definitions', 'onboarding_template_defaults', 'workspace_onboarding_stages', 'onboarding_staff_details',
        'onboarding_check_acceptances', 'onboarding_events', 'onboarding_reminders', 'onboarding_member_flags', 'workspace_agent_activation',
        'onboarding_import_runs', 'lead_import_marks', 'onboarding_import_problems', 'messaging_registration_details', 'email_domain_setup',
        'workspace_escalation_contacts', 'onboarding_sample_runs', 'onboarding_checkins', 'onboarding_feedback')),
  'a new onboarding table has row-level security off');

-- ---------------------------------------------------------------------------
-- Automatic stages follow the real state, and move back when it breaks.
-- ---------------------------------------------------------------------------

INSERT INTO public.ghl_connections (org_id, location_id, status, last_verified_at) SELECT w1, 'loc-onb-1', 'active', now() FROM w;
SELECT public.onboarding_refresh(w1) FROM w;
SELECT pg_temp.check(pg_temp.stage(w1, 'crm') = 'done', 'crm was not done with an active connection') FROM w;
UPDATE public.ghl_connections SET status = 'broken', last_refresh_error = 'token revoked' FROM w WHERE org_id = w1;
SELECT public.onboarding_refresh(w1) FROM w;
SELECT pg_temp.check(pg_temp.stage(w1, 'crm') = 'blocked', 'crm did not move back to blocked when the connection broke') FROM w;
SELECT pg_temp.check(
  EXISTS (SELECT 1 FROM public.onboarding_events e, w WHERE e.org_id = w1 AND e.kind = 'stage_reverted' AND e.stage_key = 'crm' AND e.audience = 'staff')
  AND EXISTS (SELECT 1 FROM public.onboarding_events e, w WHERE e.org_id = w1 AND e.kind = 'needs_attention' AND e.stage_key = 'crm' AND e.audience = 'owner')
  AND EXISTS (SELECT 1 FROM public.workspace_activity_log l, w WHERE l.org_id = w1 AND l.action = 'onboarding.stage_changed' AND l.detail ->> 'stage' = 'crm' AND l.detail ->> 'to' = 'blocked'),
  'a broken connection did not tell staff and the Owner, or was not logged');
SELECT pg_temp.check((SELECT stuck FROM public.workspace_onboarding_status s, w WHERE s.org_id = w1), 'a blocked stage did not mark the workspace stuck');
UPDATE public.ghl_connections SET status = 'active', last_refresh_error = NULL, last_verified_at = now() FROM w WHERE org_id = w1;

-- Every surface reads the same record: the roster carries the same steps.
SELECT public.onboarding_refresh(w1) FROM w;
SELECT pg_temp.check(
  pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format($q$(SELECT f.onboarding_steps FROM public.staff_roster_facts('all', %L, 30) f)$q$, w1))
    = (SELECT steps FROM public.workspace_onboarding_status s WHERE s.org_id = w1)
  AND pg_temp.q('0b0a0000-0000-4000-8000-0000000000b1', format($q$public.onboarding_customer_view(%L)$q$, w1)) -> 'steps'
    = (SELECT steps FROM public.workspace_onboarding_status s WHERE s.org_id = w1),
  'the roster and the progress card disagree') FROM w;

-- Two staff on one stage: the second save with a stale version is refused.
SELECT pg_temp.check(e = '', 'staff could not add a note: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1',
  format($q$public.onboarding_stage_note(%L, 'messaging', 'Number ordered', 'Internal only', '1 to 2 business days', %s)$q$,
    w1, (SELECT version FROM public.workspace_onboarding_stages WHERE org_id = w1 AND stage_key = 'messaging'))) e;
SELECT pg_temp.check(
  pg_temp.err('0b0a0000-0000-4000-8000-0000000000ad',
    format($q$public.onboarding_stage_note(%L, 'messaging', 'x', NULL, NULL, %s)$q$, w1,
      (SELECT version - 1 FROM public.workspace_onboarding_stages WHERE org_id = w1 AND stage_key = 'messaging'))) LIKE '%onboarding_conflict%',
  'a stale stage edit was not refused') FROM w;
SELECT pg_temp.check(
  (SELECT steps::text NOT LIKE '%Internal only%' AND steps::text LIKE '%Number ordered%' FROM public.workspace_onboarding_status s, w WHERE s.org_id = w1),
  'the customer copy shows a staff note, or misses the customer note');

-- Skip needs a reason; reopen puts it back.
SELECT pg_temp.check(pg_temp.fails('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_stage_skip(%L, 'team', '')$q$, w1)),
  'a stage was skipped without a reason') FROM w;
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_stage_skip(%L, 'team', 'Owner works alone')$q$, w1)) FROM w;
SELECT pg_temp.check(pg_temp.stage(w1, 'team') = 'skipped', 'the skip did not apply') FROM w;
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_stage_reopen(%L, 'team', 'Owner hired a setter')$q$, w1)) FROM w;
SELECT pg_temp.check(pg_temp.stage(w1, 'team') <> 'skipped', 'reopen did not undo the skip') FROM w;

-- ---------------------------------------------------------------------------
-- Messaging registration: no tax ID; staff-only; rejection reaches the Owner.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  pg_temp.err('0b0a0000-0000-4000-8000-0000000000b1',
    format($q$public.messaging_registration_save(%L, 'v1.abc', ARRAY['legal_name', 'ein'], true)$q$, w1)) LIKE '%tax IDs%',
  'a tax ID field was accepted') FROM w;
SELECT pg_temp.check(
  pg_temp.fails('0b0a0000-0000-4000-8000-0000000000b2', format($q$public.messaging_registration_save(%L, 'v1.abc', ARRAY['legal_name'], true)$q$, w1)),
  'a Member saved registration details') FROM w;
SELECT pg_temp.check(e = '', 'the Owner could not save registration details: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000b1',
  format($q$public.messaging_registration_save(%L, 'v1.cipher', ARRAY['legal_name', 'address', 'website'], true)$q$, w1)) e;
SELECT pg_temp.check(
  (pg_temp.q('0b0a0000-0000-4000-8000-0000000000b1', format('(SELECT count(*) FROM public.messaging_registration_details WHERE org_id = %L)', w1)))::int = 0,
  'the Owner can read stored registration details back') FROM w;
SELECT pg_temp.check(
  (pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format('(SELECT count(*) FROM public.messaging_registration_details WHERE org_id = %L)', w1)))::int = 1,
  'assigned staff cannot read registration details') FROM w;
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM public.workspace_activity_log l, w WHERE l.org_id = w1 AND l.detail::text LIKE '%cipher%'),
  'registration values reached the activity log');
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1',
  format($q$public.messaging_registration_set_status(%L, 'rejected', 'website_problem', 'Site had no privacy policy')$q$, w1)) FROM w;
SELECT pg_temp.check(pg_temp.stage(w1, 'messaging') = 'blocked', 'a rejection did not block messaging') FROM w;
SELECT pg_temp.check(
  (pg_temp.q('0b0a0000-0000-4000-8000-0000000000b1', format('public.onboarding_customer_view(%L)', w1)) -> 'messaging' ->> 'rejection_code') = 'website_problem'
  AND EXISTS (SELECT 1 FROM public.onboarding_events e, w WHERE e.org_id = w1 AND e.kind = 'messaging_status' AND e.audience = 'owner'),
  'the Owner was not given the rejection reason') FROM w;

-- ---------------------------------------------------------------------------
-- Historic leads: no clocks, alerts, drafts, approvals, or lead notices.
-- ---------------------------------------------------------------------------

INSERT INTO public.leads (id, org_id, first_name, status, opted_in_at, ghl_contact_id, phone, do_not_contact, do_not_contact_reason)
VALUES
  ('0b0a0000-0000-4000-8000-000000000101', (SELECT w1 FROM w), 'Old', 'new', now() - interval '40 days', 'crm-old-1', '+13035550111', false, NULL),
  ('0b0a0000-0000-4000-8000-000000000102', (SELECT w1 FROM w), 'Quiet', 'new', now() - interval '20 days', 'crm-old-2', '+13035550112', true, 'Marked do-not-contact in your CRM');
INSERT INTO public.lead_import_marks (lead_id, org_id, crm_created_at)
SELECT id, org_id, opted_in_at FROM public.leads WHERE id IN ('0b0a0000-0000-4000-8000-000000000101', '0b0a0000-0000-4000-8000-000000000102');

-- Case-file counts for the workbench: staff of the workspace only.
SELECT pg_temp.check(
  (pg_temp.q('0b0a0000-0000-4000-8000-0000000000ad', format('public.onboarding_case_file_counts(%L)', w1)) ->> 'none')::int = 2
  AND (pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format('public.onboarding_case_file_counts(%L)', w1)) ->> 'none')::int = 2
  AND pg_temp.fails('0b0a0000-0000-4000-8000-0000000000a2', format('public.onboarding_case_file_counts(%L)', w1))
  AND pg_temp.fails('0b0a0000-0000-4000-8000-0000000000b1', format('public.onboarding_case_file_counts(%L)', w1))
  AND pg_temp.fails(NULL, format('public.onboarding_case_file_counts(%L)', w1)),
  'case-file counts were readable outside the workspace staff') FROM w;

-- The same CRM contact cannot become two leads (the import's repeat-safety key).
SELECT pg_temp.check(
  pg_temp.fails('0b0a0000-0000-4000-8000-0000000000ad',
    format($q$(WITH x AS (INSERT INTO public.leads (org_id, first_name, status, opted_in_at, ghl_contact_id) VALUES (%L, 'Dup', 'new', now(), 'crm-old-1') RETURNING id) SELECT count(*) FROM x)$q$, w1)),
  'a second lead was created for the same CRM contact') FROM w;

INSERT INTO public.sentry_clocks (org_id, lead_id, kind, state, started_at, window_minutes)
SELECT w1, '0b0a0000-0000-4000-8000-000000000101'::uuid, 'first_touch', 'missed', now() - interval '40 days', 15 FROM w;
INSERT INTO public.sentry_alerts (org_id, lead_id, level, kind, title, body)
SELECT w1, '0b0a0000-0000-4000-8000-000000000101'::uuid, 1, 'escalation', 'x', 'y' FROM w;
INSERT INTO public.relay_jobs (org_id, lead_id, trigger, dedupe_key)
SELECT w1, '0b0a0000-0000-4000-8000-000000000101'::uuid, 'missed_window', 'onb-historic-1' FROM w;
INSERT INTO public.approval_items (org_id, area, kind, action_type, title, lead_ids, dedupe_key)
SELECT w1, 'sales', 'draft', 'first_reply', 'Draft for Old', ARRAY['0b0a0000-0000-4000-8000-000000000101']::uuid[], 'onb-historic-approval' FROM w;
INSERT INTO public.notifications (org_id, event_type, channel, recipient_user_id, subject_kind, subject_ids, title, body, href, dedupe_key, status)
SELECT w1, 'speed_to_lead', 'push', '0b0a0000-0000-4000-8000-0000000000b1', 'lead', ARRAY['0b0a0000-0000-4000-8000-000000000101']::uuid[],
  'A lead is waiting', 'Open Vistrial', '/app/queue', 'onb-historic-notice', 'queued' FROM w;

SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM public.sentry_clocks WHERE lead_id = '0b0a0000-0000-4000-8000-000000000101')
  AND NOT EXISTS (SELECT 1 FROM public.sentry_alerts WHERE lead_id = '0b0a0000-0000-4000-8000-000000000101')
  AND NOT EXISTS (SELECT 1 FROM public.relay_jobs WHERE lead_id = '0b0a0000-0000-4000-8000-000000000101')
  AND NOT EXISTS (SELECT 1 FROM public.approval_items WHERE '0b0a0000-0000-4000-8000-000000000101' = ANY (lead_ids))
  AND NOT EXISTS (SELECT 1 FROM public.notifications WHERE dedupe_key = 'onb-historic-notice'),
  'a historic lead got a clock, an alert, a draft job, an approval, or a notice');
SELECT pg_temp.check(
  (SELECT do_not_contact FROM public.leads WHERE id = '0b0a0000-0000-4000-8000-000000000102'),
  'a do-not-contact marker from the CRM did not carry over');
SELECT pg_temp.check(
  NOT pg_temp.fails('0b0a0000-0000-4000-8000-0000000000b3', format('(SELECT count(*) FROM public.leads WHERE org_id = %L)', w1)),
  'reading leads failed for an Operator') FROM w;

-- New activity after the import brings the lead back; then agents may act.
INSERT INTO public.touches (org_id, lead_id, type, channel, direction, occurred_at)
SELECT w1, '0b0a0000-0000-4000-8000-000000000101'::uuid, 'human', 'sms', 'outbound', now() FROM w;
SELECT pg_temp.check(NOT public.lead_is_historic('0b0a0000-0000-4000-8000-000000000101'), 'a worked lead stayed historic');
INSERT INTO public.relay_jobs (org_id, lead_id, trigger, dedupe_key)
SELECT w1, '0b0a0000-0000-4000-8000-000000000101'::uuid, 'missed_window', 'onb-historic-2' FROM w;
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.relay_jobs WHERE dedupe_key = 'onb-historic-2'), 'a reactivated lead was still blocked');

-- ---------------------------------------------------------------------------
-- The sample lead: never sends, left out of results, removed and verified.
-- ---------------------------------------------------------------------------

INSERT INTO public.leads (id, org_id, first_name, last_name, status, opted_in_at, phone, is_test)
VALUES ('0b0a0000-0000-4000-8000-000000000201', (SELECT w1 FROM w), 'Sample', 'lead (test)', 'new', now() - interval '20 minutes', '+13035550199', true);
INSERT INTO public.onboarding_sample_runs (id, org_id, lead_id, status, started_from)
SELECT '0b0a0000-0000-4000-8000-000000000301'::uuid, w1, '0b0a0000-0000-4000-8000-000000000201'::uuid, 'running', 'customer' FROM w;
INSERT INTO public.case_files (org_id, lead_id, status, summary, depth)
SELECT w1, '0b0a0000-0000-4000-8000-000000000201'::uuid, 'ready', 'Sample.', 'basic' FROM w;
INSERT INTO public.sentry_clocks (org_id, lead_id, kind, state, started_at, window_minutes)
SELECT w1, '0b0a0000-0000-4000-8000-000000000201'::uuid, 'first_touch', 'missed', now() - interval '20 minutes', 15 FROM w;
INSERT INTO public.sentry_alerts (org_id, lead_id, level, kind, title, body)
SELECT w1, '0b0a0000-0000-4000-8000-000000000201'::uuid, 1, 'escalation', 'Sample lead missed a response window', 'Sample' FROM w;
INSERT INTO public.approval_items (org_id, area, kind, action_type, title, lead_ids, dedupe_key)
SELECT w1, 'sales', 'draft', 'first_reply', 'Sample draft', ARRAY['0b0a0000-0000-4000-8000-000000000201']::uuid[], 'onb-sample-approval' FROM w;

-- Approving and sending: the message is recorded as not sent.
DO $$
DECLARE
  v_status text;
BEGIN
  BEGIN
    INSERT INTO public.ghl_dispatches (org_id, lead_id, channel, body_text, status)
    SELECT w1, '0b0a0000-0000-4000-8000-000000000201'::uuid, 'sms', 'Hi', 'queued' FROM w
    RETURNING status::text INTO v_status;
  EXCEPTION WHEN OTHERS THEN
    -- Sending switched off platform-wide also refuses: still nothing sent.
    v_status := 'refused';
  END;
  PERFORM pg_temp.check(v_status IN ('suppressed', 'refused'), 'a message to the sample lead was queued to send: ' || COALESCE(v_status, 'null'));
END $$;
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM public.ghl_dispatches WHERE lead_id = '0b0a0000-0000-4000-8000-000000000201' AND status <> 'suppressed'),
  'the sample lead has a dispatch that could send');

SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM w, public.portal_lead_scope(w1, '{}'::jsonb) s WHERE s.lead_id = '0b0a0000-0000-4000-8000-000000000201'),
  'the sample lead counts in results');

UPDATE public.onboarding_sample_runs SET status = 'passed' WHERE id = '0b0a0000-0000-4000-8000-000000000301';
SELECT pg_temp.check(
  pg_temp.fails('0b0a0000-0000-4000-8000-0000000000b3', $q$public.onboarding_sample_cleanup('0b0a0000-0000-4000-8000-000000000301')$q$),
  'an Operator ran the sample cleanup');
SELECT pg_temp.check(
  (pg_temp.q('0b0a0000-0000-4000-8000-0000000000b1', $q$public.onboarding_sample_cleanup('0b0a0000-0000-4000-8000-000000000301')$q$) ->> 'verified')::boolean,
  'the sample cleanup was not verified');
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM public.leads WHERE id = '0b0a0000-0000-4000-8000-000000000201')
  AND NOT EXISTS (SELECT 1 FROM public.case_files WHERE lead_id = '0b0a0000-0000-4000-8000-000000000201')
  AND NOT EXISTS (SELECT 1 FROM public.sentry_alerts WHERE lead_id = '0b0a0000-0000-4000-8000-000000000201')
  AND NOT EXISTS (SELECT 1 FROM public.sentry_clocks WHERE lead_id = '0b0a0000-0000-4000-8000-000000000201')
  AND NOT EXISTS (SELECT 1 FROM public.approval_items WHERE '0b0a0000-0000-4000-8000-000000000201' = ANY (lead_ids))
  AND NOT EXISTS (SELECT 1 FROM public.ghl_dispatches WHERE lead_id = '0b0a0000-0000-4000-8000-000000000201'),
  'the sample lead left data behind');
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000b1', $q$public.onboarding_sample_confirm('0b0a0000-0000-4000-8000-000000000301', true)$q$);
SELECT pg_temp.check(pg_temp.stage(w1, 'sample_test') = 'done', 'sample_test was ' || pg_temp.stage(w1, 'sample_test')) FROM w;

-- ---------------------------------------------------------------------------
-- Go-live: blocked while any check fails; only a Platform Admin accepts a
-- warning; staged activation in order.
-- ---------------------------------------------------------------------------

-- The Owner's own steps.
UPDATE public.organizations SET owner_contact_phone = '+13035550100', business_address = '1 Main St, Denver CO' FROM w WHERE id = w1;
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000b1', format($q$public.onboarding_confirm_approach(%L)$q$, w1)) FROM w;
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000b1',
  format($q$public.escalation_contacts_save(%L, jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM public.org_members WHERE org_id = %L AND role = 'owner' AND seat = 'customer'), 'channel', 'push')))$q$, w1, w1)) FROM w;
SELECT pg_temp.check(
  pg_temp.fails('0b0a0000-0000-4000-8000-0000000000b2', format($q$public.escalation_contact_confirm((SELECT id FROM public.workspace_escalation_contacts WHERE org_id = %L))$q$, w1)),
  'someone other than the contact confirmed it') FROM w;
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000b1',
  format($q$public.escalation_contact_confirm((SELECT id FROM public.workspace_escalation_contacts WHERE org_id = %L))$q$, w1)) FROM w;
SELECT pg_temp.check(pg_temp.stage(w1, 'escalation') = 'done', 'escalation was ' || pg_temp.stage(w1, 'escalation')) FROM w;
SELECT pg_temp.check(pg_temp.stage(w1, 'approvers') = 'done', 'approvers was ' || pg_temp.stage(w1, 'approvers')) FROM w;

SELECT pg_temp.check(pg_temp.fails('0b0a0000-0000-4000-8000-0000000000a1', format('public.onboarding_owner_confirm(%L)', w1)),
  'staff confirmed readiness for the Owner') FROM w;
SELECT pg_temp.check(e = '', 'the Owner could not confirm they are ready: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000b1', format('public.onboarding_owner_confirm(%L)', w1)) e;

-- Many checks still fail (messaging rejected, email, configuration...).
SELECT pg_temp.check(
  pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format('public.onboarding_approve_go_live(%L)', w1)) LIKE '%onboarding_checks_failing%',
  'go-live was approved with failing checks') FROM w;
SELECT pg_temp.check(
  pg_temp.err('0b0a0000-0000-4000-8000-0000000000ad', format($q$public.onboarding_accept_warning(%L, 'messaging', 'We trust it')$q$, w1)) LIKE '%cannot be accepted%',
  'a Platform Admin accepted a failing check') FROM w;
SELECT pg_temp.check((SELECT status FROM public.organizations, w WHERE id = w1) = 'onboarding', 'the workspace went live anyway');

-- Make every check pass.
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_set_channel(%L, 'texting', false, 'Email and chat only for now')$q$, w1)) FROM w;
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_set_channel(%L, 'email', false, 'Chat only')$q$, w1)) FROM w;
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.config_record_readiness(%L, %L, true)$q$, w1, public.config_version_stamp(w1))) FROM w;
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_config_review_signoff(%L, 'Looks right')$q$, w1)) FROM w;
INSERT INTO public.onboarding_import_runs (org_id, status, lookback_days, window_start, imported, finished_at)
SELECT w1, 'done', 90, now() - interval '90 days', 2, now() FROM w;
SELECT public.onboarding_refresh(w1) FROM w;

-- Billing is only a warning (not set up): Service Team cannot accept it.
SELECT pg_temp.check(
  pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format('public.onboarding_approve_go_live(%L)', w1)) LIKE '%Billing%',
  'go-live passed with an unaccepted warning') FROM w;
SELECT pg_temp.check(
  pg_temp.fails('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_accept_warning(%L, 'billing', 'Invoice sent by hand')$q$, w1)),
  'Service Team accepted a warning') FROM w;
SELECT pg_temp.check(e = '', 'the Platform Admin could not accept the billing warning: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000ad', format($q$public.onboarding_accept_warning(%L, 'billing', 'Invoice sent by hand')$q$, w1)) e;

-- Past-due billing is a failure, and blocks even with the acceptance.
INSERT INTO public.workspace_billing (org_id, status, payment_failed_at) SELECT w1, 'past_due', now() FROM w;
SELECT pg_temp.check(
  pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format('public.onboarding_approve_go_live(%L)', w1)) LIKE '%Billing%',
  'go-live was approved while billing was past due') FROM w;
DELETE FROM public.workspace_billing USING w WHERE org_id = w1;

SELECT pg_temp.check(e = '', 'go-live could not be approved with every check passing: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_approve_go_live(%L, 'All good')$q$, w1)) e;
SELECT pg_temp.check(
  (SELECT o.status = 'active' AND s.phase = 'activating' AND s.go_live_approved_by = '0b0a0000-0000-4000-8000-0000000000a1'
   FROM public.organizations o JOIN public.workspace_onboarding_status s ON s.org_id = o.id, w WHERE o.id = w1),
  'approval did not record the approver and move the workspace on');
SELECT pg_temp.check((SELECT count(*) FROM public.onboarding_checkins c, w WHERE c.org_id = w1) = 3, 'check-ins were not scheduled');

-- Order: Relay before Scribe and Sentry is refused.
SELECT pg_temp.check(
  pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_activate_step(%L, 'relay')$q$, w1)) LIKE '%first%',
  'Relay was switched on before Scribe and Sentry') FROM w;
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_activation_pause(%L, true, 'Owner on holiday')$q$, w1)) FROM w;
SELECT pg_temp.check(
  pg_temp.fails('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_activate_step(%L, 'scribe')$q$, w1)),
  'a step ran while activation was paused') FROM w;
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_activation_pause(%L, false)$q$, w1)) FROM w;
SELECT pg_temp.check(e = '', 'Scribe could not be switched on: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_activate_step(%L, 'scribe')$q$, w1)) e;
SELECT pg_temp.check(e = '', 'Sentry could not be switched on: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_activate_step(%L, 'sentry')$q$, w1)) e;
SELECT pg_temp.check(
  (SELECT a.stage = 'watch' AND sw.mode = 'practice' AND s.sentry_watch_until > now() + interval '23 hours'
   FROM public.workspace_agent_activation a JOIN public.sentry_workspaces sw ON sw.org_id = a.org_id
   JOIN public.workspace_onboarding_status s ON s.org_id = a.org_id, w
   WHERE a.org_id = w1 AND a.agent_id = 'sentry'),
  'Sentry did not start in watch-only mode for a day');
SELECT pg_temp.check(
  pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_sentry_full_on(%L)$q$, w1)) LIKE '%watch-only period%',
  'Service Team switched Sentry alerts on during the watch-only day') FROM w;
SELECT pg_temp.check(e = '', 'Relay could not be switched on: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_activate_step(%L, 'relay')$q$, w1)) e;
SELECT pg_temp.check((SELECT stage FROM public.workspace_agent_activation, w WHERE org_id = w1 AND agent_id = 'relay') = 'drafts_only',
  'Relay did not start in drafts-only mode');
SELECT pg_temp.check(e = '', 'the Compass placeholder step failed: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_activate_step(%L, 'compass')$q$, w1)) e;
SELECT pg_temp.check(
  (SELECT phase = 'live' AND live FROM public.workspace_onboarding_status s, w WHERE s.org_id = w1)
  AND (SELECT array_agg(agent_id ORDER BY activated_at, step_order) FROM public.workspace_agent_activation, w WHERE org_id = w1) = ARRAY['scribe', 'sentry', 'relay', 'compass'],
  'the workspace did not go live after the steps, in order');
SELECT pg_temp.check(
  (SELECT count(*) FROM public.workspace_activity_log l, w WHERE l.org_id = w1 AND l.action = 'onboarding.agent_activated') = 4,
  'activation steps were not each recorded');

-- The Platform Admin may end the watch-only period early, with a reason.
SELECT pg_temp.check(
  pg_temp.fails('0b0a0000-0000-4000-8000-0000000000ad', format($q$public.onboarding_sentry_full_on(%L)$q$, w1)),
  'the watch-only period ended early without a reason') FROM w;
SELECT pg_temp.check(e = '', 'the Platform Admin could not switch Sentry alerts on: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000ad', format($q$public.onboarding_sentry_full_on(%L, 'Owner asked for alerts now')$q$, w1)) e;
SELECT pg_temp.check((SELECT mode FROM public.sentry_workspaces, w WHERE org_id = w1) = 'live', 'Sentry did not go live');

-- First-week check-ins settle the workspace.
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_checkin_complete(%L, 'All fine')$q$, c.id))
FROM public.onboarding_checkins c, w WHERE c.org_id = w1;
SELECT pg_temp.check((SELECT phase FROM public.workspace_onboarding_status s, w WHERE s.org_id = w1) = 'settled', 'check-ins did not settle the workspace');

-- Moving back turns every agent off.
SELECT pg_temp.check(e = '', 'staff could not move the workspace back: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000a1', format($q$public.onboarding_move_back(%L, 'onboarding', 'CRM changed')$q$, w1)) e;
SELECT pg_temp.check(
  (SELECT status FROM public.organizations, w WHERE id = w1) = 'onboarding'
  AND (SELECT bool_and(stage = 'off') FROM public.workspace_agent_activation, w WHERE org_id = w1)
  AND EXISTS (SELECT 1 FROM public.onboarding_events e, w WHERE e.org_id = w1 AND e.kind = 'moved_onboarding' AND e.audience = 'owner'),
  'moving back left agents on, or did not tell the Owner');

-- A Platform Admin's direct status change still leaves agents off.
SELECT pg_temp.q('0b0a0000-0000-4000-8000-0000000000ad', format($q$public.config_record_readiness(%L, %L, true)$q$, w2, public.config_version_stamp(w2))) FROM w;
SELECT pg_temp.check(e = '', 'the Platform Admin could not set W2 live directly: ' || e)
FROM w, pg_temp.err('0b0a0000-0000-4000-8000-0000000000ad', format($q$public.set_workspace_status(%L, 'active')$q$, w2)) e;
SELECT pg_temp.check((SELECT phase FROM public.workspace_onboarding_status, w WHERE org_id = w2) = 'activating',
  'a direct status change did not keep the record in step');
SELECT pg_temp.check(
  (SELECT bool_and(stage = 'off') FROM public.workspace_agent_activation, w WHERE org_id = w2),
  'a direct status change switched agents on');

SELECT 'onboarding checks passed' AS result;
