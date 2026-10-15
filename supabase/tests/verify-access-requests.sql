-- Public access requests stay out of customer workspaces.
-- Anon can submit and cannot read. Customers cannot read. Service Team
-- reads only with a grant, and cannot delete or export.

CREATE FUNCTION pg_temp.check(p_ok boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'access request check failed: %', p_message;
  END IF;
END;
$$;

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

CREATE FUNCTION pg_temp.call_as(p_user uuid, p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_text text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user::text, ''), true);
  IF p_user IS NULL THEN
    SET LOCAL ROLE anon;
  ELSE
    SET LOCAL ROLE authenticated;
  END IF;
  BEGIN
    EXECUTE p_sql INTO v_text;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RETURN 'denied:' || SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN COALESCE(v_text, 'ok');
END;
$$;

INSERT INTO auth.users (id, email) VALUES
  ('17aa0000-0000-4000-8000-000000000001', 'access-admin@vistrial.test'),
  ('17aa0000-0000-4000-8000-000000000002', 'access-service@vistrial.test'),
  ('17aa0000-0000-4000-8000-000000000003', 'access-owner@vistrial.test'),
  ('17aa0000-0000-4000-8000-000000000004', 'already-customer@example.test');

INSERT INTO public.platform_staff (user_id, role, display_name, email) VALUES
  ('17aa0000-0000-4000-8000-000000000001', 'platform_admin', 'Access Admin', 'access-admin@vistrial.test'),
  ('17aa0000-0000-4000-8000-000000000002', 'service_team', 'Access Service', 'access-service@vistrial.test');

SELECT pg_temp.check(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'access_requests' AND column_name = 'org_id'
  ),
  'requests are not stored on a workspace'
);

SELECT pg_temp.check(
  pg_temp.call_as(NULL, $q$SELECT count(*)::text FROM public.access_requests$q$) LIKE 'denied:%',
  'anon cannot read requests'
);

SELECT pg_temp.check(
  pg_temp.count_as('17aa0000-0000-4000-8000-000000000003', $q$SELECT count(*) FROM public.access_requests$q$) = 0,
  'a customer cannot read requests'
);

SELECT pg_temp.check(
  pg_temp.count_as('17aa0000-0000-4000-8000-000000000002', $q$SELECT count(*) FROM public.access_requests$q$) = 0,
  'service team cannot read requests until granted'
);

SELECT pg_temp.check(
  pg_temp.call_as(NULL, $q$
    SELECT public.submit_access_request(
      jsonb_build_object(
        'kind', 'private_access',
        'fullName', 'Ada Owner',
        'email', 'ada@northline.example',
        'businessName', 'Northline',
        'businessType', 'med-spa',
        'teamSize', '2_5',
        'dealValue', '2500_10000',
        'callsPerWeek', '5_20',
        'leadsPerMonth', '20_100',
        'crm', 'gohighlevel',
        'consent', 'true',
        'pagePath', '/request',
        'honeypot', ''
      ),
      '203.0.113.10'
    )::text
  $q$) = '{"ok": true}',
  'anon can submit and learns nothing else'
);

SELECT pg_temp.check(
  (SELECT count(*) FROM public.access_requests WHERE email = 'ada@northline.example') = 1,
  'the request was stored'
);

SELECT pg_temp.check(
  pg_temp.call_as(NULL, $q$
    SELECT public.submit_access_request(
      jsonb_build_object(
        'kind', 'private_access',
        'fullName', 'Ada Owner',
        'email', 'ada@northline.example',
        'businessName', 'Northline Studio',
        'businessType', 'med-spa',
        'teamSize', '2_5',
        'dealValue', '2500_10000',
        'callsPerWeek', '5_20',
        'leadsPerMonth', '20_100',
        'consent', 'true',
        'honeypot', ''
      ),
      '203.0.113.10'
    )::text
  $q$) = '{"ok": true}',
  'a second submit from the same email still says only ok'
);

SELECT pg_temp.check(
  (SELECT count(*) FROM public.access_requests WHERE lower(email) = 'ada@northline.example') = 1
  AND (SELECT business_name FROM public.access_requests WHERE email = 'ada@northline.example') = 'Northline Studio'
  AND (SELECT count(*) FROM public.access_request_events e JOIN public.access_requests r ON r.id = e.request_id WHERE r.email = 'ada@northline.example') >= 2,
  'the same email updates the row and keeps history'
);

SELECT pg_temp.check(
  pg_temp.call_as(NULL, $q$
    SELECT public.submit_access_request(
      jsonb_build_object(
        'kind', 'custom',
        'fullName', 'Bot',
        'email', 'bot@example.test',
        'businessName', 'Bot Co',
        'need', 'spam',
        'consent', 'true',
        'honeypot', 'http://spam.example'
      ),
      '203.0.113.11'
    )::text
  $q$) = '{"ok": true}'
  AND NOT EXISTS (SELECT 1 FROM public.access_requests WHERE email = 'bot@example.test'),
  'the trap field does not store a request'
);

SELECT pg_temp.check(
  pg_temp.call_as(NULL, $q$
    SELECT public.submit_access_request(
      jsonb_build_object(
        'kind', 'private_access',
        'fullName', 'Known',
        'email', 'already-customer@example.test',
        'businessName', 'Known Co',
        'businessType', 'home-services',
        'teamSize', '6_15',
        'dealValue', 'above_10000',
        'callsPerWeek', '21_50',
        'leadsPerMonth', '101_400',
        'consent', 'true',
        'honeypot', ''
      ),
      '203.0.113.12'
    )::text
  $q$) = '{"ok": true}',
  'an existing account gets the same ok reply'
);

SELECT pg_temp.check(
  (SELECT existing_account FROM public.access_requests WHERE email = 'already-customer@example.test'),
  'an existing account is flagged internally and not mentioned in the reply'
);

SELECT pg_temp.check(
  pg_temp.call_as('17aa0000-0000-4000-8000-000000000002', $q$
    SELECT public.delete_access_request(
      (SELECT id FROM public.access_requests WHERE email = 'ada@northline.example'),
      'no'
    )::text
  $q$) LIKE 'denied:%',
  'service team cannot delete'
);

UPDATE public.platform_staff
SET can_view_access_requests = true
WHERE user_id = '17aa0000-0000-4000-8000-000000000002';

SELECT pg_temp.check(
  pg_temp.count_as('17aa0000-0000-4000-8000-000000000002', $q$SELECT count(*) FROM public.access_requests$q$) >= 1,
  'a granted service team member can read'
);

SELECT pg_temp.check(
  pg_temp.call_as('17aa0000-0000-4000-8000-000000000002', $q$
    SELECT public.log_access_request_export(1)::text
  $q$) LIKE 'denied:%',
  'service team cannot export'
);

SELECT pg_temp.check(
  pg_temp.call_as('17aa0000-0000-4000-8000-000000000001', $q$
    SELECT public.set_access_request_status(
      (SELECT id FROM public.access_requests WHERE email = 'ada@northline.example'),
      'in_review',
      (SELECT version FROM public.access_requests WHERE email = 'ada@northline.example')
    )::text
  $q$) LIKE '%"ok": true%',
  'a platform admin can change status'
);

SELECT pg_temp.check(
  pg_temp.call_as('17aa0000-0000-4000-8000-000000000001', $q$
    SELECT public.set_access_request_status(
      (SELECT id FROM public.access_requests WHERE email = 'ada@northline.example'),
      'approved',
      1
    )::text
  $q$) LIKE 'denied:%',
  'a stale version does not overwrite a newer edit'
);

INSERT INTO public.access_requests (
  kind, status, full_name, email, business_name, last_activity_at, created_at
) VALUES (
  'custom', 'declined', 'Old', 'old-request@example.test', 'Old Co', now() - interval '13 months', now() - interval '13 months'
);

SELECT pg_temp.check(public.purge_expired_access_requests() >= 1, 'old inactive requests are deleted');
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM public.access_requests WHERE email = 'old-request@example.test')
  AND EXISTS (SELECT 1 FROM public.access_request_deletions WHERE reason = 'Retention period ended.'),
  'deletion is recorded without keeping the request'
);

SELECT pg_temp.check(
  pg_temp.call_as(NULL, $q$SELECT public.access_request_confirmation_batch(5)::text$q$) LIKE 'denied:%',
  'anon cannot read the confirmation batch'
);
