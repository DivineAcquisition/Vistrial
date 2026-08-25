# Monitoring and alerting

Alerts go to DA (`OPS_ALERT_WEBHOOK_URL`, falling back to `INGESTION_ALERT_WEBHOOK_URL`). They never go to clients.

`/api/cron/ops-health` (every minute) evaluates:

- **Jobs that did not run** (not only jobs that failed): last success older than interval + grace. Check first is stored on `ops_job_catalog.check_first`.
- Global ingest backlog older than 30 minutes
- Per-client: no leads in 6 hours when CRM is connected (and the org has actually ingested before); no transcripts in 48 hours when a recorder is connected; extraction dead rate >20% over 24h with n≥10; draft rejection >30% over 7d with n≥10
- Notification dead letters ≥5 in 24 hours

HTTP error rate is sampled on public webhook routes (`ops_http_errors`). Database connectivity, `pg_stat_activity` connection counts, and in-flight queries older than one second are sampled into `ops_health_samples.detail.runtime`. Slow-query logging on hosted Postgres remains the Supabase slow-query setting; the sample is what the Operator console can show without another product.

Gradual degradation: compare the 24h error rate on the Operator console to recent samples. A job that silently stops still pages via missed-heartbeat, which is the failure class that otherwise looks like current numbers.

To verify missed-job alerting: set `ops_job_runs.last_success_at` for `ghl-ingest` an hour in the past and call `evaluate_ops_alerts()`. `verify-hardening.sql` does this.
