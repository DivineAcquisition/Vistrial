# Forsight

Forsight is Vistrial's tracking and metrics section: applications, qualified leads, booked calls, held calls, closed revenue, and what each of them costs, per workspace, week over week. This document covers the foundation only — routing, tenancy, sources, and credentials. No metrics render yet.

## What Forsight is not

It does not own data and does not calculate anything its sources do not already calculate. It is a display layer over external sources.

It performs exactly one write, described under [The spend sync](#the-spend-sync). Everything else is read-only, and that should stay true.

## Tenancy

Forsight uses Vistrial's existing workspace model unchanged: `organizations`, `org_members`, the `vistrial_org` cookie, `getAuthContext()`, and the same row-level security as every other section. There is no Forsight-specific login, session, or workspace concept.

Divine Acquisition is an ordinary workspace with an ordinary source record. Nothing about it is special-cased, which is the point: if the DA workspace works, a client workspace works, because they are the same shape.

## Where a workspace's metrics live

Each workspace has one row per source type in `public.forsight_sources`:

| Column | Meaning |
| --- | --- |
| `source_type` | `airtable`, `meta_ads`, or `ghl`. A `vistrial_core` type, reading the main app's own database, is next and slots in behind the same interface. |
| `airtable_base_id` | The base DA created for that client, or `DA Pipeline — ClientAcquisition` for ours. |
| `airtable_*_table` | Names of the Leads, Creatives, Weekly Summary, and Touches tables. `NULL` means this base does not have that table, and the display layer treats those metrics as unavailable rather than broken. |
| `meta_ad_account_id` | Only on `meta_ads` rows, and only for workspaces whose ad spend Forsight reads. |
| `ghl_calendar_id` | Only on `ghl` rows. `NULL` reads every calendar on the location, which is what the rest of Vistrial already does. |

Source details are database rows and not environment variables on purpose: env vars cannot vary by tenant, so every client added would otherwise be a deployment.

### Isolation

`forsight_sources` has RLS on, with a single `SELECT` policy scoped to `user_org_ids()`. `authenticated` has **no** insert, update, or delete grant at all — creating and editing source records is an internal operator action performed with the service role. `supabase/tests/verify-forsight.sql` asserts the cross-workspace read is empty and that a member's write is refused.

## Credentials

Airtable and Meta use one Divine Acquisition credential per platform, held in environment configuration:

```
AIRTABLE_API_KEY=
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=
```

That works because DA owns every base and ad account Forsight reads. Client users never see, enter, or manage any part of it, and no screen in Forsight asks anyone for a key, URL, id, or field name.

There is deliberately no Airtable base id in the environment.

**GoHighLevel is different, and deliberately so.** There is no Forsight GHL credential of any kind. Authentication comes from the per-sub-account OAuth connection Vistrial's core already holds in `ghl_connections`, and every call goes through `ghlRequest(db, orgId, path)`, which resolves and refreshes that org's token. Forsight does not stand up a second GHL connection, and a workspace whose LeadConnector connection is not active simply reports that section as unavailable.

## GoHighLevel

Read-only and live. Forsight never writes to GHL.

- **Appointments** — `/calendars/events`, counted by status into booked, showed, no-showed, and cancelled. Uses the calendar on the source record, or every calendar on the location when that is `NULL`.
- **Message volume** — outbound split by SMS and email, plus inbound replies.

Message *content* is never read or displayed. That rule holds across the product and Forsight is not an exception: the shared history helpers strip bodies before parsing, and Forsight keeps nothing but a direction, a channel, and a timestamp.

GHL has no aggregate message-count endpoint, so a count means walking conversations. That walk is bounded (5 pages, 100 conversations) and rate-limited through `try_consume_ghl_rate`. When it hits a cap the page says the counts are floors rather than totals.

## Airtable against LeadConnector

Weekly Pulse shows GHL's appointment counts beside Airtable's for the same week. Airtable's booking data arrives through GHL workflow steps; when one silently stops firing, Airtable undercounts and every cost metric that divides by those counts goes quietly wrong.

The page shows both numbers and names the gap. It does not reconcile them or pick a winner — a person decides what to do about it.

## Seeding a workspace's source

```
npm run ops:forsight-source -- \
  --org-slug divine-acquisition \
  --airtable-base appXXXXXXXXXXXXXX \
  --label "DA Pipeline — Client Acquisition"
```

Add `--missing creatives,touches` for a base that lacks those tables, `--meta-ad-account act_123` to record an ad account, `--ghl` (optionally `--ghl-calendar <id>`) to read appointments and message counts, and `--dry-run` to see the rows without writing them. The script needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and refuses to add a GHL source to a workspace with no active LeadConnector connection.

`supabase/seed.sql` creates a Divine Acquisition workspace with a placeholder base id for local development only.

## The spend sync

The one write. Runs daily at 08:00 UTC via `/api/cron/forsight-meta-sync`, registered in the job catalog as `forsight-meta-sync`, and logged run by run in `forsight_sync_runs`.

Meta ad spend has to land in Airtable because Airtable's cost formulas divide by it: cost per audit held, CAC, cost per application, and ROAS are all spend over a count. If spend only ever existed as a live read, either those formulas go blank or the dashboard starts dividing, and the dashboard does not divide.

### Re-running is safe because nothing is accumulated

Every value written is an absolute total for a fixed window, recomputed from Meta and `PATCH`ed as a set. There are no counters and no read-modify-add, so syncing the same period twice writes the same numbers twice and the second run changes nothing. Idempotency is a property of the shape of the write, not of bookkeeping that could itself go wrong. `forsight_sync_runs` is therefore only a scheduling hint: at worst a wrong one costs a redundant recompute.

### Two windows, because the destinations mean different things

- **Creatives** — lifetime totals (`date_preset=maximum`). That row's cost formulas divide Spend by lifetime rollups, so its Spend must be lifetime spend.
- **Weekly Summary** — that week's totals. Its formulas divide by that week's counts.

Writing a since-last-sync figure into either would silently corrupt every cost on the dashboard.

### What it will not touch

Applications, qualified, booked, held, closed, revenue, and notes are typed by a person. The sync writes `Total Spend` and nothing else on an existing week row, and `Spend`, `Impressions`, `Clicks` on a creative. The allowlist in `meta-sync.ts` is asserted on every record before it leaves the module.

### Matching, weeks, and failure

- Meta ads are matched to Airtable creatives by **exact name**. That convention is the only join between the two systems. An unmatched ad is recorded in `unmatched_ads` and skipped — never created, never fuzzy matched, because it is almost always a naming mistake on our side that somebody needs to fix.
- Week boundaries follow the base's own cadence, anchored on the earliest `Week Start Date` already recorded, rather than an imposed Monday. The DA base's weeks start on a Tuesday.
- A failed run does not record its period, so the next run redoes it. Catch-up is capped at six weeks so a long outage does not time out before reaching today.

## Spend today

Separate from the sync, and deliberately so. Weekly Pulse shows today's spend read live from Meta, labelled as live rather than as one of the Airtable week-to-date figures. It shares no code path with the sync, writes nothing, and never throws: if Meta is unavailable, that one figure reads as unavailable and the rest of the page is unaffected.

## Reading

Everything goes through `src/lib/forsight/provider.ts`. Nothing else in the app calls Airtable.

- Pagination is handled inside `listAirtableRecords`; callers never see an offset.
- A failed read **throws** `ForsightSourceError` naming the workspace. It never returns an empty array, because an empty dashboard that is really a broken connection is worse than an error screen.
- Rate limits retry with backoff before failing.
- Reads go through `airtable.ts`; the single write path is `airtable-write.ts`, kept in its own module so "does Forsight write to this base" is answered by grepping one import.

To prove a workspace's connections without a screen, a Divine Acquisition operator can call:

```
GET /api/forsight/checks?source=airtable
GET /api/forsight/checks?source=meta&since=2026-08-01&until=2026-08-31
```

Both are read-only, platform-admin only, and scoped to the caller's active workspace.

## Hosting

Forsight is served at `pulse.vistrial.io`. The proxy redirects `/` on that host to `/app/forsight`, so the existing login gate covers it and a logged-out visitor comes back to Forsight on the same host after signing in. `pulse.vistrial.io` is on the allowlist in `src/lib/app-url.ts` so magic links do not bounce people to `app.vistrial.io`.

Two things live outside this repository and must be done by hand:

1. Add `pulse.vistrial.io` to the Vercel project and point DNS at it. The app is one deployment; this is a second hostname on it, not a second project.
2. Add `https://pulse.vistrial.io/auth/callback` to the Supabase Auth redirect allowlist.
