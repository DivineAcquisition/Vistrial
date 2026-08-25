-- Two-phase destructive change, phase 2.
-- Phase 1 (20260825010000) added ops_alerts.phase1_unused_pad. No application
-- code reads or writes it. This migration drops the column after that code
-- (which never needed it) is what would be deployed.
--
-- Never combine "stop using a column" and "drop it" in one migration.

ALTER TABLE public.ops_alerts DROP COLUMN IF EXISTS phase1_unused_pad;
