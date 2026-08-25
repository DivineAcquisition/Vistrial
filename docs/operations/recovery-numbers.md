# Recovery numbers

Measured locally on 2026-08-25 (`docs/operations/restore-drill-last.json`). Hosted PITR numbers are the product contract for production.

| Metric | Value | Meaning |
| --- | --- | --- |
| **RPO without PITR** | 24 hours | Worst case if only the daily backup exists. |
| **RPO with Supabase PITR** | ~5 minutes | Documented WAL window; confirm in the project. |
| **PITR retention** | 30 days minimum | Required on the production project. |
| **RTO (local drill)** | **428 ms** restore of migrations + seed + fixture into a clean database, integrity verified across leads, touches, calls, transcripts/extractions, objections, scores, revenue, and baseline tables | Always longer than people expect once the dataset is real. Re-run `npm run ops:restore-drill`. |
| **RTO (hosted)** | local drill duration + DNS/env cutover | Cutover is extra. Measure it in staging. |

Data that cannot be regenerated if both primary and backups are gone: transcripts, extractions, objections, touches, scores, revenue, baseline backfill. The CRM still has contacts. Nothing else in Vistrial exists anywhere else.
