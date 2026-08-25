-- Prompt 20 rollback.

DROP FUNCTION IF EXISTS public.submit_verification_sample_audit(uuid, int, text);
DROP FUNCTION IF EXISTS public.record_verification_false_positive(uuid, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.set_verification_task_enabled(text, boolean, text);
DROP FUNCTION IF EXISTS public.reporting_integrity_snapshot(uuid);
DROP FUNCTION IF EXISTS public.reporting_recompute_outcome(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.reporting_recompute_outcome(uuid);

DROP TABLE IF EXISTS public.verification_false_positives;
DROP TABLE IF EXISTS public.verification_injected_runs;
DROP TABLE IF EXISTS public.verification_sample_audits;
DROP TABLE IF EXISTS public.verification_usage;
DROP TABLE IF EXISTS public.verification_runs;
DROP TABLE IF EXISTS public.verification_task_settings;

ALTER TABLE public.operator_run_confirmations
  DROP CONSTRAINT IF EXISTS operator_run_confirmations_verification_gate_check;
ALTER TABLE public.operator_run_confirmations
  DROP COLUMN IF EXISTS verification_faults,
  DROP COLUMN IF EXISTS verification_gate;

ALTER TABLE public.follow_up_drafts
  DROP CONSTRAINT IF EXISTS follow_up_drafts_verification_status_check;
ALTER TABLE public.follow_up_drafts
  DROP COLUMN IF EXISTS verification_attempt,
  DROP COLUMN IF EXISTS verification_faults,
  DROP COLUMN IF EXISTS verification_status;

ALTER TABLE public.call_extractions
  DROP CONSTRAINT IF EXISTS call_extractions_verification_status_check;
ALTER TABLE public.call_extractions
  DROP COLUMN IF EXISTS verification_attempt,
  DROP COLUMN IF EXISTS verification_faults,
  DROP COLUMN IF EXISTS verification_status;

DELETE FROM public.ops_job_runs WHERE job_name = 'verification-audit';
DELETE FROM public.ops_job_catalog WHERE job_name = 'verification-audit';
