# Recovery numbers

These are operational facts. Replace the local-drill duration after each run of `npm run ops:restore-drill`. Hosted PITR numbers are the product contract for production.

| Metric | Value | Meaning |
| --- | --- | --- |
| **RPO without PITR** | 24 hours | Worst case if only the daily backup exists. |
| **RPO with Supabase PITR** | ~5 minutes | Documented WAL window; confirm in the project. |
| **PITR retention** | 30 days minimum | Required on the production project. |
| **RTO (local drill)** | see `restore-drill-last.json` | Full restore into a clean database, integrity verified. Always longer than people expect. |
| **RTO (hosted)** | local drill duration + DNS/env cutover | Cutover is extra. Measure it in staging. |

Data that cannot be regenerated if both primary and backups are gone: transcripts, extractions, objections, touches, scores, revenue, baseline backfill. The CRM still has contacts. Nothing else in Vistrial exists anywhere else.
