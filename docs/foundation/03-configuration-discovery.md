# Prompt 2, Phase 0: Configuration system discovery and plan

Status: discovery only. Nothing in the app or the database has changed. This waits for your approval.

## 1. The short version

- **Vistrial already has most of the raw material, but in the wrong shape.**
  - Configuration lives in about 25 tables and 20 columns on `organizations`.
  - Each workspace gets its own full copy of the defaults when it is created, through insert triggers.
    So a default changed later never reaches existing workspaces, and nothing records where a value
    came from.
  - The same defaults are written a second time in TypeScript, sometimes with different values. Ghost
    days are 14/30 in SQL but 7/14/30 in Forsight. The ready threshold of 60 is written in three files.
- **No industry concept exists yet.** The product is quietly shaped as a high-ticket coaching and
  consulting business with setters and closers:
  - offer types, objection types and scoring factors are database enums;
  - the LLM prompts say "high-ticket sales business" and "closer";
  - no med spa or home services wording exists anywhere.
- **`organizations.industry_template_id` and `platform_staff.template_access` already exist from
  Prompt 1.** Both are waiting for this system.
- **One part already works the way the target model does: approvals.** There is a global catalog
  default (`approval_action_types`), a sparse workspace override (`approval_gate_actions`), one
  resolver (`effectiveGate`), and field-level change history. The new system generalises that
  pattern.
- **No setting can be traced back from its result.** Scoring has version snapshots, but no score,
  draft or agent run records which settings produced it.
- **Today's live data.** Live has one workspace (DivineAcquisition) with:
  - a fully completed business profile (consulting, $3,500 offer, two-call close, casual voice);
  - customised scoring (weights 25 each, ghost days 4 and 7, speed-to-lead 15 minutes);
  - customised follow-up (5-day maximum sequence);
  - three objections.

  All of that has to resolve to exactly the same behaviour on day one.

## 2. Where behaviour is stored or hard-coded today

### 2.1 Per-workspace settings tables (already editable, staff-only since Prompt 1)

| Section in the new model | Existing store | Editing screen | Version history today |
|---|---|---|---|
| Identity | `organizations` (timezone, `working_hours_start/end`, `working_days`, `owner_contact_*`, status) | Settings → Workspace, Advanced | Activity log only |
| Qualification | `score_configs` (weights, ready threshold, speed-to-lead, ghost days), `score_field_maps`, `score_field_rules`, `business_profiles` (signals, disqualifiers, price and timeline bands) | Settings → Scoring; onboarding stages | `score_config_versions`, `business_profile_versions` |
| Response windows | `score_configs.speed_to_lead_minutes`, `follow_up_settings` (max length 3, max duration, stale days), `follow_up_routing_rules` (cadence per stage) | Settings → Follow-up (hidden by product scope) | None |
| Tone and voice | `org_voice_profiles` (formality, greeting, sign-off, SMS 240 / email 900 characters, emoji, banned words, examples), `business_profiles.never_say` / `voice_formality` | Follow-up page; onboarding voice stage | None |
| Industry fields | `business_profiles` (offer type, price, lead channels, objections, application fields), `objection_vocabulary`, `profile_field_registry` (global) | Onboarding only | Business profile versions |
| Escalation | `notification_preferences` (per person, overrides only), `notification_team_channels` (Slack/Teams), `organizations.sms_emergencies_enabled`; defaults are a role × event matrix in code | Settings → Notifications | None |
| Approval gate | `approval_gate_settings` (quiet hours 20–08, 2 sends per lead per day, 240-minute wait), `approval_gate_actions` on top of the global `approval_action_types`; separately `sales_os_gates` | Settings → Approvals; Ask Vistrial settings | `approval_gate_changes` |
| Integrations | `ghl_connections`, `ghl_field_maps`, `source_connections`, `transcript_connections`, `execution_connections`, `sales_os_destinations`/`routes` | Settings → Integrations; portal | None |
| Sources | `organizations.transcript_retention_days` (365), `closed_retention_days` (90); everything else is code constants | Advanced | None |
| Operators and routing | Nothing. Assignment is manual only, and the daily brief time is fixed | — | — |
| Compliance | Follow-up quiet hours 21–08 (`follow_up_settings`) **and** approval queue quiet hours 20–08 (`approval_gate_settings`), which conflict; no opt-out words; the per-lead daily cap only applies to auto-run items | Follow-up / Approvals | Partial |
| Agents | `org_agent_settings` (operator: enabled, observation mode, run and spend caps), `organizations.agents_halted` and related columns | Settings → Agents | None |

Global (platform) tables: `agent_model_routes`, `approval_action_types`, `verification_task_settings`,
`configuration_priors` (cohort medians, used only to pre-fill onboarding), `profile_field_registry`,
`stellar_build_stage_mappings` (empty and unread), `ops_job_catalog`.

`src/lib/product-scope.ts` holds nine compile-time feature flags, all off. They are not per workspace,
and the file forbids turning them into environment flags. I propose leaving them out of this system.

### 2.2 Hard-coded behaviour that should become configuration (the most important)

1. **Escalation ladder.** Speed-to-lead goes to the assignee or all setters at 1× the window,
   adds the team channel at 2×, and adds managers at 4× (`notifications/observe.ts:221`).
2. **Quiet hours.** Follow-up uses 21:00–08:00, the approval queue uses 20:00–08:00, and the approval
   queue applies them even when quiet hours are "off" (`follow-up/constants.ts:9`, `home/gate.ts:15`,
   `home/run.ts:49`).
3. **Opt-out.** There is no in-app opt-out word list; the app relies on the CRM's do-not-disturb flag.
4. **Frequency cap.** "2 sends per lead per day" is enforced for auto-run items only, not for
   follow-up dispatch.
5. **Follow-up cadence.** Steps per stage (no-show 0/24/72 hours, objection 0/48/120 hours) and the
   regexes that decide stages (`seed_default_follow_up_rules`, `profile_pacing_offer_fallback`).
6. **Home queue windows.** Quiet lead 48 hours, no-show 7 days, untouched 3 days, repeat 7 days
   (`home/metrics.ts:55`, `home/areas/sales-producer.ts:21`).
7. **Forsight pipeline buckets** of 7/14/30 days ignore the workspace's own ghost days
   (`forsight/core-source.ts:282`).
8. **Banned openers and words** that every draft must avoid. The workspace list can only add to them
   (`follow-up/banned.ts`, `follow-up/prompt.ts:12`).
9. **Fixed home queue message templates.** These also add "Hi {name}," even when the workspace turned
   greetings off. That is a bug (`home/queue.ts:89`).
10. **Industry framing in LLM prompts:** "high-ticket sales business", "closer"
    (`sales-os/prompt.ts:5`, `extraction/prompt.ts:1`, `brief/opening.ts:10`).
11. **Objection types and offer types are enums.** They cover coaching only: price, timing,
    spouse/partner, trust, fit, competitor; coaching, consulting, agency, course, software,
    done-for-you.
12. **Disqualifier keyword phrases** such as "no budget", "pre-revenue" and "looking for a job"
    (`profile/vocabulary.ts:202`).
13. **Notification defaults and caps.** The role × event × channel matrix, 8 per hour, the daily brief
    in the first 15 minutes of the working day, and emergency SMS after 1 hour.
14. **Response clock and timezones.** The clock does not pause outside business hours. Timezone
    fallbacks disagree (New York in agents, UTC in notifications).
15. **Retention periods.** Webhooks 14 days, notifications 90, offboarding grace 30. Each is written
    in both TypeScript and SQL.

**Per-customer special cases.** Only one exists: the Prompt 1 migration marks `divine-acquisition` as
Vistrial's own workspace. Forsight uses one Divine Acquisition Meta token for every workspace, and
its formulas name DA's "audit" offer. No code branches on a customer's name.

**Industry wording.** Everything assumes coaching and consulting. "Cleaning", "HVAC", "roofing",
"med spa" and "treatment" appear nowhere.

### 2.3 Stellar and Forsight

- **Stellar:**
  - `organizations.product` turns Stellar on per workspace.
  - Placement records are operating data, not settings.
  - Build-stage labels and order are code constants.
  - `stellar_build_stage_mappings` is global and empty.
  - All of it fits the new system: stage labels at platform level, the product flag at workspace
    level.
- **Forsight:**
  - `forsight_sources` is per workspace (source type, Meta ad account, CRM calendar).
  - Recipients are "every active owner".
  - The report day is a global cron.
  - History weeks (12), cache time (3 minutes) and pipeline buckets are constants.
  - The settings fit the new system. The source rows stay where they are as integration records,
    and configuration refers to them.

### 2.4 Secrets and credentials

- **Per-workspace secrets:**
  - Stored as AES-256-GCM ciphertext under one global key (`GHL_TOKEN_ENCRYPTION_KEY`), in the
    connection tables (CRM tokens, source connections, recorders, Slack/Drive, Ask Vistrial
    destinations, notification webhooks).
  - Supabase Vault is not used.
  - No settings screen ever shows a stored secret. The recorder signing secret is shown once at
    creation.
  - One gap: owners can read the *ciphertext* of the notification webhooks through the API. It is
    useless without the key, but it should be closed.
- **Global credentials** live in environment variables: app OAuth clients, Twilio, Resend, the
  Anthropic key, Divine Acquisition's Meta token.
- **"Test connection" exists for:** the CRM, recorders, Slack/Discord/Drive, notification channels,
  portal sources and Forsight sources. Ask Vistrial destinations have none.

### 2.5 Agents and run records

- **Automated features today:**
  - follow-up drafting;
  - transcript extraction;
  - scoring and the ghost detector;
  - home-screen producers (quiet leads, no-shows, untouched);
  - the Operator agent;
  - Ask Vistrial (Sales OS chat);
  - the notification observer;
  - verification.
- **Scribe, Sentry and Relay** do not exist yet.
- **Run records exist** (`agent_runs`, `operator_runs`, `follow_up_jobs`/`follow_up_drafts`,
  `extraction_jobs`, `readiness_scores`, `ghost_detector_runs`, `approval_items`,
  `sales_os_messages`). Some record a model. **None records a settings version.**

## 3. Conflicts with the target model, and proposed fixes

| # | Conflict | Proposed fix |
|---|---|---|
| C1 | Defaults are **copied** into each workspace at creation, so they can never improve afterwards. | Stop copying. The resolver reads platform → template → sparse workspace overrides. The existing tables become write-through projections of the effective configuration, so today's code keeps working while readers move over one at a time. |
| C2 | The business profile questionnaire *is* the workspace's configuration, written into five tables by `apply_business_profile_configuration`. | Keep the questionnaire as the onboarding user interface, but it writes workspace overrides. The derived values (weights, pacing) become overrides, labelled "set during onboarding". |
| C3 | Coaching-only **enums** (offer type, objection type, score factor) cannot describe a med spa or a roofer. | Templates own the lists: offers, objections, urgency signals and case-file facts become configurable lists. Each objection carries an internal category so reporting keeps working, mapping to today's enum, with `other` for the rest. The four scoring factors stay as the engine's structure; templates set their labels, weights, thresholds and field rules. |
| C4 | Two conflicting quiet-hours values (21:00 vs 20:00). | One locked compliance field for outbound quiet hours. **Decision Q2.** |
| C5 | Rules the prompt makes mandatory do not exist yet: in-app opt-out words, a per-lead cap on every send, the clock pausing after hours, an unacknowledged-escalation rule. | Build them as fields. Platform defaults reproduce today exactly (opt-out list empty, follow-up path uncapped, clock never pauses), unless you choose otherwise. **Decision Q3.** |
| C6 | No configuration version on any result. | Add `config_version` to every run and draft table. Agents get configuration only through one function that stamps the version. |
| C7 | Validation is split between SQL CHECK constraints and TypeScript, with duplicated defaults. | One field registry in TypeScript, the single source of names, help text, types, validation and platform defaults. The database keeps a synced copy of the facts it must enforce itself: which fields exist, which are locked, which are required, and which owners may edit. Duplicated TypeScript and SQL defaults are removed as readers move over. |
| C8 | Escalation channels: the prompt names Discord, Slack, text and email. Notifications support push, email, SMS and Slack/Teams webhooks; Discord exists only as an Ask Vistrial destination. | Escalation targets point at existing channels. Discord is reused from the execution connection, with no second Discord integration. |
| C9 | Secrets are ciphertext in connection tables, not "references to secure storage". | Keep the ciphertext in those tables; configuration stores only the connection's id and shows "connected, last changed …". Close the owner read on webhook ciphertext. Moving the key into Supabase Vault is possible later. **Decision Q4.** |
| C10 | Assignment is manual only, and the daily summary time is fixed. | New fields. The defaults are "manual" and "first 15 minutes of the working day", which is today's behaviour. Round robin, by source and by service type come later, through the same field. |
| C11 | `approval_action_types` defaults `setter_nudge` and `owner_escalation` to auto-run. | These only notify your own team; they never reach leads. Actions that reach people are marked **locked: never proceed without approval**. Setting any action to proceed without approval needs an explicit confirmation and is recorded. |
| C12 | Sales OS has a second, separate approval-gate model. | It moves into the same approval section, as action types under one gate. |
| C13 | Existing workspaces need exactly one template, but the three new templates start as drafts. | **Decision Q1.** |
| C14 | Model routing is global, and environment variables override it. | It stays a platform/ops setting outside workspace configuration, with no per-workspace model choice for now. |
| C15 | `stellar_build_stage_mappings` is global and unused; Forsight constants are in code. | Becomes a platform-default list, plus Forsight fields (history weeks, report recipients) under Integrations/Sources. |

## 4. The plan

### Data model (all new tables isolated per Prompt 1)

- **`config_fields`.** The synced registry: key (for example `response.first_touch_minutes`),
  section, type, required, locked level, owner-editable flag and "sensitive". It is platform-wide and
  readable by staff.
- **`config_templates`.** Slug, name, status (draft / active / retired), description, current
  version.
- **`config_layers`.** One row per level instance: the platform default, each template, and each
  workspace. It holds the level's sparse values as `{field_key: value}` (jsonb), the lock markers,
  and a version counter.
- **`config_versions`.**
  - Append-only.
  - Records every change to any level: the full snapshot of that level, the field-by-field diff (old
    and new), who made it, when, an optional note, and the source (edit, rollback, push, migration).
  - Rollback writes a new version.
- **`workspace_config_pins`.**
  - Records which version of the platform default and of the template each workspace is resolved
    against. This is how "live workspaces never change silently" works: a template edit makes a new
    version, but a live workspace stays on its pinned version until someone accepts the change.
  - Onboarding workspaces can follow the latest version automatically.
  - A locked-field push moves every pin, with a record.
- **`config_review_notices`.** Per workspace and per template or default version: the exact
  before/after for that workspace's effective values, skipping fields it overrides. Status is
  pending, accepted, declined (remembered for that version) or postponed.
- **`config_readiness`.** Per workspace: the configuration version validated, missing required
  fields, validation errors, who marked it ready, and when.
- **Isolation.**
  - Workspace layers, pins, notices and readiness are visible only to staff of that workspace.
  - Owners read only the owner subset, through one narrow function.
  - Templates and platform defaults are readable by all staff. Platform Admins can write them, and so
    can Service Team members with template access.
  - Every write is logged to the Prompt 1 activity log.

### The resolver

- `getEffectiveConfig(orgId)` on the server, plus a SQL twin, `effective_config(org_id)`, for jobs
  that run inside the database.
- Both return:
  - every field resolved;
  - the source of each value (platform, template, workspace, or locked);
  - missing required fields;
  - validation errors;
  - a version stamp. The stamp combines the three pinned versions with a hash, so any result can be
    traced back.
- No cache at first. Resolution is one query over three small jsonb rows, so it is always fresh. If
  a cache becomes necessary, it is keyed on the version stamp, so it can never go stale.
- Each agent declares the sections it reads. If a required field is missing or invalid, the agent
  stops, records the reason on its run, and notifies the assigned Service Team. It never falls back
  to a hidden default.

### Sections and fields

All eleven sections from the brief, with fields typed as text, long text, number, duration, yes/no,
single choice, multiple choice, list, schedule, key-value or reference. Every field gets a
plain-language label, help text, validation and a platform default. The platform default equals
today's behaviour.

Cross-field checks include:
- the follow-up cadence fits inside the sequence length;
- quiet hours cannot cover the whole day;
- the warning threshold is shorter than the window;
- scoring weights add up to 100;
- banned and preferred terms do not overlap.

### Migration of today's settings (nothing deleted)

1. Snapshot first, and avoid the Prompt 1 mistake: snapshot enum columns as text.
2. The platform default is filled from today's SQL column defaults and seed functions. Values that
   disagree today are flagged, and the value actually in effect wins.
3. Each existing workspace gets a template (Q1) and a workspace layer holding only the values that
   differ from template plus default. The day-one effective configuration therefore equals today's
   values.
4. A parity test compares the effective configuration with every existing table for every workspace.
   It must match exactly before anything ships.
5. Existing tables stay. During the transition they are written from the effective configuration,
   and readers move to the resolver one by one. Anything that cannot be mapped goes on a review list.
6. There is a rollback script and a local round-trip test, as in Prompt 1. On live, the GitHub
   integration path applies it, with the database first and the app second.

### Seeds

Med Spa, Home Services and Coaches & Consultants, written in plain language and complete enough to
validate on their own. All three are **drafts** until a Platform Admin activates them.

### Screens (existing visual style)

- **Template library** (`/app/team/templates`): list, create (blank, duplicate, from a workspace),
  section-by-section editor with help text, a sample-lead preview, and retire.
- **Workspace configuration** (`/app/settings/configuration`, staff only): the same section layout,
  with an inherited / overridden / locked label on each field, reset-to-inherited, an
  effective-configuration view with sources, and a completeness indicator.
- **Owner settings:** the existing Workspace and Notifications pages, plus business hours when the
  Service Team allows it. Nothing else.
- **Review notices** (`/app/team/notices`): accept, decline or postpone, with the per-workspace
  before/after.
- **History and compare:** for any template or workspace, side by side, with one-step rollback.
- **Go-live readiness:**
  - a checklist of what's missing, linking to each field;
  - a test run that takes a sample lead through qualification, response window and a sample message,
    sending nothing;
  - `set_workspace_status(... 'active')` refuses unless the readiness record for the current version
    passes.

### Build order (each step tested and committed before the next)

1. Registry, schema, resolver, validation, versioning, seeds, migration, parity test.
2. Readers move to the resolver: scoring, follow-up and voice, approvals and quiet hours, home
   windows, notifications and escalation, Forsight. This step also adds `config_version` on every
   run and draft, the agent section declarations, and stop-on-missing.
3. Screens: workspace configuration, effective view, readiness and test run, history and compare,
   owner subset.
4. Templates: library, review notices, locked push, template switching.
5. Verification against every Done When item, then the report. Then live, database first.

## 5. Decisions I need from you

**Q1. Which template does DivineAcquisition (the only live workspace) use on day one?**
- Recommended: **Coaches & Consultants**. Its business profile is consulting, and its overrides keep
  today's exact values. The template is still a draft; existing workspaces may stay on a draft
  template, but new workspaces can only choose active ones.
- Alternative: a fourth "Current behaviour" template that copies today's values, retired once you
  move it.

**Q2. Quiet hours are 21:00–08:00 for follow-ups and 20:00–08:00 for the approval queue.**
- Recommended: **one locked compliance field at 20:00–08:00**, the stricter of the two. Follow-up
  sends would stop an hour earlier.
- Alternative: keep two fields so day one is identical, and merge later.

**Q3. New compliance rules the brief requires that don't exist today: opt-out words, a per-lead daily
cap on every send, and the clock pausing after hours.**
- Recommended: **build all three, with platform defaults that switch them on**:
  - opt-out words: STOP, UNSUBSCRIBE, CANCEL, END, QUIT;
  - a cap of 2 per lead per day on every send path;
  - the clock pauses outside business hours.

  This is a deliberate change from today, recorded in history.
- Alternative: build them switched off, so day one is identical, and turn them on per workspace.

**Q4. Secrets.**
- Recommended: **keep the encrypted credentials where they are, with configuration storing only
  references** (connected, last changed). Also close the owner read on webhook ciphertext.
- Alternative: also move the encryption key into Supabase Vault now. This is more work and touches
  every integration.

## 6. Found along the way (not part of this prompt unless you say so)

- The home queue adds "Hi {name}," even when greetings are turned off (`home/queue.ts:89`).
- Forsight's pipeline buckets ignore the workspace's ghost days.
- The timezone fallback is New York in agents but UTC in notifications.
- The Meta Graph API version is 21 in source sync and 26 in Forsight.
