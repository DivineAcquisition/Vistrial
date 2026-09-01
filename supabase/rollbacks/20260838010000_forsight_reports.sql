-- Rollback for 20260838010000_forsight_reports.sql.
--
-- Dropping the table takes the generated reports with it, which is the one
-- thing the schema otherwise forbids. That is acceptable only as a rollback of
-- a release that should not have shipped; the triggers have to go first
-- because they exist to refuse exactly this.

DELETE FROM public.ops_job_runs WHERE job_name = 'forsight-reports';
DELETE FROM public.ops_job_catalog WHERE job_name = 'forsight-reports';

DROP TRIGGER IF EXISTS forsight_report_sends_no_update ON public.forsight_report_sends;
DROP TRIGGER IF EXISTS forsight_reports_no_update ON public.forsight_reports;

DROP TABLE IF EXISTS public.forsight_report_sends;
DROP TABLE IF EXISTS public.forsight_reports;

DROP FUNCTION IF EXISTS public.forsight_next_report_version(uuid, date);
DROP FUNCTION IF EXISTS public.forsight_reports_are_immutable();

DROP TYPE IF EXISTS public.forsight_report_actor;
