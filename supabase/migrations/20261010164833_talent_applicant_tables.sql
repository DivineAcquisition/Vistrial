-- Talent applicants for the Sales Operator interview.
-- Staff can read and write. A public application can only insert itself.
-- A submitted interview cannot be edited. A correction is a new interview.

CREATE TABLE IF NOT EXISTS public.talent_applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  email text NOT NULL CHECK (position('@' IN email) > 1 AND char_length(email) <= 200),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 40),
  role text NOT NULL DEFAULT 'sales_operator' CHECK (role = 'sales_operator'),
  stage text NOT NULL DEFAULT 'applied' CHECK (stage IN ('applied', 'screening', 'hold', 'second', 'advance', 'declined', 'withdrawn')),
  timezone text CHECK (timezone IS NULL OR char_length(timezone) <= 80),
  availability text CHECK (availability IS NULL OR char_length(availability) <= 500),
  source text NOT NULL DEFAULT 'apply' CHECK (source IN ('apply', 'staff')),
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS talent_applicants_email_lower ON public.talent_applicants (lower(email));

CREATE TABLE IF NOT EXISTS public.talent_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.talent_applicants (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  interviewer_user_id uuid,
  interviewer_name text CHECK (interviewer_name IS NULL OR char_length(interviewer_name) <= 120),
  precheck jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(precheck) = 'object'),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  roleplay jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(roleplay) = 'object'),
  dishonesty boolean NOT NULL DEFAULT false,
  scorecard jsonb CHECK (scorecard IS NULL OR jsonb_typeof(scorecard) = 'object'),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talent_interviews_submitted_has_card CHECK (status <> 'submitted' OR (scorecard IS NOT NULL AND submitted_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS talent_interviews_one_draft ON public.talent_interviews (applicant_id) WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS talent_interviews_applicant_idx ON public.talent_interviews (applicant_id, created_at DESC);

DROP TRIGGER IF EXISTS talent_applicants_set_updated_at ON public.talent_applicants;
CREATE TRIGGER talent_applicants_set_updated_at
  BEFORE UPDATE ON public.talent_applicants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS talent_interviews_set_updated_at ON public.talent_interviews;
CREATE TRIGGER talent_interviews_set_updated_at
  BEFORE UPDATE ON public.talent_interviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.talent_interviews_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'submitted' THEN
    RAISE EXCEPTION 'A submitted interview stays as it was. Start a new one to correct it.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS talent_interviews_freeze ON public.talent_interviews;
CREATE TRIGGER talent_interviews_freeze
  BEFORE UPDATE ON public.talent_interviews
  FOR EACH ROW EXECUTE FUNCTION public.talent_interviews_freeze();

CREATE OR REPLACE FUNCTION public.talent_apply(
  p_name text,
  p_email text,
  p_phone text,
  p_timezone text,
  p_availability text,
  p_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_name text := btrim(COALESCE(p_name, ''));
  v_id uuid;
  v_stage text;
BEGIN
  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Enter your first and last name.' USING ERRCODE = '22023';
  END IF;
  IF position('@' IN v_email) < 2 OR char_length(v_email) > 200 THEN
    RAISE EXCEPTION 'Enter an email address.' USING ERRCODE = '22023';
  END IF;

  SELECT id, stage INTO v_id, v_stage FROM public.talent_applicants WHERE lower(email) = v_email;
  IF v_id IS NOT NULL THEN
    IF v_stage NOT IN ('applied', 'declined', 'withdrawn') THEN
      RAISE EXCEPTION 'This application is already with the team.' USING ERRCODE = '23505';
    END IF;
    UPDATE public.talent_applicants
    SET full_name = v_name,
        phone = NULLIF(left(btrim(COALESCE(p_phone, '')), 40), ''),
        timezone = NULLIF(left(btrim(COALESCE(p_timezone, '')), 80), ''),
        availability = NULLIF(left(btrim(COALESCE(p_availability, '')), 500), ''),
        note = NULLIF(left(btrim(COALESCE(p_note, '')), 2000), ''),
        stage = 'applied',
        source = 'apply'
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.talent_applicants (full_name, email, phone, timezone, availability, note, source, stage)
  VALUES (
    v_name,
    v_email,
    NULLIF(left(btrim(COALESCE(p_phone, '')), 40), ''),
    NULLIF(left(btrim(COALESCE(p_timezone, '')), 80), ''),
    NULLIF(left(btrim(COALESCE(p_availability, '')), 500), ''),
    NULLIF(left(btrim(COALESCE(p_note, '')), 2000), ''),
    'apply',
    'applied'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.talent_apply(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talent_apply(text, text, text, text, text, text) TO anon, authenticated;

ALTER TABLE public.talent_applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_interviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_applicants_staff ON public.talent_applicants;
CREATE POLICY talent_applicants_staff ON public.talent_applicants
  FOR ALL TO authenticated
  USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.user_staff_org_ids()))
  WITH CHECK (public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.user_staff_org_ids()));

DROP POLICY IF EXISTS talent_interviews_staff ON public.talent_interviews;
CREATE POLICY talent_interviews_staff ON public.talent_interviews
  FOR ALL TO authenticated
  USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.user_staff_org_ids()))
  WITH CHECK (public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.user_staff_org_ids()));

COMMENT ON TABLE public.talent_applicants IS
  'People who applied to be a Sales Operator. Staff only. Nothing here is a client lead, and the application does not send a message.';

COMMENT ON TABLE public.talent_interviews IS
  'One Sales Operator interview. A submitted row is frozen, including the scorecard the report is printed from.';
