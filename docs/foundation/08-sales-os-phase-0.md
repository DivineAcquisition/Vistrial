# Sales OS rebuild (Prompt 26): Phase 0 discovery

Report only. Nothing in this document was applied to production. Checks against
production were read-only and schema-only (migration history, table names, and
one catalog query about row level security). No customer rows were read.

## 1. CI health

The `verify` job in `.github/workflows/ci.yml` runs, in order: `npm ci`,
`npm audit --audit-level=high`, `npm test`, `npm run typecheck`, `npm run build`,
and the client secrets check. It stops at the audit, so no pull request has had
its tests, typecheck or build run in CI.

`npm audit` today: 24 advisories (2 critical, 15 high, 7 moderate).

| Severity | Package | Path | Fix |
|---|---|---|---|
| critical | next | direct | 16.4.2 (patch inside 16.x) |
| critical | proxy-addr | transitive | `npm audit fix` |
| high | shadcn, braces, fast-glob, micromatch | direct dev CLI | shadcn 1.0.0 is a major change; the CLI is a dev tool and never reaches a user |
| high | eslint-config-next, @next/eslint-plugin-next | direct dev | major; dev only |
| high | @modelcontextprotocol/sdk, @ts-morph/common, ts-morph, brace-expansion, js-yaml, sharp, source-map-js, undici, vite | transitive | `npm audit fix` |

Unit tests on main: 16 failures in 6 files, the same with and without the work
in this branch.

| File | Why it fails | Proposed fix |
|---|---|---|
| `src/lib/navigation.test.ts` | Settings now has an Approvals tab the test does not list | Update the expected tabs |
| `src/lib/auth/portal-access.test.ts` | Operators can now open `/app/settings/cookies` | Decide: allow (update test) or remove from the operator list |
| `src/lib/plain-language.test.ts` | The word "webhook" is in user-facing scoring copy | Reword the copy |
| `src/lib/email/auth-templates.test.ts` | Expects "Divine Acquisition LLC" in the auth email footer | Conflicts with "name no other company" rules; decide the footer, then align the test |
| `src/lib/supabase/service-role.test.ts` | 16 files use the service-role client without being on the reviewed list | Review each file, then add it or move it off the service role |
| `src/lib/execution/execution.test.ts` (11) | Execution now reads pause state, which the test doubles do not provide | Give the doubles a pause state |

Fix order: (1) `next` to 16.4.2 and `npm audit fix` for the transitive patches;
(2) make the audit step block only on advisories that can reach a user (the
branch `claude/sales-os-agent-7xpxyk` already has a commit that does this,
"Block CI on advisories that can reach a user, report the rest"); (3) fix the six
test files above; (4) then CI runs tests, typecheck and build on every PR.

## 2. Production database drift

Production (`jizzmlvpnykazrsiotqq`) is at `20261019170604_approval_gate_owner_lock`.
Comparing by name, many repo migrations were applied there under different
version numbers or split into parts (for example `case_file_experience`,
`service_team_workspace`, `connector_catalog`). The ones that are truly missing:

1. `20261018010000_assay`
2. `20261018010001_assay_queue_order`
3. `20261018010002_assay_list_order`
4. `20261018170000_placed_operator_enum`
5. `20261018180000_directory_convex_owner`
6. `20261019010000_assay_scores`
7. `20261020190000_live_record_convex`
8. `20261021010000_agent_registry`
9. `20261022010000_agent_sidebar`
10. `20261022020000_workflows_foundation`

Confirmed by the table list: production has no `assay_*`, `agent_registry`,
`agent_areas`, `workspace_flags`, `playbooks`, `playbook_versions`,
`workflow_enrollments` or `lead_stage_history` tables.

Version mismatch to repair first: `approval_gate_owner_lock` is recorded in
production as `20261019170604` but is `20261019180000` in the repo. A plain
`supabase db push` would see the repo version as pending. Repair the history
(mark the repo versions of every renamed or split migration as applied) before
pushing anything.

Proposed safe order, with your approval, on a branch database first:
1. Repair migration history for the renamed and split migrations.
2. Apply 1 to 10 above in version order. `placed_operator_enum` adds an enum
   value, which cannot be used in the same transaction that adds it; it is
   already its own migration.
3. Run `npm run db:verify` against the branch, then promote.

### Security finding (act on this first)

`public.billing_settings` has row level security switched off in production,
although the repo migration enables it and the `billing_settings_admin` policy
exists there. The `anon` and `authenticated` roles both have SELECT and UPDATE
on it, so anyone with the public anon key can read and change billing settings.
Proposed fix, not applied:

```sql
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_settings FROM anon;
```

The existing admin policy keeps working once RLS is on.

## 3. What is removed, and what is reused

Onboarding
- Routes: `src/app/(workspace)/app/onboarding/**` (page, `[stage]`, `step/[slug]`,
  `approvals`, `progress`, `report` with a PDF route, `vistrial`,
  `confirm-contact/[id]`, `actions.ts`, `setup-actions.ts`), the staff side at
  `src/app/(workspace)/app/team/onboarding/**`, the layout sample at
  `src/app/(workspace)/app/layouts/onboarding`, and cron
  `src/app/api/cron/onboarding` (every 5 minutes in `vercel.json`).
- Tests: `src/lib/onboarding/onboarding.test.ts`.
- Library: `src/lib/onboarding/*` (activation, imports, stages, samples,
  registration, email domain, reminders, gate). `redirectIfOnboardingIncomplete`
  in `src/lib/onboarding/gate.ts` is called from the `/app` layout.
- Tables: `workspace_onboarding_status`, `workspace_onboarding_stages`,
  `onboarding_*` (stage definitions, template defaults, staff details, events,
  reminders, member flags, import runs and problems, sample runs, check-ins,
  feedback), `business_profiles` and versions, `activation_records`.
- Reused by Foundation: business profile fields and versions, import plan and
  history import (quiet, marked historic), template defaults.

Case File
- Routes: `src/app/(workspace)/app/cases/**` (list, `[id]`, `brief`, `print`,
  files route, actions). Components: `src/components/cases/*`.
- Library: `src/lib/cases/*` (load, experience, filters, parse, files).
- Tables: `case_files`, `case_file_versions`, `case_file_fields`, `lead_notes`,
  `lead_files`, `lead_saved_views`, `lead_merges`, `lead_plan_actions`.
- Reused by the Lead Record: case file facts and versions, extraction
  (`src/lib/extraction`, `call_extractions`, `extraction_corrections`), the
  activity timeline (`src/lib/activity`), Scribe passages and embeddings.

Forsight
- Routes: `src/app/(workspace)/app/forsight/**` (dashboard, pipeline, creatives,
  reports and export, sources, workspaces), `src/app/api/forsight/checks`, cron
  `src/app/api/cron/forsight-reports` (monthly).
- Library: `src/lib/forsight/**`. Navigation: `FORSIGHT_PATH` in
  `src/lib/navigation.ts`. Host routing: `pulse.vistrial.io` in
  `src/lib/domains/routing.ts`, `src/lib/domains/landing.ts` and
  `src/lib/marketing/hosts.ts`.
- Tables: `forsight_sources`, `forsight_reports`, `forsight_report_sends`.
- Redirect plan: the pulse host sends every path to `app.vistrial.io`.

Tables stay. Screens, navigation, crons and their tests go in build step 10.

## 4. How data enters today

- GoHighLevel: webhooks land raw in `webhook_events` (`ingestGhlWebhook` in
  `src/lib/ghl/ingest.ts`), the `ghl-ingest` cron runs `processGhlWebhookQueue`
  and `processOneEvent` (`src/lib/ghl/process.ts`) into `leads`, `touches`,
  `calls`, `lead_status_changes`. History import is `src/lib/ghl/backfill.ts`
  into the `baseline_*` tables, never into live leads.
- Inbound events that cannot be matched to exactly one open workspace are held,
  never acted on (`decideInbound` in `src/lib/inbound/decide.ts`,
  `inbound_event_holds`).
- Transcripts: webhooks in `src/app/api/transcripts`, matched to a call by
  `matchTranscriptToCall` (`src/lib/transcripts/match.ts`); no unique match goes
  to `unmatched_transcripts` for a person to assign. It never guesses.
- Calendars and other sources: `src/lib/sources` (`calendar_blocks`,
  `ad_spend_days`, `processor_events`, `form_events`), metadata only.
- Spreadsheet upload and manual entry: onboarding import
  (`src/lib/onboarding/import.ts`, `file_imports`, `lead_import_marks`) and the
  add-person dialog on the cases list (native leads).
- Connectors: `src/lib/connectors/catalog.ts` with `workspace_connections`,
  `connection_secrets` (ciphertext only), `inbound_endpoints`, `inbound_deliveries`.

Identity today is per source, and no two sources agree on the key:

| Source | How a person is matched to a lead |
|---|---|
| GoHighLevel | `findOrCreateLead` in `src/lib/ghl/process.ts`, by `ghl_contact_id` only. `identityFromContact` copies email and phone but never merges on them. |
| Spreadsheet upload and connector events | `applyInboundEvent` and `importPastRows` in `src/lib/connectors/apply.ts`, by email (`ilike`) only. Phone is stored, not matched. |
| Onboarding import | `normalizedPhone` (`libphonenumber-js`) and email duplicate checks in `src/lib/onboarding/import-plan.ts`. |
| Calendar | `keepCalendarEvent` in `src/lib/connectors/calendar-match.ts`, by attendee email against known leads. |
| Transcripts | `matchTranscriptToCall`: provider id, then time window, then participant email. Fails closed. |
| Manual entry | `createLead` in `src/app/(workspace)/app/cases/actions.ts`. No dedupe. |
| Manual merge | `lead_merges`. |

There is no single matcher across email, phone, CRM id and calendar attendee.
That is the data spine gap. The import's phone normalizer is the piece to reuse.

## 5. Agents, gate and actions

- Registry and roster: `src/lib/agents/roster.ts`, `registry.ts`, `contract.ts`,
  tables `agent_registry` and `agent_areas` (not yet in production).
- Runs: `src/lib/agents/runtime.ts`, `jobs.ts`, `persist.ts`, `agent_runs`,
  `agent_activity_*`, cron `/api/cron/agent-runtime`. Caps: `decideCaps` in
  `caps.ts`, defaults 40 runs and $25 a day per agent (`constants.ts`). Spend:
  `spend.ts`. Observation mode: `observationBlocksExecution` in `approvals.ts`.
  Halt: `agentWritesHalted` in `halt.ts`, `platform_agent_halts`.
- Flags: `workspace_flags` allows `agent_sidebar` and `workflows` today, set by
  staff through `set_workspace_flag`. `sales_os` is a one-line constraint change.
- Gate: `src/lib/gate/registry.ts`, `approval_items`, `approval_gate_settings`,
  `approval_gate_actions`, with send-time rechecks.
- Actions in connected apps: `src/lib/execution` (Slack, Discord, Drive) with
  `execution_connections` and the append-only `execution_writes`.
- To act inside connected apps the framework needs a named, typed action
  registry with a tier and a per-workspace policy (Suggest or Do and log), and an
  MCP tool map where every tool is mapped to a named action or blocked.

## 6. Roles

`org_role` values: `owner`, `admin`, `closer`, `setter`, `member`, `operator`,
`placed_operator` (not yet in production), and the retired `client_viewer` and
`da_operator`, which stay in the enum because Postgres cannot drop enum values.
`admin` is used as a staff seat label, not a customer workspace role.
The app maps them to `WorkspaceRole` (`platform_admin`, `service_team`, `owner`,
`member`, `operator`) in `src/lib/auth/types.ts`. Staff are `platform_role`
(`service_team`, `platform_admin`) in `platform_staff`. A Manager fits best as a
permission on `admin` (see decision 1).

## 7. Conflicts with earlier prompts

- Theme. Earlier prompts and the README kept the app permanently dark, and this
  prompt says not to change the design system. The owner has now chosen a white
  workspace with a dark theme toggle, built in this branch. The public site and
  the auth desk stay dark. Recommendation: treat the owner's choice as the new
  rule and keep both themes on the same tokens.
- AI Elements. The workflow canvas pieces were not rebuilt in the shadcn/ui
  version of AI Elements, and the old installer is deprecated at the end of
  November 2026. The installed copies are ours; no action needed.
- The auth email test expects "Divine Acquisition LLC" in the footer, against the
  rule to name no other company in the interface.
- Prompt 16 (Playbook Studio) is not built. Workflows store the playbook graph
  now; snippets and talk tracks fill the empty slots when Prompt 16 lands.
- Two follow-up paths run side by side. The old sequence engine
  (`src/lib/follow-up`, `processFollowUpQueue`, called from the transcript cron
  in `src/lib/transcripts/jobs.ts`) drafts into `follow_up_drafts`, and Relay
  (`src/lib/relay`) drafts into `relay_drafts` and `approval_items`, bridged by
  `relay_drafts.follow_up_draft_id`. Both need a person to approve and send from
  the CRM. The seeded sequences (`seed_default_follow_up_rules`) to convert into
  workflows or retire:

  | Branch | Starts when | Steps |
  |---|---|---|
  | `no_show` | outcome is no-show | text at 0, 24, 72 hours |
  | `closed` (two rules) | next step reads as paid or onboarding, or lead closed won | email at 0 |
  | `not_interested` | next step says so | text at 0 |
  | `objection_hold` | an objection was stated | text at 0, 48, 120 hours |
  | `follow_up_scheduled` | a next step is set after a held call | text at 0 |
  | `ghost_risk` | held call, no next step | text at 0, 48, 120 hours |

- Quiet hours: the first follow-up migration defaulted to 9 pm to 8 am;
  `20261015070000_sequence_quiet_hours` (applied in production) moved the
  default to 8 pm and clamps stored values. `parseHm` in
  `src/lib/follow-up/quiet-hours.ts` still falls back to 9 pm if a stored time is
  unreadable. Recommendation: fall back to the locked 8 pm and 8 am.
- Hosts: `pulse.vistrial.io` opens Forsight, and `forsight.vistrial.io` opens
  Stellar (`src/lib/domains/routing.ts`). Retiring Forsight should not take the
  `forsight` host with it.

## Plan and build order

Ship behind `workspace_flags` flag `sales_os`, workspace by workspace.

1. Hygiene: the CI order above, the security fix, then the migration repair and
   the ten missing migrations, all with approval. Small, mostly config and tests.
2. Data spine and connector contract; Scribe identity matching (email, phone in
   E.164 with `libphonenumber-js`, CRM id, calendar attendee) with a reversible
   merge record. Large: new tables and a backfill from GoHighLevel data.
3. New shell, Lead Record and Command center reading existing data. Large, UI.
4. Foundation page and Compass drafting with sources on every field. Medium.
5. Native connectors: Google Workspace, then HubSpot, Airtable, Fathom,
   Fireflies. Large, one per connector, each behind the contract.
6. Action registry and execution: gate for anything that reaches a person,
   Owner policies for internal writes, MCP map. Medium to large.
7. Relay on the workflow engine (this branch), Assay on the Foundation, Sentry
   alert threads per lead, Compass awareness loop. Large.
8. Sales Manager: EOD drafts, scorecards, team board, reports. Large.
9. Remove onboarding, Case File screens and Forsight; redirect the pulse host.
10. Roles, phone and accessibility pass, performance, tests.

## Decisions for the owner (with recommendations)

1. Manager: a permission on `admin` (recommended) rather than a new `org_role`
   value, to avoid another enum migration and role remap.
2. Internal write actions: all start on Suggest (recommended).
3. MCP servers: a curated list only (recommended); no workspace-added servers.
4. Scorecard formula and weights per role, and the minimum sample before a score
   shows. Recommended: the Prompt 16 sample rules (no percentage under 20).
5. EOD timing: drafted at the end of each rep's business day, confirmed by the
   rep, summarized to managers the next morning (recommended).
6. Sending approved messages: from the connected tool where allowed, otherwise
   handed to the person (recommended).
7. Plan gating for the Sales Manager agent and connectors.
8. Connector order after Google Workspace: HubSpot, Fathom, Fireflies, Airtable
   (recommended, by how many teams use them).
9. Copy for the Command center cards, Foundation fields and agent pages, for
   approval before shipping.
10. Approve the security fix for `billing_settings` and the migration repair
    order above.
