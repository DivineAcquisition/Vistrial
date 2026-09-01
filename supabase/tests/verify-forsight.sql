-- Forsight foundation: per-workspace source records stay inside their workspace,
-- carry no write path for members, and refuse malformed shapes.
-- IDs use the f0f5f0f5- prefix so they do not collide with earlier fixtures.

INSERT INTO auth.users (id, email)
VALUES
  ('f0f5f0f5-0000-4000-8000-00000000000a', 'forsight-da@vistrial.local'),
  ('f0f5f0f5-0000-4000-8000-00000000000b', 'forsight-client@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, timezone, holdout_percent)
VALUES
  ('f0f5f0f5-0000-4000-8000-000000000001', 'Forsight DA', 'forsight-da', 'America/New_York', 0),
  ('f0f5f0f5-0000-4000-8000-000000000002', 'Forsight Client', 'forsight-client', 'America/New_York', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES
  (
    'f0f5f0f5-0000-4000-8000-000000000011',
    'f0f5f0f5-0000-4000-8000-000000000001',
    'f0f5f0f5-0000-4000-8000-00000000000a',
    'owner',
    'Forsight DA Owner',
    'forsight-da@vistrial.local'
  ),
  (
    'f0f5f0f5-0000-4000-8000-000000000012',
    'f0f5f0f5-0000-4000-8000-000000000002',
    'f0f5f0f5-0000-4000-8000-00000000000b',
    'owner',
    'Forsight Client Owner',
    'forsight-client@vistrial.local'
  )
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO public.forsight_sources (
  org_id, source_type, label, airtable_base_id, airtable_creatives_table
) VALUES
  (
    'f0f5f0f5-0000-4000-8000-000000000001',
    'airtable',
    'DA Pipeline — Client Acquisition',
    'appForsightDaSeed1',
    'Creatives'
  ),
  (
    'f0f5f0f5-0000-4000-8000-000000000002',
    'airtable',
    'Client base without creatives',
    'appForsightClient1',
    NULL
  )
ON CONFLICT (org_id, source_type) DO NOTHING;

INSERT INTO public.forsight_sources (org_id, source_type, label, meta_ad_account_id)
VALUES (
  'f0f5f0f5-0000-4000-8000-000000000001',
  'meta_ads',
  'DA ad account',
  'act_1234567890'
)
ON CONFLICT (org_id, source_type) DO NOTHING;

DO $$
DECLARE
  v_count integer;
  v_missing text;
  v_denied boolean;
BEGIN
  -- A missing table on a client base is recorded, not guessed.
  SELECT airtable_creatives_table INTO v_missing
  FROM public.forsight_sources
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002' AND source_type = 'airtable';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'client base kept a creatives table it does not have';
  END IF;

  -- An Airtable source must name a base.
  v_denied := false;
  BEGIN
    INSERT INTO public.forsight_sources (org_id, source_type)
    VALUES ('f0f5f0f5-0000-4000-8000-000000000002', 'meta_ads');
    INSERT INTO public.forsight_sources (org_id, source_type)
    VALUES ('f0f5f0f5-0000-4000-8000-000000000002', 'airtable');
  EXCEPTION
    WHEN check_violation THEN v_denied := true;
    WHEN unique_violation THEN v_denied := false;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'a source without a base id or ad account id was accepted';
  END IF;

  -- A workspace only sees its own source.
  PERFORM set_config('request.jwt.claim.sub', 'f0f5f0f5-0000-4000-8000-00000000000b', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.forsight_sources;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'client member saw % forsight sources, expected 1', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.forsight_sources
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'client member saw % DA forsight sources', v_count;
  END IF;

  -- Members cannot point their workspace at another base.
  v_denied := false;
  BEGIN
    UPDATE public.forsight_sources
    SET airtable_base_id = 'appSomebodyElse'
    WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002';
  EXCEPTION
    WHEN insufficient_privilege THEN v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'an authenticated member was able to edit a forsight source';
  END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.forsight_sources (org_id, source_type, airtable_base_id)
    VALUES ('f0f5f0f5-0000-4000-8000-000000000002', 'meta_ads', 'appNope');
  EXCEPTION
    WHEN insufficient_privilege THEN v_denied := true;
    WHEN check_violation THEN v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'an authenticated member was able to create a forsight source';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
END
$$;

-- Sources leave with the workspace they belong to.
DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('vistrial.allow_org_wipe', '1', true);
  DELETE FROM public.organizations WHERE id = 'f0f5f0f5-0000-4000-8000-000000000002';
  SELECT count(*) INTO v_count
  FROM public.forsight_sources
  WHERE org_id = 'f0f5f0f5-0000-4000-8000-000000000002';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'deleting a workspace left % forsight sources behind', v_count;
  END IF;
END
$$;
