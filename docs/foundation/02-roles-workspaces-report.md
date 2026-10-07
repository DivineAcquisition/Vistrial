# Foundation: roles, workspaces, and data isolation — implementation report

Branch: `claude/foundation-roles-discovery`. Discovery and plan: `01-roles-workspaces-discovery.md`.

## Status in one paragraph

The database migration, its rollback, the app changes, and the tests are built and pushed.
**Nothing has been applied to the live database yet.**

- Every check below passes on a local Postgres copy built from the repo's migrations.
- Creating the approved Supabase test branch timed out three times, and no branch was created.
  So the test on a hosted copy has not happened.
- The backup plan is still waiting on your confirmation.
- A snapshot of every live row exists on the live project, in schema `vistrial_snapshot_20261007`.
  The API cannot read that schema.

**Order matters when this goes live.** The app code expects the new columns, so the migrations
must reach the live database before this branch's code is deployed. Merging to `main` triggers the
Supabase GitHub integration, which applies migrations automatically. That integration currently
reports `MIGRATIONS_FAILED` on main, because of the drift described under Migration results.

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

Every result in this section is from the local copy. Live has not been touched.

- 30 of the 32 database test files pass. That includes `verify-workspaces.sql`, with 100 checks on two
  near-identical customer workspaces.
- The two failures also fail on unchanged `main`, and neither is caused by this work:
  - `verify-reporting`: "expected a volume discontinuity";
  - `verify-agent-framework`: "operator was not grandfathered enabled".
- Rollback, then re-apply, succeeds twice in a row (`scripts/test-workspace-rollback.sh`).
- 716 unit tests pass. Typecheck is clean.
- Lint shows 20 errors, all in files this work did not change, and all present on main.

**Needs manual review before or after applying:**

1. **Live drift.**
   - Live is missing `20261003040000_drop_airtable_source`.
   - Live has an extra migration entry, `20261003045746 sales_os_agent`.
   - Apply order to live: `20261003040000`, then `20261007010000`, then `20261007020000`.
2. **The DivineAcquisition workspace** (`divine-acquisition`) is marked as Vistrial's own
   (`is_platform_workspace`), because it has no customer seats. Please confirm that's right.
3. Any `da_operator` seat is deactivated rather than converted, and listed in
   `workspace_migration_review`. Live has none today.
4. Existing logins are unchanged. The one live user is a Platform Admin and keeps access to everything.
   After the domain is set up, that user signs in at admin.vistrial.io.

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
    - ✅ On the local copy: rollback tested twice, and the snapshot was taken on live.
    - ⏳ On live: pending.
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

## Still to do to go live

1. You confirm the backup plan.
2. Run the hosted test. Either the Supabase test branch, once creation works, or the preview branch
   that opening a PR creates automatically. Then delete it.
3. Apply the three migrations to live in the order above. Compare row counts with the snapshot, and
   regenerate types.
4. Deploy the app.
5. Set up `admin.vistrial.io`:
   - add the domain to the Vercel project and DNS;
   - add `https://admin.vistrial.io/auth/callback` to Supabase Auth redirect URLs.
6. Later, when plugged in: point Telnyx at `/api/webhooks/telnyx` and Stripe billing at
   `/api/webhooks/stripe-billing`.

## Found along the way, not fixed here

- Supabase advisor findings:
  - leaked-password protection is off;
  - 36 functions have a mutable `search_path`;
  - `pg_trgm` is installed in `public`.
- `scripts/test-migration-rollback.sh` fails at the operator-agent rollback on main.
- The data-retention job still keys off `offboarded_at`, not the new `closed` status.
