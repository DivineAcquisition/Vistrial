-- Touch ingestion: raw webhook bodies, dead-letter table, human touches
-- without a mapped operator, and a generated time-to-first-human-touch.
-- Additive. Does not drop webhook_events or rewrite existing payloads.

-- ---------------------------------------------------------------------------
-- Raw body is the system of record. Retention still tombstones payload jsonb
-- after 14 days; this column is not cleared by that update.
-- ---------------------------------------------------------------------------

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS raw_body text;

COMMENT ON COLUMN public.webhook_events.raw_body IS
  'Original request body. System of record. run_data_retention tombstones payload jsonb after 14 days and leaves this column in place.';

-- ---------------------------------------------------------------------------
-- Dead letters. Failed or malformed webhooks are never silently dropped.
-- org_id is nullable: signature rejections and unresolved payloads still persist.
-- Writes are service-role. Authenticated SELECT is granted so RLS can deny it.
-- ---------------------------------------------------------------------------

CREATE TABLE public.webhook_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  webhook_event_id uuid REFERENCES public.webhook_events (id) ON DELETE SET NULL,
  source public.webhook_source NOT NULL DEFAULT 'ghl',
  reason text NOT NULL,
  event_type text,
  provider_event_id text,
  raw_body text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_dead_letters_reason_present CHECK (btrim(reason) <> '')
);

COMMENT ON TABLE public.webhook_dead_letters IS
  'Failed or malformed webhooks with the original payload. Service-role writes. Not a second ingest queue.';

CREATE UNIQUE INDEX webhook_dead_letters_event_id_key
  ON public.webhook_dead_letters (webhook_event_id)
  WHERE webhook_event_id IS NOT NULL;

CREATE INDEX webhook_dead_letters_org_created_idx
  ON public.webhook_dead_letters (org_id, created_at DESC);

CREATE INDEX webhook_dead_letters_reason_idx
  ON public.webhook_dead_letters (reason, created_at DESC);

ALTER TABLE public.webhook_dead_letters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.webhook_dead_letters FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.webhook_dead_letters TO authenticated;
GRANT ALL ON TABLE public.webhook_dead_letters TO service_role;

-- ---------------------------------------------------------------------------
-- A GHL operator who is not in org_members is still a human touch.
-- first_human_touch_at is maintained by sync_lead_touch_times on human outbound.
-- ---------------------------------------------------------------------------

ALTER TABLE public.touches
  DROP CONSTRAINT IF EXISTS touches_human_requires_actor;

-- ---------------------------------------------------------------------------
-- Duration cache derived from the two timestamps so it cannot drift.
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS time_to_first_human_touch_seconds integer
  GENERATED ALWAYS AS (
    CASE
      WHEN first_human_touch_at IS NULL THEN NULL
      ELSE GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (first_human_touch_at - opted_in_at)))
      )::integer
    END
  ) STORED;

COMMENT ON COLUMN public.leads.time_to_first_human_touch_seconds IS
  'Seconds from opted_in_at to first_human_touch_at. Generated; not written by application code.';

COMMENT ON COLUMN public.touches.outcome IS
  'Result of the touch when known. Queue writes are operator-logged. Ingest sets replied on inbound messages and connected on held calendar calls.';
