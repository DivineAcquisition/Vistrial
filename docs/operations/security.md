# Security

## Dependency scanning

Every CI build runs `npm audit --audit-level=high`. High and critical findings block the deploy. Lower findings are tracked, not ignored silently.

## Headers

`next.config.ts` sets CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy. CSP allows Supabase and the HighLevel booking embed used on the marketing site. `unsafe-inline` / `unsafe-eval` remain because Next.js 16 still emits inline scripts without a nonce pipeline in this app.

## Rate limits

| Route | Window | Limit |
| --- | --- | --- |
| `/api/ghl/webhooks`, transcript webhooks, Resend | 60s / IP | 120 |
| Login password + magic link | 15m / email+IP | 8 |
| `/api/marketing/events` | 60s / IP | 60 |

Keys are SHA-256. Raw emails are not stored in `rate_limit_buckets`.

## Secrets in the client bundle

`node scripts/assert-no-secrets-in-client.mjs` greps `.next/static` after `next build`. CI fails if `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `sk-ant-` plus a token, Twilio, VAPID private, Cron, Resend, or GHL secrets appear. The supabase-js client is allowed to *name* the `sb_secret_` prefix so it can refuse a secret key in the browser; a real key value still fails the scan.

## Encryption

TLS in transit on Vercel and Supabase. Database and backups encrypted at rest on hosted Supabase. GHL tokens are encrypted with `GHL_TOKEN_ENCRYPTION_KEY` before storage.
