-- Platform super-admins (DA operators) sit above org roles. They are enrolled
-- as owners in every workspace and cannot be demoted or deactivated.

CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_admins IS
  'DA operators. Enrolled as owner in every org. Not an org_role — it outranks owner.';

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_admins_select
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_admins TO authenticated;
GRANT ALL ON TABLE public.platform_admins TO service_role;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.enroll_platform_admin_in_orgs(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_name text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'platform admin user % does not exist', p_user_id;
  END IF;

  v_name := COALESCE(NULLIF(split_part(v_email, '@', 1), ''), 'Super admin');

  INSERT INTO public.org_members (org_id, user_id, role, display_name, email, active)
  SELECT o.id, p_user_id, 'owner', v_name, v_email, true
  FROM public.organizations o
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET role = 'owner',
        active = true,
        email = EXCLUDED.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.enroll_platform_admin_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enroll_platform_admin_in_orgs(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_admins_enroll
  AFTER INSERT ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.enroll_platform_admin_row();

CREATE OR REPLACE FUNCTION public.enroll_platform_admins_on_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin record;
  v_email text;
  v_name text;
BEGIN
  FOR v_admin IN SELECT user_id FROM public.platform_admins LOOP
    SELECT email INTO v_email FROM auth.users WHERE id = v_admin.user_id;
    IF v_email IS NULL THEN
      CONTINUE;
    END IF;
    v_name := COALESCE(NULLIF(split_part(v_email, '@', 1), ''), 'Super admin');
    INSERT INTO public.org_members (org_id, user_id, role, display_name, email, active)
    VALUES (NEW.id, v_admin.user_id, 'owner', v_name, v_email, true)
    ON CONFLICT (org_id, user_id) DO UPDATE
      SET role = 'owner',
          active = true,
          email = EXCLUDED.email;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_enroll_platform_admins
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.enroll_platform_admins_on_new_org();

CREATE OR REPLACE FUNCTION public.protect_platform_admin_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = NEW.user_id
  ) THEN
    IF NEW.active IS DISTINCT FROM TRUE
      OR NEW.role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Platform admins cannot be demoted or deactivated';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER org_members_protect_platform_admin
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.protect_platform_admin_membership();

CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM public.org_members
  WHERE user_id = auth.uid()
    AND active = true
  UNION
  SELECT id
  FROM public.organizations
  WHERE public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.user_has_org_role(
  p_org_id uuid,
  VARIADIC p_roles public.org_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND active = true
      AND role = ANY (p_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_platform_admin_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enroll_platform_admin_in_orgs(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enroll_platform_admin_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enroll_platform_admins_on_new_org() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_platform_admin_membership() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enroll_platform_admin_in_orgs(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_org_role(uuid, public.org_role[]) TO authenticated, service_role;
