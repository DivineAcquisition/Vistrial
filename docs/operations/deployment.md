# Migrations and deployment

- Every schema change is a file under `supabase/migrations/`, applied in filename order. No manual production schema edits.
- Every **new** migration ships a matching file under `supabase/rollbacks/`. Test it with `npm run ops:migration-rollback` before the migration reaches production.
- Migrations run **before** the application deploy. New columns are additive with defaults so a still-running previous instance can serve live requests against the new schema.
- Destructive changes are two-phase. This prompt demonstrated it: `ops_alerts.phase1_unused_pad` was added unused, then dropped in `20260825020000_drop_ops_alerts_phase1_pad.sql` after application code that never read it would already have been what is deployed. Never drop a live column in the same migration that stops using it.
- Application rollback: Vercel → previous deployment. Additive schema means the previous app still runs. Do not roll back a migration in production unless the matching rollback file has been executed in staging.

## Webhooks during a deploy

`POST /api/ghl/webhooks` and transcript webhooks **insert first**, then process with `after()`. An in-flight request either completes the insert or returns 5xx and the provider retries. Queued `webhook_events` survive the swap. A deploy during business hours must not require draining the queue first.

## Verified in this repo

- Forward + rollback + re-apply of the Prompt 14 migrations: `scripts/test-migration-rollback.sh`
- Two-phase drop: `verify-hardening.sql` asserts `phase1_unused_pad` is gone after both migrations
- Queued `webhook_events` remaining pending without a processor: `verify-hardening.sql` (the deploy-during-ingest contract)
- Application rollback on Vercel is the previous deployment against this additive schema. This repository cannot click that button in a hosted project; old app + new columns is the compatibility that makes that rollback safe.
