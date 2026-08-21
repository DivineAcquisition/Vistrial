-- Build Check B fixes: activation clock, closed-won INSERT guard,
-- serialized dispatch claim, quote-integrity helper.

-- ---------------------------------------------------------------------------
-- Org activation. created_at is when the row appeared. activated_at is when
-- the workspace became live (first successful CRM link). Never overwrite.
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN activated_at timestamptz;

COMMENT ON COLUMN public.organizations.activated_at IS
  'When this workspace became live. Set once on the first successful CRM connection. Not created_at.';

CREATE OR REPLACE FUNCTION public.mark_org_activated(p_org_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at timestamptz;
BEGIN
  UPDATE public.organizations
  SET activated_at = COALESCE(activated_at, now())
  WHERE id = p_org_id
  RETURNING activated_at INTO v_at;
  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_org_activated(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_org_activated(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Closed-won cannot be inserted or updated except through a recorded payment.
-- The previous guard only fired AFTER UPDATE OF status, so INSERT slipped.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_closed_won()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'closed_won'
      AND current_setting('vistrial.allow_closed_won', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'closed_won follows a recorded payment';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status = 'closed_won'
    AND current_setting('vistrial.allow_closed_won', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'closed_won follows a recorded payment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_guard_closed_won ON public.leads;
CREATE TRIGGER leads_guard_closed_won
  BEFORE INSERT OR UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_won();

-- Keep the history trigger's closed_won check as a second belt. INSERT still
-- has no history row, which is correct (there is no from_status).

-- ---------------------------------------------------------------------------
-- Dispatch claim: one sender at a time. claimed_at is a lease, not a status.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ghl_dispatches
  ADD COLUMN claimed_at timestamptz;

COMMENT ON COLUMN public.ghl_dispatches.claimed_at IS
  'Lease taken by claim_ghl_dispatch. Stale after two minutes so a crashed sender can be retried.';

CREATE OR REPLACE FUNCTION public.claim_ghl_dispatch(p_id uuid)
RETURNS public.ghl_dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ghl_dispatches;
BEGIN
  UPDATE public.ghl_dispatches d
  SET claimed_at = clock_timestamp()
  WHERE d.id = p_id
    AND (
      (d.status = 'queued' AND d.available_at <= now())
      OR (
        d.status = 'failed'
        AND d.failure_reason = 'touch_insert_failed'
        AND d.ghl_message_id IS NOT NULL
      )
    )
    AND (d.claimed_at IS NULL OR d.claimed_at < now() - interval '2 minutes')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ghl_dispatch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ghl_dispatch(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Quality failures stay queryable even when a draft insert later fails.
-- follow_up_events already carries generation failures with a null draft_id.
-- ---------------------------------------------------------------------------

ALTER TYPE public.follow_up_event_kind ADD VALUE IF NOT EXISTS 'enqueue_failed';

-- ---------------------------------------------------------------------------
-- Every stored extraction quote must appear in its source transcript.
-- Used by verify-integrity.sql and by operators querying live data.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.extraction_quotes_not_in_transcript()
RETURNS TABLE (
  extraction_id uuid,
  call_id uuid,
  org_id uuid,
  quote_text text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    e.id,
    e.call_id,
    e.org_id,
    trim(q.elem ->> 'text') AS quote_text
  FROM public.call_extractions e
  JOIN public.calls c ON c.id = e.call_id AND c.org_id = e.org_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(e.quotes) = 'array' THEN e.quotes
      ELSE '[]'::jsonb
    END
  ) AS q(elem)
  WHERE trim(COALESCE(q.elem ->> 'text', '')) <> ''
    AND position(
      regexp_replace(lower(trim(q.elem ->> 'text')), '\s+', '', 'g')
      IN regexp_replace(lower(COALESCE(c.raw_transcript, '')), '\s+', '', 'g')
    ) = 0;
$$;

REVOKE ALL ON FUNCTION public.extraction_quotes_not_in_transcript() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extraction_quotes_not_in_transcript() TO authenticated, service_role;
