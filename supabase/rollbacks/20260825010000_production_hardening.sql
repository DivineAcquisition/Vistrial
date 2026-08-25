-- Rollback for 20260825010000_production_hardening.sql
-- Restores schema only. Purged transcript bodies and deleted notification
-- rows cannot be resurrected from this file — that is what backups are for.

DROP FUNCTION IF EXISTS public.evaluate_ops_alerts();
DROP FUNCTION IF EXISTS public.sample_db_runtime();
DROP FUNCTION IF EXISTS public.mark_org_offboarded(uuid, text, integer);
DROP FUNCTION IF EXISTS public.delete_org_data(uuid, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.org_scoped_row_counts(uuid);
DROP FUNCTION IF EXISTS public.run_data_retention(boolean);
DROP FUNCTION IF EXISTS public.record_ops_http_sample(text, boolean);
DROP FUNCTION IF EXISTS public.resolve_ops_alert(text);
DROP FUNCTION IF EXISTS public.upsert_ops_alert(text, text, text, uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS public.record_ops_job_run(text, boolean, text, integer, jsonb);
DROP FUNCTION IF EXISTS public.consume_rate_limit(text, integer, integer);

DROP TABLE IF EXISTS public.org_deletion_records;
DROP TABLE IF EXISTS public.retention_runs;
DROP TABLE IF EXISTS public.ops_restore_drills;
DROP TABLE IF EXISTS public.ops_incidents;
DROP TABLE IF EXISTS public.ops_health_samples;
DROP TABLE IF EXISTS public.ops_http_errors;
DROP TABLE IF EXISTS public.ops_alerts;
DROP TABLE IF EXISTS public.ops_job_runs;
DROP TABLE IF EXISTS public.ops_job_catalog;
DROP TABLE IF EXISTS public.rate_limit_buckets;

ALTER TABLE public.webhook_events DROP COLUMN IF EXISTS payload_purged_at;
ALTER TABLE public.unmatched_transcripts DROP COLUMN IF EXISTS transcript_purged_at;
ALTER TABLE public.calls DROP COLUMN IF EXISTS transcript_purged_at;

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_transcript_retention_days_check;
ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS transcript_retention_days,
  DROP COLUMN IF EXISTS inactive_at,
  DROP COLUMN IF EXISTS offboarded_at,
  DROP COLUMN IF EXISTS delete_after,
  DROP COLUMN IF EXISTS offboard_reason;

-- Restore the pre-hardening quote check (purged-call skip removed).
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

CREATE OR REPLACE FUNCTION public.forbid_readiness_score_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'readiness_scores is append-only';
END;
$$;

CREATE OR REPLACE FUNCTION public.forbid_case_file_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'case file history is not deleted';
END;
$$;
