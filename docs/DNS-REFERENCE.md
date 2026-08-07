# DNS reference (vistrial.io)

**Configured by hand at the registrar. Reference only — do not create or verify these from this repository.**

## Application hosts

| Host | Purpose | Record |
|---|---|---|
| `admin.vistrial.io` | Staff workspace | Whatever record the hosting provider specifies for this deployment (typically an A/AAAA or CNAME). |
| `app.vistrial.io` | Client portal | Same deployment as admin; same record form the provider specifies. |

Certificates usually issue automatically once each record resolves.

## Mail (`mail.vistrial.io`)

Outbound transactional email through Resend.

Use the records Resend supplies for the `mail` subdomain, including:

- a DKIM record
- a return-path record

## Root domain

| Record | Purpose |
|---|---|
| SPF | Authorise Resend to send for `vistrial.io`. |
| DMARC | Begin in **monitoring mode** (`p=none`), not enforcement, so legitimate mail is not silently rejected while the configuration settles. |

## Do not add

- **No wildcard record** for `*.vistrial.io`. A wildcard resolves every unconfigured subdomain somewhere, which makes a misconfiguration look like a working system.
- **No `api` subdomain.** Webhook ingestion is on the Supabase project endpoint, not on vistrial.io.
