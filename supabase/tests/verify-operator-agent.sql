-- Prompt 18: operator-agent RLS, batch cap, rate-limit wrapper.
-- JWT claims are session-level. SET ROLE is at the SQL session (not inside
-- PL/pgSQL) so auth.uid() is visible to INSERT WITH CHECK the same way it is
-- for SELECT policies in the other verify files.

INSERT INTO auth.users (id, email)
VALUES
  ('181e1811-1811-4181-8181-1811111111a2', 'oa-owner@vistrial.local'),
  ('181e1811-1811-4181-8181-1811111111a4', 'oa-setter@vistrial.local'),
  ('181e1811-1811-4181-8181-1811111111b2', 'oa-other-owner@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, timezone, activated_at, operator_agent_batch_cap)
VALUES (
  '181e1811-1811-4181-8181-1811111111a1',
  'Operator Co',
  'operator-co',
  'America/New_York',
  now() - interval '30 days',
  10
);

INSERT INTO public.score_configs (org_id)
VALUES ('181e1811-1811-4181-8181-1811111111a1')
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES
(
  '181e1811-1811-4181-8181-1811111111a3',
  '181e1811-1811-4181-8181-1811111111a1',
  '181e1811-1811-4181-8181-1811111111a2',
  'owner',
  'OA Owner',
  'oa-owner@vistrial.local'
),
(
  '181e1811-1811-4181-8181-1811111111a5',
  '181e1811-1811-4181-8181-1811111111a1',
  '181e1811-1811-4181-8181-1811111111a4',
  'setter',
  'OA Setter',
  'oa-setter@vistrial.local'
);

INSERT INTO public.organizations (id, name, slug, timezone, activated_at)
VALUES (
  '181e1811-1811-4181-8181-1811111111b1',
  'Other Operator Co',
  'other-operator-co',
  'America/New_York',
  now() - interval '30 days'
);

INSERT INTO public.score_configs (org_id)
VALUES ('181e1811-1811-4181-8181-1811111111b1')
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES (
  '181e1811-1811-4181-8181-1811111111b3',
  '181e1811-1811-4181-8181-1811111111b1',
  '181e1811-1811-4181-8181-1811111111b2',
  'owner',
  'Other OA Owner',
  'oa-other-owner@vistrial.local'
);

INSERT INTO public.leads (id, org_id, first_name, last_name, status, assigned_setter_id, opted_in_at)
VALUES (
  '181e1811-1811-4181-8181-1811111111c1',
  '181e1811-1811-4181-8181-1811111111a1',
  'Pat',
  'Lead',
  'working',
  '181e1811-1811-4181-8181-1811111111a5',
  now() - interval '3 days'
);

DO $$
BEGIN
  BEGIN
    UPDATE public.organizations
    SET operator_agent_batch_cap = 0
    WHERE id = '181e1811-1811-4181-8181-1811111111a1';
    RAISE EXCEPTION 'batch cap 0 should fail';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.organizations
    SET operator_agent_batch_cap = 41
    WHERE id = '181e1811-1811-4181-8181-1811111111a1';
    RAISE EXCEPTION 'batch cap 41 should fail';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END
$$;

SELECT set_config('request.jwt.claim.sub', '181e1811-1811-4181-8181-1811111111a4', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '181e1811-1811-4181-8181-1811111111a4', false);

DO $$
BEGIN
  IF public.user_member_id('181e1811-1811-4181-8181-1811111111a1')
     IS DISTINCT FROM '181e1811-1811-4181-8181-1811111111a5'::uuid THEN
    RAISE EXCEPTION 'setter user_member_id mismatch: %', public.user_member_id('181e1811-1811-4181-8181-1811111111a1');
  END IF;
  IF public.operator_run_user_is_self('181e1811-1811-4181-8181-1811111111a4') IS NOT TRUE THEN
    RAISE EXCEPTION 'setter operator_run_user_is_self failed';
  END IF;
END
$$;

INSERT INTO public.operator_runs (
  id, org_id, member_id, user_id, request_text, status
) VALUES (
  '181e1811-1811-4181-8181-1811111111d1',
  '181e1811-1811-4181-8181-1811111111a1',
  '181e1811-1811-4181-8181-1811111111a5',
  '181e1811-1811-4181-8181-1811111111a4',
  'Which leads went quiet?',
  'completed'
);

INSERT INTO public.operator_run_leads (org_id, run_id, lead_id)
VALUES (
  '181e1811-1811-4181-8181-1811111111a1',
  '181e1811-1811-4181-8181-1811111111d1',
  '181e1811-1811-4181-8181-1811111111c1'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.operator_runs (org_id, member_id, user_id, request_text, status)
    VALUES (
      '181e1811-1811-4181-8181-1811111111a1',
      '181e1811-1811-4181-8181-1811111111a3',
      '181e1811-1811-4181-8181-1811111111a2',
      'Forged owner run',
      'completed'
    );
    RAISE EXCEPTION 'setter inserted a run as the owner';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%setter inserted%' THEN RAISE; END IF;
  END;
END
$$;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.operator_runs
  WHERE user_id = '181e1811-1811-4181-8181-1811111111a4';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'setter could not read their own run';
  END IF;
END
$$;

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '181e1811-1811-4181-8181-1811111111a2', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '181e1811-1811-4181-8181-1811111111a2', false);

INSERT INTO public.operator_runs (
  id, org_id, member_id, user_id, request_text, status
) VALUES (
  '181e1811-1811-4181-8181-1811111111d2',
  '181e1811-1811-4181-8181-1811111111a1',
  '181e1811-1811-4181-8181-1811111111a3',
  '181e1811-1811-4181-8181-1811111111a2',
  'Owner run',
  'completed'
);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.operator_runs
  WHERE org_id = '181e1811-1811-4181-8181-1811111111a1';
  IF v_count < 2 THEN
    RAISE EXCEPTION 'owner should see setter runs in this org, saw %', v_count;
  END IF;
END
$$;

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '181e1811-1811-4181-8181-1811111111a4', false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '181e1811-1811-4181-8181-1811111111a4', false);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.operator_runs
  WHERE user_id = '181e1811-1811-4181-8181-1811111111a2';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'setter saw % owner runs', v_count;
  END IF;
END
$$;

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '181e1811-1811-4181-8181-1811111111b2', false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '181e1811-1811-4181-8181-1811111111b2', false);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.operator_runs
  WHERE org_id = '181e1811-1811-4181-8181-1811111111a1';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'other org saw % operator runs', v_count;
  END IF;

  BEGIN
    PERFORM public.consume_operator_agent_rate_limit(
      '181e1811-1811-4181-8181-1811111111a1',
      'user',
      20,
      3600
    );
    RAISE EXCEPTION 'other org consumed this org rate limit';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%other org consumed%' THEN RAISE; END IF;
  END;
END
$$;

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '181e1811-1811-4181-8181-1811111111a4', false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '181e1811-1811-4181-8181-1811111111a4', false);

DO $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT (public.consume_operator_agent_rate_limit(
    '181e1811-1811-4181-8181-1811111111a1',
    'user',
    20,
    3600
  )->>'allowed')::boolean INTO v_ok;
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'member rate limit should allow the first hit';
  END IF;
END
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $$
DECLARE
  v_relrowsecurity boolean;
BEGIN
  SELECT c.relrowsecurity INTO v_relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'operator_runs';
  IF v_relrowsecurity IS NOT TRUE THEN
    RAISE EXCEPTION 'operator_runs RLS is off';
  END IF;
END
$$;
