-- Foundation (Prompt 26, build step 5). Replaces onboarding as the place a
-- workspace says what it is trying to achieve. Structured, versioned fields:
-- Compass drafts, the Owner edits and confirms, staff may edit but never
-- confirm. Nothing runs off a field until a confirmed version holds it.

CREATE TABLE IF NOT EXISTS public.foundation_fields (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^[a-z_]{2,30}\.[a-z_]{2,40}$'),
  value jsonb,
  source text NOT NULL CHECK (source IN ('crm', 'calendar', 'transcripts', 'industry_default', 'compass', 'owner')),
  status text NOT NULL CHECK (status IN ('drafted', 'edited', 'confirmed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (org_id, key),
  CONSTRAINT foundation_fields_value_size CHECK (value IS NULL OR pg_column_size(value) <= 16384)
);

CREATE TABLE IF NOT EXISTS public.foundation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'object'),
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 500),
  confirmed_by uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, version)
);

ALTER TABLE public.foundation_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foundation_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.foundation_fields, public.foundation_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.foundation_fields, public.foundation_versions TO authenticated;
GRANT ALL ON public.foundation_fields, public.foundation_versions TO service_role;

DROP POLICY IF EXISTS foundation_fields_read ON public.foundation_fields;
CREATE POLICY foundation_fields_read ON public.foundation_fields FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS foundation_versions_read ON public.foundation_versions;
CREATE POLICY foundation_versions_read ON public.foundation_versions FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

-- Compass's draft only fills fields nobody has edited or confirmed.
CREATE OR REPLACE FUNCTION public.foundation_save_draft(p_org_id uuid, p_fields jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_key text;
  v_entry jsonb;
BEGIN
  IF COALESCE(public.ws_access(p_org_id), '') NOT IN ('owner', 'service_team', 'platform_admin') THEN
    RAISE EXCEPTION 'Only an Owner or the Vistrial team can draft the foundation.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'Draft must be an object.' USING ERRCODE = '22023';
  END IF;
  FOR v_key, v_entry IN SELECT * FROM jsonb_each(p_fields) LOOP
    INSERT INTO public.foundation_fields AS f (org_id, key, value, source, status, updated_by)
    VALUES (p_org_id, v_key, v_entry -> 'value', v_entry ->> 'source', 'drafted', auth.uid())
    ON CONFLICT (org_id, key) DO UPDATE
      SET value = EXCLUDED.value, source = EXCLUDED.source, updated_at = now(), updated_by = EXCLUDED.updated_by
      WHERE f.status = 'drafted';
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;
  PERFORM public.ws_log(p_org_id, 'foundation.drafted', 'foundation_fields', NULL, jsonb_build_object('fields', v_count), auth.uid());
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.foundation_save_field(p_org_id uuid, p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.ws_access(p_org_id), '') NOT IN ('owner', 'service_team', 'platform_admin') THEN
    RAISE EXCEPTION 'Only an Owner or the Vistrial team can edit the foundation.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.foundation_fields AS f (org_id, key, value, source, status, updated_by)
  VALUES (p_org_id, p_key, p_value, 'owner', 'edited', auth.uid())
  ON CONFLICT (org_id, key) DO UPDATE
    SET value = EXCLUDED.value, source = 'owner', status = 'edited', updated_at = now(), updated_by = EXCLUDED.updated_by;
  PERFORM public.ws_log(p_org_id, 'foundation.field_edited', 'foundation_fields', p_key, '{}'::jsonb, auth.uid());
END;
$$;

-- Each confirmation is a new version with a note. Owners only.
CREATE OR REPLACE FUNCTION public.foundation_confirm(p_org_id uuid, p_note text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
  v_fields jsonb;
BEGIN
  IF COALESCE(public.ws_access(p_org_id), '') <> 'owner' THEN
    RAISE EXCEPTION 'Only an Owner can confirm the foundation.' USING ERRCODE = '42501';
  END IF;
  IF p_note IS NULL OR char_length(btrim(p_note)) = 0 THEN
    RAISE EXCEPTION 'Add a short note about what changed.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(jsonb_object_agg(key, jsonb_build_object('value', value, 'source', source)), '{}'::jsonb)
    INTO v_fields
    FROM public.foundation_fields
    WHERE org_id = p_org_id AND value IS NOT NULL;
  IF v_fields = '{}'::jsonb THEN
    RAISE EXCEPTION 'There is nothing to confirm yet.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('foundation:' || p_org_id::text, 0));
  SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM public.foundation_versions WHERE org_id = p_org_id;
  INSERT INTO public.foundation_versions (org_id, version, fields, note, confirmed_by)
  VALUES (p_org_id, v_version, v_fields, btrim(p_note), auth.uid());
  UPDATE public.foundation_fields SET status = 'confirmed' WHERE org_id = p_org_id;
  PERFORM public.ws_log(p_org_id, 'foundation.confirmed', 'foundation_versions', v_version::text, '{}'::jsonb, auth.uid());
  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.foundation_save_draft(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.foundation_save_field(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.foundation_confirm(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.foundation_save_draft(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.foundation_save_field(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.foundation_confirm(uuid, text) TO authenticated, service_role;
