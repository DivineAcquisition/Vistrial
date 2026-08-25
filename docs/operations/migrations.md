# Migrations

New SQL goes in `supabase/migrations/` via `supabase migration new` when the CLI is available; otherwise a `YYYYMMDDHHMMSS_name.sql` file matching existing timestamps.

Every new migration has `supabase/rollbacks/<same-timestamp>_name.sql`. `npm run ops:migration-rollback` applies this prompt's rollbacks on a throwaway database and re-applies them.

Historical migrations before Prompt 14 do not all have rollback files. That gap is real. New work does not add to it.

Destructive changes stay two-phase: deploy code that ignores the old shape, confirm, then drop in a later migration. `20260825020000_drop_ops_alerts_phase1_pad.sql` is the demonstration.
