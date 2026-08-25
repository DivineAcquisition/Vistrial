# Runbook: suspected unauthorized access

**Detection.** Unknown login, platform_admin row you did not add, exports you did not start, or a token in a client bundle (CI would have failed — treat a missed CI as part of this). First check: Auth users, `org_deletion_records`, Vercel access log, Supabase auth logs. Do not reset production secrets from a staging laptop.

**Immediate action.** Revoke sessions for the suspected user. Rotate the env that was exposed (service role, GHL encryption key, Anthropic, Resend, Twilio, VAPID, Cron) **in that environment only**. Halt dispatch if outbound credentials may have been used. Preserve logs.

**Client communication.** If a client's workspace was in scope, DA tells the owner within one hour: what we know was accessed, what we rotated, that their prospects were or were not messaged. Legal (`legal@divineacquisition.io`) is copied. Do not speculate.

**Resolution.** Incident with timeline, cause, impact, prevention. Add the person who had excess access to the production secret list or remove them.
