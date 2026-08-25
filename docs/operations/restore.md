# Restore procedure

Someone who did not build this system should be able to run this under pressure.

## Hosted production (Supabase)

1. Confirm the incident in the Operator console (`/app/ops`) and halt dispatch for affected workspaces if data may have been written wrong.
2. In the Supabase dashboard for the **production** project: Database → Backups. Point-in-time recovery must be enabled with **at least 30 days**. Backups are stored separately from the primary and encrypted at rest by Supabase.
3. Restore into a **new** project or a clone. Never restore over a running primary until the clone has been integrity-checked.
4. Integrity check (SQL as service role):

```sql
SELECT count(*) FROM leads;
SELECT count(*) FROM touches;
SELECT count(*) FROM readiness_scores;
SELECT count(*) FROM calls;
SELECT count(*) FROM call_extractions e
  JOIN calls c ON c.id = e.call_id AND c.org_id = e.org_id;
SELECT count(*) FROM revenue_log;
SELECT count(*) FROM baseline_leads;
SELECT count(*) FROM baseline_touches;
SELECT count(*) FROM baseline_calls;
SELECT count(*) FROM baseline_revenue;
```

Every extraction must still join its call. Every call must still join its lead. Baseline child tables must join `baseline_runs`.

5. Point the production Vercel project at the restored database **only after** those counts match the pre-incident numbers (or the expected PITR window).
6. Record the drill on `/app/ops` (duration, verified, notes). Re-run this procedure on a schedule; a restore that worked once is not a program.

## Local / staging drill (this repository)

```bash
npm run ops:restore-drill
```

This builds a source database from migrations + seed, `pg_dump`s it, restores into a clean database, and compares counts for leads, touches, scores, calls, extractions, objections, revenue, and baseline tables. Duration is written to `docs/operations/restore-drill-last.json`. Paste that duration into Operator → Record restore drill.

## Recovery numbers

See `docs/operations/recovery-numbers.md`. Update them after every drill. The duration you measured is the real RTO, not the number anyone guessed.
