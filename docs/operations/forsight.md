# Forsight

Forsight is Vistrial's tracking and metrics section: applications, qualified leads, booked calls, held calls, closed revenue, and what each of them costs, per workspace, week over week. This document covers the foundation only — routing, tenancy, sources, and credentials. No metrics render yet.

## What Forsight is not

It does not own data and does not calculate anything its sources do not already calculate. It is a display layer over external sources.

It performs exactly one write *to a source*, described under [The spend sync](#the-spend-sync). Generated monthly reports are written to our own `forsight_reports` table and never back to Airtable, Meta, or GHL. Everything else is read-only, and that should stay true.

## Tenancy

Forsight uses Vistrial's existing workspace model unchanged: `organizations`, `org_members`, the `vistrial_org` cookie, `getAuthContext()`, and the same row-level security as every other section. There is no Forsight-specific login, session, or workspace concept.

Divine Acquisition is an ordinary workspace with an ordinary source record. Nothing about it is special-cased, which is the point: if the DA workspace works, a client workspace works, because they are the same shape.

## Where a workspace's metrics live

Each workspace has one row per source type in `public.forsight_sources`:

| Column | Meaning |
| --- | --- |
| `source_type` | `airtable`, `vistrial_core`, `meta_ads`, or `ghl`. A workspace reads its metrics from exactly one of `airtable` or `vistrial_core`, enforced by a partial unique index. |
| `airtable_base_id` | The base DA created for that client, or `DA Pipeline — ClientAcquisition` for ours. |
| `airtable_*_table` | Names of the Leads, Creatives, Weekly Summary, and Touches tables. `NULL` means this base does not have that table, and the display layer treats those metrics as unavailable rather than broken. |
| `meta_ad_account_id` | Only on `meta_ads` rows, and only for workspaces whose ad spend Forsight reads. |
| `ghl_calendar_id` | Only on `ghl` rows. `NULL` reads every calendar on the location, which is what the rest of Vistrial already does. |

Source details are database rows and not environment variables on purpose: env vars cannot vary by tenant, so every client added would otherwise be a deployment.

### Isolation

`forsight_sources` has RLS on. Reads are scoped to `user_org_ids()`; writes require `is_platform_admin()`. A client user's insert is refused outright and their update or delete matches zero rows, so provisioning is closed to them in Postgres and not merely hidden behind a missing link. `supabase/tests/verify-forsight.sql` asserts all of it, plus that an operator can do the same things a client cannot.

## The two metrics source types

Both present the same shapes with the metrics already computed, which is what lets a page ask for a workspace's weekly metrics without learning where they came from. No dashboard page branches on source type; adding the second one changed none of them.

| | `airtable` | `vistrial_core` |
| --- | --- | --- |
| Where it reads | A base duplicated from our master template | `leads`, `calls`, `touches`, `revenue_log`, `next_actions`, `call_extractions` |
| How costs are computed | Read from formula fields | Derived in the adapter by `formulas.ts`, which reproduces those formulas including their text branches |
| Creative performance | Yes | **No** — core holds no per-ad data at all |
| Ad spend | Synced in from Meta | Read live from the workspace's Meta source, or unavailable |

Existing Airtable clients are untouched. Nothing migrates.

### Matching the formulas

`src/lib/forsight/formulas.ts` is the Airtable formulas written once. A client moved between source types must not see their numbers change meaning, so the edge cases are reproduced exactly: a zero denominator with spend behind it returns `No audits yet` or `No closes yet`, a zero denominator with no spend returns blank, and neither returns zero. `adapter-parity.test.ts` builds the same week both ways and compares.

### What core cannot produce

- **Creative performance.** There is no per-ad-creative data in core: `ad_spend_days` is campaign by day, with no ad name, impressions, or clicks. The page says so rather than showing an empty table.
- **Ad spend.** Spend comes from the workspace's own Meta source. `ad_spend_days` exists but belongs to the owner-portal integration, with its own sync lifecycle and a rolling window; borrowing another subsystem's numbers is how a dashboard ends up confidently wrong. Without a Meta source, every metric that divides by spend reads `No ad spend connected` — never `$0`.

## Provisioning a client

Every organization is already a Forsight workspace. With no source row, Forsight reads that workspace's own Vistrial tables (`vistrial_core`). Airtable, Meta, and LeadConnector remain operator-only extras at `/app/forsight/sources`: pick a workspace, pick a source type, enter what that type needs, and test the connection; the save button stays disabled until the test passes, and the save action re-runs the test server-side and refuses to write if it fails. A source that saves cleanly and fails at the client's first login is the worst version of this feature.

This is the one screen that asks anyone to type a base ID, and it is the narrow exception to the no-pasting rule: clients still never touch configuration. The page 404s for a client user, and Postgres refuses their writes regardless.

`/app/forsight/workspaces` is the cross-workspace overview: every workspace's cost per audit held, CAC, pipeline health counts, and last month's report (generated, version, sent), one row each, with a link into that workspace's Forsight. It shows one tenant's metrics beside another's, which is exactly the boundary the rest of the architecture enforces — legitimate because DA runs these systems on clients' behalf, and gated at the data layer, since the read goes through the operator's own client and `user_org_ids()` decides what comes back. A client user gets a not-found, not a list of one.

Both use the existing `platform_admins` concept. No new permission was introduced.

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
