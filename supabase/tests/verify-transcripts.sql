-- Transcripts, extraction, unmatched queue, corrections, cascade, RLS.

INSERT INTO public.calls (
  id, org_id, lead_id, type, scheduled_at
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'triage',
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.calls (
  id, org_id, lead_id, type, scheduled_at
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  '66666666-6666-4666-8666-666666666666',
  '88888888-8888-4888-8888-888888888888',
  'triage',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Explicit provider id uniqueness per org
INSERT INTO public.calls (
  id, org_id, lead_id, type, transcript_provider_id
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'discovery',
  'rec_unique_1'
);

DO $$
BEGIN
  INSERT INTO public.calls (
    id, org_id, lead_id, type, transcript_provider_id
  ) VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444441',
    'follow_up',
    'rec_unique_1'
  );
  RAISE EXCEPTION 'duplicate transcript_provider_id was allowed';
EXCEPTION
  WHEN unique_violation THEN
    NULL;
END
$$;

-- Extraction is one row per call; re-extract replaces
INSERT INTO public.call_extractions (
  org_id, call_id, summary, budget_signal_state, model_version
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'first',
  'absent',
  'model-a'
);

UPDATE public.call_extractions
SET summary = 'second', model_version = 'model-b'
WHERE call_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

DO $$
DECLARE
  v_count integer;
  v_version text;
BEGIN
  SELECT count(*), max(model_version) INTO v_count, v_version
  FROM public.call_extractions
  WHERE call_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one extraction row, found %', v_count;
  END IF;
  IF v_version <> 'model-b' THEN
    RAISE EXCEPTION 're-extract did not record the new model version';
  END IF;
END
$$;

INSERT INTO public.extraction_corrections (
  org_id, extraction_id, call_id, field_name, previous_value, new_value, actor_member_id
)
SELECT
  e.org_id,
  e.id,
  e.call_id,
  'summary',
  'second',
  'corrected',
  '33333333-3333-4333-8333-333333333333'
FROM public.call_extractions e
WHERE e.call_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.extraction_corrections
  WHERE org_id = '22222222-2222-4222-8222-222222222222'
    AND field_name = 'summary';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'correction frequency is not queryable';
  END IF;
END
$$;

INSERT INTO public.unmatched_transcripts (
  org_id, source, raw_transcript, status
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'manual',
  'unmatched body',
  'open'
);

-- Org A must not see org B call/extraction/unmatched
DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.calls
  WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'org A user saw org B call';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.unmatched_transcripts
  WHERE org_id = '66666666-6666-4666-8666-666666666666';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'org A user saw org B unmatched transcripts';
  END IF;
END
$$;

RESET ROLE;

-- Deleting a lead removes its transcripts and extractions
INSERT INTO public.leads (
  id, org_id, first_name, last_name, status
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  '22222222-2222-4222-8222-222222222222',
  'Temp',
  'Lead',
  'new'
);

INSERT INTO public.calls (
  id, org_id, lead_id, type, raw_transcript, transcript_source
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  'triage',
  'temp transcript',
  'manual'
);

INSERT INTO public.call_extractions (
  org_id, call_id, summary
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
  'temp'
);

DELETE FROM public.leads WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.calls WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5') THEN
    RAISE EXCEPTION 'deleting a lead left its call/transcript';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.call_extractions
    WHERE call_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
  ) THEN
    RAISE EXCEPTION 'deleting a lead left its extraction';
  END IF;
END
$$;

-- recording_url stays unused in this suite
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.calls
    WHERE recording_url IS NOT NULL
      AND org_id = '22222222-2222-4222-8222-222222222222'
  ) THEN
    RAISE EXCEPTION 'audio/recording_url was stored';
  END IF;
END
$$;
