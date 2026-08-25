# Runbook: database unavailable

**Detection.** `/api/health` `ok: false`, `ops_health_samples.db_ok = false`, Vercel 500s on `/app`. First check: Supabase status, then project pause, then credential rotation.

**Immediate action.** Do not deploy. Webhook providers will retry; do not flush queues you cannot see. If the primary is gone, restore into a clone using `docs/operations/restore.md`. Halt dispatch is impossible if the DB is down — HighLevel outbound will fail closed when tokens cannot refresh.

**Client communication.** DA tells every active owner within 30 minutes if the app is dark: the product is unavailable; CRM data is still in HighLevel; we will not invent numbers while the database is down.

**Resolution.** Restore, verify integrity, record duration as RTO, write the incident.
