-- A recovery code stands in for the authenticator app for 15 minutes.
-- The table is service-role only; staff read their own grant through the function.

CREATE TABLE IF NOT EXISTS public.staff_mfa_grants (
  user_id uuid PRIMARY KEY,
  until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_mfa_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_mfa_grants FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_mfa_grants TO service_role;

CREATE OR REPLACE FUNCTION public.staff_mfa_grant_until()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.until
  FROM public.staff_mfa_grants g
  WHERE g.user_id = auth.uid()
    AND g.until > now()
    AND public.is_platform_staff();
$$;

REVOKE ALL ON FUNCTION public.staff_mfa_grant_until() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_mfa_grant_until() TO authenticated, service_role;

-- Billing kept after a workspace is deleted must not look like leftover data.
CREATE OR REPLACE FUNCTION public.org_scoped_row_counts(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  r record;
  v_n bigint;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN (
        'org_deletion_records',
        'workspace_activity_log',
        'workspace_migration_review',
        'workspace_migration_role_map',
        'retained_billing_records'
      )
    ORDER BY 1
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', r.table_name)
      INTO v_n
      USING p_org_id;
    IF v_n > 0 THEN
      v_out := v_out || jsonb_build_object(r.table_name, v_n);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;
