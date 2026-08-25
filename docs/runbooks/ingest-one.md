# Runbook: ingestion stopped for one client

**Detection.** Operator console: that workspace is stale, or `no_leads:<orgId>` / ingest backlog for one org. First check: `ghl_connections.status`, then `webhook_events` for that `org_id`.

**Immediate action.** Confirm the HighLevel location still points at this environment's webhook URL. Do not reconnect a production location from staging. If tokens are broken, reconnect OAuth. Do not replay payloads that have already been purged.

**Client communication.** DA tells the owner within one hour of confirmed stoppage: ingestion from their CRM paused at `<time>`, no new leads since `<time>`, we are reconnecting, no messages were sent in error. Do not wait for them to notice an empty queue.

**Resolution.** Record an `ops_incidents` row: timeline, cause, impact, prevention. Page resolves when `evaluate_ops_alerts` sees a fresh lead or processed webhook.
