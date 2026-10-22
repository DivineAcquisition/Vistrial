-- Rolls back 20261022020000_workflows_foundation.sql.
-- Copies the rows to vistrial_rollback_keep first. Run in one transaction.

BEGIN;

CREATE SCHEMA IF NOT EXISTS vistrial_rollback_keep;
REVOKE ALL ON SCHEMA vistrial_rollback_keep FROM PUBLIC, anon, authenticated;
DROP TABLE IF EXISTS vistrial_rollback_keep.workflows_20261022;
CREATE TABLE vistrial_rollback_keep.workflows_20261022 AS
SELECT 'playbooks' AS source, id::text AS ref, to_jsonb(p) AS data FROM public.playbooks p
UNION ALL
SELECT 'playbook_versions', id::text, to_jsonb(v) FROM public.playbook_versions v
UNION ALL
SELECT 'workflow_enrollments', id::text, to_jsonb(e) FROM public.workflow_enrollments e
UNION ALL
SELECT 'lead_stage_history', id::text, to_jsonb(h) FROM public.lead_stage_history h;

DROP TRIGGER IF EXISTS leads_record_stage_change ON public.leads;
DROP FUNCTION IF EXISTS public.leads_record_stage_change();
DROP TABLE IF EXISTS public.workflow_enrollments;
ALTER TABLE IF EXISTS public.playbooks DROP CONSTRAINT IF EXISTS playbooks_published_version_fkey;
DROP TABLE IF EXISTS public.playbook_versions;
DROP TABLE IF EXISTS public.playbooks;
DROP TABLE IF EXISTS public.lead_stage_history;
DROP FUNCTION IF EXISTS public.workflow_enrollments_lead_limit();
DROP FUNCTION IF EXISTS public.playbooks_published_limit();
DROP FUNCTION IF EXISTS public.playbook_versions_freeze();
ALTER TABLE public.organizations DROP COLUMN IF EXISTS workflows_enabled;

COMMIT;
