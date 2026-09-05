-- ---------------------------------------------------------------------------
-- Webhook events that arrive before their location is linked
--
-- The agency OAuth flow hands the admin a location picker and then waits on a
-- human. Meanwhile the funnel keeps firing. Those webhooks store with a null
-- org_id, and until now they burned the ordinary failure budget and died in
-- about four hours, unreachable: every health and retry query filters on
-- org_id, so a null-org dead row is invisible in settings and cannot be
-- retried. Every lead that opted in during the gap was lost silently.
--
-- Recording the location on the event makes those rows attributable, so
-- linking a location can adopt its own backlog.
-- ---------------------------------------------------------------------------

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS location_id text;

COMMENT ON COLUMN public.webhook_events.location_id IS
  'Provider location the event came from, recorded at ingest. Set even when org_id is null so a later link can adopt the backlog.';

UPDATE public.webhook_events
SET location_id = COALESCE(
  payload ->> 'locationId',
  payload ->> 'location_id',
  payload -> 'data' ->> 'locationId',
  payload -> 'data' ->> 'location_id',
  payload -> 'appointment' ->> 'locationId',
  payload -> 'contact' ->> 'locationId'
)
WHERE location_id IS NULL
  AND payload_purged_at IS NULL;

-- Adoption scans only unclaimed events, so keep the index to that slice.
CREATE INDEX IF NOT EXISTS webhook_events_unclaimed_location_idx
  ON public.webhook_events (location_id, received_at)
  WHERE org_id IS NULL AND location_id IS NOT NULL;
