-- Rollback for 20260825020000_drop_ops_alerts_phase1_pad.sql
-- Re-adds the unused pad column. Safe: application never reads it.

ALTER TABLE public.ops_alerts
  ADD COLUMN IF NOT EXISTS phase1_unused_pad text;
