-- Prompt 26, build step 3: the data spine's identity layer.
--
-- lead_identities holds every key a lead is known by (email, phone in E.164,
-- CRM id), with the source that supplied it. Scribe matches a person from any
-- source against it. identity_reviews holds the cases it will not decide on
-- its own: two leads claiming one person, or a phone number alone.
-- Merges stay in lead_merges, whose snapshot makes them reversible.

CREATE TABLE IF NOT EXISTS public.lead_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email', 'phone', 'crm')),
  value text NOT NULL CHECK (char_length(value) BETWEEN 3 AND 320),
  source text NOT NULL,
  source_id text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind, value, lead_id)
);

CREATE INDEX IF NOT EXISTS lead_identities_lookup_idx ON public.lead_identities (org_id, kind, value);
CREATE INDEX IF NOT EXISTS lead_identities_lead_idx ON public.lead_identities (lead_id);

ALTER TABLE public.lead_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_identities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lead_identities TO authenticated;
GRANT ALL ON public.lead_identities TO service_role;
DROP POLICY IF EXISTS lead_identities_select ON public.lead_identities;
CREATE POLICY lead_identities_select ON public.lead_identities FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE TABLE IF NOT EXISTS public.identity_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('conflict', 'phone_only')),
  source text NOT NULL,
  source_id text,
  keys jsonb NOT NULL,
  candidate_lead_ids uuid[] NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'merged', 'kept_apart', 'linked')),
  decided_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS identity_reviews_once_idx
  ON public.identity_reviews (org_id, source, source_id) WHERE status = 'open' AND source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS identity_reviews_open_idx ON public.identity_reviews (org_id, created_at DESC) WHERE status = 'open';

ALTER TABLE public.identity_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.identity_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.identity_reviews TO authenticated;
GRANT ALL ON public.identity_reviews TO service_role;
DROP POLICY IF EXISTS identity_reviews_select ON public.identity_reviews;
CREATE POLICY identity_reviews_select ON public.identity_reviews FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

-- E.164 for the numbers the app stores. Ten digits read as US, eleven starting
-- with 1 as US with the country code, a leading + as already international.
CREATE OR REPLACE FUNCTION public.spine_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    WHEN btrim(p_phone) LIKE '+%' AND length(regexp_replace(p_phone, '\D', '', 'g')) BETWEEN 8 AND 15
      THEN '+' || regexp_replace(p_phone, '\D', '', 'g')
    WHEN length(regexp_replace(p_phone, '\D', '', 'g')) = 10 THEN '+1' || regexp_replace(p_phone, '\D', '', 'g')
    WHEN length(regexp_replace(p_phone, '\D', '', 'g')) = 11 AND regexp_replace(p_phone, '\D', '', 'g') LIKE '1%'
      THEN '+' || regexp_replace(p_phone, '\D', '', 'g')
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.spine_phone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spine_phone(text) TO authenticated, service_role;

-- Keeps a lead's own keys current. Merged leads keep their rows so Undo can
-- give them back; lookups skip leads that were merged away.
CREATE OR REPLACE FUNCTION public.leads_sync_identities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := NULLIF(lower(btrim(NEW.email)), '');
  v_phone text := public.spine_phone(NEW.phone);
  v_source text := COALESCE(NULLIF(NEW.source, ''), 'manual');
BEGIN
  IF v_email IS NOT NULL AND v_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    INSERT INTO public.lead_identities (org_id, lead_id, kind, value, source)
    VALUES (NEW.org_id, NEW.id, 'email', v_email, v_source)
    ON CONFLICT (org_id, kind, value, lead_id) DO NOTHING;
  END IF;
  IF v_phone IS NOT NULL THEN
    INSERT INTO public.lead_identities (org_id, lead_id, kind, value, source)
    VALUES (NEW.org_id, NEW.id, 'phone', v_phone, v_source)
    ON CONFLICT (org_id, kind, value, lead_id) DO NOTHING;
  END IF;
  IF NULLIF(btrim(NEW.ghl_contact_id), '') IS NOT NULL THEN
    INSERT INTO public.lead_identities (org_id, lead_id, kind, value, source, source_id)
    VALUES (NEW.org_id, NEW.id, 'crm', 'gohighlevel:' || btrim(NEW.ghl_contact_id), 'crm', btrim(NEW.ghl_contact_id))
    ON CONFLICT (org_id, kind, value, lead_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.leads_sync_identities() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS leads_sync_identities ON public.leads;
CREATE TRIGGER leads_sync_identities
  AFTER INSERT OR UPDATE OF email, phone, ghl_contact_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_sync_identities();

-- Backfill from what is already known. A record only: nothing fires from it.
INSERT INTO public.lead_identities (org_id, lead_id, kind, value, source, first_seen_at)
SELECT l.org_id, l.id, 'email', lower(btrim(l.email)), COALESCE(NULLIF(l.source, ''), 'manual'), l.created_at
FROM public.leads l
WHERE NULLIF(btrim(l.email), '') IS NOT NULL AND lower(btrim(l.email)) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
ON CONFLICT (org_id, kind, value, lead_id) DO NOTHING;

INSERT INTO public.lead_identities (org_id, lead_id, kind, value, source, first_seen_at)
SELECT l.org_id, l.id, 'phone', public.spine_phone(l.phone), COALESCE(NULLIF(l.source, ''), 'manual'), l.created_at
FROM public.leads l
WHERE public.spine_phone(l.phone) IS NOT NULL
ON CONFLICT (org_id, kind, value, lead_id) DO NOTHING;

INSERT INTO public.lead_identities (org_id, lead_id, kind, value, source, source_id, first_seen_at)
SELECT l.org_id, l.id, 'crm', 'gohighlevel:' || btrim(l.ghl_contact_id), 'crm', btrim(l.ghl_contact_id), l.created_at
FROM public.leads l
WHERE NULLIF(btrim(l.ghl_contact_id), '') IS NOT NULL
ON CONFLICT (org_id, kind, value, lead_id) DO NOTHING;
