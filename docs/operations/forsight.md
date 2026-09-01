# Forsight

Forsight is Vistrial's tracking and metrics section: applications, qualified leads, booked calls, held calls, closed revenue, and what each of them costs, per workspace, week over week. This document covers the foundation only — routing, tenancy, sources, and credentials. No metrics render yet.

## What Forsight is not

It does not own data and does not calculate anything its sources do not already calculate. It is a display layer over external sources.

## Tenancy

Forsight uses Vistrial's existing workspace model unchanged: `organizations`, `org_members`, the `vistrial_org` cookie, `getAuthContext()`, and the same row-level security as every other section. There is no Forsight-specific login, session, or workspace concept.

Divine Acquisition is an ordinary workspace with an ordinary source record. Nothing about it is special-cased, which is the point: if the DA workspace works, a client workspace works, because they are the same shape.

## Where a workspace's metrics live

Each workspace has one row per source type in `public.forsight_sources`:

| Column | Meaning |
| --- | --- |
| `source_type` | `airtable` today. A `vistrial_core` type, reading the main app's own database, is next and slots in behind the same interface. |
| `airtable_base_id` | The base DA created for that client, or `DA Pipeline — Client Acquisition` for ours. |
| `airtable_*_table` | Names of the Leads, Creatives, Weekly Summary, and Touches tables. `NULL` means this base does not have that table, and the display layer treats those metrics as unavailable rather than broken. |
| `meta_ad_account_id` | Only on `meta_ads` rows, and only for workspaces whose ad spend Forsight reads. |

Source details are database rows and not environment variables on purpose: env vars cannot vary by tenant, so every client added would otherwise be a deployment.

### Isolation

`forsight_sources` has RLS on, with a single `SELECT` policy scoped to `user_org_ids()`. `authenticated` has **no** insert, update, or delete grant at all — creating and editing source records is an internal operator action performed with the service role. `supabase/tests/verify-forsight.sql` asserts the cross-workspace read is empty and that a member's write is refused.

## Credentials

One Divine Acquisition credential per platform, held in environment configuration:

```
AIRTABLE_API_KEY=
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=
```

That works because DA owns every base and ad account Forsight reads. Client users never see, enter, or manage any part of it, and no screen in Forsight asks anyone for a key, URL, id, or field name.

There is deliberately no Airtable base id in the environment.

## Seeding a workspace's source

```
npm run ops:forsight-source -- \
  --org-slug divine-acquisition \
  --airtable-base appXXXXXXXXXXXXXX \
  --label "DA Pipeline — Client Acquisition"
```

Add `--missing creatives,touches` for a base that lacks those tables, `--meta-ad-account act_123` to record an ad account, and `--dry-run` to see the rows without writing them. The script needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

`supabase/seed.sql` creates a Divine Acquisition workspace with a placeholder base id for local development only.

## Reading

Everything goes through `src/lib/forsight/provider.ts`. Nothing else in the app calls Airtable.

- Pagination is handled inside `listAirtableRecords`; callers never see an offset.
- A failed read **throws** `ForsightSourceError` naming the workspace. It never returns an empty array, because an empty dashboard that is really a broken connection is worse than an error screen.
- Rate limits retry with backoff before failing.
- Reads only. Forsight never writes to Airtable or Meta.

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
