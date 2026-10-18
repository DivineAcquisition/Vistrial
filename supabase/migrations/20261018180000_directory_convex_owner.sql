-- Domain 1 ownership.
-- Convex is the store the application writes. These tables stay readable so
-- row security for domains that have not moved can still see membership.
-- Application roles cannot write them. The replica function is the one
-- writer the application may call, and it only copies a Convex document.

UPDATE public.org_members SET role = 'placed_operator' WHERE role = 'da_operator';
UPDATE public.org_invites SET role = 'placed_operator' WHERE role = 'da_operator';

COMMENT ON TYPE public.org_role IS
  'Seat role. placed_operator is the renamed da_operator label. It is not Workspace Operator or Workspace Member. The old da_operator label remains because Postgres cannot drop an enum value; nothing new is written with it.';

ALTER TABLE public.stellar_da_access_log RENAME TO placed_access_log;
ALTER INDEX IF EXISTS stellar_da_access_log_user_idx RENAME TO placed_access_log_user_idx;
ALTER INDEX IF EXISTS stellar_da_access_log_org_idx RENAME TO placed_access_log_org_idx;
ALTER POLICY stellar_da_access_log_select ON public.placed_access_log RENAME TO placed_access_log_select;

COMMENT ON TABLE public.placed_access_log IS
  'Every cross-workspace read a placed operator performs. Renamed from stellar_da_access_log. Same rows, same readers.';

DROP VIEW IF EXISTS public.stellar_da_operators;
CREATE VIEW public.placed_operators
WITH (security_invoker = true) AS
SELECT user_id, created_by AS granted_by, created_at AS granted_at, NULL::text AS note
FROM public.platform_staff
WHERE active;

COMMENT ON VIEW public.placed_operators IS
  'Active platform staff. Renamed from stellar_da_operators. Assignments still decide which workspaces they see.';

REVOKE ALL ON public.placed_operators FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.placed_operators TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_placed_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_staff();
$$;

REVOKE ALL ON FUNCTION public.is_placed_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_placed_operator() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_placed_access(
  p_org_id uuid,
  p_action text,
  p_resource text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_placed_operator() THEN
    RAISE EXCEPTION 'not a placed operator';
  END IF;
  INSERT INTO public.placed_access_log (user_id, org_id, action, resource)
  VALUES (auth.uid(), p_org_id, p_action, p_resource);
END;
$$;

REVOKE ALL ON FUNCTION public.record_placed_access(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_placed_access(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.placed_list_placements()
RETURNS TABLE(placement_id uuid, org_id uuid, org_name text, setter_member_id uuid, setter_name text, agreement_status placement_agreement_status, build_stage placement_build_stage, build_stage_updated_at timestamp with time zone, started_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_placed_operator() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  PERFORM public.record_placed_access(NULL, 'list', 'placements');
  RETURN QUERY
  SELECT
    p.id, p.org_id, o.name, p.setter_member_id, m.display_name,
    p.agreement_status, p.build_stage, p.build_stage_updated_at, p.started_at
  FROM public.placements p
  JOIN public.organizations o ON o.id = p.org_id
  LEFT JOIN public.org_members m ON m.id = p.setter_member_id
  WHERE p.ended_at IS NULL
    AND o.product IN ('stellar', 'both')
    AND p.org_id IN (SELECT public.user_staff_org_ids())
  ORDER BY o.name;
END;
$$;

REVOKE ALL ON FUNCTION public.placed_list_placements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.placed_list_placements() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.placed_get_placement(p_org_id uuid)
RETURNS TABLE(placement_id uuid, org_id uuid, org_name text, setter_member_id uuid, setter_name text, agreement_status placement_agreement_status, agreement_document_url text, agreement_signed_at timestamp with time zone, build_stage placement_build_stage, build_stage_updated_at timestamp with time zone, started_at timestamp with time zone, ended_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_placed_operator() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_org_id NOT IN (SELECT public.user_staff_org_ids()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  PERFORM public.record_placed_access(p_org_id, 'read', 'placement');
  RETURN QUERY
  SELECT
    p.id, p.org_id, o.name, p.setter_member_id, m.display_name,
    p.agreement_status, p.agreement_document_url, p.agreement_signed_at,
    p.build_stage, p.build_stage_updated_at, p.started_at, p.ended_at
  FROM public.placements p
  JOIN public.organizations o ON o.id = p.org_id
  LEFT JOIN public.org_members m ON m.id = p.setter_member_id
  WHERE p.org_id = p_org_id
  ORDER BY p.started_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.placed_get_placement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.placed_get_placement(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.stellar_da_list_placements();
DROP FUNCTION IF EXISTS public.stellar_da_get_placement(uuid);
DROP FUNCTION IF EXISTS public.record_stellar_da_access(uuid, text, text);
DROP FUNCTION IF EXISTS public.is_stellar_da_operator();

-- ---------------------------------------------------------------------
-- Replica and read-only guard.
-- ---------------------------------------------------------------------

CREATE TABLE public.directory_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL,
  op text NOT NULL,
  legacy_id text NOT NULL,
  workspace_id text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

ALTER TABLE public.directory_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.directory_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.directory_outbox TO service_role;

COMMENT ON TABLE public.directory_outbox IS
  'Changes database functions still make to directory tables, waiting to be copied into Convex. The application does not insert these.';

CREATE OR REPLACE FUNCTION public.directory_reject_app_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('vistrial.directory_replica', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF current_user IN ('authenticated', 'anon', 'service_role') THEN
    RAISE EXCEPTION 'This record is owned by Convex.'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.directory_outbox_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF current_setting('vistrial.directory_replica', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  INSERT INTO public.directory_outbox (table_name, op, legacy_id, workspace_id, payload)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(v_row->>'id', v_row->>'user_id'),
    v_row->>'org_id',
    v_row
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations', 'org_members', 'workspace_assignments', 'platform_staff', 'org_invites']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS directory_reject_app_write ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER directory_reject_app_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.directory_reject_app_write()',
      t
    );
    EXECUTE format('DROP TRIGGER IF EXISTS directory_outbox_capture ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER directory_outbox_capture AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.directory_outbox_capture()',
      t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.directory_replicate(p_table text, p_row jsonb, p_delete boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text;
  v_sets text;
BEGIN
  IF p_table NOT IN ('organizations', 'org_members', 'workspace_assignments', 'platform_staff', 'org_invites') THEN
    RAISE EXCEPTION 'not a directory table';
  END IF;
  PERFORM set_config('vistrial.directory_replica', 'on', true);
  v_pk := CASE WHEN p_table = 'platform_staff' THEN 'user_id' ELSE 'id' END;
  IF p_delete THEN
    EXECUTE format('DELETE FROM public.%I WHERE %I = ($1->>%L)::uuid', p_table, v_pk, v_pk) USING p_row;
    RETURN;
  END IF;
  SELECT string_agg(format('%I = EXCLUDED.%I', column_name, column_name), ', ')
    INTO v_sets
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = p_table AND column_name <> v_pk;
  EXECUTE format(
    'INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I, $1)).* ON CONFLICT (%I) DO UPDATE SET %s',
    p_table, p_table, v_pk, v_sets
  ) USING p_row;
END;
$$;

REVOKE ALL ON FUNCTION public.directory_replicate(text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.directory_replicate(text, jsonb, boolean) TO service_role;
