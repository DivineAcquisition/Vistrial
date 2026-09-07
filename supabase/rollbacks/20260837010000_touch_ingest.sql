-- Inverse of 20260837010000_touch_ingest.sql.

DROP TABLE IF EXISTS public.webhook_dead_letters;

ALTER TABLE public.leads
  DROP COLUMN IF EXISTS time_to_first_human_touch_seconds;

ALTER TABLE public.webhook_events
  DROP COLUMN IF EXISTS raw_body;

ALTER TABLE public.touches
  DROP CONSTRAINT IF EXISTS touches_human_requires_actor;

ALTER TABLE public.touches
  ADD CONSTRAINT touches_human_requires_actor CHECK (
    type <> 'human' OR actor_member_id IS NOT NULL
  );
