-- Cookie tool registry. Google Analytics and the Meta pixel stay disabled
-- until a Platform Admin enables them and the privacy policy is live.

CREATE TABLE IF NOT EXISTS public.tracking_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  consent_version integer NOT NULL DEFAULT 1,
  lifetime_days integer NOT NULL DEFAULT 365,
  dismiss_days integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tracking_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tracking_tools (
  slug text PRIMARY KEY,
  name text NOT NULL,
  company text NOT NULL,
  category text NOT NULL CHECK (category IN ('essential', 'analytics', 'advertising')),
  purpose text NOT NULL,
  collects text NOT NULL,
  storage text NOT NULL,
  duration text NOT NULL,
  privacy_url text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.tracking_choice_daily (
  day date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('accept', 'reject', 'custom', 'dismiss')),
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, mode)
);

ALTER TABLE public.tracking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_choice_daily ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tracking_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tracking_tools FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tracking_choice_daily FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.tracking_settings TO authenticated;
GRANT SELECT ON TABLE public.tracking_tools TO authenticated;
GRANT SELECT ON TABLE public.tracking_choice_daily TO authenticated;
GRANT ALL ON TABLE public.tracking_settings TO service_role;
GRANT ALL ON TABLE public.tracking_tools TO service_role;
GRANT ALL ON TABLE public.tracking_choice_daily TO service_role;

CREATE POLICY tracking_settings_admin ON public.tracking_settings
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY tracking_tools_admin ON public.tracking_tools
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY tracking_choice_daily_admin ON public.tracking_choice_daily
  FOR SELECT TO authenticated USING (public.is_platform_admin());

INSERT INTO public.tracking_tools (slug, name, company, category, purpose, collects, storage, duration, privacy_url, enabled, sort_order)
VALUES
  ('session', 'Sign-in and security', 'Vistrial', 'essential', 'Keeps you signed in and remembers which workspace is open.', 'A session token and the workspace id.', 'sb-vistrial-session, vistrial_org', 'Session, and up to 400 days for the workspace cookie.', 'https://vistrial.io/privacy', true, 1),
  ('turnstile', 'Form abuse check', 'Cloudflare', 'essential', 'Checks that a form was sent by a person, only when a site key is configured.', 'A challenge result.', 'A short-lived Cloudflare cookie when the check runs.', 'For the form session.', 'https://www.cloudflare.com/privacypolicy/', true, 2),
  ('consent', 'Cookie choice', 'Vistrial', 'essential', 'Remembers the categories you allowed on this browser.', 'Categories, version, and date. No name or email.', 'vistrial_consent', '12 months, or 30 days if the banner is closed without a choice.', 'https://vistrial.io/cookies', true, 3),
  ('first-party', 'Page counts', 'Vistrial', 'analytics', 'Counts which public pages are viewed.', 'Event type and page path.', 'None beyond the choice cookie.', 'Daily totals.', 'https://vistrial.io/privacy', true, 4),
  ('google-analytics', 'Google Analytics', 'Google', 'analytics', 'Measures public pages and how visitors reach the site.', 'Pages, device, approximate location, and referrer. No name, email, or form answers.', 'Google Analytics cookies after you allow analytics.', 'The shortest retention setting on the property.', 'https://policies.google.com/privacy', false, 5),
  ('meta-pixel', 'Meta pixel', 'Meta', 'advertising', 'Measures our own ads and a form submission.', 'A page view or a Lead event. No name, email, phone, or form answers.', 'Meta cookies after you allow advertising.', 'Meta sets the lifetime on its own domains.', 'https://www.facebook.com/privacy/policy/', false, 6)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.subprocessors (company, purpose, data_handled, location, published, sort_order)
SELECT 'Google Analytics', 'Public website measurement', 'Pages viewed, device type, approximate location, and referring page. No workspace data.', NULL, false, 7
WHERE NOT EXISTS (SELECT 1 FROM public.subprocessors WHERE company = 'Google Analytics');

INSERT INTO public.subprocessors (company, purpose, data_handled, location, published, sort_order)
SELECT 'Meta', 'Advertising measurement on the public website', 'A page view or a form submission event. No name, email, or form answers.', NULL, false, 8
WHERE NOT EXISTS (SELECT 1 FROM public.subprocessors WHERE company = 'Meta');

CREATE OR REPLACE FUNCTION public.record_tracking_choice(p_mode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_mode NOT IN ('accept', 'reject', 'custom', 'dismiss') THEN
    RETURN;
  END IF;
  INSERT INTO public.tracking_choice_daily (day, mode, count)
  VALUES ((now() AT TIME ZONE 'UTC')::date, p_mode, 1)
  ON CONFLICT (day, mode) DO UPDATE SET count = public.tracking_choice_daily.count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_tracking_choice(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tracking_choice(text) TO service_role;

CREATE OR REPLACE FUNCTION public.set_tracking_tool_enabled(p_slug text, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.access_requests_require_admin();
  UPDATE public.tracking_tools SET enabled = COALESCE(p_enabled, false) WHERE slug = p_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That tool is not in the registry.';
  END IF;
  UPDATE public.tracking_settings SET consent_version = consent_version + 1, updated_at = now() WHERE id = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tracking_tool_enabled(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tracking_tool_enabled(text, boolean) TO authenticated, service_role;
