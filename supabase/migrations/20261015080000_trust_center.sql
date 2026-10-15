-- Trust center settings, subprocessors, security documents, and data requests.
-- Public readers get a projection that never includes an internal mailbox.

ALTER TABLE public.access_requests DROP CONSTRAINT IF EXISTS access_requests_kind_check;
ALTER TABLE public.access_requests
  ADD CONSTRAINT access_requests_kind_check
  CHECK (kind IN ('private_access', 'custom', 'security_review', 'vulnerability'));

ALTER TABLE public.access_requests DROP CONSTRAINT IF EXISTS access_requests_status_check;
ALTER TABLE public.access_requests
  ADD CONSTRAINT access_requests_status_check
  CHECK (status IN (
    'new', 'in_review', 'approved', 'waitlisted', 'declined', 'converted', 'archived',
    'waiting', 'answered', 'closed'
  ));

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS request_role text,
  ADD COLUMN IF NOT EXISTS review_needs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deadline date,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS existing_customer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workspace_org_id uuid;

CREATE TABLE IF NOT EXISTS public.public_site_settings (
  id integer PRIMARY KEY DEFAULT 1,
  security_email text NOT NULL DEFAULT 'contact@vistrial.io',
  vulnerability_email text NOT NULL DEFAULT 'contact@vistrial.io',
  privacy_email text NOT NULL DEFAULT 'contact@vistrial.io',
  legal_email text NOT NULL DEFAULT 'contact@vistrial.io',
  support_email text NOT NULL DEFAULT 'contact@vistrial.io',
  internal_forward_email text,
  security_updated_on date NOT NULL DEFAULT DATE '2026-10-14',
  subprocessors_updated_on date NOT NULL DEFAULT DATE '2026-10-14',
  privacy_updated_on date NOT NULL DEFAULT DATE '2026-10-14',
  terms_updated_on date NOT NULL DEFAULT DATE '2026-10-14',
  legal_entity_name text,
  mailing_address text,
  governing_place text NOT NULL DEFAULT 'Maryland, United States',
  switch_ai_no_training boolean NOT NULL DEFAULT false,
  switch_encryption_at_rest boolean NOT NULL DEFAULT false,
  switch_backups boolean NOT NULL DEFAULT false,
  switch_no_sell boolean NOT NULL DEFAULT false,
  switch_staff_mfa boolean NOT NULL DEFAULT false,
  privacy_approved boolean NOT NULL DEFAULT false,
  terms_approved boolean NOT NULL DEFAULT false,
  vulnerability_safe_harbor_approved boolean NOT NULL DEFAULT false,
  security_txt_expires_on date NOT NULL DEFAULT (DATE '2026-10-15' + 365),
  security_txt_reminded boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_site_settings_singleton CHECK (id = 1)
);

INSERT INTO public.public_site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.public_site_setting_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  field text NOT NULL,
  from_value text,
  to_value text
);

CREATE TABLE IF NOT EXISTS public.subprocessors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,
  purpose text NOT NULL,
  data_handled text NOT NULL,
  location text,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subprocessor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  subprocessor_id uuid,
  kind text NOT NULL,
  detail text
);

CREATE TABLE IF NOT EXISTS public.security_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.security_document_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.security_documents (id),
  request_id uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid
);

CREATE TABLE IF NOT EXISTS public.trust_data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  org_id uuid,
  requester_name text,
  requester_email text,
  details text,
  result_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trust_data_requests_kind CHECK (kind IN ('export', 'deletion', 'correction', 'lead_passthrough')),
  CONSTRAINT trust_data_requests_status CHECK (status IN ('received', 'verifying', 'in_progress', 'completed', 'declined'))
);

CREATE TABLE IF NOT EXISTS public.trust_data_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.trust_data_requests (id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  kind text NOT NULL,
  detail text
);

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  user_id uuid NOT NULL,
  document text NOT NULL,
  version_on date NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document, version_on)
);

ALTER TABLE public.public_site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_site_setting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subprocessors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subprocessor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_document_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_data_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_site_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.public_site_setting_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.subprocessors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.subprocessor_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.security_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.security_document_sends FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trust_data_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trust_data_request_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.legal_acceptances FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.public_site_settings TO authenticated;
GRANT SELECT ON TABLE public.public_site_setting_events TO authenticated;
GRANT SELECT ON TABLE public.subprocessors TO authenticated;
GRANT SELECT ON TABLE public.security_documents TO authenticated;
GRANT SELECT ON TABLE public.security_document_sends TO authenticated;
GRANT SELECT ON TABLE public.trust_data_requests TO authenticated;
GRANT SELECT ON TABLE public.trust_data_request_events TO authenticated;
GRANT SELECT ON TABLE public.legal_acceptances TO authenticated;
GRANT ALL ON TABLE public.public_site_settings TO service_role;
GRANT ALL ON TABLE public.public_site_setting_events TO service_role;
GRANT ALL ON TABLE public.subprocessors TO service_role;
GRANT ALL ON TABLE public.subprocessor_events TO service_role;
GRANT ALL ON TABLE public.security_documents TO service_role;
GRANT ALL ON TABLE public.security_document_sends TO service_role;
GRANT ALL ON TABLE public.trust_data_requests TO service_role;
GRANT ALL ON TABLE public.trust_data_request_events TO service_role;
GRANT ALL ON TABLE public.legal_acceptances TO service_role;

CREATE POLICY public_site_settings_admin ON public.public_site_settings
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY public_site_setting_events_admin ON public.public_site_setting_events
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY subprocessors_admin ON public.subprocessors
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY security_documents_admin ON public.security_documents
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY security_document_sends_admin ON public.security_document_sends
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY trust_data_requests_select ON public.trust_data_requests
  FOR SELECT TO authenticated USING (
    public.is_platform_admin()
    OR (org_id IS NOT NULL AND public.user_member_id(org_id) IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = trust_data_requests.org_id AND m.user_id = auth.uid() AND m.role = 'owner' AND m.active
    ))
  );
CREATE POLICY trust_data_request_events_select ON public.trust_data_request_events
  FOR SELECT TO authenticated USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.trust_data_requests r
      JOIN public.org_members m ON m.org_id = r.org_id
      WHERE r.id = trust_data_request_events.request_id AND m.user_id = auth.uid() AND m.role = 'owner' AND m.active
    )
  );
CREATE POLICY legal_acceptances_own ON public.legal_acceptances
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin());

INSERT INTO public.subprocessors (company, purpose, data_handled, location, published, sort_order)
SELECT * FROM (VALUES
  ('Supabase', 'Database, sign-in, and file storage', 'Workspace records and account records', NULL, false, 1),
  ('Vercel', 'Hosting for the app and the website', 'Request logs from the hosted app', NULL, false, 2),
  ('Stripe', 'Payments', 'A billing customer reference. Full card numbers are not stored in Vistrial.', NULL, false, 3),
  ('Resend', 'Email delivery', 'Recipient addresses and notification text. Lead message text is not included.', NULL, false, 4),
  ('Anthropic', 'Model calls for Scribe, Relay, and Compass', 'Case file context sent for a single answer or draft', NULL, false, 5)
) AS seed(company, purpose, data_handled, location, published, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.subprocessors);

CREATE OR REPLACE FUNCTION public.public_trust_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'security_email', s.security_email,
    'vulnerability_email', s.vulnerability_email,
    'privacy_email', s.privacy_email,
    'legal_email', s.legal_email,
    'support_email', s.support_email,
    'security_updated_on', s.security_updated_on,
    'subprocessors_updated_on', s.subprocessors_updated_on,
    'privacy_updated_on', s.privacy_updated_on,
    'terms_updated_on', s.terms_updated_on,
    'legal_entity_name', NULLIF(btrim(COALESCE(s.legal_entity_name, '')), ''),
    'mailing_address', NULLIF(btrim(COALESCE(s.mailing_address, '')), ''),
    'governing_place', s.governing_place,
    'switch_ai_no_training', s.switch_ai_no_training,
    'switch_encryption_at_rest', s.switch_encryption_at_rest,
    'switch_backups', s.switch_backups,
    'switch_no_sell', s.switch_no_sell,
    'switch_staff_mfa', s.switch_staff_mfa,
    'privacy_live', s.privacy_approved AND NULLIF(btrim(COALESCE(s.legal_entity_name, '')), '') IS NOT NULL AND NULLIF(btrim(COALESCE(s.mailing_address, '')), '') IS NOT NULL,
    'terms_live', s.terms_approved AND NULLIF(btrim(COALESCE(s.legal_entity_name, '')), '') IS NOT NULL AND NULLIF(btrim(COALESCE(s.mailing_address, '')), '') IS NOT NULL,
    'safe_harbor_live', s.vulnerability_safe_harbor_approved,
    'security_txt_expires_on', s.security_txt_expires_on
  )
  FROM public.public_site_settings s
  WHERE s.id = 1;
$$;

REVOKE ALL ON FUNCTION public.public_trust_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_trust_snapshot() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_subprocessors()
RETURNS TABLE (company text, purpose text, data_handled text, location text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.company, p.purpose, p.data_handled, p.location
  FROM public.subprocessors p
  WHERE p.published AND NULLIF(btrim(COALESCE(p.location, '')), '') IS NOT NULL
  ORDER BY p.sort_order, p.company;
$$;

REVOKE ALL ON FUNCTION public.public_subprocessors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_subprocessors() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_trust_request(p_payload jsonb, p_ip text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_email text;
  v_name text;
  v_business text;
  v_limit jsonb;
  v_id uuid;
  v_needs text[] := '{}';
  v_item jsonb;
BEGIN
  IF p_payload IS NULL OR octet_length(p_payload::text) > 12000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;
  v_kind := p_payload->>'kind';
  v_email := lower(public.access_request_clean(p_payload->>'email', 200));
  v_name := public.access_request_clean(p_payload->>'fullName', 120);
  v_business := public.access_request_clean(p_payload->>'businessName', 160);
  IF v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    v_limit := public.consume_rate_limit(md5('access-email:' || v_email), 5, 3600);
    IF COALESCE((v_limit->>'allowed')::boolean, false) IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'code', 'rate');
    END IF;
  END IF;
  v_limit := public.consume_rate_limit(md5('access-ip:' || left(COALESCE(p_ip, '0'), 80)), 20, 3600);
  IF COALESCE((v_limit->>'allowed')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate');
  END IF;
  IF public.access_request_clean(p_payload->>'honeypot', 200) <> '' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF v_kind NOT IN ('security_review', 'vulnerability')
     OR v_name = '' OR v_business = ''
     OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     OR COALESCE(p_payload->>'consent', '') IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;
  IF v_kind = 'security_review' AND public.access_request_clean(p_payload->>'role', 80) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;
  IF jsonb_typeof(p_payload->'needs') = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'needs') LOOP
      IF jsonb_typeof(v_item) = 'string' THEN
        v_needs := array_append(v_needs, left(v_item#>>'{}', 80));
      END IF;
    END LOOP;
  END IF;
  INSERT INTO public.access_requests (
    kind, full_name, email, business_name, request_role, review_needs, deadline, problem, priority, page_path
  ) VALUES (
    v_kind,
    v_name,
    v_email,
    v_business,
    NULLIF(public.access_request_clean(p_payload->>'role', 80), ''),
    v_needs,
    NULLIF(p_payload->>'deadline', '')::date,
    NULLIF(left(public.access_request_clean(p_payload->>'details', 2000), 2000), ''),
    CASE WHEN v_kind = 'vulnerability' THEN 10 ELSE 1 END,
    CASE WHEN v_kind = 'vulnerability' THEN '/security/report' ELSE '/security/review' END
  ) RETURNING id INTO v_id;
  INSERT INTO public.access_request_events (request_id, kind, to_status) VALUES (v_id, 'submitted', 'new');
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RETURN jsonb_build_object('ok', false, 'code', 'invalid');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_trust_request(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_trust_request(jsonb, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_access_request_status(p_id uuid, p_status text, p_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
  v_version integer;
BEGIN
  PERFORM public.access_requests_require_admin();
  IF p_status NOT IN ('new', 'in_review', 'approved', 'waitlisted', 'declined', 'archived', 'waiting', 'answered', 'closed') THEN
    RAISE EXCEPTION 'Choose a status the queue allows.';
  END IF;
  SELECT status INTO v_old FROM public.access_requests WHERE id = p_id AND version = p_version AND status <> 'converted';
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.access_requests WHERE id = p_id) THEN
      RAISE EXCEPTION 'Someone else just updated this request. Refresh the page and try again.';
    END IF;
    RAISE EXCEPTION 'That request is not available.';
  END IF;
  UPDATE public.access_requests
  SET status = p_status, version = version + 1, updated_at = now(), last_activity_at = now()
  WHERE id = p_id AND version = p_version
  RETURNING version INTO v_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Someone else just updated this request. Refresh the page and try again.';
  END IF;
  INSERT INTO public.access_request_events (request_id, actor_id, kind, from_status, to_status)
  VALUES (p_id, auth.uid(), 'status', v_old, p_status);
  RETURN jsonb_build_object('ok', true, 'version', v_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_public_site_setting(p_field text, p_value text, p_bump_date boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
  v_value text := NULLIF(btrim(COALESCE(p_value, '')), '');
BEGIN
  PERFORM public.access_requests_require_admin();
  IF p_field NOT IN (
    'security_email','vulnerability_email','privacy_email','legal_email','support_email','internal_forward_email',
    'legal_entity_name','mailing_address','governing_place',
    'switch_ai_no_training','switch_encryption_at_rest','switch_backups','switch_no_sell','switch_staff_mfa',
    'privacy_approved','terms_approved','vulnerability_safe_harbor_approved'
  ) THEN
    RAISE EXCEPTION 'That setting is not editable.';
  END IF;
  EXECUTE format('SELECT %I::text FROM public.public_site_settings WHERE id = 1', p_field) INTO v_old;
  IF p_field LIKE 'switch_%' OR p_field IN ('privacy_approved','terms_approved','vulnerability_safe_harbor_approved') THEN
    EXECUTE format('UPDATE public.public_site_settings SET %I = $1, updated_at = now() WHERE id = 1', p_field) USING (v_value = 'true');
  ELSE
    EXECUTE format('UPDATE public.public_site_settings SET %I = $1, updated_at = now() WHERE id = 1', p_field) USING v_value;
  END IF;
  IF p_bump_date AND p_field IN ('legal_entity_name','mailing_address') THEN
    UPDATE public.public_site_settings
    SET privacy_updated_on = CURRENT_DATE, terms_updated_on = CURRENT_DATE
    WHERE id = 1;
  END IF;
  INSERT INTO public.public_site_setting_events (actor_id, field, from_value, to_value)
  VALUES (auth.uid(), p_field, v_old, COALESCE(v_value, 'false'));
END;
$$;

REVOKE ALL ON FUNCTION public.update_public_site_setting(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_public_site_setting(text, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bump_public_page_date(p_page text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.access_requests_require_admin();
  IF p_page = 'security' THEN
    UPDATE public.public_site_settings SET security_updated_on = CURRENT_DATE WHERE id = 1;
  ELSIF p_page = 'subprocessors' THEN
    UPDATE public.public_site_settings SET subprocessors_updated_on = CURRENT_DATE WHERE id = 1;
  ELSIF p_page = 'privacy' THEN
    UPDATE public.public_site_settings SET privacy_updated_on = CURRENT_DATE WHERE id = 1;
  ELSIF p_page = 'terms' THEN
    UPDATE public.public_site_settings SET terms_updated_on = CURRENT_DATE WHERE id = 1;
  ELSE
    RAISE EXCEPTION 'Choose a page date to update.';
  END IF;
  INSERT INTO public.public_site_setting_events (actor_id, field, to_value)
  VALUES (auth.uid(), p_page || '_updated_on', CURRENT_DATE::text);
END;
$$;

REVOKE ALL ON FUNCTION public.bump_public_page_date(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bump_public_page_date(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_subprocessor(p_id uuid, p_company text, p_purpose text, p_data text, p_location text, p_published boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := COALESCE(p_id, gen_random_uuid());
BEGIN
  PERFORM public.access_requests_require_admin();
  IF public.access_request_clean(p_company, 120) = '' THEN
    RAISE EXCEPTION 'A company name is required.';
  END IF;
  INSERT INTO public.subprocessors (id, company, purpose, data_handled, location, published)
  VALUES (v_id, public.access_request_clean(p_company, 120), public.access_request_clean(p_purpose, 300), public.access_request_clean(p_data, 400), NULLIF(public.access_request_clean(p_location, 120), ''), COALESCE(p_published, false))
  ON CONFLICT (id) DO UPDATE SET
    company = EXCLUDED.company,
    purpose = EXCLUDED.purpose,
    data_handled = EXCLUDED.data_handled,
    location = EXCLUDED.location,
    published = EXCLUDED.published,
    updated_at = now();
  INSERT INTO public.subprocessor_events (actor_id, subprocessor_id, kind, detail)
  VALUES (auth.uid(), v_id, 'save', public.access_request_clean(p_company, 120));
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_subprocessor(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_subprocessor(uuid, text, text, text, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_owner_data_request(p_kind text, p_details text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_ref text;
  v_id uuid;
BEGIN
  SELECT m.org_id INTO v_org
  FROM public.org_members m
  WHERE m.user_id = auth.uid() AND m.role = 'owner' AND m.active
  ORDER BY m.created_at
  LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Only a Workspace Owner can submit this.' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('export', 'deletion', 'correction') THEN
    RAISE EXCEPTION 'Choose export, deletion, or correction.';
  END IF;
  v_ref := 'DR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.trust_data_requests (reference, kind, org_id, requester_email, details)
  VALUES (
    v_ref,
    p_kind,
    v_org,
    (SELECT lower(email) FROM auth.users WHERE id = auth.uid()),
    NULLIF(left(btrim(COALESCE(p_details, '')), 2000), '')
  ) RETURNING id INTO v_id;
  INSERT INTO public.trust_data_request_events (request_id, actor_id, kind, detail)
  VALUES (v_id, auth.uid(), 'received', p_kind);
  RETURN v_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_owner_data_request(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_owner_data_request(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_lead_data_note(p_name text, p_email text, p_business text, p_details text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_id uuid;
  v_email text := lower(public.access_request_clean(p_email, 200));
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR public.access_request_clean(p_details, 2000) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;
  v_ref := 'DR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.trust_data_requests (reference, kind, requester_name, requester_email, details)
  VALUES (v_ref, 'lead_passthrough', public.access_request_clean(p_name, 120), v_email, left(public.access_request_clean(p_details, 2000), 2000))
  RETURNING id INTO v_id;
  INSERT INTO public.trust_data_request_events (request_id, kind, detail) VALUES (v_id, 'received', 'lead');
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_lead_data_note(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_lead_data_note(text, text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_data_request(p_id uuid, p_status text, p_note text, p_confirm boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.access_requests_require_admin();
  IF p_confirm IS NOT TRUE THEN
    RAISE EXCEPTION 'Confirm this action before it is recorded.';
  END IF;
  IF p_status NOT IN ('verifying', 'in_progress', 'completed', 'declined') THEN
    RAISE EXCEPTION 'Choose a status the queue allows.';
  END IF;
  UPDATE public.trust_data_requests
  SET status = p_status, result_note = NULLIF(left(btrim(COALESCE(p_note, '')), 2000), ''), updated_at = now()
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request is not available.';
  END IF;
  INSERT INTO public.trust_data_request_events (request_id, actor_id, kind, detail)
  VALUES (p_id, auth.uid(), p_status, left(btrim(COALESCE(p_note, '')), 300));
END;
$$;

REVOKE ALL ON FUNCTION public.complete_data_request(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_data_request(uuid, text, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_legal_versions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_privacy date;
  v_terms date;
  v_live boolean;
BEGIN
  SELECT privacy_updated_on, terms_updated_on,
    privacy_approved AND terms_approved
      AND NULLIF(btrim(COALESCE(legal_entity_name, '')), '') IS NOT NULL
      AND NULLIF(btrim(COALESCE(mailing_address, '')), '') IS NOT NULL
  INTO v_privacy, v_terms, v_live
  FROM public.public_site_settings WHERE id = 1;
  IF v_live IS NOT TRUE OR auth.uid() IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.legal_acceptances (user_id, document, version_on)
  VALUES (auth.uid(), 'privacy', v_privacy), (auth.uid(), 'terms', v_terms)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_legal_versions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_legal_versions() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.legal_acceptance_due()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT s.privacy_approved AND s.terms_approved
      AND NULLIF(btrim(COALESCE(s.legal_entity_name, '')), '') IS NOT NULL
      AND NULLIF(btrim(COALESCE(s.mailing_address, '')), '') IS NOT NULL
      AND (
        NOT EXISTS (SELECT 1 FROM public.legal_acceptances a WHERE a.user_id = auth.uid() AND a.document = 'privacy' AND a.version_on = s.privacy_updated_on)
        OR NOT EXISTS (SELECT 1 FROM public.legal_acceptances a WHERE a.user_id = auth.uid() AND a.document = 'terms' AND a.version_on = s.terms_updated_on)
      )
    FROM public.public_site_settings s WHERE s.id = 1
  ), false);
$$;

REVOKE ALL ON FUNCTION public.legal_acceptance_due() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_acceptance_due() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_owner_security_review(p_details text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_name text;
  v_email text;
  v_business text;
  v_id uuid;
BEGIN
  SELECT m.org_id, m.display_name, lower(m.email), o.name
  INTO v_org, v_name, v_email, v_business
  FROM public.org_members m
  JOIN public.organizations o ON o.id = m.org_id
  WHERE m.user_id = auth.uid() AND m.role = 'owner' AND m.active
  ORDER BY m.created_at
  LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Only a Workspace Owner can submit this.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.access_requests (
    kind, full_name, email, business_name, request_role, review_needs, problem,
    priority, existing_customer, workspace_org_id, page_path
  ) VALUES (
    'security_review', v_name, v_email, v_business, 'Workspace Owner', ARRAY['general'],
    NULLIF(left(btrim(COALESCE(p_details, '')), 2000), ''),
    5, true, v_org, '/app/help'
  ) RETURNING id INTO v_id;
  INSERT INTO public.access_request_events (request_id, actor_id, kind, to_status)
  VALUES (v_id, auth.uid(), 'submitted', 'new');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_owner_security_review(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_owner_security_review(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_security_document(p_title text, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.access_requests_require_admin();
  IF public.access_request_clean(p_title, 160) = '' THEN
    RAISE EXCEPTION 'A title is required.';
  END IF;
  INSERT INTO public.security_documents (title, body, created_by)
  VALUES (public.access_request_clean(p_title, 160), left(COALESCE(p_body, ''), 20000), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_security_document(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_security_document(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_security_document_send(p_document uuid, p_request uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.access_requests_require_admin();
  INSERT INTO public.security_document_sends (document_id, request_id, sent_by)
  VALUES (p_document, p_request, auth.uid());
  INSERT INTO public.access_request_events (request_id, actor_id, kind, detail)
  VALUES (p_request, auth.uid(), 'document', jsonb_build_object('document_id', p_document));
END;
$$;

REVOKE ALL ON FUNCTION public.record_security_document_send(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_security_document_send(uuid, uuid) TO authenticated, service_role;
