# Environments

Three environments, genuinely separated. A shared API key across any two of them is a defect.

| Environment | Database | CRM | Data |
| --- | --- | --- | --- |
| **Development** | Local Postgres / local Supabase | Never a production HighLevel location | Synthetic / seed only |
| **Staging** | Its own Supabase project | HighLevel **sandbox** locations on `GHL_ALLOWED_LOCATION_IDS` only | Generated data. Never a production copy. |
| **Production** | Its own Supabase project | Production HighLevel locations | Real clients |

## Secrets

Each environment has its own: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GHL_CLIENT_ID` / `GHL_CLIENT_SECRET`, `GHL_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `TWILIO_*`, `VAPID_PRIVATE_KEY`.

Production secrets live in the Vercel / Supabase managed stores, not in a laptop `.env`.

## Runtime guards (verified in tests, not assumed)

1. `VISTRIAL_ENV=staging` plus `PRODUCTION_SUPABASE_URLS=<prod project URL>` — if staging is pointed at that URL, `getSupabaseAdmin()` throws `staging_points_at_production_database`. A deployed staging with an empty denylist throws `staging_missing_production_db_denylist`.
2. Staging HighLevel: `GHL_ALLOWED_LOCATION_IDS`. Empty allowlist **blocks every location**. There is no documented location-id format that distinguishes sandbox from production, so an allowlist is the control. Connecting a production location from staging is refused before tokens are stored.

## Staging seed policy

Staging is seeded from `supabase/seed.sql` and generated fixtures. Copying production transcripts into staging is forbidden.

## This cloud agent

This repository cannot provision the three hosted projects. The guards and docs are the product contract; DA creates the Vercel projects and Supabase instances and fills the env vars above.
