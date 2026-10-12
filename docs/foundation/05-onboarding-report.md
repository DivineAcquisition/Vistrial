# Client onboarding flow: implementation report

Branch: `claude/onboarding-flow`. Discovery and plan were agreed in the session (ten decisions,
listed at the end).

## Status in one paragraph

**Built and tested locally; nothing is deployed.** Every workspace now has one onboarding
record with sixteen fixed stages, and every screen reads that record: the Owner's setup flow,
the home progress card, the staff queue, the workbench, the roster and the workspace overview.
Staff create a workspace and invite the Owner. The Owner then works through thirteen setup
screens, at their own pace, on a phone or a desktop. Staff run go-live checks, approve, and
switch agents on one at a time. A first-week check-in moves the workspace to "settled".
Imported leads are history: database guards stop alerts, clocks and drafts for them. The
sample lead never sends. One migration does all of it, and it has a tested rollback.

## What changed

### Database: `20261012010000_onboarding_flow.sql` (rollback in `supabase/rollbacks/`)

- **Stage definitions** (`onboarding_stage_definitions`): one row per stage. Each row holds:
  - the customer label and the staff label;
  - why the stage matters;
  - who does it (customer, staff, or both);
  - automatic or manual completion;
  - dependencies, a time estimate, and whether go-live requires it.

  Platform Admins edit the wording, the estimates and the dependencies. The order and the
  completion rules are fixed. Template defaults (`onboarding_template_defaults`) set the import
  look-back (90 days) and Sentry's watch-only days (1).
- **The record:**
  - `workspace_onboarding_status` gains these columns:
    - `phase` (setup, ready for review, activating, live, settled, paused, cancelled);
    - the current stage, who the workspace is waiting on and since when;
    - the stuck flag and its reason;
    - the channel choices, the review sign-off, the Owner's confirmation, the go-live
      approval, the activation pause, Sentry's watch end, and the stored checks.
  - `workspace_onboarding_stages` holds one row per stage per workspace. Each row has:
    - the status (not started, in progress, waiting on customer, waiting on team, blocked,
      done, skipped);
    - a customer note and a staff-only note, plus an expected date;
    - a skip reason, start and finish times, and who completed it;
    - a version, for edit conflicts.
- **`onboarding_refresh`** recomputes the stages from the real state. Every function and
  screen goes through it.
  - Automatic stages move back when the underlying state breaks. Example: a broken CRM
    connection turns the CRM stage from done to blocked.
  - Each change is logged as `onboarding.stage_changed` and emits an event for notifications.
  - Dependencies are respected, and a manual skip holds until someone reopens the stage.
- **Other new tables:**
  - `onboarding_staff_details`: the internal note, the intended plan, and the case-file pace
    overrides;
  - `onboarding_check_acceptances`: warnings a Platform Admin accepted;
  - `onboarding_events` and `onboarding_reminders`;
  - `onboarding_member_flags`: one-time welcomes;
  - `workspace_agent_activation`;
  - `onboarding_import_runs`, `onboarding_import_problems` and `lead_import_marks`;
  - `messaging_registration_details` and `email_domain_setup`;
  - `workspace_escalation_contacts`;
  - `onboarding_sample_runs`, `onboarding_checkins` and `onboarding_feedback`.
- **Guards:** before-insert triggers silently drop rows for historic (imported, not
  reactivated) leads on these tables:
  - `sentry_clocks`, `sentry_alerts`;
  - `relay_jobs`, `relay_drafts`;
  - `follow_up_sequence_runs`, `follow_up_drafts`;
  - `approval_items`.

  A notifications guard strips historic lead ids. A dispatch guard suppresses anything
  addressed to a sample lead.
- **`create_workspace`** has a new signature. It takes:
  - the name, time zone, slug, Owner email and template;
  - the contact name, the staff to assign, and the plan's price id and label;
  - an internal note.

  It applies the template, creates the record with every agent off, records the plan without
  charging, and creates a 7-day Owner invitation. Platform Admins can always call it. Service
  Team can call it only with the per-person permission, which only a Platform Admin can grant.
  Every grant and every use is logged.
- **Backfill:** existing workspaces get the record. Active workspaces keep their agents on:
  Sentry as configured, Relay drafts only, Compass "coming soon". Their phase is set from
  their current status.

### App

- **Customer setup** (`/app/onboarding`): an overview that resumes where the Owner stopped,
  then one screen per step:
  - welcome, approach, business details;
  - CRM, texting, email;
  - approvers, escalation contacts, team;
  - lead import, meet your agents, sample test, go live.

  Each screen shows its place in the journey, why it matters, the time it takes, and its
  honest state ("Your team is on it", "Waiting on you", "Coming next"). Each also has "Need
  help?", Back, and "Save and finish later". Steps that wait on staff never block the steps
  the Owner can do. Members get a read-only progress page. Operators only get a short welcome.
- **Staff queue** (`/app/team/onboarding`): every workspace in setup.
  - Each row shows the phase, the current stage and next action, who it waits on and for how
    long, a risk (stuck, needs review, slow, on track), and the assigned staff.
  - Filters cover phase, waiting on, risk, mine, and search; filters can be saved as views.
  - Stuck workspaces sort first.
  - Wide screens get a table; phones get cards.
  - Platform Admins and permitted Service Team also get the create-workspace form.
- **Workbench** (`/app/team/onboarding/[id]`): each section below is one of the anchors the
  go-live checks link to.
  - **Where it stands:** a summary of the workspace's state.
  - **Owner invitation:** resend, change the email, cancel.
  - **Go-live checks:** each check with its reason and fix link. A Platform Admin can accept
    a warning with a reason. Then the approval.
  - **Agent activation:** the next step with its plain-language copy, then Sentry's alerts,
    and the pause.
  - **Every stage:** the customer note, staff note and expected date; skip or reopen with a
    reason; and "Remind the Owner", at most once a day per step.
  - **Settings review:** the sign-off.
  - **Texting registration:**
    - the decrypted details, staff only;
    - the "EIN received and submitted" toggle;
    - the carrier status, with a rejection reason picked from a fixed list and the guidance
      shown;
    - sender confirmation.
  - **Email domain:** the records editor and domain confirmation.
  - **People and escalation:** the contacts and the customer's team.
  - **Import:** progress, skip reasons, and pause, resume, retry or cancel. Problems are
    decided one at a time; the customer can also decide them by kind. Case-file limits and the
    pause control sit here.
  - **Sample test:** run, confirm, and clean up.
  - **First-week check-ins:** questions answered from real data, notes, and a follow-up date.
  - **Staff details:** the internal note and the plan.
  - **Move back, pause or resume.**
  - **Activity log.**
- **Platform Admin settings:**
  - `/app/team/support#onboarding` sets the timings:
    - invitation reminder days and nudge spacing;
    - the per-step nudge limit and the stuck-after days;
    - check-in days and the carrier-slow days;
    - the longest import look-back;
    - the case-file defaults.
  - `/app/team/onboarding/settings` covers stage wording and time estimates, template
    defaults, and who on the Service Team may create workspaces.
- **Background work** (`/api/cron/onboarding`, every 5 minutes): refresh records, run
  imports, build case files at their pace, advance and clean up sample tests, send grouped
  notices, and send reminders.
- **Agents:**
  - `agentMayRun` now also requires the workspace's activation row, and reports
    `not_activated` otherwise.
  - Relay's `sample` trigger works only on the test lead.
  - Sentry's sweep skips historic leads and sends to the named escalation contacts in order.
  - The notification observers ignore historic leads.

## Sample lead test

- **What it creates:** a lead named "Sample lead (test)", flagged `is_test`. It gets a basic
  case file, a Scribe run, a Sentry clock and alert, and a Relay draft through the normal
  approval gate. The Owner watches the same live agent screens they will see later.
- **Why it can't send:** two independent stops.
  - The dispatch chokepoint returns `suppressed / sample_lead` before any outside call.
  - A database guard marks any dispatch row for a test lead as suppressed.
- **Kept out of metrics:** test leads are outside `portal_lead_scope`, so they appear in no
  results or reports.
- **Cleanup:** the test lead is deleted from every lead-linked table, and then the cleanup is
  verified by counting what is left. This happens on confirmation, on a reported problem, on
  failure, or after 24 hours.
- **A failed run:** a run that stops part way is marked failed at that step and the team is
  told. The go-live check stays failing until a clean pass.

## Import, and how historic leads are protected

- **Pacing:** the import pages through the CRM 100 contacts at a time, within the shared CRM
  rate limit, in 40-second ticks. It saves progress after every page.
- **Interruptions:** if the CRM fails mid-import, the run is marked failed and resumes from the
  last saved page on retry.
- **Repeatable without duplicates:** the CRM contact id is unique per workspace, so a second
  run updates the lead rather than adding another.
- **Problems:** missing contact details, bad numbers, bad emails, possible duplicates and
  unreadable contacts are grouped and described in plain words. The Owner or staff keep or
  skip them.
- **Do-not-contact** markers carry over from the CRM.
- **Case files:**
  - every imported lead gets a basic case file from its CRM details, with no AI cost;
  - Scribe builds full case files only for open leads active in the last 30 days, at most
    300 per workspace, at 60 an hour;
  - staff can pause this or raise either limit; Platform Admins set the defaults;
  - leads past the limit are labelled "basic case file".
- **Protection:** each imported lead gets a `lead_import_marks` row. While it has no
  `reactivated_at`, the guards above drop any alert, clock, draft, sequence or approval for
  it, and the app filters skip it. A new touch or call after the import time reactivates it,
  and from then on it is a normal lead.
- **Never writes to the CRM.**

## Go-live checks and approval

There are twelve checks, each with pass, warning or fail, a reason, and a fix link:

1. configuration complete (Prompt 2's check, for the current version);
2. CRM connected and recently synced;
3. texting registered and approved, or texting turned off with a reason;
4. email domain verified, or email turned off;
5. at least one approver who has signed in;
6. at least one escalation contact who confirmed a test;
7. compliance rules in place;
8. staff review signed off for the current configuration version;
9. sample test passed and cleaned up;
10. lead import complete or running;
11. billing in good standing;
12. no open connection or agent-failure escalations.

Rules:

- A failing check blocks approval.
- Only a Platform Admin can accept a warning, and only with a reason.
- A fail can never be accepted.
- The Owner must have said they are ready.

Approval sets the workspace active with every agent still off and creates the check-ins.

## Staged activation

The order is enforced in the database:

1. **Scribe** on.
2. **Sentry** watching only for the template's watch days (1 by default). It records what it
   would have flagged and tells nobody, and it never switches over by itself. After the watch
   period, staff switch the alerts on. A Platform Admin can do it earlier, with a reason.
3. **Relay** in drafts-only mode, through the approval gate.
4. **Compass:** "coming soon", as a placeholder.

The Owner sees the plan in plain words on the go-live screen, including when alerts start in
the workspace's time zone. Staff can pause at any step. Moving a workspace back to setup,
pausing it or cancelling it switches every agent off at once and tells the customer. A
Platform Admin's direct status change also keeps the record in step and leaves agents off.

## First-week check-in

- **Days 1, 3 and 7** (configurable). Each check-in answers its questions from real data:
  - alerts acknowledged;
  - drafts decided;
  - failed runs;
  - connection problems;
  - unanswered requests;
  - Operators with no activity.
- **Completing one:** staff add notes and an optional follow-up date.
- **The Owner's prompt:** on day 7 the Owner gets one optional "How is it going?" prompt, a
  rating and a free-text box. It goes to the team as a request, and dismissing it is
  remembered.
- **Settled:** when the last check-in is done, the workspace is settled and leaves the active
  queue.

## Role visibility, as enforced

Everything is enforced in the database. The pages only mirror it.

| Who | Can see and do |
| --- | --- |
| Owner | The setup flow and progress card for their own workspace. Customer copy never includes staff notes, configuration internals or secrets. |
| Member | The read-only progress page and card. |
| Operator | Only the one-time welcome. `onboarding_customer_view` and `onboarding_refresh` refuse them. |
| Service Team | The queue and workbench for assigned workspaces only, through `staff_scope_org_ids` and the `ws_staff_only` policies. Another workspace's address returns the neutral not-found. |
| Platform Admin | Everything: creation, stage definitions, timings, accepting warnings, early Sentry alerts. |

Every staff action is logged with the actor's label.

## Sensitive registration details

- **No tax ID, anywhere.** Vistrial never collects or stores the EIN. The form has no field
  for it, and both the app and the database refuse a tax-ID-shaped value or field name. Staff
  get it from the Owner outside Vistrial and enter it only in the CRM's registration form. The
  workbench toggle "EIN received and submitted" records only that this happened, never a value.
- **Encrypted at rest:** the other details are encrypted (AES-256-GCM, the server-only key
  already used for CRM tokens) and stored as `details_ciphertext`. In the clear, the database
  holds only the list of field names and whether the set is complete.
- **Who can read them:**
  - only assigned staff and Platform Admins, by row policy;
  - decrypted on the server for the workbench;
  - the Owner can save the details but cannot read them back.
- **Never leaves the workbench:** the details never appear in logs, the activity feed,
  notifications, customer exports, or agent context.
- **The registration reference** is staff-only.

## Workspace isolation: every new table and store

Each table is listed with the policy on it:

- **Staff only:** the select policy and a restrictive `ws_staff_only` limit these to
  `user_staff_org_ids()`. They are also covered by the `ws_open_*` closed-workspace guards.
  - `workspace_onboarding_stages`, `onboarding_staff_details`;
  - `onboarding_check_acceptances`, `onboarding_events`, `onboarding_reminders`;
  - `onboarding_import_runs`, `onboarding_import_problems`;
  - `messaging_registration_details`, `email_domain_setup`;
  - `onboarding_checkins`, `onboarding_feedback`, `onboarding_sample_runs`.
- **Customer-visible, scoped:**
  - `workspace_agent_activation`: staff, Owner and Member of that workspace.
  - `lead_import_marks`: whoever can see the lead (`ws_lead_visible`).
  - `workspace_escalation_contacts`: staff and Owner, plus each person's own row.
  - `onboarding_member_flags`: each person's own row, plus staff.
- **Platform tables:** `onboarding_stage_definitions` and `onboarding_template_defaults` are
  readable by platform staff only, and changed only through Platform Admin functions.
- **Summaries:** `onboarding_queue`, `onboarding_customer_view` and the new
  `onboarding_case_file_counts` are definer functions that check access before reading.
- **Not added:** no new storage buckets and no realtime publications.
- **Signed-out visitors:** a before/after comparison of definer functions callable by `anon`
  shows none added. Three old ones are no longer callable.

## Performance (local Postgres 16, 402 workspaces, one with 50,000 imported leads)

| Read | Time |
| --- | --- |
| Staff queue, all workspaces (`onboarding_queue`) | 13–26 ms |
| Workbench refresh on the 50,000-lead workspace (`onboarding_refresh`) | 20–31 ms |
| Case-file counts on that workspace | 22 ms (was 26.6 s through the row policy; replaced with `onboarding_case_file_counts`) |
| Customer view (`onboarding_customer_view`) | 41–51 ms |
| Creating 400 workspaces through `create_workspace` | 67 ms each |

## Accessibility and phone checks

- **Method:** axe-core in headless Chromium, on server-rendered HTML. The pages were the setup
  overview in all seven sample states, every staff workbench control, and the settings
  controls. The colour-contrast rule was off because no stylesheet was loaded.
- **Overview:** no violations other than the landmark rule. The app shell provides `<main>`,
  so that one only appears without the shell.
- **Fixed:** five toggles had no accessible name. They now use the Switch's own label, plus a
  matching `aria-label`.
- **Remaining, and existing:** a field's label points at the id given in code, but the shared
  base-ui control renders its own id on the server and corrects it after mount. The existing
  Add staff form shows the same thing. Changing the shared Field component was out of scope.
- **By construction:**
  - every control has a visible label;
  - states are words as well as colour;
  - tap targets are at least 44 px;
  - the queue switches to cards below the medium breakpoint;
  - workbench rows wrap.
- **Not done:** a live browser pass on a running app. The local stack has no auth server.

## Layout reference and simulator

- **Layout reference:** `/app/layouts/onboarding`, Platform Admins only, linked from
  `/app/layouts`. It shows the setup overview in each state: just created, mid-setup, waiting
  on the carriers, blocked, ready for review, live, and settled. The data is made up.
- **Simulator:** a new "Sentry watching only, during setup" scenario shows the watch-day run.
  It ends with "Would have flagged… Nobody was told."

## Done When

| Check | Result |
| --- | --- |
| One record per workspace; card, overview, roster and queue read it and agree | **Pass.** Database test: roster = card = customer view; unit test: TypeScript stages = seeded stages in order. |
| Workspace creation with invite, resend, change and cancel, plus invitation reminders | **Pass** (database test: Platform Admin, Service Team only with a logged grant, 7-day invite, resend and change). Reminders on days 3 and 7 are in the cron job; there is no separate test for them. |
| Owner completes guided setup on a phone, with resume, help and honest waiting states | **Pass by construction and unit tests** (resume logic, step order). No live phone run. |
| CRM, messaging (status and rejection guidance), email domain; credentials are references only | **Pass.** Database test covers rejection → blocked with the Owner's code. CRM tokens are unchanged (reference-only). |
| Approvers and escalation contacts required, with a test notification | **Pass.** Go-live checks 5 and 6. The test notification goes to the contact; confirming it is recorded. |
| Member and Operator invitations; one-time role welcome | **Pass** (`onboarding_member_flags`, RoleWelcome). |
| Sample test is safe, labelled, sends nothing, excluded from metrics, cleaned up | **Pass.** Database test: dispatch suppressed, outside `portal_lead_scope`, cleanup verified, confirm → done. |
| Import: background, repeatable, paced, pausable, safe at scale; historic leads and DNC protected | **Pass.** Database tests: guards, DNC carry-over, unique CRM contact, reactivation. 50,000-lead timing above. |
| Staff queue and workbench for assigned workspaces, with nudges, skip, reopen and notes | **Pass.** Database tests: Service Team B sees nothing of W1; stale-version conflict; skip and reopen. |
| Go-live checks block failures; only Platform Admins accept warnings | **Pass.** Database tests: failing checks block; a Platform Admin cannot accept a fail; Service Team cannot accept a warning; past-due billing blocks. |
| Approval recorded; staged activation in order, with pause; Sentry watch-only; Relay drafts-only | **Pass.** Database tests for order, pause, watch period, and the early switch-on with a reason. |
| First-week check-in, day 7 prompt, settled | **Pass.** Database test: check-ins settle. Unit test: the six questions answered from facts. |
| Notifications gentle, grouped, no lead content, stop once acted on | **Pass by construction:** grouped per workspace and audience; at most one Owner nudge every 3 days and 3 per step; lines carry no lead data (unit-tested). |
| Role visibility at the data layer; customers can't reach the staff area | **Pass.** Database tests: Owner, Member, Operator, the other Service Team member, and signed-out visitors. Nav test: the staff onboarding area is not in Owner, Member or Operator navigation; pages use `requireStaff` → not-found. |
| Sensitive registration details | **Pass.** Database test: no tax ID; the Owner can't read details back; staff can; no ciphertext in the log. |
| Layout states, accessibility and phone checks, load times | **Partly.** States added; axe results and timings above. No live browser run (see Accessibility). |
| Isolation for every new table and store | **Pass.** Listed above; the policies are exercised by the role tests. |
| No existing permission, route, component, colour, font or token changed beyond what's described | **Pass.** Checked with `git diff --stat` (details below). |

The `git diff --stat` check found:

- **No UI primitives or styles changed.**
- **Two app components changed:**
  - `first-run.tsx` skips the generic explainer for roles that now get the welcome;
  - `layout-reference.tsx` gains one link.
- **One route removed:** the old staff-only `progress` edit form was replaced by the record.
- **Permission changes, as agreed:**
  - Owners may set `business_address`;
  - Service Team may create workspaces only with the new grant.

## Tests run

- **Unit tests:** 938 pass. The two failures in `src/lib/navigation.test.ts` also fail on the
  untouched branch head.
- **Lint:** 22 errors and 9 warnings, all in files this work doesn't touch. The same count
  appears on the untouched head.
- **Typecheck:** clean.
- **Database suites:** `verify-onboarding` passes, and so does `verify-onboarding-reconcile`.
  Every other suite gives the same result, at the same line, as before the migration.
- **Rollback:** applied, then the migration re-applied and `verify-onboarding` passed again.

## Edge cases

- **The Owner leaves for two weeks:** they resume at the first step waiting on them. Owner
  nudges stop after 3 per step. The workspace shows as stuck to staff after 5 days.
- **Owner invited with an email that already has an account:** the existing invitation
  acceptance adds the membership, and the workspace switcher handles two workspaces. This
  was not separately tested here.
- **CRM fails mid-import:** the run fails, can be resumed from its last page, and the CRM
  stage goes to blocked.
- **Huge or messy CRM:** paged, rate-limited, problems grouped; full case files are capped.
- **Carrier rejection or slow approval:**
  - rejection: plain reason and fix for the Owner, with the fields to correct;
  - slow: "slow" after 7 days, and staff can set an expected date.
- **No texting, or no email:** the Owner turns the channel off with a reason, and the check
  passes on that reason.
- **Template change requested mid-setup:** the request reaches staff. A configuration change
  invalidates the staff review sign-off and the configuration check.
- **Approver or contact never accepts:** the approver check fails, and the contact check warns
  or fails. Required alert levels fall back to the Owner, and the screen says so.
- **Staff reassigned or removed:** access follows assignments, the queue shows "Nobody
  assigned", and Platform Admins cover.
- **Customer asks to pause or cancel:** staff move the workspace with a reason, agents go
  off, and the customer is told.
- **Billing past due:** the billing check fails and blocks go-live (tested).
- **Sample test fails part way:** marked failed at that step, staff told, cleaned up.
- **Two staff on one stage:** the version check refuses the second write with "Someone else
  changed this a moment ago".
- **Live, then a connection fails:** existing connection alerts fire, the day-1 to day-7
  check-ins show it, and the no-blockers check reflects it.
- **Time zones:** times that matter (when Sentry's alerts start, business hours) are shown
  in the workspace's time zone and named. Other times are relative ("in 3h", "2d ago").
  Users have no stored personal time zone, so "the viewer's time zone" is the workspace's.

## Decisions applied

1. Carrier registration: the details are collected in Vistrial, staff submit in the CRM's
   phone registration, and the status is recorded here. `provider` is ready for a direct
   integration later.
2. EIN: never collected or stored; there is a staff-only checkbox.
3. Case files: basic for every imported lead; full for open leads active in the last 30 days,
   up to 300, at 60 an hour, adjustable.
4. Look-back: the template default (90 days), up to 365, with the basic-case-file note.
5. Service Team creation: a per-person grant from a Platform Admin; every grant and use is
   logged.
6. Escalation contacts: an ordered named list with a channel each; it is the final fallback.
7. Sentry watch-only: 1 day by default, never switches over automatically, and the Owner is
   told when alerting starts.
8. Compass: "coming soon".
9. Reminders: staff on days 3 and 7; the Owner at most every 3 days and 3 per step; stuck
   after 5 days; all editable.
10. Plan: the price is recorded on the workspace and nothing is charged.

## Going live

- **Deploy and migrate:** apply the migration. Before trusting it with real data, check it
  on a Supabase branch.
- **Cron:** confirm `CRON_SECRET` is set; Vercel Cron picks up `/api/cron/onboarding` from
  `vercel.json`.
- **Templates:** make sure the template each new workspace will use is active.
