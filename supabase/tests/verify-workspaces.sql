-- Workspaces, roles, and isolation at the data layer.
--
-- Two near-identical customer workspaces (same name stem, same contact email,
-- same data shape), every role, and one assertion per rule. Each check runs as
-- the signed-in user through the `authenticated` role, the way the API does.
-- IDs use the 7e57 prefix.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Run a count query as a user.
CREATE FUNCTION pg_temp.count_as(p_user uuid, p_sql text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  n bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE p_sql INTO n;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN n;
END;
$$;

-- Run a write as a user. Returns 'ok:<rows>' or 'denied:<sqlstate>'. A write
-- RLS filters to zero rows reads as ok:0, which callers treat as refused.
CREATE FUNCTION pg_temp.write_as(p_user uuid, p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  n bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RETURN 'denied:' || SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN 'ok:' || n;
END;
$$;

CREATE FUNCTION pg_temp.refused(p_result text)
RETURNS boolean
LANGUAGE sql
AS $$ SELECT p_result LIKE 'denied:%' OR p_result = 'ok:0' $$;

CREATE FUNCTION pg_temp.check(p_ok boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'workspace check failed: %', p_message;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claim.role', '', false);

INSERT INTO auth.users (id, email) VALUES
  ('7e570000-0000-4000-8000-0000000000a1', 'owner-a@acme.test'),
  ('7e570000-0000-4000-8000-0000000000a2', 'co-owner-a@acme.test'),
  ('7e570000-0000-4000-8000-0000000000a3', 'member-a@acme.test'),
  ('7e570000-0000-4000-8000-0000000000a4', 'approver-a@acme.test'),
  ('7e570000-0000-4000-8000-0000000000a5', 'setter-a@acme.test'),
  ('7e570000-0000-4000-8000-0000000000a6', 'va-a@acme.test'),
  ('7e570000-0000-4000-8000-0000000000b1', 'owner-b@acme.test'),
  ('7e570000-0000-4000-8000-0000000000c1', 'owner-closed@acme.test'),
  ('7e570000-0000-4000-8000-0000000000d1', 'staff-a@vistrial.test'),
  ('7e570000-0000-4000-8000-0000000000d2', 'staff-none@vistrial.test'),
  ('7e570000-0000-4000-8000-0000000000d3', 'admin@vistrial.test'),
  ('7e570000-0000-4000-8000-0000000000e1', 'both@acme.test')
ON CONFLICT (id) DO NOTHING;

-- Same stem, same contact: these must never be confused.
INSERT INTO public.organizations (id, name, slug, timezone, holdout_percent, owner_contact_email, status) VALUES
  ('7e570000-0000-4000-8000-00000000a000', 'Acme Plumbing', 'acme-plumbing', 'America/Chicago', 0, 'hello@acme.test', 'active'),
  ('7e570000-0000-4000-8000-00000000b000', 'Acme Plumbing Co', 'acme-plumbing-co', 'America/Chicago', 0, 'hello@acme.test', 'active'),
  ('7e570000-0000-4000-8000-00000000c000', 'Acme Closed', 'acme-closed', 'America/Chicago', 0, NULL, 'active');

INSERT INTO public.org_members (id, org_id, user_id, role, can_approve, display_name, email) VALUES
  ('7e570000-0000-4000-8000-0000000a0001', '7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-0000000000a1', 'owner',    false, 'Owner A',    'owner-a@acme.test'),
  ('7e570000-0000-4000-8000-0000000a0002', '7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-0000000000a2', 'owner',    false, 'Co-owner A', 'co-owner-a@acme.test'),
  ('7e570000-0000-4000-8000-0000000a0003', '7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-0000000000a3', 'member',   false, 'Member A',   'member-a@acme.test'),
  ('7e570000-0000-4000-8000-0000000a0004', '7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-0000000000a4', 'member',   true,  'Approver A', 'approver-a@acme.test'),
  ('7e570000-0000-4000-8000-0000000a0005', '7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-0000000000a5', 'setter',   false, 'Setter A',   'setter-a@acme.test'),
  ('7e570000-0000-4000-8000-0000000a0006', '7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-0000000000a6', 'operator', false, 'VA A',       'va-a@acme.test'),
  ('7e570000-0000-4000-8000-0000000b0001', '7e570000-0000-4000-8000-00000000b000', '7e570000-0000-4000-8000-0000000000b1', 'owner',    false, 'Owner B',    'owner-b@acme.test'),
  ('7e570000-0000-4000-8000-0000000c0001', '7e570000-0000-4000-8000-00000000c000', '7e570000-0000-4000-8000-0000000000c1', 'owner',    false, 'Owner C',    'owner-closed@acme.test'),
  -- A person who owns one workspace and is a member of the other.
  ('7e570000-0000-4000-8000-0000000a0007', '7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-0000000000e1', 'member',   false, 'Both A',     'both@acme.test'),
  ('7e570000-0000-4000-8000-0000000b0002', '7e570000-0000-4000-8000-00000000b000', '7e570000-0000-4000-8000-0000000000e1', 'owner',    false, 'Both B',     'both@acme.test');

INSERT INTO public.platform_staff (user_id, role, display_name, email) VALUES
  ('7e570000-0000-4000-8000-0000000000d1', 'service_team',   'Staff A',    'staff-a@vistrial.test'),
  ('7e570000-0000-4000-8000-0000000000d2', 'service_team',   'Staff None', 'staff-none@vistrial.test'),
  ('7e570000-0000-4000-8000-0000000000d3', 'platform_admin', 'Admin',      'admin@vistrial.test');

INSERT INTO public.workspace_assignments (org_id, user_id)
VALUES ('7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-0000000000d1');

-- Identical data in A and B.
INSERT INTO public.leads (id, org_id, first_name, email, assigned_setter_id, assigned_closer_id) VALUES
  ('7e570000-0000-4000-8000-00000a1ead01', '7e570000-0000-4000-8000-00000000a000', 'Pat', 'pat@lead.test', '7e570000-0000-4000-8000-0000000a0005', NULL),
  ('7e570000-0000-4000-8000-00000a1ead02', '7e570000-0000-4000-8000-00000000a000', 'Lee', 'lee@lead.test', NULL, '7e570000-0000-4000-8000-0000000a0006'),
  ('7e570000-0000-4000-8000-00000a1ead03', '7e570000-0000-4000-8000-00000000a000', 'Kim', 'kim@lead.test', NULL, NULL),
  ('7e570000-0000-4000-8000-00000a1ead04', '7e570000-0000-4000-8000-00000000a000', 'Ash', 'ash@lead.test', '7e570000-0000-4000-8000-0000000a0006', NULL),
  ('7e570000-0000-4000-8000-00000b1ead01', '7e570000-0000-4000-8000-00000000b000', 'Pat', 'pat@lead.test', NULL, NULL),
  ('7e570000-0000-4000-8000-00000b1ead02', '7e570000-0000-4000-8000-00000000b000', 'Lee', 'lee@lead.test', NULL, NULL),
  ('7e570000-0000-4000-8000-00000c1ead01', '7e570000-0000-4000-8000-00000000c000', 'Old', 'old@lead.test', NULL, NULL);

INSERT INTO public.lead_files (id, org_id, lead_id, file_name, content_type, byte_size, contents) VALUES
  ('7e570000-0000-4000-8000-00000f11ea01', '7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-00000a1ead01', 'a.txt', 'text/plain', 1, 'QQ=='),
  ('7e570000-0000-4000-8000-00000f11eb01', '7e570000-0000-4000-8000-00000000b000', '7e570000-0000-4000-8000-00000b1ead01', 'b.txt', 'text/plain', 1, 'Qg==');

INSERT INTO public.revenue_log (org_id, lead_id, amount_cents, payment_type) VALUES
  ('7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-00000a1ead03', 500000, 'pif'),
  ('7e570000-0000-4000-8000-00000000b000', '7e570000-0000-4000-8000-00000b1ead01', 500000, 'pif');

INSERT INTO public.calls (id, org_id, lead_id, type) VALUES
  ('7e570000-0000-4000-8000-00000ca11a01', '7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-00000a1ead03', 'discovery');

INSERT INTO public.follow_up_drafts (
  id, org_id, lead_id, call_id, branch, channel, generated_body, edited_body, model_version, expires_at
) VALUES (
  '7e570000-0000-4000-8000-00000d5a0001', '7e570000-0000-4000-8000-00000000a000',
  '7e570000-0000-4000-8000-00000a1ead03', '7e570000-0000-4000-8000-00000ca11a01',
  'follow_up_scheduled', 'sms', 'Hi Kim', 'Hi Kim', 'test', now() + interval '2 days'
);

-- Close the third workspace now that it has data.
UPDATE public.organizations SET status = 'closed' WHERE id = '7e570000-0000-4000-8000-00000000c000';

-- ---------------------------------------------------------------------------
-- 1. A customer cannot see or reach another workspace: interface reads,
--    guessed IDs, modified writes, search, files, and exports all run through
--    the same policies.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT count(*) FROM public.leads WHERE org_id = '7e570000-0000-4000-8000-00000000b000'$q$) = 0,
  'owner A read workspace B leads');

SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT count(*) FROM public.leads WHERE id = '7e570000-0000-4000-8000-00000b1ead01'$q$) = 0,
  'owner A read a guessed lead id from workspace B');

SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT count(*) FROM public.leads WHERE email = 'pat@lead.test'$q$) = 1,
  'a search for a shared email crossed workspaces');

SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT count(*) FROM public.organizations$q$) = 1,
  'owner A can see that another workspace exists');

SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT count(*) FROM public.org_members WHERE org_id <> '7e570000-0000-4000-8000-00000000a000'$q$) = 0,
  'owner A saw members of another workspace');

SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$UPDATE public.leads SET first_name = 'x' WHERE id = '7e570000-0000-4000-8000-00000b1ead01'$q$)),
  'owner A edited a workspace B lead by id');

SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$INSERT INTO public.leads (org_id, first_name) VALUES ('7e570000-0000-4000-8000-00000000b000', 'planted')$q$)),
  'owner A wrote a lead into workspace B by changing org_id');

SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$UPDATE public.leads SET org_id = '7e570000-0000-4000-8000-00000000b000' WHERE id = '7e570000-0000-4000-8000-00000a1ead03'$q$)),
  'owner A moved a lead into workspace B');

-- Files: the contents column of workspace B is unreachable from A.
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT count(contents) FROM public.lead_files WHERE id = '7e570000-0000-4000-8000-00000f11eb01'$q$) = 0,
  'owner A opened a workspace B file');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000b1',
    $q$SELECT count(contents) FROM public.lead_files WHERE id = '7e570000-0000-4000-8000-00000f11ea01'$q$) = 0,
  'owner B opened a workspace A file');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000b1',
    $q$SELECT count(contents) FROM public.lead_files WHERE id = '7e570000-0000-4000-8000-00000f11eb01'$q$) = 1,
  'owner B could not open their own file');

-- A person in both workspaces sees each through its own seat only.
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000e1',
    $q$SELECT count(*) FROM public.leads$q$) = 6,
  'a person in both workspaces should see exactly both workspaces'' leads');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000e1',
    $q$UPDATE public.leads SET first_name = 'x' WHERE id = '7e570000-0000-4000-8000-00000a1ead03'$q$)),
  'owner-of-B used their B role to write in A, where they are only a member');

-- ---------------------------------------------------------------------------
-- 2. Service Team sees only assigned workspaces, and loses access the moment
--    the assignment ends.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000d1',
    $q$SELECT count(*) FROM public.organizations WHERE id::text LIKE '7e570000%'$q$) = 1,
  'staff A should see exactly their one assigned test workspace');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000d1',
    $q$SELECT count(*) FROM public.leads WHERE org_id = '7e570000-0000-4000-8000-00000000b000'$q$) = 0,
  'staff A read an unassigned workspace');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000d2',
    $q$SELECT count(*) FROM public.organizations$q$) = 0,
  'unassigned staff saw workspaces');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000d1',
    $q$SELECT count(*) FROM public.follow_up_settings WHERE org_id = '7e570000-0000-4000-8000-00000000a000'$q$) = 1,
  'staff A cannot read configuration in their workspace');

-- Platform Admin sees everything; only a Platform Admin manages assignments.
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000d3',
    $q$SELECT count(*) FROM public.organizations WHERE id::text LIKE '7e570000%'$q$) = 3,
  'platform admin should see all three test workspaces');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000d1',
    $q$SELECT public.assign_staff_to_workspace('7e570000-0000-4000-8000-00000000b000', '7e570000-0000-4000-8000-0000000000d1')$q$)),
  'service team assigned themselves');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT public.assign_staff_to_workspace('7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-0000000000d2')$q$)),
  'a customer owner managed assignments');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000d1',
    $q$INSERT INTO public.workspace_assignments (org_id, user_id) VALUES ('7e570000-0000-4000-8000-00000000b000', '7e570000-0000-4000-8000-0000000000d1')$q$)),
  'service team wrote an assignment row directly');
SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000d3',
    $q$SELECT public.assign_staff_to_workspace('7e570000-0000-4000-8000-00000000b000', '7e570000-0000-4000-8000-0000000000d2')$q$) LIKE 'ok:%',
  'platform admin could not assign staff');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000d2',
    $q$SELECT count(*) FROM public.leads WHERE org_id = '7e570000-0000-4000-8000-00000000b000'$q$) = 2,
  'a new assignment did not take effect immediately');
SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000d3',
    $q$SELECT public.end_staff_assignment('7e570000-0000-4000-8000-00000000b000', '7e570000-0000-4000-8000-0000000000d2')$q$) LIKE 'ok:%',
  'platform admin could not end an assignment');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000d2',
    $q$SELECT count(*) FROM public.leads WHERE org_id = '7e570000-0000-4000-8000-00000000b000'$q$) = 0,
  'an ended assignment still grants access');
SELECT pg_temp.check(
  (SELECT count(*) FROM public.workspace_assignments
   WHERE user_id = '7e570000-0000-4000-8000-0000000000d2' AND ended_at IS NOT NULL) = 1,
  'the ended assignment is not kept as history');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000d3',
    $q$SELECT public.assign_staff_to_workspace('7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-0000000000a1')$q$)),
  'a customer was assigned as staff');

-- ---------------------------------------------------------------------------
-- 3. Members are read-only; approval only by grant. Operators work only their
--    leads and the unassigned queue, and never see revenue.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a3',
    $q$SELECT count(*) FROM public.leads$q$) = 4,
  'a member should read every lead in their workspace');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a3',
    $q$UPDATE public.leads SET first_name = 'x' WHERE id = '7e570000-0000-4000-8000-00000a1ead03'$q$)),
  'a member edited a lead');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a3',
    $q$INSERT INTO public.touches (org_id, lead_id, type, channel, direction, actor_member_id) VALUES ('7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-00000a1ead03', 'human', 'call', 'outbound', '7e570000-0000-4000-8000-0000000a0003')$q$)),
  'a member logged a touch');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a3',
    $q$UPDATE public.follow_up_drafts SET status = 'rejected', rejected_reason = 'off tone', rejected_by_member_id = '7e570000-0000-4000-8000-0000000a0003' WHERE id = '7e570000-0000-4000-8000-00000d5a0001'$q$)),
  'a member without the grant rejected a draft');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a3',
    $q$UPDATE public.org_members SET display_name = 'x' WHERE id = '7e570000-0000-4000-8000-0000000a0005'$q$)),
  'a member changed another user');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a3',
    $q$INSERT INTO public.org_invites (org_id, email, role, token, invited_by, expires_at) VALUES ('7e570000-0000-4000-8000-00000000a000', 'new@acme.test', 'member', 'tok-member', '7e570000-0000-4000-8000-0000000a0003', now() + interval '7 days')$q$)),
  'a member invited a user');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a3',
    $q$UPDATE public.score_configs SET speed_to_lead_minutes = 99 WHERE org_id = '7e570000-0000-4000-8000-00000000a000'$q$)),
  'a member changed a setting');
SELECT pg_temp.check(
  (SELECT NOT public.ws_can_approve('7e570000-0000-4000-8000-00000000a000')
     FROM (SELECT set_config('request.jwt.claim.sub', '7e570000-0000-4000-8000-0000000000a3', true)) s),
  'ws_can_approve is true for a member without the grant');
SELECT set_config('request.jwt.claim.sub', '', false);

SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000a4',
    $q$UPDATE public.follow_up_drafts SET status = 'rejected', rejected_reason = 'off tone', rejected_by_member_id = '7e570000-0000-4000-8000-0000000a0004' WHERE id = '7e570000-0000-4000-8000-00000d5a0001'$q$) = 'ok:1',
  'a member with the approval grant could not decide a draft');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a4',
    $q$UPDATE public.leads SET first_name = 'x' WHERE id = '7e570000-0000-4000-8000-00000a1ead03'$q$)),
  'the approval grant let a member edit a lead');

-- Operators.
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a5',
    $q$SELECT count(*) FROM public.leads$q$) = 2,
  'setter should see their assigned lead and the unassigned queue (2)');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a6',
    $q$SELECT count(*) FROM public.leads$q$) = 3,
  'VA should see their two assigned leads (setter and closer slots) and the queue (3)');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a5',
    $q$SELECT count(*) FROM public.lead_files WHERE lead_id = '7e570000-0000-4000-8000-00000a1ead01'$q$) = 1,
  'setter cannot see files on their own lead');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a5',
    $q$UPDATE public.leads SET context_notes = 'x' WHERE id = '7e570000-0000-4000-8000-00000a1ead02'$q$)),
  'setter worked another operator''s lead');
SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000a6',
    $q$UPDATE public.leads SET context_notes = 'called back' WHERE id = '7e570000-0000-4000-8000-00000a1ead02'$q$) = 'ok:1',
  'VA could not work their own closer-slot lead');
SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000a5',
    $q$INSERT INTO public.touches (org_id, lead_id, type, channel, direction, actor_member_id) VALUES ('7e570000-0000-4000-8000-00000000a000', '7e570000-0000-4000-8000-00000a1ead03', 'human', 'call', 'outbound', '7e570000-0000-4000-8000-0000000a0005')$q$) = 'ok:1',
  'setter could not log a touch on a queue lead');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a5',
    $q$SELECT count(*) FROM public.revenue_log$q$) = 0,
  'an operator saw revenue');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a5',
    $q$UPDATE public.follow_up_drafts SET status = 'pending', rejected_reason = NULL, rejected_by_member_id = NULL WHERE id = '7e570000-0000-4000-8000-00000d5a0001'$q$)),
  'an operator changed a draft decision');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a5',
    $q$INSERT INTO public.org_invites (org_id, email, role, token, invited_by, expires_at) VALUES ('7e570000-0000-4000-8000-00000000a000', 'op@acme.test', 'member', 'tok-op', '7e570000-0000-4000-8000-0000000a0005', now() + interval '7 days')$q$)),
  'an operator invited a user');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT count(*) FROM public.revenue_log$q$) = 1,
  'the owner cannot see their own revenue');

-- Owners: invite members and operators, not owners; business contact only.
SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$INSERT INTO public.org_invites (org_id, email, role, token, invited_by, expires_at) VALUES ('7e570000-0000-4000-8000-00000000a000', 'new-op@acme.test', 'operator', 'tok-owner-op', '7e570000-0000-4000-8000-0000000a0001', now() + interval '7 days')$q$) = 'ok:1',
  'an owner could not invite an operator');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$INSERT INTO public.org_invites (org_id, email, role, token, invited_by, expires_at) VALUES ('7e570000-0000-4000-8000-00000000a000', 'new-owner@acme.test', 'owner', 'tok-owner-owner', '7e570000-0000-4000-8000-0000000a0001', now() + interval '7 days')$q$)),
  'an owner invited another owner');
SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$UPDATE public.organizations SET owner_contact_phone = '555-0100' WHERE id = '7e570000-0000-4000-8000-00000000a000'$q$) = 'ok:1',
  'an owner could not change business contact details');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$UPDATE public.organizations SET holdout_percent = 5 WHERE id = '7e570000-0000-4000-8000-00000000a000'$q$)),
  'an owner changed an internal workspace setting');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$UPDATE public.organizations SET status = 'paused' WHERE id = '7e570000-0000-4000-8000-00000000a000'$q$)),
  'an owner changed workspace status');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$UPDATE public.follow_up_settings SET quiet_hours_enabled = false WHERE org_id = '7e570000-0000-4000-8000-00000000a000'$q$)),
  'an owner changed follow-up configuration');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT count(*) FROM public.follow_up_settings$q$) = 0,
  'an owner read configuration internals');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT count(*) FROM public.settings_activity$q$) = 0,
  'an owner read the team''s settings history');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT public.load_org_activity('7e570000-0000-4000-8000-00000000a000')$q$)),
  'an owner loaded the full activity stream');
SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$UPDATE public.org_members SET can_approve = true WHERE id = '7e570000-0000-4000-8000-0000000a0003'$q$) = 'ok:1',
  'an owner could not grant approval to a member');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$UPDATE public.org_members SET role = 'owner' WHERE id = '7e570000-0000-4000-8000-0000000a0003'$q$)),
  'an owner promoted a member to owner');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$UPDATE public.org_members SET active = false WHERE org_id = '7e570000-0000-4000-8000-00000000a000' AND seat = 'staff'$q$)),
  'an owner removed a staff seat');

-- ---------------------------------------------------------------------------
-- 4. The last owner cannot be removed; removal is immediate and keeps history.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$UPDATE public.org_members SET active = false WHERE id = '7e570000-0000-4000-8000-0000000a0002'$q$) = 'ok:1',
  'an owner could not remove a co-owner');
SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000a1',
    $q$UPDATE public.org_members SET active = false WHERE id = '7e570000-0000-4000-8000-0000000a0001'$q$) = 'denied:P0001',
  'the last owner removed themselves');
SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000d3',
    $q$UPDATE public.org_members SET role = 'member' WHERE id = '7e570000-0000-4000-8000-0000000a0001'$q$) = 'denied:P0001',
  'staff demoted the last owner');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a2',
    $q$SELECT count(*) FROM public.leads$q$) = 0,
  'a removed co-owner kept access');
SELECT pg_temp.check(
  (SELECT deactivated_at IS NOT NULL FROM public.org_members WHERE id = '7e570000-0000-4000-8000-0000000a0002'),
  'removal did not stamp deactivated_at');
SELECT pg_temp.check(
  EXISTS (SELECT 1 FROM public.workspace_activity_log WHERE action = 'member.removed'
          AND target_id = '7e570000-0000-4000-8000-0000000a0002'),
  'removal was not logged');

-- ---------------------------------------------------------------------------
-- 5. Closed workspaces: customers lose access, staff read-only. Paused ones
--    keep data and stop automation.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000c1',
    $q$SELECT count(*) FROM public.leads$q$) = 0,
  'a customer kept access to a closed workspace');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000d3',
    $q$SELECT count(*) FROM public.leads WHERE org_id = '7e570000-0000-4000-8000-00000000c000'$q$) = 1,
  'staff cannot read a closed workspace');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000d3',
    $q$UPDATE public.leads SET first_name = 'x' WHERE org_id = '7e570000-0000-4000-8000-00000000c000'$q$)),
  'staff wrote to a closed workspace');
SELECT pg_temp.check(
  (SELECT delete_after IS NOT NULL AND closed_at IS NOT NULL FROM public.organizations
   WHERE id = '7e570000-0000-4000-8000-00000000c000'),
  'closing did not schedule removal after the retention period');

SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000d3',
    $q$SELECT public.set_workspace_status('7e570000-0000-4000-8000-00000000b000', 'paused', 'test')$q$) LIKE 'ok:%',
  'platform admin could not pause a workspace');
SELECT pg_temp.check(
  NOT public.ws_automation_allowed('7e570000-0000-4000-8000-00000000b000'),
  'automation is still allowed in a paused workspace');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000b1',
    $q$SELECT count(*) FROM public.leads$q$) = 2,
  'a paused workspace lost its data for the owner');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000d1',
    $q$SELECT public.set_workspace_status('7e570000-0000-4000-8000-00000000a000', 'closed', 'test')$q$)),
  'service team changed a workspace''s status');
SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000d3',
    $q$SELECT public.set_workspace_status('7e570000-0000-4000-8000-00000000b000', 'active', NULL)$q$) LIKE 'ok:%',
  'platform admin could not resume a workspace');

-- ---------------------------------------------------------------------------
-- 6. The activity log: who, what, which record, which workspace, when.
--    Nobody edits or deletes it.
-- ---------------------------------------------------------------------------

-- Staff action inside a customer workspace.
SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000d1',
    $q$UPDATE public.leads SET context_notes = 'staff note' WHERE id = '7e570000-0000-4000-8000-00000a1ead03'$q$) = 'ok:1',
  'staff could not work a lead');
SELECT pg_temp.check(
  EXISTS (
    SELECT 1 FROM public.workspace_activity_log
    WHERE org_id = '7e570000-0000-4000-8000-00000000a000'
      AND actor_user_id = '7e570000-0000-4000-8000-0000000000d1'
      AND actor_kind = 'service_team'
      AND action = 'leads.update'
      AND target_id = '7e570000-0000-4000-8000-00000a1ead03'
  ),
  'a staff edit inside a customer workspace was not logged');

SELECT pg_temp.check(
  EXISTS (SELECT 1 FROM public.workspace_activity_log WHERE action = 'invite.sent'
          AND org_id = '7e570000-0000-4000-8000-00000000a000'),
  'invitations are not logged');
SELECT pg_temp.check(
  EXISTS (SELECT 1 FROM public.workspace_activity_log WHERE action = 'assignment.added'
          AND org_id = '7e570000-0000-4000-8000-00000000b000'),
  'assignment changes are not logged');
SELECT pg_temp.check(
  EXISTS (SELECT 1 FROM public.workspace_activity_log WHERE action = 'workspace.status_changed'
          AND org_id = '7e570000-0000-4000-8000-00000000c000'),
  'workspace status changes are not logged');
SELECT pg_temp.check(
  EXISTS (SELECT 1 FROM public.workspace_activity_log WHERE action = 'member.approval_permission_changed'
          AND target_id = '7e570000-0000-4000-8000-0000000a0003'),
  'permission grants are not logged');
SELECT pg_temp.check(
  EXISTS (SELECT 1 FROM public.workspace_activity_log WHERE action = 'follow_up_drafts.update'
          AND actor_user_id = '7e570000-0000-4000-8000-0000000000a4' AND actor_kind = 'customer'),
  'a customer approval is not logged');

-- Visibility of the log.
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT count(*) FROM public.workspace_activity_log WHERE actor_kind <> 'customer'$q$) = 0,
  'a customer saw service team activity');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a4',
    $q$SELECT count(*) FROM public.workspace_activity_log WHERE action = 'follow_up_drafts.update'$q$) >= 1,
  'a customer cannot see the approvals they made');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000d1',
    $q$SELECT count(*) FROM public.workspace_activity_log WHERE org_id = '7e570000-0000-4000-8000-00000000b000'$q$) = 0,
  'staff read the log of an unassigned workspace');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000d3',
    $q$SELECT count(*) FROM public.workspace_activity_log WHERE org_id = '7e570000-0000-4000-8000-00000000b000'$q$) >= 1,
  'platform admin cannot read every workspace''s log');

-- Immutable for users, for staff, and for the service role.
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000d3',
    $q$UPDATE public.workspace_activity_log SET action = 'edited'$q$)),
  'a platform admin edited the activity log');
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000d3',
    $q$DELETE FROM public.workspace_activity_log$q$)),
  'a platform admin deleted the activity log');
DO $$
DECLARE
  v_blocked boolean := false;
BEGIN
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.workspace_activity_log SET action = 'edited';
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;
  RESET ROLE;
  PERFORM pg_temp.check(v_blocked, 'the service role edited the activity log');

  v_blocked := false;
  BEGIN
    DELETE FROM public.workspace_activity_log;
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;
  PERFORM pg_temp.check(v_blocked, 'the activity log could be deleted without the purge switch');
END $$;

-- ---------------------------------------------------------------------------
-- 7. Holding area: platform admin only.
-- ---------------------------------------------------------------------------

INSERT INTO public.inbound_event_holds (source, event_type, external_ref, reason, payload)
VALUES ('telnyx', 'message.received', 'tx-1', 'source_not_enabled', '{"to": "+15550100"}');

SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000a1',
    $q$SELECT count(*) FROM public.inbound_event_holds$q$) = 0,
  'a customer read the holding area');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000d1',
    $q$SELECT count(*) FROM public.inbound_event_holds$q$) = 0,
  'service team read the holding area');
SELECT pg_temp.check(
  pg_temp.count_as('7e570000-0000-4000-8000-0000000000d3',
    $q$SELECT count(*) FROM public.inbound_event_holds WHERE external_ref = 'tx-1'$q$) = 1,
  'platform admin cannot read the holding area');

-- Only a Platform Admin creates a workspace. It starts in onboarding, with one
-- owner invite, and the creation is logged once.
SELECT pg_temp.check(
  pg_temp.refused(pg_temp.write_as('7e570000-0000-4000-8000-0000000000d1',
    $q$SELECT public.create_workspace('Staff Made', 'UTC', NULL, 'x@example.com')$q$)),
  'service team created a workspace');
SELECT pg_temp.check(
  pg_temp.write_as('7e570000-0000-4000-8000-0000000000d3',
    $q$SELECT public.create_workspace('Fresh Studio', 'UTC', 'fresh-studio', 'Owner@Fresh.test')$q$) LIKE 'ok:%',
  'platform admin could not create a workspace');
SELECT pg_temp.check(
  (SELECT status FROM public.organizations WHERE slug = 'fresh-studio') = 'onboarding',
  'a new workspace did not start in onboarding');
SELECT pg_temp.check(
  (SELECT count(*) FROM public.org_invites i JOIN public.organizations o ON o.id = i.org_id
   WHERE o.slug = 'fresh-studio' AND i.role = 'owner' AND i.email = 'owner@fresh.test') = 1,
  'a new workspace did not get exactly one owner invite');
SELECT pg_temp.check(
  (SELECT count(*) FROM public.workspace_activity_log l JOIN public.organizations o ON o.id = l.org_id
   WHERE o.slug = 'fresh-studio' AND l.action = 'workspace.created' AND l.actor_kind = 'platform_admin') = 1,
  'workspace creation was not logged exactly once');

-- ---------------------------------------------------------------------------
-- 8. Nothing privileged is open to signed-out visitors, and every table that
--    holds a workspace has row-level security.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'a SECURITY DEFINER function is callable by anon');

SELECT pg_temp.check(
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  ),
  'a public table has row-level security off');

SELECT set_config('request.jwt.claim.sub', '', false);
