-- Close the signed-out path into privileged functions, and delete search
-- vectors when a transcript is cleared.
--
-- New functions in this schema were executable by everyone, including
-- signed-out visitors, because Postgres grants EXECUTE to PUBLIC and the
-- hosted defaults also grant it to anon. Functions that already check the
-- caller stay callable by signed-in people. Signed-out visitors lose them.

-- Scoring band names are workspace configuration. Only someone who can see
-- that workspace's results may read them.
CREATE OR REPLACE FUNCTION public.portal_top_band(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(public.portal_can_see_results(p_org_id), false) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT b->>'name'
    FROM jsonb_array_elements(COALESCE(public.config_effective_at(p_org_id)->'values'->'qualification.scoring_bands', '[]'::jsonb)) b
    ORDER BY (b->>'min_score')::numeric DESC NULLS LAST
    LIMIT 1
  );
END;
$$;

-- A cleared transcript drops its passages and the vectors built from them.
CREATE OR REPLACE FUNCTION public.calls_purge_passages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.raw_transcript IS NULL AND OLD.raw_transcript IS NOT NULL)
     OR (NEW.transcript_purged_at IS NOT NULL AND OLD.transcript_purged_at IS NULL) THEN
    DELETE FROM public.scribe_embeddings WHERE call_id = NEW.id;
    DELETE FROM public.transcript_passages WHERE call_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Keep signed-in and service-role grants. Take PUBLIC and anon away.
DO $$
DECLARE
  r record;
  v_args text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    v_args := r.args;
    IF has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
        r.proname, v_args
      );
    ELSE
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
        r.proname, v_args
      );
    END IF;
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
      r.proname, v_args
    );
  END LOOP;
END $$;

-- Future functions created by the role running migrations are not handed to anon.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
GRANT EXECUTE ON FUNCTION public.portal_top_band(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_top_band(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.calls_purge_passages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calls_purge_passages() TO service_role;
