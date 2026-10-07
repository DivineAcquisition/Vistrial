# Foundation: roles, workspaces, and data isolation — implementation report

Branch: `claude/foundation-roles-discovery`. Discovery and plan: `01-roles-workspaces-discovery.md`.

## Status in one paragraph

**Live.** The migrations are applied to the production database and the app is deployed from
`main` (commit `cc44347`, Vercel deployment `dpl_BHKPeY7HB3J5VE5yM6hqjdJgF1af`, serving every
production domain including `admin.vistrial.io`). No runtime errors in the first hour.

How it went live:

1. A snapshot of every live row was taken first, in schema `vistrial_snapshot_20261007` on the live
   project. The API cannot read it. It was topped up just before applying with the Ask Vistrial
   rows added since.
2. `20261007010000` (the two new roles) was applied directly. It only adds enum values.
3. The other migrations went through the repo's own path, the Supabase GitHub integration, from a
   `main` commit holding only database files, so the app could not deploy ahead of its schema.
   - The first run failed: the snapshot table had copied `forsight_sources.source_type` with its enum
     type, which blocked `drop_airtable_source` from rebuilding that type. Nothing was applied; the
     whole run rolled back. The snapshot's enum-typed columns were changed to text (values
     unchanged) and the second run applied `20261003040000` and `20261007020000`.
4. Live was checked against the snapshot, then the app code was merged to `main`.

The approved Supabase test branch could not be created (three timeouts, no branch left behind), so
there was no hosted dry run; the local test suite and the transactional, all-or-nothing integration
run stood in for it.

## What changed

**Database.** There are two migrations, with a generated rollback for the second:

- `20261007010000_workspace_roles_enum.sql` adds the `member` and `operator` roles.
- `20261007020000_workspace_isolation.sql` adds:
  - workspace status: onboarding, active, paused, closed;
  - `platform_staff` and `workspace_assignments`;
  - staff seats that follow assignments automatically;
  - the append-only `workspace_activity_log`;
  - the `inbound_event_holds` holding area;
  - admin functions: create workspace, set status, assign, unassign, add staff, deactivate everywhere, review a held event;
  - a second, restrictive layer of row-level policies on every workspace table.

  It also reconciles the settings-tier objects that existed on live but not in the repo, and closes the
  two security gaps from discovery: anon could execute SECURITY DEFINER functions, and
  `stellar_build_stage_mappings` had RLS off.
- `supabase/rollbacks/20261007020000_workspace_isolation.sql` restores the previous functions,
  roles, and tables in one transaction. It keeps a JSON copy of the new history tables in
  `vistrial_rollback_keep`.

**App.**

- The session knows the workspace role, whether the person is staff in this workspace, and whether
  they are a Platform Admin. Every screen and action uses those.
- Staff get a searchable workspace switcher. It shows each workspace's status, remembers the last
  workspace, and shows a "you are inside a customer workspace" band.
- `admin.vistrial.io` is the staff address:
  - Customers who reach it are turned away to `app.vistrial.io/no-access`.
  - Staff who reach the customer address are sent to admin.
  - Sessions are per host, so staff sign in at admin.
- `/app/team` is the staff area:
  - Platform Admins: workspaces, status, assignments, new workspaces, staff, the holding area, and the activity log for everything.
  - Service Team: their assigned workspaces and those workspaces' activity.
- Customers get **Settings → History**, which lists their own actions.
- Inbound events go through one resolver. It accepts an event only when it matches exactly one open
  workspace; otherwise the event is held. Telnyx and Stripe billing have hold-only endpoints.
- Paused and closed workspaces send nothing. The outbound send chokepoint refuses, and every scheduled
  job and queue skips them.
- A service-role audit closed six gaps; see Done When check 1. A test now fails if a new file uses the
  service-role client without review, or if that client is imported into browser code.

## Roles and permissions as implemented

| | Platform Admin | Service Team (assigned) | Owner | Member | Operator |
|---|---|---|---|---|---|
| Which workspaces | All | Assigned only; lost at once when unassigned | Their own | Their own | Their own |
| Leads, touches, calls, notes | Read, write | Read, write | Read, write | Read | Leads assigned to them and the unassigned queue |
| Approve drafts and gated actions | Yes | Yes | Yes | Only if an owner grants it | No |
| Revenue and reporting | Yes | Yes | Yes | Yes | No |
| Invite people | Any role | Any role | Members and operators | No | No |
| Make someone an owner | Yes | Yes | No | No | No |
| Settings | All | All | Business contact details, people, own notifications | Own profile and notifications | Own profile and notifications |
| Integrations, approval-gate setup, scoring, voice, Ask Vistrial destinations | Yes | Yes | No | No | No |
| Workspace status, assignments, staff, new workspaces | Yes | No | No | No | No |
| Holding area | Yes | No | No | No | No |
| Activity log | Everything | Assigned workspaces | Own actions only | Own actions only | Own actions only |
| Turn on auto-run for actions that reach people | Yes | No | No | No | No |
| Closed workspace | Read-only | Read-only | No access | No access | No access |

Notes:

- `setter` and `closer` remain as labels for Operators. Today's customer admins became Owners.
- A workspace can have several owners, and the last active owner cannot be removed.
- Members see the customer portal, not the working app.

## Data and storage covered

- **All 152 tables in `public` have row-level security on.** On main, one table had it off.
- **130 tables carry a workspace (`org_id`).** Every one of them has the restrictive workspace layer,
  except three staff-only tables whose only policy already limits them to staff:
  - `inbound_event_holds`: Platform Admin only;
  - `workspace_activity_log`: scoped as in the table above;
  - `workspace_assignments`: own rows, or Platform Admin.
- The layer sorts tables into five groups:
  - staff-only internals;
  - customer read-only configuration and results;
  - lead work, where Operators are limited to their leads;
  - approvals, which need staff, an owner, or a granted member;
  - revenue, which Operators can't see.

  `01-roles-workspaces-discovery.md`, Appendix A, lists every table and its group.
- **22 tables have no `org_id` by design:**
  - `organizations` itself;
  - `platform_staff`;
  - per-person push subscriptions;
  - anonymised cross-workspace benchmarks;
  - ops and job telemetry;
  - rate limits;
  - reference catalogues;
  - the migration's own invite map.
- **Files.** Uploads live in Postgres, in `lead_files.contents`, under the same policies as the lead.
  There are no Supabase Storage buckets: live has 0 buckets and 0 files.
- **Transcripts.** They are stored on `calls` and `unmatched_transcripts`. Both are covered.

## Migration results

**On live (production database):**

- Applied: `20261003040000_drop_airtable_source`, `20261003045746_sales_os_agent` (a no-op
  placeholder for a version that existed only on live), `20261007010000_workspace_roles_enum`,
  `20261007020000_workspace_isolation`. The repo and live now list the same versions, and the
  integration on `main` reports healthy again for the first time since 3 October.
- Row counts match the snapshot in 29 of 31 tables. The two differences are intended:
  `ops_job_catalog` and `ops_job_runs` each lost their `forsight-meta-sync` row, which
  `drop_airtable_source` removes. Both rows are in the snapshot.
- The one Forsight source on Airtable is now `vistrial_core`, as `drop_airtable_source` intends.
- The one login is unchanged: an active Platform Admin with a staff seat in DivineAcquisition.
- `workspace_migration_review` is empty: nothing needed a manual decision.
- Every table has row-level security on. The Supabase security advisor reports no errors (it
  reported one before: `stellar_build_stage_mappings` had RLS off).

**On the local copy:**

- 30 of the 32 database test files pass. That includes `verify-workspaces.sql`, with 100 checks on two
  near-identical customer workspaces.
- The two failures also fail on unchanged `main`, and neither is caused by this work:
  - `verify-reporting`: "expected a volume discontinuity";
  - `verify-agent-framework`: "operator was not grandfathered enabled".
- Rollback, then re-apply, succeeds twice in a row (`scripts/test-workspace-rollback.sh`).
- 716 unit tests pass. Typecheck is clean. The production build compiles.
- Lint shows 20 errors, all in files this work did not change, and all present on main.

**For you to review:**

1. **Live drift is resolved.** Live was missing `20261003040000_drop_airtable_source` and had an
   extra `20261003045746 sales_os_agent` entry; both now line up with the repo.
2. **The DivineAcquisition workspace** (`divine-acquisition`) is marked as Vistrial's own
   (`is_platform_workspace`), because it has no customer seats. Please confirm that's right.
3. Any `da_operator` seat is deactivated rather than converted, and listed in
   `workspace_migration_review`. Live has none today.
4. Existing logins are unchanged. The one live user is a Platform Admin and keeps access to everything.
   Staff now work at admin.vistrial.io and sign in there once (sessions are per host).
5. **DivineAcquisition's status is `onboarding`**, set from its timestamps because it was never
   marked activated. Automation runs for onboarding workspaces, so nothing stopped; change it to
   active from `/app/team` if you prefer.

## Done When checks

Each check was verified on the local copy.

1. **A customer cannot reach another workspace.** ✅ Covered by `verify-workspaces.sql` section 1:
   interface reads, guessed IDs, modified writes, search, and files.
   - The export is staff-only and built for the open workspace only. That is checked in code review,
     not by a SQL test.
   - Dynamic pages return a neutral 404 when a row isn't visible.
   - The service-role audit fixed these gaps:
     - Members could change data connections from the portal.
     - Two unmatched-transcript actions had no gate.
     - Call transcript actions didn't check lead access.
     - Forsight reports checked staff status in the wrong workspace.
     - Anyone could post a test message to the shared team channel.
   - Not done: browser-level (Playwright) checks against a running build.
2. **Two similar workspaces stay separate in every screen and job.** ✅ At the data layer, with identical
   data in both.
   - Background jobs and webhooks each run against one resolved workspace.
   - The isolation check is unit-tested for CRM and Stripe events.
3. **Service Team sees only assigned workspaces, and loses access at once.** ✅ Section 2.
   The switcher reads the same function, so an assignment change shows on the next page load
   without signing in again.
4. **Platform Admin sees all and manages assignments; no one else can.** ✅ Sections 2 and 7.
   Workspace creation is also covered.
5. **Members can't approve unless granted, and can't change settings.** ✅ Section 3, both at the
   database and in server actions.
6. **The last owner cannot be removed.** ✅ Section 4.
7. **Telnyx, Stripe, and CRM events are matched, or held with no action.**
   - ✅ CRM and Stripe revenue are tested for matched, unmatched, ambiguous, paused, and closed cases.
   - ✅ Telnyx and Stripe billing are tested as hold-only.
   - Untested against real traffic: transcripts, forms, and Commas are wired to the same resolver,
     but only the shared logic is unit-tested. Telnyx and Stripe billing have no real integration yet.
8. **Files can't be opened from another workspace.** ✅ Section 1, files block: `lead_files.contents`.
9. **Staff actions, role changes, invitations, assignments, and status changes are logged, and entries
   can't be edited.** ✅ Section 6. Users, staff, and the service role are all refused edits and deletes.
10. **Existing data and users are intact, with a documented rollback.**
    - ✅ On the local copy: rollback tested twice.
    - ✅ On live: row counts checked against the snapshot; the only differences are the two
      intended job rows. The login is unchanged.
11. **A written list of covered tables and storage.** ✅ The section above, plus Appendix A of the
    discovery doc.

## Decisions I made that you may want to change

- **Owners can work leads**, as well as everything else owners do. Members are read-only.
- **Approval-gate setup is staff-only.** Turning on auto-run for actions that reach people needs a Platform Admin.
- **Staff-only areas:** integrations, data connections (including the portal's Connect buttons),
  Ask Vistrial destinations, scoring, and voice settings.
- **The data export is staff-only.** The bundle includes internal notes and configuration. An
  owner-safe export would need its own build.
- **Paused workspaces:**
  - queued follow-up drafts and notifications are ended;
  - transcript analysis waits;
  - CRM events are held, and can be released from the holding area once the workspace is open.
- **Released holds.** Releasing a held CRM or transcript event re-runs it. Other sources are marked
  reviewed, and the sender must resend.
- **Staff sessions are per host.** Staff sign in again at admin.vistrial.io.

## Still to do

1. Optional: add `https://admin.vistrial.io/auth/callback` to Supabase Auth redirect URLs, so
   email-link sign-in works on the admin address. Password sign-in already works there.
2. When plugged in: point Telnyx at `/api/webhooks/telnyx` and Stripe billing at
   `/api/webhooks/stripe-billing`.
3. Drop `vistrial_snapshot_20261007` from live once you are satisfied (it holds a copy of every
   row, including the auth user's email).
4. Regenerate `src/types/database.ts` from live at some point; it was edited by hand to match.

## Found along the way, not fixed here

- Supabase advisor findings:
  - leaked-password protection is off;
  - 36 functions have a mutable `search_path`;
  - `pg_trgm` is installed in `public`.
- `scripts/test-migration-rollback.sh` fails at the operator-agent rollback on main.
- The data-retention job still keys off `offboarded_at`, not the new `closed` status.
