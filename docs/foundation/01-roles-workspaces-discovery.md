# Prompt 1 — Roles, Workspaces, and Data Isolation

## Phase 0: Discovery findings and migration plan

Status: **awaiting approval. Nothing in the app or the database has been changed.**
Sources: this repository at `main` (`2a684a9`), the schema rebuilt from all 64
migrations in a local Postgres 16, and read-only queries against the live
Vistrial Supabase project (`jizzmlvpnykazrsiotqq`).

---

## 1. The headline

1. **Isolation already exists at the data layer.** Every customer table carries
   `org_id`, RLS is on for 146 of 147 tables, and nearly every policy goes
   through two central functions, `user_org_ids()` and `user_has_org_role()`.
   So we can change who reaches which workspace in a few places in the
   database, and every table inherits the change.
2. **Production has almost no data.** Live: 1 auth user, 1 workspace, 1 member
   (that same user, who is a platform admin), 1 lead, 1 touch, 5 Ask Vistrial
   conversations, no open invites, no uploaded files, no storage buckets. The
   migration risk is very low, and nobody else's login can be disrupted.
3. **Part of the brief doesn't match what's built.**
   - **Telnyx is not in the codebase.** SMS goes out only through Twilio, and
     only to staff (emergency alerts). Messages to leads go through the
     LeadConnector/GHL CRM.
   - **Stripe is not used for billing.** Stripe only appears as a read-only
     Stripe Connect *revenue source* (a customer's own sales). There are no
     plans, invoices, or subscriptions anywhere in the schema.
   - **Gemini is not in the codebase.** Every model call is Anthropic.
4. **There is no Service Team concept and no assignments.** DA staff today are
   either `platform_admins` (silently enrolled as **owner** in every workspace)
   or Stellar `stellar_da_operators` (standing read access to every Stellar
   workspace). Both conflict with "only assigned workspaces".

---

## 2. How users, accounts, and workspaces are modeled today

| Concept | Today | Notes |
|---|---|---|
| Sign-in | Supabase Auth, invite-only (`supabase/AUTH.md`), session refreshed in `src/proxy.ts` | Unauthenticated `/app`, `/portal`, `/stellar` go to `/login`. |
| Workspace | `organizations` (called "workspace" in the UI) | Has name, slug, timezone, `product` (`core` / `stellar` / `both`), `activated_at`, `inactive_at`, `offboarded_at`, `delete_after`, `agents_halted`, `managed`. **No status field, no industry template, no owner contact.** |
| Membership | `org_members` (`org_id`, `user_id`, `role`, `active`, `surface_access`) | One row per user per workspace. Removal = `active = false`, so history survives. |
| Roles | `org_role` enum: `owner`, `admin`, `closer`, `setter`, `client_viewer`, `da_operator` | `client_viewer` and `da_operator` are Stellar-only. |
| Portal vs app | `surface_access`: `operator` (working app) or `portal` (owner portal only) | Portal requires owner/admin. |
| Platform admin | `platform_admins(user_id)` | A trigger enrolls each admin as **owner** in every org and blocks demotion. |
| Stellar DA | `stellar_da_operators(user_id)` | Cross-workspace read access to Stellar orgs, logged in `stellar_da_access_log`. |
| Invites | `org_invites` (workspace + role + email + token + `expires_at`), redeemed by `redeem_org_invite()` | Only `admin`, `closer`, `setter` are invitable. **Owners cannot be invited.** |
| Active workspace | `vistrial-org` cookie, checked against the user's memberships on every request (`resolveActiveMembership`) | A forged cookie falls back to a real membership. Membership is re-read per request, so access changes already apply without a new login. |
| Switcher | `OrgSwitcher` shows whenever a user has 2+ memberships | Customers with two workspaces would see it too. |
| Creating a workspace | **No path in the app.** `create_client_org()` was dropped in `20260823090000`. | Workspaces are created by hand in SQL today. |

---

## 3. Subdomains and routing (one codebase already)

All of these are served by **one Next.js app and one deployment**. `src/lib/domains/routing.ts` decides what each host may serve.

| Host | Serves |
|---|---|
| `www.vistrial.io` / `vistrial.io` | Marketing site |
| `app.vistrial.io` | Operator app (`/app`) **and** the owner portal (`/portal`) |
| `pulse.vistrial.io` | Forsight (the same app, opened at `/app/forsight`) |
| `forsight.vistrial.io` | Stellar (`/stellar`) |
| `admin.vistrial.io` | Mentioned in the README as "comes later"; **not built** |

There is no separate staff deployment. DA staff use `app.vistrial.io`, and staff-only screens (`/app/ops`, Forsight workspaces) are hidden by `isPlatformAdmin` checks.

---

## 4. Data inventory and workspace coverage

Full per-table list: **Appendix A**. Summary:

| Group | Count | Status |
|---|---|---|
| Customer data with `org_id NOT NULL` and RLS | 118 | ✅ Covered (leads, touches, calls, transcripts/extractions, objections, scores, follow-ups, approvals, revenue, files, notes, notifications, settings, Sales OS, agents, Forsight, Stellar placements, EOD logs, …) |
| `org_id` present but nullable | 7 | ⚠️ `webhook_events`, `webhook_dead_letters`, `notifications`, `ops_alerts`, `ops_incidents`, `reporting_job_runs`, `stellar_da_access_log`. These hold inbound events that aren't matched yet, or platform ops. |
| Service-role only (RLS on, no policies) | 8 | ✅ Not readable from the browser (`ghl_dispatches`, `ghl_oauth_sessions`, `webhook_events`, …) |
| Platform-wide, no customer data | 20 | ✅ Benchmarks, model routes, ops/job telemetry, field registry |
| **RLS disabled** | 1 | ❌ `stellar_build_stage_mappings` (empty config table; Supabase advisor ERROR) |

**Notes and internal content**
- Lead notes live on `leads.context_notes` (one text field). Nothing marks a note
  as internal or shared, so there is no "internal notes" concept to protect yet.
- Files live in **Postgres** (`lead_files.contents`, base64), not Supabase
  Storage. They are protected by the same RLS as the lead. Live: 0 files, 0
  buckets.

**Where config internals leak to customers today:** RLS checks the workspace,
not who in it is asking. Any member, including a portal-only owner, can read
these tables directly with their own session: scoring config, business
profile, approval-gate settings, agent settings, model routes, voice profiles,
and integration connection metadata. Hiding them in the UI is the only
protection, which the brief rules out.

---

## 5. Where data is read and written

- **Screens and server actions:** ~150 route segments under `src/app/app`,
  `src/app/portal`, `src/app/stellar`. They read through the user's own
  session (RLS applies).
- **Browser Supabase client** (RLS + Realtime applies): notification bell,
  activity stream, queue, case file, ops activity.
- **Service-role client** (bypasses RLS): 49 files. That includes legitimate
  crons and webhooks, but also **21 app screens and actions** (e.g.
  `cases/[id]/page.tsx`, settings actions, `/app/ops`, data export, login and
  invite acceptance). Each of these must be audited for an explicit workspace
  filter. A static check confirms the key never reaches the browser bundle
  (`npm run assert:no-secrets`).
- **Scheduled jobs:** 17 Vercel crons (`vercel.json`): ingestion, transcripts,
  reporting, notifications, agents, Forsight reports, retention, and others.
  Most loop over orgs and filter by `org_id`.
- **Inbound webhooks and how each finds its workspace:**

| Source | Route | Workspace match | When it can't match |
|---|---|---|---|
| LeadConnector / GHL | `/api/leadconnector/webhooks` (and the `/api/ghl` alias) | `locationId` → `organizations.ghl_location_id` | ✅ Stored in `webhook_events` with `org_id` null and marked "awaiting link". No action. |
| Stripe Connect (revenue) | `/api/sources/webhooks/stripe` | Connected account → `source_connections` | ❌ **Dropped.** Returns 200 `unmatched_org` and stores nothing. |
| Transcripts | `/api/transcripts/webhooks/[source]/[token]` | Per-workspace token | Token picks the workspace. An unknown lead goes to `unmatched_transcripts`. |
| Forms, Commas | `/api/sources/webhooks/{forms,commas}/[token]` | Per-workspace token | Rejected |
| Resend | `/api/webhooks/resend` | Delivery status only | — |
| Telnyx | — | **Does not exist** | — |

---

## 6. Conflicts with the target model, and proposed fixes

| # | Conflict | Proposed fix |
|---|---|---|
| C1 | No Service Team role, no assignments | Add a platform-level `platform_staff` (user, role `service_team` / `platform_admin`, `active`, `template_access`) and `workspace_assignments` (workspace, staff user, assigned_by/at, ended_by/at). Assignment history is the rows themselves. |
| C2 | Platform admins are fake **owner** rows in every workspace. They show in customer member lists and count toward "last owner". | Derive staff access from `platform_staff` plus assignments inside `user_org_ids()` and `user_has_org_role()`. Remove the auto-enroll trigger and the fake owner rows; keep history readable. |
| C3 | Stellar `stellar_da_operators` have standing access to every Stellar workspace | Fold into Service Team with explicit assignments. Existing `stellar_da_access_log` rows are kept. |
| C4 | Six legacy roles vs four target roles | See §7. Customer side becomes **Owner** and **Member** (plus a per-person "can approve" grant). |
| C5 | RLS is workspace-wide, not role-aware: customers can read config internals | Classify every table (Appendix A). Add a `can_see_internal(org_id)` check to SELECT on "Service team only" tables, and stop customer-role writes on them. |
| C6 | No workspace status | Add a `workspace_status` enum (`onboarding`, `active`, `paused`, `closed`) with `status_changed_at/by`, back-filled from `activated_at` / `inactive_at` / `offboarded_at`. **Paused:** every cron, dispatcher, and agent checks status (a single DB helper plus `agents_halted`). **Closed:** customers drop out of `user_org_ids()`; staff keep read-only access (write policies require status ≠ closed); `delete_after` drives retention. |
| C7 | No industry template reference or owner contact on the workspace | Add `industry_template_id` (nullable until Prompt 2 builds templates) and `owner_contact_name/email/phone`. |
| C8 | Unmatched Stripe events are dropped; there's no general holding area | Add an `inbound_event_holds` table (source, raw payload, reason: `unmatched`, `ambiguous`, `workspace_paused`, `workspace_closed`; review state), readable by platform admins only. Every webhook goes through one `resolveWorkspaceForEvent()` that returns exactly one workspace or holds the event. Telnyx plugs into the same path when it's added. |
| C9 | 21 app screens use the service-role client | Audit each one. Replace it with the user's own session where possible; otherwise wrap it in `withWorkspace(orgId)`, which first proves access and always filters by `org_id`. Add a lint test that bans `getSupabaseAdmin` in `src/app/**` outside an allowlist. |
| C10 | Activity history is scattered and partly editable. `settings_activity` and `stellar_da_access_log` are append-only. The table grants on `lead_assignment_changes`, `lead_status_changes`, `approval_gate_changes`, `agent_events`, and `follow_up_events` would allow UPDATE/DELETE, but RLS blocks it because there are no policies for it. `staff_access_log` was dropped. Logins, invites, role changes, and assignments are not logged. | Add one append-only `workspace_activity_log` (actor, actor kind, workspace, action, target table/id, before/after, at). Writes go through a SECURITY DEFINER function and DB triggers on members, invites, assignments, workspace status, and settings. A trigger rejects UPDATE/DELETE, and those grants are revoked. Logins are recorded by the sign-in action. Customers see only entries about their own actions. |
| C11 | Owners can't be invited; invites only cover admin/closer/setter | Allow `owner` and `member` invites. Only owners (and staff) can invite, and only for their own workspace. Staff are never invited into a workspace; they get an assignment. |
| C12 | Customers with 2+ workspaces would see the switcher | Customers get a plain "Your businesses" chooser listing only their own workspaces, with no status, search, or hint of others. Staff get the full searchable switcher with status badges and a remembered last workspace. |
| C13 | No way to create a workspace in the app | A platform-admin "New workspace" flow (starts `onboarding`, sends the owner invite). It feeds Prompt 10. |
| C14 | `stellar_build_stage_mappings` has RLS off | Enable RLS; platform admin only. |
| C15 | 25 SECURITY DEFINER functions are executable by signed-out (`anon`) callers | Each one I checked validates the caller internally, so nothing leaks today. Revoke `anon` EXECUTE anyway as defense in depth, and set default privileges so new functions don't re-open it. |
| C16 | Neutral not-found: the case file returns `notFound()` correctly; other `[id]` routes are unverified | Audit every `[id]` route and API handler, and return the same 404 for "doesn't exist" and "other workspace". |

---

## 7. Roles and permissions (proposed, for review)

**Customer roles** (per workspace, stored in `org_members.role`):

| Capability | Owner | Member | Member + approve grant |
|---|:-:|:-:|:-:|
| See customer-facing views (overview, results, approvals queue, case files with shared notes only, agents summary) | ✅ | ✅ (read-only) | ✅ |
| Approve or reject drafts and gated actions | ✅ | ❌ | ✅ |
| Invite or remove Members (own workspace) | ✅ | ❌ | ❌ |
| Edit own users, notification prefs, business contact details | ✅ | own notification prefs only | own notification prefs only |
| See internal notes, config internals, service-team activity, other workspaces | ❌ | ❌ | ❌ |
| See own invoices and plan | ✅ (once billing exists) | ❌ | ❌ |
| Simple history of actions taken on their own behalf | ✅ | ✅ (own) | ✅ (own) |
| Remove themselves | ✅ unless last owner | ✅ | ✅ |

**Platform roles** (in `platform_staff`, not per workspace):

| Capability | Service Team | Platform Admin |
|---|:-:|:-:|
| Enter workspaces | Assigned only | All |
| Case files, notes (internal + shared), uploads, escalations, operator logs | ✅ assigned | ✅ |
| Workspace configuration and onboarding | ✅ assigned | ✅ |
| Activity log | Assigned workspaces | All |
| Edit industry templates and platform defaults | Only with `template_access` | ✅ |
| Create, pause, or close workspaces | ❌ | ✅ |
| Manage assignments | ❌ | ✅ |
| Manage Service Team accounts and roles | ❌ | ✅ |
| Billing administration | ❌ | ✅ |
| Holding area for unmatched events | ❌ | ✅ |
| Write in a **closed** workspace | ❌ | ❌ (read-only for everyone; reopening is an admin status change) |

**Enforcement:** the database is the source of truth. `user_org_ids()`,
`user_has_org_role()`, and new `workspace_role(org_id)`, `can_see_internal(org_id)`,
`can_approve(org_id)` helpers back RLS. The app's `permissions.ts` mirrors them
for hiding UI. Crons and webhooks resolve one explicit workspace before any
read or write.

**Mapping today's roles** (live impact: just the 1 platform-admin user):

| Today | Becomes |
|---|---|
| `platform_admins` | Platform Admin (and the fake owner rows are removed) |
| `stellar_da_operators` (0 live) | Service Team (assignments created per Stellar workspace) |
| `owner` (real customer) | Owner |
| `admin` (customer manager), `client_viewer` | **Decision needed (Q1)** |
| `setter`, `closer`, `da_operator` | **Decision needed (Q1)** |

---

## 8. Migration plan

Every step is a forward migration with a matching file in
`supabase/rollbacks/`, following the repo's existing pattern.

1. **Snapshot.** Before touching live, export every non-empty live table (≈10
   tables, a few dozen rows) to JSON in a private location, record the
   schema_migrations list, and confirm the project's Supabase backup or
   point-in-time restore is current. I can't see the backup tier from here;
   please confirm it.
2. **Fix the existing drift first.** Live never applied
   `20261003040000_drop_airtable_source`, and it has an extra
   `20261003045746 sales_os_agent` entry that isn't in the repo. Reconcile both
   so the repo and live match.
3. **Additive schema.** Add `platform_staff`, `workspace_assignments`,
   `workspace_activity_log`, `inbound_event_holds`, the new workspace columns,
   and the `member` / `can_approve` additions. Nothing is dropped.
4. **Back-fill.** Copy `platform_admins` into `platform_staff`, Stellar
   operators into Service Team with assignments, set each workspace's status
   from its timestamps, and map members per the Q1 decision. Anything that
   can't be mapped is written to a review list instead of being guessed.
5. **Swap the access functions.** Redefine `user_org_ids()` and
   `user_has_org_role()` to use customer membership plus assignment plus
   platform admin, honoring workspace status and staff `active`. Add the
   staff-only SELECT restrictions table by table.
6. **Remove the fake owner rows** for platform admins (mark them inactive and
   tag them so history still resolves names), and drop the auto-enroll triggers.
7. **App layer.** Session and context gain `platformRole`; switcher (C12); top
   bar workspace name plus a "you are inside a customer workspace" cue for
   staff; workspace-keyed client state so switching remounts; the
   service-role audit (C9); the webhook resolver (C8); activity-log writes;
   neutral 404s (C16); assignment-management and workspace-creation screens
   for platform admins.
8. **Test on a copy before live.** Run all migrations on the local Postgres
   build and the repo's `db:verify` suite, plus a new `verify-workspaces.sql`
   that sets up **two near-identical customer workspaces**, an owner, a member
   with and without the approve grant, a Service Team member assigned to one
   workspace, and a platform admin. It then asserts every Done-When item at
   the SQL level (cross-workspace SELECT/INSERT/UPDATE by guessed ID, files,
   last-owner removal, unassign mid-session, closed and paused behavior,
   held events, log immutability). After that, app-level checks with
   Playwright against a local build.
9. **Apply to live**, re-run the read-only verification queries, and compare
   row counts to the snapshot.

**Rollback.** Each migration has a down file. The swap in step 5 is a single
`CREATE OR REPLACE` of two functions, so it reverts in seconds. Steps 3–4 are
additive and can be left in place harmlessly. The JSON snapshot plus Supabase
backup cover the worst case.

---

## 9. Decisions I need from you

**Q1. Who are setters and closers?** If they're DA-placed people (as Stellar
"placements" suggest), they become **Service Team** with assignments. If
they're the customer's own staff, the four-role model has no role for
customer employees who *work* leads. Options: keep them as **Members** who can
log touches, or add a fifth customer role. Also: does today's customer `admin`
map to **Owner**, or to **Member + approve**?

**Q2. Telnyx and Stripe billing.** Neither exists yet. I'd build the
webhook-holding pattern for the sources that do exist (CRM, Stripe Connect
revenue, transcripts, forms) and make Telnyx and Stripe billing plug into it
when later prompts add them. The "Telnyx and Stripe events are matched"
Done-When item would then be verified against CRM and Stripe Connect events
only. OK?

**Q3. Stellar and Forsight.** Should the Stellar product (`forsight.vistrial.io`)
and Forsight (`pulse.vistrial.io`) move onto this same role model now (my
recommendation, since they share the tables), or be left as-is?

**Q4. Staff host.** Keep staff and customers both on `app.vistrial.io` (today's
structure, with role-based navigation and the customer portal at `/portal`),
or stand up `admin.vistrial.io` for staff now?

**Q5. Backups.** Please confirm the Supabase project's backup or PITR tier, or
approve a Supabase branch for the test run. A branch costs money, so I won't
create one without a yes. Without either, I'll test on the local rebuild and
take the JSON snapshot.

---

## 10. Things I found that predate this work

- `npm run db:verify` fails in `verify-reporting.sql:529` ("expected a volume
  discontinuity") on an untouched `main`. Every migration applies cleanly.
- Supabase advisors: leaked-password protection is off; 36 functions have a
  mutable `search_path`; `pg_trgm` is in `public`.
- Prompts 2 and 3 reference "Section 3" and "Section 4" of a spec I don't have.
  Please share it before Prompt 2.

---

## Appendix A — Every table, with current coverage and proposed visibility

Built from the schema produced by all repo migrations (matches live, except
live still has `forsight_sync_runs` because `drop_airtable_source` wasn't
applied). Storage: **no Supabase Storage buckets exist**. Files are rows in
`lead_files`, covered by RLS.

| Table | Workspace column | RLS | Policies | Proposed visibility |
|---|---|---|---|---|
| `activation_changes` | org_id | yes | 1 | Service team only |
| `activation_records` | org_id | yes | 1 | Customer-visible (read), staff write |
| `ad_spend_days` | org_id | yes | 1 | Customer-visible (read), staff write |
| `agent_assets` | org_id | yes | 2 | Customer-visible (read), staff write |
| `agent_escalations` | org_id | yes | 2 | Service team only |
| `agent_events` | org_id | yes | 1 | Service team only |
| `agent_model_routes` | — | yes | 1 | Platform-wide (no customer data) |
| `agent_research_facts` | org_id | yes | 2 | Service team only |
| `agent_run_approvals` | org_id | yes | 2 | Service team only |
| `agent_run_steps` | org_id | yes | 2 | Service team only |
| `agent_runs` | org_id | yes | 3 | Service team only |
| `approval_action_types` | — | yes | 1 | Platform-wide (no customer data) |
| `approval_gate_actions` | org_id | yes | 1 | Service team only |
| `approval_gate_changes` | org_id | yes | 1 | Service team only |
| `approval_gate_settings` | org_id | yes | 1 | Service team only |
| `approval_items` | org_id | yes | 1 | Customer-visible (read), staff write |
| `baseline_calls` | org_id | yes | 1 | Service team only |
| `baseline_fallback_declines` | org_id | yes | 1 | Service team only |
| `baseline_leads` | org_id | yes | 1 | Service team only |
| `baseline_revenue` | org_id | yes | 1 | Service team only |
| `baseline_runs` | org_id | yes | 1 | Service team only |
| `baseline_touches` | org_id | yes | 1 | Service team only |
| `benchmark_cohorts` | — | yes | 1 | Platform-wide (no customer data) |
| `brief_openings` | org_id | yes | 2 | Customer-visible (read), staff write |
| `brief_views` | org_id | yes | 2 | Service team only |
| `business_profile_stages` | org_id | yes | 1 | Service team only |
| `business_profile_versions` | org_id | yes | 1 | Service team only |
| `business_profiles` | org_id | yes | 1 | Service team only |
| `calendar_blocks` | org_id | yes | 1 | Customer-visible (read), staff write |
| `calibration_benchmarks` | — | yes | 1 | Platform-wide (no customer data) |
| `calibration_suggestions` | org_id | yes | 1 | Service team only |
| `call_coaching_benchmarks` | — | yes | 1 | Platform-wide (no customer data) |
| `call_coaching_findings` | org_id | yes | 1 | Service team only |
| `call_coaching_gaming_signals` | org_id | yes | 1 | Service team only |
| `call_extractions` | org_id | yes | 3 | Customer-visible (read), staff write |
| `call_objection_handlings` | org_id | yes | 1 | Service team only |
| `call_quality_measures` | org_id | yes | 1 | Service team only |
| `calls` | org_id | yes | 2 | Customer-visible (read), staff write |
| `configuration_priors` | — | yes | 1 | Platform-wide (no customer data) |
| `eod_submission_leads` | org_id | yes | 1 | Customer-visible (read), staff write |
| `eod_submissions` | org_id | yes | 1 | Customer-visible (read), staff write |
| `execution_connections` | org_id | yes | 1 | Service team only |
| `execution_writes` | org_id | yes | 1 | Service team only |
| `extraction_audits` | org_id | yes | 1 | Service team only |
| `extraction_corrections` | org_id | yes | 2 | Service team only |
| `extraction_jobs` | org_id | yes | 1 | Service team only |
| `extraction_usage` | org_id | yes | 1 | Service team only |
| `follow_up_drafts` | org_id | yes | 3 | Customer-visible (read), staff write |
| `follow_up_events` | org_id | yes | 2 | Service team only |
| `follow_up_jobs` | org_id | yes | 1 | Service team only |
| `follow_up_quality_check_failures` | org_id | yes | 1 | Service team only |
| `follow_up_reply_signals` | org_id | yes | 1 | Service team only |
| `follow_up_routing_rules` | org_id | yes | 2 | Service team only |
| `follow_up_sequence_runs` | org_id | yes | 2 | Service team only |
| `follow_up_settings` | org_id | yes | 2 | Service team only |
| `form_events` | org_id | yes | 1 | Customer-visible (read), staff write |
| `forsight_report_sends` | org_id | yes | 1 | Customer-visible (read), staff write |
| `forsight_reports` | org_id | yes | 1 | Customer-visible (read), staff write |
| `forsight_sources` | org_id | yes | 4 | Service team only |
| `ghl_connections` | org_id | yes | 1 | Service team only |
| `ghl_contact_locks` | — | yes | 0 | Platform-wide (no customer data) |
| `ghl_dispatches` | org_id | yes | 0 | Service team only |
| `ghl_field_maps` | org_id | yes | 2 | Service team only |
| `ghl_oauth_sessions` | org_id | yes | 0 | Service team only |
| `ghl_rate_windows` | org_id | yes | 0 | Service team only |
| `ghost_detector_runs` | org_id | yes | 1 | Service team only |
| `ingestion_alerts` | org_id | yes | 0 | Holding / ops: platform admin only |
| `lead_assignment_changes` | org_id | yes | 1 | Customer-visible (read), staff write |
| `lead_files` | org_id | yes | 3 | Customer-visible (read), staff write |
| `lead_status_changes` | org_id | yes | 1 | Customer-visible (read), staff write |
| `lead_type_changes` | org_id | yes | 1 | Customer-visible (read), staff write |
| `leads` | org_id | yes | 6 | Customer-visible (read), staff write |
| `leak_reports` | org_id | yes | 1 | Customer-visible (read), staff write |
| `next_actions` | org_id | yes | 4 | Customer-visible (read), staff write |
| `notification_digest_log` | org_id | yes | 1 | Service team only |
| `notification_escalations` | org_id | yes | 1 | Service team only |
| `notification_mutes` | org_id | yes | 2 | Customer-visible (read), staff write |
| `notification_preferences` | org_id | yes | 2 | Customer-visible (read), staff write |
| `notification_presence` | org_id | yes | 1 | Service team only |
| `notification_push_subscriptions` | — | yes | 1 | Per-user (scoped by user, not workspace) |
| `notification_team_channels` | org_id | yes | 2 | Service team only |
| `notifications` | org_id (nullable) | yes | 2 | Customer-visible (read), staff write |
| `objection_vocabulary` | org_id | yes | 1 | Service team only |
| `objections` | org_id | yes | 3 | Customer-visible (read), staff write |
| `operator_run_confirmations` | org_id | yes | 3 | Service team only |
| `operator_run_leads` | org_id | yes | 2 | Service team only |
| `operator_run_steps` | org_id | yes | 3 | Service team only |
| `operator_runs` | org_id | yes | 3 | Service team only |
| `ops_alerts` | org_id (nullable) | yes | 1 | Holding / ops: platform admin only |
| `ops_health_samples` | — | yes | 1 | Platform-wide (no customer data) |
| `ops_http_errors` | — | yes | 1 | Platform-wide (no customer data) |
| `ops_incidents` | org_id (nullable) | yes | 1 | Holding / ops: platform admin only |
| `ops_job_catalog` | — | yes | 1 | Platform-wide (no customer data) |
| `ops_job_runs` | — | yes | 1 | Platform-wide (no customer data) |
| `ops_restore_drills` | — | yes | 1 | Platform-wide (no customer data) |
| `org_agent_settings` | org_id | yes | 2 | Service team only |
| `org_benchmark_metrics` | org_id | yes | 1 | Service team only |
| `org_deletion_records` | org_id | yes | 1 | Service team only |
| `org_invites` | org_id | yes | 3 | Customer-visible (read), staff write |
| `org_members` | org_id | yes | 4 | Customer-visible (read), staff write |
| `org_voice_profiles` | org_id | yes | 2 | Service team only |
| `organizations` | — | yes | 2 | The workspace record itself |
| `placements` | org_id | yes | 1 | Customer-visible (read), staff write |
| `platform_admins` | — | yes | 1 | Platform-wide (no customer data) |
| `portal_schedules` | org_id | yes | 2 | Customer-visible (read), staff write |
| `processor_events` | org_id | yes | 1 | Customer-visible (read), staff write |
| `profile_contradictions` | org_id | yes | 1 | Service team only |
| `profile_field_registry` | — | yes | 1 | Platform-wide (no customer data) |
| `profile_review_prompts` | org_id | yes | 1 | Service team only |
| `rate_limit_buckets` | — | yes | 0 | Platform-wide (no customer data) |
| `readiness_scores` | org_id | yes | 3 | Customer-visible (read), staff write |
| `reporting_cohorts` | org_id | yes | 1 | Customer-visible (read), staff write |
| `reporting_job_runs` | org_id (nullable) | yes | 1 | Service team only |
| `reporting_snapshots` | org_id | yes | 1 | Customer-visible (read), staff write |
| `retention_runs` | — | yes | 1 | Platform-wide (no customer data) |
| `revenue_log` | org_id | yes | 2 | Customer-visible (read), staff write |
| `sales_os_assets` | org_id | yes | 3 | Customer-visible (read), staff write |
| `sales_os_context_packages` | org_id | yes | 2 | Service team only |
| `sales_os_conversations` | org_id | yes | 3 | Customer-visible (read), staff write |
| `sales_os_destinations` | org_id | yes | 3 | Service team only |
| `sales_os_executions` | org_id | yes | 3 | Customer-visible (read), staff write |
| `sales_os_gates` | org_id | yes | 3 | Service team only |
| `sales_os_messages` | org_id | yes | 3 | Customer-visible (read), staff write |
| `sales_os_routes` | org_id | yes | 3 | Service team only |
| `sales_os_tool_calls` | org_id | yes | 3 | Customer-visible (read), staff write |
| `score_config_versions` | org_id | yes | 1 | Service team only |
| `score_configs` | org_id | yes | 2 | Service team only |
| `score_field_maps` | org_id | yes | 2 | Service team only |
| `score_field_rules` | org_id | yes | 2 | Service team only |
| `self_reported_baselines` | org_id | yes | 2 | Service team only |
| `settings_activity` | org_id | yes | 1 | Service team only |
| `source_connections` | org_id | yes | 1 | Service team only |
| `stellar_build_stage_mappings` | — | **NO** | 0 | Platform-wide (no customer data) |
| `stellar_da_access_log` | org_id (nullable) | yes | 1 | Service team only |
| `stellar_da_operators` | — | yes | 1 | Platform-wide (no customer data) |
| `touches` | org_id | yes | 3 | Customer-visible (read), staff write |
| `transcript_connections` | org_id | yes | 1 | Service team only |
| `unmatched_transcripts` | org_id | yes | 4 | Service team only |
| `verification_false_positives` | org_id | yes | 1 | Service team only |
| `verification_injected_runs` | — | yes | 1 | Platform-wide (no customer data) |
| `verification_runs` | org_id | yes | 1 | Service team only |
| `verification_sample_audits` | org_id | yes | 1 | Service team only |
| `verification_task_settings` | — | yes | 1 | Platform-wide (no customer data) |
| `verification_usage` | org_id | yes | 1 | Service team only |
| `voice_profile_suggestions` | org_id | yes | 2 | Service team only |
| `webhook_dead_letters` | org_id (nullable) | yes | 0 | Holding / ops: platform admin only |
| `webhook_events` | org_id (nullable) | yes | 0 | Holding / ops: platform admin only |
