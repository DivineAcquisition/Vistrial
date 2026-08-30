# Third-party processors

A client's legal review will ask. This is the list.

| Processor | What it is | What data it touches | Where |
| --- | --- | --- | --- |
| **Supabase** | Database, Auth, storage of application data | All workspace data, including transcripts, extractions, members | Supabase-hosted Postgres (region of the project) |
| **Vercel** | Application hosting, Cron, logs | HTTP requests, env secrets, deployment artifacts. Logs must not contain transcript or contact payloads (existing redaction). | Vercel |
| **Anthropic** | Model API for extraction and follow-up drafting | Transcript text (extraction) and draft inputs (lead facts, not full CRM dumps) | Anthropic API |
| **LeadConnector** | CRM + messaging | Contacts, messages, appointments. Vistrial stores encrypted OAuth tokens and inbound webhook payloads (short retention). | LeadConnector |
| **Resend** | Email delivery for operator notifications | Notification title/body (first name or a count; never transcript text) | Resend |
| **Twilio** | SMS for emergency operator alerts when enabled | Phone number + short alert body | Twilio |
| **Web Push (VAPID)** | Browser push to operators | Same lock-screen-safe notification copy | Browser push services |

Vistrial does not send prospect transcripts to Resend, Twilio, or web push.

See also `docs/legal/call-data.md` for what happens to call recordings and transcripts.
