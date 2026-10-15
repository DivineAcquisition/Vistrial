-- Facts confirmed for the privacy policy draft.
-- The legal entity is recorded. The mailing address stays empty until the
-- registered agent address is entered, so the policy remains a draft.
-- Supabase is published with the confirmed US East region. Google is listed
-- for embeddings and extraction but stays hidden until a region is confirmed.

UPDATE public.public_site_settings
SET legal_entity_name = COALESCE(NULLIF(btrim(legal_entity_name), ''), 'Divine Agency LLC'),
    privacy_updated_on = CASE
      WHEN privacy_updated_on = DATE '2026-10-14' THEN DATE '2026-10-15'
      ELSE privacy_updated_on
    END
WHERE id = 1;

UPDATE public.subprocessors
SET location = 'United States (US East, N. Virginia)',
    published = true,
    updated_at = now()
WHERE company = 'Supabase'
  AND location IS NULL;

INSERT INTO public.subprocessors (company, purpose, data_handled, location, published, sort_order)
SELECT
  'Google',
  'Embeddings and extraction for workspace features',
  'Workspace text sent for an embedding or an extraction',
  NULL,
  false,
  6
WHERE NOT EXISTS (SELECT 1 FROM public.subprocessors WHERE company = 'Google');
