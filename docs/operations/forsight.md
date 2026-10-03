# Forsight

Forsight is Vistrial's tracking and metrics section: applications, qualified leads, booked calls, held calls, closed revenue, and what each of them costs, per workspace, week over week. This document covers the foundation only — routing, tenancy, sources, and credentials. No metrics render yet.

## What Forsight is not

It does not own data. Every figure it shows is read from somewhere that already holds it: Vistrial's own tables for lead, call and outcome activity, Meta for ad spend, GoHighLevel for appointment and message counts.

It writes nothing back to any source. Generated monthly reports are written to our own `forsight_reports` table and nowhere else. Everything else is read-only, and that should stay true.

## Tenancy

Forsight uses Vistrial's existing workspace model unchanged: `organizations`, `org_members`, the `vistrial_org` cookie, `getAuthContext()`, and the same row-level security as every other section. There is no Forsight-specific login, session, or workspace concept.

Divine Acquisition is an ordinary workspace with an ordinary source record. Nothing about it is special-cased, which is the point: if the DA workspace works, a client workspace works, because they are the same shape.

## Where a workspace's metrics live

Each workspace has one row per source type in `public.forsight_sources`:

| Column | Meaning |
| --- | --- |
| `source_type` | `vistrial_core`, `meta_ads`, or `ghl`. A workspace reads its metrics from `vistrial_core` and has at most one such row, enforced by a partial unique index. |
| `meta_ad_account_id` | Only on `meta_ads` rows, and only for workspaces whose ad spend Forsight reads. |
| `ghl_calendar_id` | Only on `ghl` rows. `NULL` reads every calendar on the location, which is what the rest of Vistrial already does. |

Source details are database rows and not environment variables on purpose: env vars cannot vary by tenant, so every client added would otherwise be a deployment.

### Isolation

`forsight_sources` has RLS on. Reads are scoped to `user_org_ids()`; writes require `is_platform_admin()`. A client user's insert is refused outright and their update or delete matches zero rows, so provisioning is closed to them in Postgres and not merely hidden behind a missing link. `supabase/tests/verify-forsight.sql` asserts all of it, plus that an operator can do the same things a client cannot.

## The metrics source

Every workspace reads its metrics from `vistrial_core`: `leads`, `calls`, `touches`, `revenue_log`, `next_actions`, and `call_extractions`, the tables the rest of the app already writes. Ad spend is read live from the workspace's Meta source, or reported as unavailable.

The adapter hands back figures that are already computed, which is what lets a page ask for a workspace's weekly metrics without learning where they came from. No dashboard page computes a metric.

### Every cost written once

`src/lib/forsight/formulas.ts` holds every cost and ratio Forsight reports. The edge cases matter more than the arithmetic: a zero denominator with spend behind it returns `No audits yet` or `No closes yet`, a zero denominator with no spend returns blank, and neither returns zero. A dash and "no closes yet" say different things to a reader, and `$0` says something false.

### What core cannot produce

- **Creative performance.** There is no per-ad-creative data in core: `ad_spend_days` is campaign by day, with no ad name, impressions, or clicks. The page says so rather than showing an empty table.
- **Ad spend.** Spend comes from the workspace's own Meta source. `ad_spend_days` exists but belongs to the owner-portal integration, with its own sync lifecycle and a rolling window; borrowing another subsystem's numbers is how a dashboard ends up confidently wrong. Without a Meta source, every metric that divides by spend reads `No ad spend connected` — never `$0`.

## Provisioning a client

Every organization is already a Forsight workspace. With no source row at all, Forsight reads that workspace's own Vistrial tables. Meta and LeadConnector are operator-only extras at `/app/forsight/sources`: pick a workspace, pick a source type, enter what that type needs, and test the connection; the save button stays disabled until the test passes, and the save action re-runs the test server-side and refuses to write if it fails. A source that saves cleanly and fails at the client's first login is the worst version of this feature.

Clients never touch any of it. The page 404s for a client user, and Postgres refuses their writes regardless.

`/app/forsight/workspaces` is the cross-workspace overview: every workspace's cost per audit held, CAC, pipeline health counts, and last month's report (generated, version, sent), one row each, with a link into that workspace's Forsight. It shows one tenant's metrics beside another's, which is exactly the boundary the rest of the architecture enforces — legitimate because DA runs these systems on clients' behalf, and gated at the data layer, since the read goes through the operator's own client and `user_org_ids()` decides what comes back. A client user gets a not-found, not a list of one.

Both use the existing `platform_admins` concept. No new permission was introduced.

## Credentials

Meta uses one Divine Acquisition credential per platform, held in environment configuration:

```
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=
```

That works because DA owns every ad account Forsight reads. Client users never see, enter, or manage any part of it, and no screen in Forsight asks anyone for a key, URL, id, or field name.

**GoHighLevel is different, and deliberately so.** There is no Forsight GHL credential of any kind. Authentication comes from the per-sub-account OAuth connection Vistrial's core already holds in `ghl_connections`, and every call goes through `ghlRequest(db, orgId, path)`, which resolves and refreshes that org's token. Forsight does not stand up a second GHL connection, and a workspace whose LeadConnector connection is not active simply reports that section as unavailable.

## GoHighLevel

Read-only and live. Forsight never writes to GHL.

- **Appointments** — `/calendars/events`, counted by status into booked, showed, no-showed, and cancelled. Uses the calendar on the source record, or every calendar on the location when that is `NULL`.
- **Message volume** — outbound split by SMS and email, plus inbound replies.

Message *content* is never read or displayed. That rule holds across the product and Forsight is not an exception: the shared history helpers strip bodies before parsing, and Forsight keeps nothing but a direction, a channel, and a timestamp.

GHL has no aggregate message-count endpoint, so a count means walking conversations. That walk is bounded (5 pages, 100 conversations) and rate-limited through `try_consume_ghl_rate`. When it hits a cap the page says the counts are floors rather than totals.

## Spend today

Weekly Pulse shows today's spend read live from Meta, labelled as live rather than folded into the week-to-date figures beside it. It shares no code path with them, writes nothing, and never throws: if Meta is unavailable, that one figure reads as unavailable and the rest of the page is unaffected.

## Reading

Everything goes through `src/lib/forsight/provider.ts`. No page reaches a source directly.

- A failed read **throws** `ForsightSourceError` naming the workspace. It never returns an empty array, because an empty dashboard that is really a broken connection is worse than an error screen.
- Rate limits retry with backoff before failing.
- Nothing in Forsight writes to a source. There is no write module to grep for.

To prove a workspace's connections without a screen, a Divine Acquisition operator can call:

```
GET /api/forsight/checks
GET /api/forsight/checks?source=meta&since=2026-08-01&until=2026-08-31
```

Both are read-only, platform-admin only, and scoped to the caller's active workspace.

## Monthly client reports

A report is a snapshot of last month, frozen at generation. Viewing it reads `forsight_reports.payload` and never re-queries a source. That is the opposite of every dashboard page, and it is deliberate: a client will quote a number from it months later, and a figure that has quietly moved destroys more trust than a bad figure ever did.

Six sections, always the same: funnel, speed and touch, revenue, nurture health, team scorecard, objections. A line the workspace's source cannot produce is omitted (never shown as zero or "unavailable") and logged so an operator can see it. A section with nothing in it becomes one plain sentence.

There is no per-workspace contacts table. Recipients are the active owner and admin members on `org_members`. Generation never emails anyone. Sending is an explicit operator action, logged in `forsight_report_sends` (who, when, which version, to whom). Regeneration inserts the next version beside the old one. Nothing updates or deletes a generated row; the only delete is the workspace itself going away.

Scheduled generation runs at 09:00 UTC on the 3rd of the month via `/api/cron/forsight-reports` (`forsight-reports` in the job catalog) and skips a period that already has a report. An operator can generate off-cycle from `/app/forsight/reports`. Export is a PDF built from the stored payload with `pdf-lib`, so the team table and the closed-versus-lost comparison survive.

## Hosting

Forsight is served at `pulse.vistrial.io`. The proxy redirects `/` on that host to `/app/forsight`, so the existing login gate covers it and a logged-out visitor comes back to Forsight on the same host after signing in. `pulse.vistrial.io` is on the allowlist in `src/lib/app-url.ts` so magic links do not bounce people to `app.vistrial.io`.

Two things live outside this repository and must be done by hand:

1. Add `pulse.vistrial.io` to the Vercel project and point DNS at it. The app is one deployment; this is a second hostname on it, not a second project.
2. Add `https://pulse.vistrial.io/auth/callback` to the Supabase Auth redirect allowlist.
