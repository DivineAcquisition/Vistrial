-- Footer version recorded on each Vistrial email, plus lifecycle unsubscribe.
-- Customer CRM mail is not stored here and does not use these footers.

CREATE TABLE IF NOT EXISTS public.email_footer_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('A', 'A2', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I')),
  version text NOT NULL,
  paragraphs jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, version)
);

CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  token uuid PRIMARY KEY,
  email text NOT NULL,
  category text NOT NULL CHECK (category IN ('E', 'F')),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.email_lifecycle_suppressions (
  email text PRIMARY KEY,
  suppressed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  footer_version text NOT NULL,
  recipient text NOT NULL,
  stream text NOT NULL CHECK (stream IN ('transactional', 'lifecycle')),
  provider_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_footer_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_lifecycle_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_footer_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.email_unsubscribe_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.email_lifecycle_suppressions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.email_send_log FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.email_footer_versions TO service_role;
GRANT ALL ON public.email_unsubscribe_tokens TO service_role;
GRANT ALL ON public.email_lifecycle_suppressions TO service_role;
GRANT ALL ON public.email_send_log TO service_role;

CREATE OR REPLACE FUNCTION public.publish_email_footer(p_category text, p_paragraphs jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform_admin_required';
  END IF;
  IF p_category NOT IN ('A', 'A2', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I') THEN
    RAISE EXCEPTION 'unknown_category';
  END IF;
  IF p_paragraphs IS NULL OR jsonb_typeof(p_paragraphs) <> 'array' THEN
    RAISE EXCEPTION 'paragraphs_required';
  END IF;
  v_version := to_char(now() AT TIME ZONE 'utc', 'YYYYMMDDHH24MISS');
  INSERT INTO public.email_footer_versions (category, version, paragraphs, created_by)
  VALUES (p_category, v_version, p_paragraphs, auth.uid());
  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_email_footer(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_email_footer(text, jsonb) TO authenticated, service_role;
