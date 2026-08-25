# Runbook: ingestion stopped for all clients

**Detection.** `ingest_backlog:global` or `job_missed:ghl-ingest`. First check: Vercel Cron, `CRON_SECRET`, `/api/cron/ghl-ingest`, then HighLevel status page.

**Immediate action.** If Cron is down, invoke `/api/cron/ghl-ingest` with `Authorization: Bearer $CRON_SECRET` until Cron recovers. Queued `webhook_events` must not be deleted. If the app is returning 5xx, roll back the deployment (previous Vercel deployment). Webhook inserts happen before processing; providers retry 5xx.

**Client communication.** DA posts once to affected owners within 30 minutes if the outage crosses a business-hour lead window: all workspaces are delayed, not just theirs; we will confirm when the backlog is drained. Do not tell clients to "refresh".

**Resolution.** Incident record with the deploy or Cron failure. Prevention is usually "migrations stay additive" or "Cron path still listed in vercel.json".
