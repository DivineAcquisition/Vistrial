-- Public access requests. Platform-level, not inside a customer workspace.
--
-- Visitors can only call submit_access_request, which inserts or updates one
-- row and returns ok or a short code. They cannot read the table.
-- Platform Admins manage the queue. Service Team can read only when
-- can_view_access_requests is granted, and cannot export or delete.
-- Nothing here creates billing.

CREATE OR REPLACE FUNCTION public.access_request_clean(p_value text, p_max integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(
    regexp_replace(btrim(COALESCE(p_value, '')), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'),
    GREATEST(p_max, 0)
  );
$$;

REVOKE ALL ON FUNCTION public.access_request_clean(text, integer) FROM PUBLIC, anon, authenticated;

CREATE TABLE public.access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  full_name text NOT NULL,
  email text NOT NULL,
  business_name text NOT NULL,
  website text,
  business_type text,
  business_type_other text,
  team_size text,
  lead_sources text[] NOT NULL DEFAULT '{}',
  lead_sources_other text,
  crm text,
  crm_other text,
  deal_value text,
  calls_per_week text,
  leads_per_month text,
  problem text,
  heard_about text,
  phone text,
  need text,
  page_path text,
  campaign jsonb NOT NULL DEFAULT '{}'::jsonb,
  existing_account boolean NOT NULL DEFAULT false,
  owner_user_id uuid REFERENCES public.platform_staff (user_id) ON DELETE SET NULL,
  converted_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  confirmation_status text NOT NULL DEFAULT 'pending',
  confirmation_attempts integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT access_requests_kind_check CHECK (kind IN ('private_access', 'custom')),
  CONSTRAINT access_requests_status_check CHECK (
    status IN ('new', 'in_review', 'approved', 'waitlisted', 'declined', 'converted', 'archived')
  ),
  CONSTRAINT access_requests_confirmation_check CHECK (confirmation_status IN ('pending', 'sent', 'failed')),
  CONSTRAINT access_requests_problem_len CHECK (problem IS NULL OR char_length(problem) <= 1000),
  CONSTRAINT access_requests_need_len CHECK (need IS NULL OR char_length(need) <= 1000)
);

CREATE UNIQUE INDEX access_requests_email_lower ON public.access_requests (lower(email));
CREATE INDEX access_requests_status_activity ON public.access_requests (status, last_activity_at DESC);

COMMENT ON TABLE public.access_requests IS
  'Public Private Access and Custom requests. Isolated from customer workspaces. No org_id.';

CREATE TABLE public.access_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.access_requests (id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  kind text NOT NULL,
  from_status text,
  to_status text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX access_request_events_request ON public.access_request_events (request_id, at DESC);

CREATE TABLE public.access_request_settings (
  id integer PRIMARY KEY DEFAULT 1,
  onboard_intent integer NOT NULL DEFAULT 5,
  retention_months integer NOT NULL DEFAULT 12,
  stale_business_days integer NOT NULL DEFAULT 2,
  staff_timezone text NOT NULL DEFAULT 'America/New_York',
  fit_rules jsonb NOT NULL DEFAULT '[
    {"id":"industry","field":"business_type","in":["med-spa","home-services","coaches-consultants"],"pass":"Industry matches a template.","fail":"Industry does not match a current template."},
    {"id":"crm","field":"crm","in":["gohighlevel"],"pass":"CRM is supported.","fail":"CRM is not a connector that works today."},
    {"id":"deal","field":"deal_value","in":["1000_2500","2500_10000","above_10000"],"pass":"Average deal value is in the target range.","fail":"Average deal value is below the range this page is written for."},
    {"id":"calls","field":"calls_per_week","in":["5_20","21_50"],"pass":"Sales calls per week are within normal range.","fail":"Sales calls per week are outside the usual range."}
  ]'::jsonb,
  last_staff_notice_at timestamptz,
  last_stale_notice_at timestamptz,
  abuse_notice_due boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_request_settings_singleton CHECK (id = 1),
  CONSTRAINT access_request_settings_ranges CHECK (
    onboard_intent BETWEEN 0 AND 500
    AND retention_months BETWEEN 1 AND 84
    AND stale_business_days BETWEEN 1 AND 30
  )
);

INSERT INTO public.access_request_settings (id) VALUES (1);

CREATE TABLE public.access_request_templates (
  id text PRIMARY KEY,
  label text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_request_templates_body CHECK (char_length(body) <= 4000 AND char_length(subject) <= 200)
);

INSERT INTO public.access_request_templates (id, label, subject, body) VALUES
  (
    'access_confirm',
    'Private Access confirmation',
    'We received your Vistrial request',
    E'Hello {{name}},\n\nWe received your request for Private Access. A person on the Vistrial team will review it.\n\n[CONFIRM: we reply within 2 business days.]\n\nReply to this email if something you sent needs a correction. This note does not include the details you submitted.\n\nVistrial'
  ),
  (
    'custom_confirm',
    'Custom confirmation',
    'We received your note to Vistrial',
    E'Hello {{name}},\n\nWe received your note. A person on the Vistrial team will read it.\n\n[CONFIRM: we reply within 2 business days.]\n\nReply to this email if something needs a correction. This note does not include the details you submitted.\n\nVistrial'
  ),
  (
    'declined',
    'Declined',
    'About your Vistrial request',
    E'Hello {{name}},\n\nThank you for asking about Vistrial. We are not able to offer access right now.\n\nYou can reply to this email if your situation changes.\n\nVistrial'
  ),
  (
    'waitlisted',
    'Waitlisted',
    'Your Vistrial request is on the list',
    E'Hello {{name}},\n\nWe are keeping your request on the list. We onboard a limited number of teams at a time.\n\n[CONFIRM: what you want this note to promise, if anything.]\n\nVistrial'
  );

CREATE TABLE public.access_request_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.platform_staff (user_id) ON DELETE CASCADE,
  name text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_request_views_name CHECK (char_length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE TABLE public.access_request_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid,
  email_hash text NOT NULL,
  kind text NOT NULL,
  reason text
);

COMMENT ON TABLE public.access_request_deletions IS
  'A record that a request was deleted. The personal fields are not kept.';

CREATE TABLE public.public_site_daily (
  day date NOT NULL,
  event_type text NOT NULL,
  path text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event_type, path),
  CONSTRAINT public_site_daily_count CHECK (count >= 0 AND char_length(path) <= 120)
);

ALTER TABLE public.platform_staff
  ADD COLUMN IF NOT EXISTS can_view_access_requests boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.platform_staff.can_view_access_requests IS
  'Service Team may view public access requests only with this grant. They still cannot export or delete. Platform Admins always can.';

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_request_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_request_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_request_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_request_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_site_daily ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.access_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.access_request_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.access_request_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.access_request_templates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.access_request_views FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.access_request_deletions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.public_site_daily FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.access_requests TO authenticated;
GRANT SELECT ON TABLE public.access_request_events TO authenticated;
GRANT SELECT ON TABLE public.access_request_settings TO authenticated;
GRANT SELECT ON TABLE public.access_request_templates TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.access_request_views TO authenticated;
GRANT SELECT ON TABLE public.public_site_daily TO authenticated;
GRANT SELECT ON TABLE public.access_request_deletions TO authenticated;

GRANT ALL ON TABLE public.access_requests TO service_role;
GRANT ALL ON TABLE public.access_request_events TO service_role;
GRANT ALL ON TABLE public.access_request_settings TO service_role;
GRANT ALL ON TABLE public.access_request_templates TO service_role;
GRANT ALL ON TABLE public.access_request_views TO service_role;
GRANT ALL ON TABLE public.access_request_deletions TO service_role;
GRANT ALL ON TABLE public.public_site_daily TO service_role;

CREATE OR REPLACE FUNCTION public.can_view_access_requests()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.platform_staff s
    WHERE s.user_id = auth.uid()
      AND s.active
      AND s.role = 'service_team'
      AND s.can_view_access_requests
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_access_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_access_requests() TO authenticated, service_role;

CREATE POLICY access_requests_select ON public.access_requests
  FOR SELECT TO authenticated
  USING (public.can_view_access_requests());

CREATE POLICY access_request_events_select ON public.access_request_events
  FOR SELECT TO authenticated
  USING (public.can_view_access_requests());

CREATE POLICY access_request_settings_select ON public.access_request_settings
  FOR SELECT TO authenticated
  USING (public.can_view_access_requests());

CREATE POLICY access_request_templates_select ON public.access_request_templates
  FOR SELECT TO authenticated
  USING (public.can_view_access_requests());

CREATE POLICY access_request_views_select ON public.access_request_views
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.can_view_access_requests());

CREATE POLICY access_request_views_insert ON public.access_request_views
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_access_requests());

CREATE POLICY access_request_views_delete ON public.access_request_views
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.can_view_access_requests());

CREATE POLICY public_site_daily_select ON public.public_site_daily
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY access_request_deletions_select ON public.access_request_deletions
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.submit_access_request(p_payload jsonb, p_ip text)
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
  v_honeypot text;
  v_existing public.access_requests%ROWTYPE;
  v_id uuid;
  v_status text;
  v_account boolean;
  v_limit jsonb;
  v_sources text[] := '{}';
  v_item jsonb;
  v_campaign jsonb := '{}'::jsonb;
  v_key text;
  v_page text;
BEGIN
  IF p_payload IS NULL OR octet_length(p_payload::text) > 12000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;

  v_kind := p_payload->>'kind';
  v_email := lower(public.access_request_clean(p_payload->>'email', 200));
  v_name := public.access_request_clean(p_payload->>'fullName', 120);
  v_business := public.access_request_clean(p_payload->>'businessName', 160);
  v_honeypot := public.access_request_clean(p_payload->>'honeypot', 200);

  IF v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    v_limit := public.consume_rate_limit(md5('access-email:' || v_email), 5, 3600);
    IF COALESCE((v_limit->>'allowed')::boolean, false) IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'code', 'rate');
    END IF;
  END IF;

  v_limit := public.consume_rate_limit(md5('access-ip:' || left(COALESCE(p_ip, '0'), 80)), 20, 3600);
  IF COALESCE((v_limit->>'allowed')::boolean, false) IS NOT TRUE THEN
    IF COALESCE((v_limit->>'count')::int, 0) >= 40 THEN
      UPDATE public.access_request_settings SET abuse_notice_due = true WHERE id = 1;
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'rate');
  END IF;

  IF v_honeypot <> '' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_kind NOT IN ('private_access', 'custom')
     OR v_name = ''
     OR v_business = ''
     OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     OR COALESCE(p_payload->>'consent', '') IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;

  IF v_kind = 'private_access' THEN
    IF public.access_request_clean(p_payload->>'businessType', 80) = ''
       OR public.access_request_clean(p_payload->>'teamSize', 40) = ''
       OR public.access_request_clean(p_payload->>'dealValue', 40) = ''
       OR public.access_request_clean(p_payload->>'callsPerWeek', 40) = ''
       OR public.access_request_clean(p_payload->>'leadsPerMonth', 40) = '' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid');
    END IF;
  ELSIF public.access_request_clean(p_payload->>'need', 1000) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;

  IF jsonb_typeof(p_payload->'leadSources') = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'leadSources') LOOP
      IF jsonb_typeof(v_item) = 'string' AND array_length(v_sources, 1) IS DISTINCT FROM 12 THEN
        v_sources := array_append(v_sources, left(v_item#>>'{}', 40));
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_payload->'campaign') = 'object' THEN
    FOREACH v_key IN ARRAY ARRAY['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','ref','from'] LOOP
      IF COALESCE(p_payload->'campaign'->>v_key, '') <> '' THEN
        v_campaign := v_campaign || jsonb_build_object(v_key, left(p_payload->'campaign'->>v_key, 120));
      END IF;
    END LOOP;
  END IF;

  v_page := public.access_request_clean(p_payload->>'pagePath', 200);
  IF v_page !~ '^/[A-Za-z0-9/_-]*$' THEN
    v_page := CASE WHEN v_kind = 'custom' THEN '/contact' ELSE '/request' END;
  END IF;

  v_account := EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email)
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE lower(COALESCE(o.owner_contact_email, '')) = v_email
    );

  SELECT * INTO v_existing FROM public.access_requests WHERE lower(email) = v_email;
  IF FOUND THEN
    v_status := CASE
      WHEN v_existing.status IN ('declined', 'archived', 'waitlisted') THEN 'new'
      ELSE v_existing.status
    END;
    UPDATE public.access_requests SET
      kind = v_kind,
      status = v_status,
      full_name = v_name,
      business_name = v_business,
      website = NULLIF(public.access_request_clean(p_payload->>'website', 200), ''),
      business_type = NULLIF(public.access_request_clean(p_payload->>'businessType', 80), ''),
      business_type_other = NULLIF(public.access_request_clean(p_payload->>'businessTypeOther', 120), ''),
      team_size = NULLIF(public.access_request_clean(p_payload->>'teamSize', 40), ''),
      lead_sources = v_sources,
      lead_sources_other = NULLIF(public.access_request_clean(p_payload->>'leadSourcesOther', 120), ''),
      crm = NULLIF(public.access_request_clean(p_payload->>'crm', 40), ''),
      crm_other = NULLIF(public.access_request_clean(p_payload->>'crmOther', 120), ''),
      deal_value = NULLIF(public.access_request_clean(p_payload->>'dealValue', 40), ''),
      calls_per_week = NULLIF(public.access_request_clean(p_payload->>'callsPerWeek', 40), ''),
      leads_per_month = NULLIF(public.access_request_clean(p_payload->>'leadsPerMonth', 40), ''),
      problem = NULLIF(left(public.access_request_clean(p_payload->>'problem', 1000), 1000), ''),
      heard_about = NULLIF(public.access_request_clean(p_payload->>'heardAbout', 160), ''),
      phone = NULLIF(public.access_request_clean(p_payload->>'phone', 40), ''),
      need = NULLIF(left(public.access_request_clean(p_payload->>'need', 1000), 1000), ''),
      page_path = v_page,
      campaign = v_campaign,
      existing_account = v_account,
      confirmation_status = 'pending',
      last_activity_at = now(),
      updated_at = now(),
      version = version + 1
    WHERE id = v_existing.id;
    INSERT INTO public.access_request_events (request_id, kind, from_status, to_status, detail)
    VALUES (
      v_existing.id,
      'resubmitted',
      v_existing.status,
      v_status,
      jsonb_build_object('previous_status', v_existing.status)
    );
  ELSE
    INSERT INTO public.access_requests (
      kind, full_name, email, business_name, website, business_type, business_type_other,
      team_size, lead_sources, lead_sources_other, crm, crm_other, deal_value, calls_per_week,
      leads_per_month, problem, heard_about, phone, need, page_path, campaign, existing_account
    ) VALUES (
      v_kind, v_name, v_email, v_business,
      NULLIF(public.access_request_clean(p_payload->>'website', 200), ''),
      NULLIF(public.access_request_clean(p_payload->>'businessType', 80), ''),
      NULLIF(public.access_request_clean(p_payload->>'businessTypeOther', 120), ''),
      NULLIF(public.access_request_clean(p_payload->>'teamSize', 40), ''),
      v_sources,
      NULLIF(public.access_request_clean(p_payload->>'leadSourcesOther', 120), ''),
      NULLIF(public.access_request_clean(p_payload->>'crm', 40), ''),
      NULLIF(public.access_request_clean(p_payload->>'crmOther', 120), ''),
      NULLIF(public.access_request_clean(p_payload->>'dealValue', 40), ''),
      NULLIF(public.access_request_clean(p_payload->>'callsPerWeek', 40), ''),
      NULLIF(public.access_request_clean(p_payload->>'leadsPerMonth', 40), ''),
      NULLIF(left(public.access_request_clean(p_payload->>'problem', 1000), 1000), ''),
      NULLIF(public.access_request_clean(p_payload->>'heardAbout', 160), ''),
      NULLIF(public.access_request_clean(p_payload->>'phone', 40), ''),
      NULLIF(left(public.access_request_clean(p_payload->>'need', 1000), 1000), ''),
      v_page, v_campaign, v_account
    ) RETURNING id INTO v_id;
    INSERT INTO public.access_request_events (request_id, kind, to_status)
    VALUES (v_id, 'submitted', 'new');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_access_request(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_access_request(jsonb, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.access_requests_require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a Platform Admin can do that.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.access_requests_require_admin() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_access_request_status(
  p_id uuid,
  p_status text,
  p_version integer
)
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
  IF p_status NOT IN ('new', 'in_review', 'approved', 'waitlisted', 'declined', 'archived') THEN
    RAISE EXCEPTION 'Choose a status the queue allows.';
  END IF;
  SELECT status INTO v_old
  FROM public.access_requests
  WHERE id = p_id AND version = p_version AND status <> 'converted';
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.access_requests WHERE id = p_id) THEN
      RAISE EXCEPTION 'Someone else just updated this request. Refresh the page and try again.';
    END IF;
    RAISE EXCEPTION 'That request is not available.';
  END IF;
  UPDATE public.access_requests
  SET status = p_status,
      version = version + 1,
      updated_at = now(),
      last_activity_at = now()
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

REVOKE ALL ON FUNCTION public.set_access_request_status(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_access_request_status(uuid, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assign_access_request(p_id uuid, p_owner uuid, p_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
BEGIN
  PERFORM public.access_requests_require_admin();
  IF p_owner IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.platform_staff s WHERE s.user_id = p_owner AND s.active
  ) THEN
    RAISE EXCEPTION 'Assign an active member of the team.';
  END IF;
  UPDATE public.access_requests
  SET owner_user_id = p_owner,
      version = version + 1,
      updated_at = now(),
      last_activity_at = now()
  WHERE id = p_id AND version = p_version
  RETURNING version INTO v_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Someone else just updated this request. Refresh the page and try again.';
  END IF;
  INSERT INTO public.access_request_events (request_id, actor_id, kind, detail)
  VALUES (p_id, auth.uid(), 'assign', jsonb_build_object('owner', p_owner));
  RETURN jsonb_build_object('ok', true, 'version', v_version);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_access_request(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_access_request(uuid, uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_access_request_note(p_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note text := public.access_request_clean(p_note, 2000);
BEGIN
  PERFORM public.access_requests_require_admin();
  IF v_note = '' THEN
    RAISE EXCEPTION 'Write a note first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.access_requests WHERE id = p_id) THEN
    RAISE EXCEPTION 'That request is not available.';
  END IF;
  INSERT INTO public.access_request_events (request_id, actor_id, kind, detail)
  VALUES (p_id, auth.uid(), 'note', jsonb_build_object('note', v_note));
  UPDATE public.access_requests
  SET last_activity_at = now(), updated_at = now()
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_access_request_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_access_request_note(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bulk_set_access_request_status(p_ids uuid[], p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  PERFORM public.access_requests_require_admin();
  IF p_status NOT IN ('in_review', 'approved', 'waitlisted', 'declined', 'archived') THEN
    RAISE EXCEPTION 'Choose a status the queue allows.';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL OR array_length(p_ids, 1) > 200 THEN
    RAISE EXCEPTION 'Choose between 1 and 200 requests.';
  END IF;
  WITH changed AS (
    UPDATE public.access_requests
    SET status = p_status,
        version = version + 1,
        updated_at = now(),
        last_activity_at = now()
    WHERE id = ANY (p_ids) AND status <> 'converted' AND status <> p_status
    RETURNING id, status
  )
  INSERT INTO public.access_request_events (request_id, actor_id, kind, to_status)
  SELECT id, auth.uid(), 'bulk_status', p_status FROM changed;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'updated', COALESCE(v_updated, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_set_access_request_status(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_set_access_request_status(uuid[], text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.convert_access_request(p_id uuid, p_org_id uuid, p_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_version integer;
  v_other uuid;
BEGIN
  PERFORM public.access_requests_require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'That workspace is not available.';
  END IF;
  SELECT email INTO v_email FROM public.access_requests WHERE id = p_id AND version = p_version;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Someone else just updated this request. Refresh the page and try again.';
  END IF;
  SELECT m.org_id INTO v_other
  FROM public.org_members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE lower(u.email) = lower(v_email)
    AND m.role = 'owner'
    AND m.active
    AND m.org_id <> p_org_id
  LIMIT 1;
  UPDATE public.access_requests
  SET status = 'converted',
      converted_org_id = p_org_id,
      version = version + 1,
      updated_at = now(),
      last_activity_at = now()
  WHERE id = p_id AND version = p_version
  RETURNING version INTO v_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Someone else just updated this request. Refresh the page and try again.';
  END IF;
  INSERT INTO public.access_request_events (request_id, actor_id, kind, to_status, detail)
  VALUES (p_id, auth.uid(), 'converted', 'converted', jsonb_build_object('org_id', p_org_id));
  RETURN jsonb_build_object('ok', true, 'version', v_version, 'existing_owner', v_other IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.convert_access_request(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_access_request(uuid, uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_access_request(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_kind text;
BEGIN
  PERFORM public.access_requests_require_admin();
  SELECT email, kind INTO v_email, v_kind FROM public.access_requests WHERE id = p_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'That request is not available.';
  END IF;
  INSERT INTO public.access_request_deletions (deleted_by, email_hash, kind, reason)
  VALUES (auth.uid(), md5(lower(v_email)), v_kind, NULLIF(public.access_request_clean(p_reason, 300), ''));
  DELETE FROM public.access_requests WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_access_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_access_request(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_access_request_export(p_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.access_requests_require_admin();
  INSERT INTO public.access_request_deletions (deleted_by, email_hash, kind, reason)
  VALUES (auth.uid(), 'export', 'export', 'Exported ' || GREATEST(p_count, 0) || ' requests.');
END;
$$;

REVOKE ALL ON FUNCTION public.log_access_request_export(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_access_request_export(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_access_request_view(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_view_access_requests() THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.access_requests WHERE id = p_id) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.access_request_events
    WHERE request_id = p_id AND actor_id = auth.uid() AND kind = 'view' AND at > now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.access_request_events (request_id, actor_id, kind)
  VALUES (p_id, auth.uid(), 'view');
END;
$$;

REVOKE ALL ON FUNCTION public.log_access_request_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_access_request_view(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_access_request_settings(p_settings jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.access_requests_require_admin();
  UPDATE public.access_request_settings SET
    onboard_intent = COALESCE((p_settings->>'onboard_intent')::int, onboard_intent),
    retention_months = COALESCE((p_settings->>'retention_months')::int, retention_months),
    stale_business_days = COALESCE((p_settings->>'stale_business_days')::int, stale_business_days),
    staff_timezone = COALESCE(NULLIF(public.access_request_clean(p_settings->>'staff_timezone', 80), ''), staff_timezone),
    fit_rules = CASE WHEN jsonb_typeof(p_settings->'fit_rules') = 'array' THEN p_settings->'fit_rules' ELSE fit_rules END,
    updated_at = now()
  WHERE id = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.update_access_request_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_access_request_settings(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_access_request_template(p_id text, p_subject text, p_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.access_requests_require_admin();
  IF p_id NOT IN ('access_confirm', 'custom_confirm', 'declined', 'waitlisted') THEN
    RAISE EXCEPTION 'Choose one of the existing templates.';
  END IF;
  IF public.access_request_clean(p_subject, 200) = '' OR public.access_request_clean(p_body, 4000) = '' THEN
    RAISE EXCEPTION 'A subject and a body are required.';
  END IF;
  IF regexp_replace(p_body, '\{\{\s*name\s*\}\}', '', 'g') ~ '\{\{' THEN
    RAISE EXCEPTION 'Templates may only include the name placeholder.';
  END IF;
  UPDATE public.access_request_templates
  SET subject = public.access_request_clean(p_subject, 200),
      body = public.access_request_clean(p_body, 4000),
      updated_at = now()
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_access_request_template(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_access_request_template(text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_access_request_viewer(p_user uuid, p_allowed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.access_requests_require_admin();
  UPDATE public.platform_staff
  SET can_view_access_requests = COALESCE(p_allowed, false)
  WHERE user_id = p_user AND role = 'service_team' AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grant this only to an active Service Team member.';
  END IF;
  INSERT INTO public.access_request_deletions (deleted_by, email_hash, kind, reason)
  VALUES (auth.uid(), 'grant', 'grant', CASE WHEN p_allowed THEN 'Granted view.' ELSE 'Removed view.' END || ' ' || p_user::text);
END;
$$;

REVOKE ALL ON FUNCTION public.set_access_request_viewer(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_access_request_viewer(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_access_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months integer;
  v_count integer;
BEGIN
  SELECT retention_months INTO v_months FROM public.access_request_settings WHERE id = 1;
  WITH doomed AS (
    SELECT id, email, kind
    FROM public.access_requests
    WHERE last_activity_at < now() - make_interval(months => COALESCE(v_months, 12))
      AND status IN ('new', 'in_review', 'waitlisted', 'declined', 'archived', 'approved')
  ), logged AS (
    INSERT INTO public.access_request_deletions (email_hash, kind, reason)
    SELECT md5(lower(email)), kind, 'Retention period ended.' FROM doomed
    RETURNING 1
  )
  DELETE FROM public.access_requests WHERE id IN (SELECT id FROM doomed);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_access_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_access_requests() TO service_role;

CREATE OR REPLACE FUNCTION public.access_request_confirmation_batch(p_limit integer)
RETURNS TABLE (id uuid, email text, full_name text, kind text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT r.id, r.email, r.full_name, r.kind
  FROM public.access_requests r
  WHERE r.confirmation_status IN ('pending', 'failed') AND r.confirmation_attempts < 5
  ORDER BY r.updated_at
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 20), 50), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.access_request_confirmation_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.access_request_confirmation_batch(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_access_request_confirmation(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('pending', 'sent', 'failed') THEN
    RETURN;
  END IF;
  UPDATE public.access_requests
  SET confirmation_status = p_status,
      confirmation_attempts = confirmation_attempts + CASE WHEN p_status = 'sent' THEN 0 ELSE 1 END
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_access_request_confirmation(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_access_request_confirmation(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_access_request_staff_notice()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed boolean := false;
BEGIN
  UPDATE public.access_request_settings
  SET last_staff_notice_at = now()
  WHERE id = 1
    AND (last_staff_notice_at IS NULL OR last_staff_notice_at < now() - interval '30 minutes')
  RETURNING true INTO v_claimed;
  RETURN COALESCE(v_claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_access_request_staff_notice() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_access_request_staff_notice() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_access_request_abuse_notice()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due boolean;
BEGIN
  SELECT abuse_notice_due INTO v_due FROM public.access_request_settings WHERE id = 1;
  IF COALESCE(v_due, false) IS NOT TRUE THEN
    RETURN false;
  END IF;
  UPDATE public.access_request_settings SET abuse_notice_due = false WHERE id = 1;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_access_request_abuse_notice() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_access_request_abuse_notice() TO service_role;

CREATE OR REPLACE FUNCTION public.access_request_stale_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
  v_count integer;
BEGIN
  SELECT stale_business_days INTO v_days FROM public.access_request_settings WHERE id = 1;
  SELECT count(*) INTO v_count
  FROM public.access_requests
  WHERE status IN ('new', 'in_review')
    AND created_at < now() - make_interval(days => GREATEST(COALESCE(v_days, 2), 1) + 2);
  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.access_request_stale_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.access_request_stale_count() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_access_request_stale_notice()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed boolean := false;
BEGIN
  UPDATE public.access_request_settings
  SET last_stale_notice_at = now()
  WHERE id = 1
    AND (last_stale_notice_at IS NULL OR last_stale_notice_at < now() - interval '20 hours')
  RETURNING true INTO v_claimed;
  RETURN COALESCE(v_claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_access_request_stale_notice() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_access_request_stale_notice() TO service_role;

CREATE OR REPLACE FUNCTION public.record_public_site_event(p_type text, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text := left(regexp_replace(COALESCE(p_type, ''), '[^a-z_]', '', 'g'), 40);
  v_path text := left(split_part(COALESCE(p_path, '/'), '?', 1), 120);
BEGIN
  IF v_type NOT IN ('page_view', 'cta_click', 'form_start', 'form_complete', 'scroll_depth') THEN
    RETURN;
  END IF;
  IF v_path !~ '^/[A-Za-z0-9/_-]*$' THEN
    v_path := '/';
  END IF;
  INSERT INTO public.public_site_daily (day, event_type, path, count)
  VALUES ((now() AT TIME ZONE 'UTC')::date, v_type, v_path, 1)
  ON CONFLICT (day, event_type, path)
  DO UPDATE SET count = public.public_site_daily.count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_public_site_event(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_public_site_event(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.log_access_request_reply(p_id uuid, p_template text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.access_requests_require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.access_requests WHERE id = p_id) THEN
    RAISE EXCEPTION 'That request is not available.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.access_request_templates WHERE id = p_template) THEN
    RAISE EXCEPTION 'Choose a template.';
  END IF;
  INSERT INTO public.access_request_events (request_id, actor_id, kind, detail)
  VALUES (p_id, auth.uid(), 'reply', jsonb_build_object('template', p_template));
  UPDATE public.access_requests SET last_activity_at = now(), updated_at = now() WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_access_request_reply(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_access_request_reply(uuid, text) TO authenticated, service_role;
