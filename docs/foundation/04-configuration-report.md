# Configuration system and industry templates: implementation report

Branch: `claude/configuration-discovery`. Discovery and plan: `03-configuration-discovery.md`.

## Status in one paragraph

**Built and tested; going live is described in "Going live" at the end.** Every workspace now runs
on three levels, platform default → industry template → its own overrides, with every value's
source shown, every change versioned, template updates reviewed before they reach a live
workspace, and locked compliance rules that can only be tightened. The one live workspace moves onto
Coaches & Consultants with overrides that keep today's values exactly; the only deliberate changes
on day one are the four launch compliance rules you approved, recorded as platform version 2.

## What changed

### Database (three migrations, each with a rollback)

`20261007030000_configuration_system.sql`:

- **Tables:** `config_fields` (the registry, generated from the TypeScript registry),
  `config_templates`, `config_layers` (platform, each template, each workspace: sparse values,
  locks, version), `config_versions` (append-only history), `workspace_config_pins`,
  `config_review_notices`, `config_readiness`, `config_migration_legacy` (the snapshot the rollback
  restores from).
- **Resolver in SQL:** `config_effective_at`, `config_effective` (staff), `config_version_stamp`,
  field validation, tighten rules. Identical to the TypeScript resolver; a test checks that both
  give the same version stamp.
- **Writes, all through checked functions:** save (with conflict detection), rollback, push of
  locked rules, notices (accept, decline, postpone), template create, edit, activate and retire,
  template switch, auto-accept, go-live check, owner business hours, `create_workspace` with a
  template. `set_workspace_status` refuses onboarding → active without a passing check for the
  current configuration version.
- **Bridge to the existing screens:** the effective configuration is written into the existing
  settings tables (`score_configs`, `follow_up_settings`, `org_voice_profiles`,
  `approval_gate_settings`/`actions`, and the `organizations` hours, timezone, retention and
  contact columns), so all existing code reads the right values. Edits made on the old screens
  become workspace overrides. A looser value for a locked rule snaps back.
- **Version on every run and draft:** a `config_version` column, stamped on insert, on
  `agent_runs`, `operator_runs`, `follow_up_jobs`, `follow_up_drafts`, `extraction_jobs`,
  `call_extractions`, `readiness_scores`, `ghost_detector_runs`, `approval_items`,
  `sales_os_messages`, `sales_os_executions`, `ghl_dispatches`.
- **Migration of today's settings** (see "Migration results").

`20261007040000_configuration_runtime.sql`:

- `lead_opt_outs`: who replied with an opt-out word, when, on which channel, under which
  configuration version. This is a separate table, not new columns on `leads`; adding columns to `leads`
  tipped a query planner test.
- `config_stops`: one open row per workspace and agent that stopped for missing settings, with the
  reason, a count, and when the team was alerted.
- `config_agent_gate`: the check for agents that run in a person's session. It answers only "may
  this run", the version, the problems, and the one-line business description.
- `config_display_settings`: the few values customer screens show (Forsight thresholds, Stellar
  stage names), and nothing else.

`20261007050000_workspace_template_reference.sql`:

- `organizations.industry_template_id` (added by Prompt 1, left empty until templates existed) is
  backfilled from each workspace's pin and now references `config_templates`.
- A trigger on `workspace_config_pins` keeps it in step on creation, template switch and the
  migration; a direct write that would set it apart from the pin is refused. The pin stays the
  source of truth; the column is there so workspace lists and reports can join on it.
- Rollback removes the link and the triggers and keeps the values.

### App

- **One way to read configuration:**
  - `getEffectiveConfig` / `requireConfig` in `src/lib/config/server.ts` serve jobs and webhooks.
  - `checkAgentConfig` serves agents in a person's session.
  - Each consumer declares its sections in `src/lib/config/consumers.ts`:
    - sending messages;
    - follow-up drafting;
    - the approval queue;
    - reading call notes;
    - the Operator;
    - Ask Vistrial;
    - speed-to-lead alerts.
  - A missing or invalid value in a declared section stops that consumer. The reason is recorded
    on its run or job and in `config_stops`, and the notifications job emails the assigned Service
    Team, or the Platform Admins when nobody is assigned, once per stop.
- **Compliance on every message:** `complianceForDispatch` runs inside `sendQueuedDispatch`, which
  is the single point every message to a lead passes through: follow-ups, the approval queue, and
  anything run without approval. In order:
  1. An opted-out lead is never messaged.
  2. Quiet hours (8pm to 8am) hold a message until morning in the lead's own time zone.
  3. The daily limit (and the weekly limit, if set) holds it until the next day.
- **Lead time zone:** the zone stored on the lead first. Otherwise every zone the phone number can be
  in, from Google libphonenumber's prefix data (vendored with its licence note in
  `src/lib/compliance/THIRD_PARTY.md`); when there are several, the stricter result applies.
  The workspace's zone is used only when neither is known; a bare "+1" with an unlisted area
  code, such as a toll-free number, counts as unknown.
- **Opt-out words:** a reply that is exactly one of the words (any case or punctuation; "STOP." yes,
  "please don't stop" no) records the opt-out. START or UNSTOP removes it. Both are logged to the
  activity log.
- **Speed-to-lead:** the window, the after-hours rule (pause outside business hours, keep running,
  or a longer after-hours window), and the alert ladder all come from configuration.
- **Prompts:** follow-up drafting, call-note extraction, the call opener and Ask Vistrial describe
  the workspace's own business (`industry.business_description`) instead of assuming a
  "high-ticket closer".
- **Approval queue:** its quiet-lead, no-show and untouched windows come from configuration (same
  values as before).
- **Forsight and Stellar:** the history length, the going-quiet / silent / long-silent thresholds
  (defaults 7/14/30), and the client portal's build stage names come from configuration.
- **Screens:**
  - `/app/settings/configuration`, staff only, reached from Advanced: every section with each
    value's source, editing, reset to inherited, the go-live check and test run, updates waiting
    for review, template switching with a preview, open stops, and auto-accept.
  - `/app/settings/configuration/history`: every version, side-by-side compare, and rollback.
  - `/app/team/templates`: the library; create blank, as a copy, or from a workspace.
  - `/app/team/templates/[id]`: details, activate or retire, a sample-lead preview, editing,
    locks, and history.
  - `/app/team/templates/platform`: the platform default and locked pushes.
  - `/app/team/notices`: everything waiting for review across your workspaces, plus recent pushes.
  - **Owners:** business hours on the Workspace page, editable only when allowed.
  - **New workspaces** choose a template.

## Sections and fields as implemented

82 fields in 11 sections, defined once in `src/lib/config/registry.ts`. The database copy is
generated from it, and a test fails if they differ. "Locked" means set at the platform level;
below it a workspace or template may only make it stricter. "→ launch" shows the value platform
version 2 switched on.

#### Identity

| Field | Type | Rules | Platform default |
|---|---|---|---|
| Business name<br>`identity.business_name` | text | required, workspace only | — |
| Name used in messages<br>`identity.display_name` | text | required, workspace only | — |
| Time zone<br>`identity.timezone` | choice | required | America/New_York |
| Business hours<br>`identity.business_hours` | schedule | required, owner: when allowed | Mon 08:00–18:00; Tue 08:00–18:00; Wed 08:00–18:00; Thu 08:00–18:00; Fri 08:00–18:00; Sat closed; Sun closed |
| Owners can change business hours<br>`identity.owners_can_edit_hours` | boolean | — | No |
| Primary contact<br>`identity.primary_contact` | key_value | required, workspace only, owner: always | — |
| Escalation contact<br>`identity.escalation_contact` | key_value | workspace only | — |

#### Qualification

| Field | Type | Rules | Platform default |
|---|---|---|---|
| Ready to buy when<br>`qualification.ready_criteria` | list | required | — |
| Needs nurturing when<br>`qualification.not_ready_criteria` | list | — | None |
| Stop pursuing when<br>`qualification.disqualifiers` | list | — | None |
| Score bands<br>`qualification.scoring_bands` | list | required | Band: Cold · From score: 0 · What it means: Interested, but not ready to decide. · Next step: Keep in touch with useful, low-pressure follow-up.<br>Band: Warm · From score: 40 · What it means: Engaged, with some of what they need in place. · Next step: Fill the gaps: timing, budget, and who decides. |
| Ready from score<br>`qualification.ready_threshold` | number | required | 60 |
| How much each factor counts<br>`qualification.factor_weights` | key_value | required | Timeline: 35 · Ability to pay: 30 · Can decide: 20 · How much it matters to them: 15 |
| Must know before qualifying<br>`qualification.minimum_info` | list | — | None |

#### Response windows

| Field | Type | Rules | Platform default |
|---|---|---|---|
| First touch within<br>`response.first_touch_minutes` | duration | required | 15 minutes |
| Longest gap between touches, by stage<br>`response.follow_up_cadence` | list | — | Stage: Being worked · Longest gap (hours): 48<br>Stage: Follow-up · Longest gap (hours): 72<br>Stage: Objection raised · Longest gap (hours): 72<br>Stage: No-show · Longest gap (hours): 24 |
| Outside business hours<br>`response.after_hours` | choice | required | Keep the clock running → launch: Pause the clock until the business opens |
| After-hours window<br>`response.after_hours_window_minutes` | duration | — | 2 hours |
| Counts as a human touch<br>`response.counted_touch_types` | multi_choice | required | Phone call, Text message, Email |
| Nudge at<br>`response.warning_threshold_percent` | number | — | 75 |
| Going quiet after<br>`response.ghost_days_soft` | number | required | 14 |
| Gone quiet after<br>`response.ghost_days_hard` | number | required | 30 |
| Most follow-ups in a row<br>`response.max_sequence_length` | number | — | 3 |
| Follow-up runs for at most<br>`response.max_sequence_days` | number | — | 21 |
| Unapproved drafts expire after<br>`response.draft_stale_days` | number | — | 5 |
| A lead is quiet after<br>`response.quiet_lead_hours` | number | — | 48 |
| Look back for untouched leads<br>`response.untouched_window_days` | number | — | 3 |
| Rebook no-shows within<br>`response.no_show_window_days` | number | — | 7 |

#### Tone and voice

| Field | Type | Rules | Platform default |
|---|---|---|---|
| Formality<br>`tone.formality` | choice | required | Casual |
| Use contractions<br>`tone.use_contractions` | boolean | — | Yes |
| Messages come from<br>`tone.sender_identity` | text | — | Not set |
| Greeting<br>`tone.greeting` | text | — | Not set |
| Sign-off<br>`tone.sign_off` | text | — | Not set |
| Longest text message<br>`tone.sms_max_chars` | number | required | 240 |
| Longest email<br>`tone.email_max_chars` | number | required | 900 |
| Emoji<br>`tone.emoji` | choice | — | Never |
| Punctuation rules<br>`tone.punctuation_rules` | long_text | — | Not set |
| Language and spelling<br>`tone.language` | choice | — | English (United States) |
| Words to use<br>`tone.preferred_terms` | list | — | None |
| Words and phrases to avoid<br>`tone.banned_terms` | list | — | I hope this message finds you well, I hope you're doing well, I wanted to reach out, just circling back, circling back, touching base, following up on our conversation, as we discussed, leverage, utilize, synergy, streamline, robust, seamless, journey, solution |
| Example messages<br>`tone.examples` | list | — | None |

#### Industry fields

| Field | Type | Rules | Platform default |
|---|---|---|---|
| What kind of business this is<br>`industry.business_description` | text | required | a business that sells through conversations with its leads |
| What the business sells<br>`industry.offers` | list | required | — |
| Case-file facts<br>`industry.case_facts` | list | required | — |
| Act-now signals<br>`industry.urgency_signals` | list | — | None |
| Objection library<br>`industry.objections` | list | — | None |
| Lead sources<br>`industry.lead_sources` | list | — | None |

#### Escalation

| Field | Type | Rules | Platform default |
|---|---|---|---|
| Who hears about what<br>`escalation.levels` | list | required | Severity: Warning · When: A new lead has not had a first touch within the window. · After (windows): 1 · Who: The person the lead is assigned to · How: App notification<br>Severity: Urgent · When: Still untouched at twice the window. · After (windows): 2 · Who: All setters · How: App notification, T |
| Quiet hours for the team<br>`escalation.quiet_hours` | choice | — | Outside business hours |
| Break quiet hours for<br>`escalation.urgent_exception` | choice | — | Critical only |
| If no one acknowledges within<br>`escalation.unacknowledged_minutes` | duration | — | 1 hour |
| Then tell<br>`escalation.unacknowledged_next` | choice | — | Owners and managers |

#### Approval gate

| Field | Type | Rules | Platform default |
|---|---|---|---|
| What needs approval<br>`approval.actions` | list | required | Action: First reply to a new lead · Approval: Ask first · Who approves: Owners and the Vistrial team<br>Action: Follow-up to a lead who went quiet · Approval: Ask first · Who approves: Owners and the Vistrial team<br>Action: Rebooking a no-show · Approval: Ask first · Who approves: Owners and the Vi |
| Always needs approval<br>`approval.never_auto` | multi_choice | locked (tighten only) | First reply to a new lead, Follow-up to a lead who went quiet, Rebooking a no-show, Sending a report to the client, Sending a text message, Sending an email |
| Waiting too long after<br>`approval.timeout_minutes` | duration | — | 4 hours |
| When no one approves in time<br>`approval.timeout_behavior` | choice | — | Nothing happens; tell the next person |
| I understand waiting items will proceed without approval<br>`approval.timeout_proceed_confirmed` | boolean | — | No |

#### Integrations

| Field | Type | Rules | Platform default |
|---|---|---|---|
| CRM<br>`integrations.crm` | reference | — | Not set |
| Messaging numbers<br>`integrations.messaging_numbers` | list | — | None |
| Calendar<br>`integrations.calendar` | reference | — | Not set |
| Email sending domain<br>`integrations.email_domain` | text | — | Not set |
| Chat channels<br>`integrations.chat_channels` | list | — | None |
| File storage folder<br>`integrations.file_folder` | text | — | Vistrial |

#### Sources

| Field | Type | Rules | Platform default |
|---|---|---|---|
| Agents may read<br>`sources.allowed` | multi_choice | required | Call transcripts, Email, Text messages, Forms, CRM notes |
| Keep for (days)<br>`sources.retention_days` | key_value | — | Call transcripts: 365 · Email: 365 · Text messages: 365 · Forms: 365 · CRM notes: 365 |
| Never read<br>`sources.excluded` | list | — | None |
| Forsight shows (weeks)<br>`sources.forsight_history_weeks` | number | — | 12 |
| Forsight: going quiet after (days)<br>`sources.forsight_quiet_days` | number | — | 7 |
| Forsight: silent after (days)<br>`sources.forsight_silent_days` | number | — | 14 |
| Forsight: long silent after (days)<br>`sources.forsight_long_silent_days` | number | — | 30 |
| Stellar build stage names<br>`sources.stellar_stage_labels` | key_value | — | Stage 1: Getting set up · Stage 2: Building your system · Stage 3: Testing · Stage 4: Live · Stage 5: Running smoothly |

#### Operators and routing

| Field | Type | Rules | Platform default |
|---|---|---|---|
| How leads are assigned<br>`operators.assignment_mode` | choice | required | Manually |
| Operators may also<br>`operators.extra_permissions` | multi_choice | — | None |
| Daily summary<br>`operators.summary_time` | choice | — | At the start of their working day |
| Summaries are confirmed by<br>`operators.summary_confirmer` | choice | — | The operator |

#### Compliance and messaging rules

| Field | Type | Rules | Platform default |
|---|---|---|---|
| Opt-out words<br>`compliance.opt_out_words` | list | locked (tighten only) | None → launch: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT |
| No messages between<br>`compliance.quiet_hours` | time_window | required, locked (tighten only) | 20:00 to 08:00 |
| Quiet hours follow<br>`compliance.quiet_hours_basis` | choice | locked | The business's time zone → launch: The lead's local time (stricter when unsure) |
| Most messages per lead per day<br>`compliance.daily_cap_per_lead` | number | required, locked (tighten only) | 2 |
| The daily limit covers<br>`compliance.cap_applies_to` | choice | locked | Only messages sent without approval → launch: Every message Vistrial sends |
| Most messages per lead per week<br>`compliance.weekly_cap_per_lead` | number | locked (tighten only) | 0 |
| Required disclosures<br>`compliance.required_disclosures` | list | locked (tighten only) | None |

**Which fields drive behaviour today.**

- **Read at run time:**
  - Directly from configuration:
    - every compliance field except required disclosures;
    - `response.after_hours`, `response.after_hours_window_minutes`, `escalation.levels`;
    - the approval queue windows;
    - `industry.business_description`, `identity.timezone`, `identity.business_hours`;
    - the Forsight and Stellar fields.
  - Through the existing tables, which are written from configuration:
    - scoring weights, ready threshold, first-touch window, ghost days;
    - follow-up length, duration and stale days;
    - the voice profile (formality, contractions, greeting, sign-off, lengths, emoji, banned
      words, examples);
    - approval action modes and the daily limit;
    - hours, timezone, retention, owner contact.
- **Stored, validated, versioned and shown, but not yet acted on:**
  - qualification criteria lists, disqualifiers, score bands, minimum information;
  - cadence by stage, counted touch types, warning threshold;
  - sender identity, punctuation, language, preferred terms;
  - offers, case facts, urgency signals, objection library, lead sources;
  - escalation quiet hours, urgent exception, unacknowledged rule;
  - approval timeout;
  - all integrations references;
  - allowed and excluded sources;
  - the operators section;
  - required disclosures.

  These are where Scribe, Sentry, Relay and the rewritten prompts will read from; nothing invents
  behaviour from them today.

## Seeded template contents

All three are **drafts** until a Platform Admin activates them. The test suite resolves each one on
its own over the platform default and finds no missing or invalid value. Fields not listed come
from the platform default.

### Med Spa (`med-spa`, draft)

Injectables, facials, laser and skin treatments, body contouring, and memberships.

| Field | Value |
|---|---|
| What kind of business this is | a med spa offering injectables, facials, laser and skin treatments, and body contouring |
| What the business sells | Offer: Injectables (wrinkle relaxers and fillers) · Typical price from ($): 300 · Typical price to ($): 1500 · Recurring: No<br>Offer: Facials and peels · Typical price from ($): 150 · Typical price to ($): 400 · Recurring: No<br>Offer: Laser and skin treatments · Typical price from ($): 300 · Typical price to ($): 2500 · Recurring: No<br>Offer: Body contouring · Typical price from ($): 600 · Typical price to ($): 4000 · Recurring: No<br>Offer: Membership · Typical price from ($): 99 · Typical price to ($): 299 · Recurring: Yes |
| Case-file facts | Key: treatment_interest · Label: Treatment of interest · Type: Text · Required: Yes<br>Key: concern · Label: What they want to change · Type: Text · Required: No<br>Key: prior_treatments · Label: Treatments they have had before · Type: Text · Required: No<br>Key: timeline · Label: When they want it done · Type: Text · Required: Yes<br>Key: budget_comfort · Label: Budget they are comfortable with · Type: Text · Required: No<br>Key: consultation_preference · Label: In-person or virtual consultation · Type: Text · Required: No |
| Act-now signals | An upcoming event, like a wedding, holiday, or trip, As soon as possible, This week, Asks about a promotion before it ends, Asks for the next available appointment |
| Objection library | Objection: Cost · Category: Price or cost · How it sounds: "How much is it?", "That's more than I thought", "Do you have payment plans?" · How to answer: Give the price range plainly, explain what is included, and mention memberships or payment options if you offer them. Never discount under pressure.<br>Objection: Nervous about the treatment · Category: Trust or proof · How it sounds: "Does it hurt?", "I'm worried it will look fake", "What if something goes wrong?" · How to answer: Acknowledge the worry, explain what the treatment involves in simple terms, and offer a consultation to talk it through with the provider. Make no medical claims or promises about results.<br>Objection: Timing · Category: Timing · How it sounds: "Not right now", "Maybe after the holidays", "I'm too busy this month" · How to answer: Ask whether there is an event or date they have in mind, and offer to hold a time that suits them.<br>Objection: Trust in the provider · Category: Trust or proof · How it sounds: "Who does the treatment?", "Are they certified?", "Can I see before-and-after photos?" · How to answer: Share the provider's credentials and experience, and point to reviews or a gallery. Offer a consultation to meet them first.<br>Objection: Needs to think about it · Category: Fit or need · How it sounds: "Let me think about it", "I'll get back to you" · How to answer: Respect it. Offer one clear, easy next step, like a free consultation, and check in once without pressure. |
| Lead sources | Source: Website booking form · Priority: High · How to treat it: Reply quickly; they already chose a time slot or treatment.<br>Source: Google search · Priority: High · How to treat it: Usually ready to book. Lead with availability.<br>Source: Instagram or Facebook ads · Priority: Normal · How to treat it: Often browsing. Start with the treatment they clicked on.<br>Source: Referral from a client · Priority: High · How to treat it: Mention who referred them and thank them. |
| Ready to buy when | Asks about a specific treatment or its price., Asks about availability or the next open appointment., Has had a consultation or treatment with us before., Mentions an event or a date they want to look their best for. |
| Needs nurturing when | General browsing with no treatment in mind., Asks only about price, with no interest in a specific treatment., Says they are "just looking". |
| Stop pursuing when | Reason: Lives outside the area we serve. · Suggested closing message: Thanks so much for reaching out. We only see clients in our local area, so we're not the right fit, but we hope you find someone wonderful nearby.<br>Reason: Below the minimum age for treatment. · Suggested closing message: Thank you for your interest. We can only treat clients who are 18 or older, so we're not able to book you in.<br>Reason: Wants a treatment we do not offer. · Suggested closing message: Thanks for asking. That's not a treatment we offer, so we'd rather point you to a specialist who does. |
| Must know before qualifying | treatment_interest, timeline |
| First touch within | 5 minutes |
| Longest gap between touches, by stage | Stage: Being worked · Longest gap (hours): 4<br>Stage: Follow-up · Longest gap (hours): 24<br>Stage: Objection raised · Longest gap (hours): 24<br>Stage: No-show · Longest gap (hours): 4 |
| Going quiet after | 3 |
| Gone quiet after | 7 |
| Follow-up runs for at most | 7 |
| Formality | Friendly |
| Emoji | Sparingly |
| Longest text message | 300 |
| Punctuation rules | At most one exclamation mark per message. No capitals for emphasis. |
| Words to use | consultation, treatment plan, provider, results vary |
| Words and phrases to avoid | I hope this message finds you well, I hope you're doing well, I wanted to reach out, just circling back, circling back, touching base, following up on our conversation, as we discussed, leverage, utilize, synergy, streamline, robust, seamless, journey, solution, guaranteed results, cure, permanent, risk-free, pain-free, act now, last chance, limited time only |
| Example messages | Channel: Text · Message: Hi Jess, it's Maya from Glow Studio. We have a lip filler consultation open Thursday at 4. Would that work for you?<br>Channel: Email · Message: Thanks for asking about laser skin resurfacing. A short consultation lets our provider look at your skin and talk through what to expect, including downtime and cost. We have openings this week on Tuesday and Thursday afternoon. Would either suit you? |

### Home Services (`home-services`, draft)

Recurring and one-time jobs: cleaning, HVAC, roofing, lawn care, plumbing, pest control, remodeling.

| Field | Value |
|---|---|
| What kind of business this is | a local home services company doing recurring and one-time jobs at people's homes |
| Business hours | Mon 07:00–18:00; Tue 07:00–18:00; Wed 07:00–18:00; Thu 07:00–18:00; Fri 07:00–18:00; Sat 08:00–14:00; Sun closed |
| What the business sells | Offer: Recurring service (cleaning, lawn care, pest control) · Typical price from ($): 100 · Typical price to ($): 400 · Recurring: Yes<br>Offer: One-time job · Typical price from ($): 150 · Typical price to ($): 1500 · Recurring: No<br>Offer: Repair or emergency call-out · Typical price from ($): 150 · Typical price to ($): 800 · Recurring: No<br>Offer: Large project (roofing, HVAC replacement, remodeling) · Typical price from ($): 3000 · Typical price to ($): 40000 · Recurring: No |
| Case-file facts | Key: service_type · Label: Service needed · Type: Text · Required: Yes<br>Key: property_type · Label: Property type (house, apartment, business) · Type: Text · Required: No<br>Key: property_size · Label: Property size · Type: Text · Required: No<br>Key: service_area · Label: Address or area · Type: Text · Required: Yes<br>Key: timing · Label: When they need it · Type: Text · Required: Yes<br>Key: frequency · Label: One-time or recurring · Type: Text · Required: No<br>Key: access_notes · Label: Access notes (gate code, pets, parking) · Type: Text · Required: No |
| Act-now signals | today, leak, flooding, broken, no heat, no AC, emergency, A move-in or move-out date |
| Objection library | Objection: Price · Category: Price or cost · How it sounds: "That's expensive", "Can you do it cheaper?" · How to answer: Explain what the price includes and why. Offer a smaller first job or a recurring rate if you have one. Do not undercut yourself to win the job.<br>Objection: Availability · Category: Timing · How it sounds: "When can you come?", "I need it sooner than that" · How to answer: Give the earliest real date. If an emergency, say what you can do today.<br>Objection: Trust and reviews · Category: Trust or proof · How it sounds: "Are you insured?", "Do you have reviews?" · How to answer: Confirm licensing and insurance, and share where to read reviews.<br>Objection: Getting other quotes · Category: Other options · How it sounds: "I'm getting a few quotes", "Someone else quoted less" · How to answer: That's sensible. Make your quote easy to compare: what is included, warranty, and timing. Follow up once after a couple of days.<br>Objection: Timing · Category: Timing · How it sounds: "Not until next month", "After the holidays" · How to answer: Offer to book a date now so they keep the slot, and set a reminder. |
| Lead sources | Source: Google local listing · Priority: High · How to treat it: Usually needs help soon. Reply with the earliest date.<br>Source: Website quote form · Priority: High · How to treat it: Confirm the job and the address, then give a time.<br>Source: Referral · Priority: High · How to treat it: Mention who referred them.<br>Source: Lead marketplace (Angi, Thumbtack) · Priority: Normal · How to treat it: Reply fast; they contacted several companies.<br>Source: Flyers and door hangers · Priority: Low · How to treat it: Often price shopping. Lead with a clear starting price. |
| Ready to buy when | Described a specific job., Gave an address or the area they are in., Asked for a quote or a date., Mentioned something urgent, like a leak or a broken system. |
| Needs nurturing when | Curious about prices in general., Comparing many providers with no date in mind. |
| Stop pursuing when | Reason: Outside our service area. · Suggested closing message: Thanks for getting in touch. That address is outside the area we cover, so we can't help with this one. Sorry we couldn't be more useful.<br>Reason: A job type we do not offer. · Suggested closing message: Thanks for asking. That's not a job we do, but a specialist will be able to help.<br>Reason: Below our minimum job size. · Suggested closing message: Thanks for reaching out. That job is smaller than we usually take on, so we're not the best fit this time. |
| Must know before qualifying | service_type, service_area, timing |
| First touch within | 10 minutes |
| Longest gap between touches, by stage | Stage: Being worked · Longest gap (hours): 24<br>Stage: Follow-up · Longest gap (hours): 48<br>Stage: Objection raised · Longest gap (hours): 48<br>Stage: No-show · Longest gap (hours): 24 |
| Going quiet after | 7 |
| Gone quiet after | 21 |
| Follow-up runs for at most | 14 |
| Who hears about what | Severity: Warning · When: A new lead has not had a first touch within the window. · After (windows): 1 · Who: The person the lead is assigned to · How: App notification<br>Severity: Urgent · When: Still untouched at twice the window. · After (windows): 2 · Who: All setters · How: App notification, Team channel (Slack or Teams)<br>Severity: Critical · When: Still untouched at four times the window. · After (windows): 4 · Who: Owners and managers · How: App notification<br>Severity: Urgent · When: A lead mentions an emergency, like a leak, flooding, or no heat. · Who: The person the lead is assigned to, Owners and managers · How: App notification, Text message |
| Formality | Friendly |
| Longest text message | 200 |
| Longest email | 600 |
| Punctuation rules | Plain words and short sentences. No exclamation marks in quotes or prices. |
| Words and phrases to avoid | I hope this message finds you well, I hope you're doing well, I wanted to reach out, just circling back, circling back, touching base, following up on our conversation, as we discussed, leverage, utilize, synergy, streamline, robust, seamless, journey, solution, kindly, do not hesitate, per our conversation |
| Example messages | Channel: Text · Message: Hi Dan, it's Luis from Northside Plumbing. We can be there tomorrow between 8 and 10 to look at the leak. Does that work?<br>Channel: Text · Message: Thanks for the photos. A full gutter clean for a two-story house is usually $180 to $240. Want me to book you in for Saturday morning? |

### Coaches and Consultants (`coaches-consultants`, draft)

High-ticket programs, group programs, one-to-one coaching, and consulting engagements.

| Field | Value |
|---|---|
| What kind of business this is | a high-ticket coaching or consulting business that sells through sales calls |
| What the business sells | Offer: High-ticket program · Typical price from ($): 3000 · Typical price to ($): 25000 · Recurring: No<br>Offer: Group program · Typical price from ($): 500 · Typical price to ($): 5000 · Recurring: No<br>Offer: One-to-one coaching · Typical price from ($): 1000 · Typical price to ($): 10000 · Recurring: Yes<br>Offer: Consulting engagement · Typical price from ($): 5000 · Typical price to ($): 50000 · Recurring: No |
| Case-file facts | Key: stated_goal · Label: What they want to achieve · Type: Text · Required: Yes<br>Key: current_situation · Label: Where they are now · Type: Text · Required: No<br>Key: budget_range · Label: Budget range · Type: Text · Required: Yes<br>Key: decision_maker · Label: Who makes the decision · Type: Text · Required: Yes<br>Key: timeline · Label: When they want to start · Type: Text · Required: Yes<br>Key: previous_coaching · Label: Coaching or consulting they have had before · Type: Text · Required: No<br>Key: objections_raised · Label: Objections raised on the call · Type: Text · Required: No |
| Act-now signals | A stated deadline, A launch date coming up, "Ready to start", A recent trigger event, like losing a client or new funding |
| Objection library | Objection: Price · Category: Price or cost · How it sounds: "It's a lot of money right now", "I can't justify that" · How to answer: Tie the investment back to the goal they stated and what it is costing them to stay where they are. Offer a payment plan only if one exists.<br>Objection: Timing · Category: Timing · How it sounds: "Now's not the right time", "Maybe next quarter" · How to answer: Ask what would need to be true for the timing to be right, and what waiting costs them.<br>Objection: Needs to talk to a partner or team · Category: Needs someone else to agree · How it sounds: "I need to talk to my partner", "I have to run it by my team" · How to answer: Offer a short call with the other decision-maker, and send a one-page summary they can share.<br>Objection: Skeptical about results · Category: Trust or proof · How it sounds: "How do I know this will work for me?" · How to answer: Share a relevant client story with specifics, and be honest about what the program needs from them.<br>Objection: Past bad experience · Category: Trust or proof · How it sounds: "I've done a program before and it didn't work" · How to answer: Ask what went wrong, listen, and explain clearly how this differs. Never criticize the other provider. |
| Lead sources | Source: Referral · Priority: High · How to treat it: Mention who referred them; trust is already there.<br>Source: Paid social ads · Priority: Normal · How to treat it: Confirm the problem they want solved before talking about the offer.<br>Source: Webinar or podcast · Priority: Normal · How to treat it: Reference what they watched or heard.<br>Source: Email list · Priority: Normal · How to treat it: They know you; ask what prompted them to reply now. |
| Ready to buy when | Has stated a clear problem and the goal they want., Has acknowledged the budget., The decision-maker is on the call., Has stated a timeline for starting., Has engaged with earlier touches. |
| Needs nurturing when | Curious, but with no clear goal., No budget for this yet., Needs approval from someone who is not on the call. |
| Stop pursuing when | Reason: Not at the right stage for the offer. · Suggested closing message: Thanks for the time today. Based on where you are right now, this isn't the right program yet. Here's what I'd focus on first, and I'm happy to talk again when you get there.<br>Reason: No decision-making authority, with no path to the person who has it.<br>Reason: Unwilling to commit to the program format. · Suggested closing message: Thanks for being straight with me. The program only works with the full commitment, so it wouldn't be fair to take you on. I wish you the best with it. |
| Must know before qualifying | stated_goal, budget_range, decision_maker, timeline |
| First touch within | 15 minutes |
| Longest gap between touches, by stage | Stage: Being worked · Longest gap (hours): 48<br>Stage: Follow-up · Longest gap (hours): 96<br>Stage: Objection raised · Longest gap (hours): 72<br>Stage: No-show · Longest gap (hours): 24 |
| Formality | Friendly |
| Punctuation rules | Confident and plain. No hype, no exclamation marks in follow-ups after a call. |
| Words and phrases to avoid | I hope this message finds you well, I hope you're doing well, I wanted to reach out, just circling back, circling back, touching base, following up on our conversation, as we discussed, leverage, utilize, synergy, streamline, robust, seamless, journey, solution, guaranteed, life-changing, secret, hack, only a few spots left |
| Example messages | Channel: Text · Message: Good talking today, Sam. You said the goal is 10 clients a month by March. I'll send the plan we walked through tonight; worth looking at before Thursday's call.<br>Channel: Email · Message: Thanks for walking me through where the business is. You mentioned two things are holding growth back: no consistent lead flow and closing calls yourself. The program covers both, and the next step is a 20-minute call with your business partner so you can decide together. Does Thursday at 2 work? |

## Permission rules as enforced (in the database, not only on screens)

| Who | Can |
|---|---|
| Platform Admin | Everything: the platform default, locks and locked pushes (with a reason), templates (create, edit, activate, retire), any workspace's configuration, go-live checks. |
| Service Team | Read templates and the platform default. Edit, roll back, switch template, decide notices and run go-live checks **only for assigned workspaces**. Edit templates only with template access. Never change a lock or push. |
| Workspace Owner | `config_owner_view` (business hours, timezone, whether they may edit) and `config_owner_set_hours` when the team allows it. Contact details and notification preferences as before. No configuration tables, history, notices, or other workspaces. |
| Member, Operator | Nothing from configuration. Their agents call `config_agent_gate` and screens call `config_display_settings`, which return a yes or no, a version, the business description and display labels; never the configuration itself. |
| Closed workspace | Configuration can be viewed by staff; every write is refused. |
| Signed-out visitors | No configuration function is callable (checked by test). |

Every write is logged to the Prompt 1 activity log: saves, pushes, rollbacks, notice decisions,
template status, switches, go-live checks, owner hours, opt-outs, and stops.

## Migration results

Rehearsed locally against a database shaped exactly like live, with values read from production
on 2026-10-08: Divine Acquisition active; weights 25/25/25/25; ghost days 4/7; five-day,
three-step follow-ups; follow-up quiet hours 21:00; casual voice with no greeting, sign-off or
emoji; no approval-gate rows; the consulting business profile with three objections.

- Divine Acquisition is on Coaches & Consultants at platform version 2, with auto-accept off.
- Its own values became overrides; values equal to the template or default did not.
- **Parity:** every legacy settings row is unchanged except follow-up quiet hours (21:00 → 20:00,
  the approved locked rule). The approval gate keeps its limits; every action keeps its mode.
- **Rollback, run twice and re-applied twice:** the legacy rows come back byte for byte, and no
  configuration table remains. The runtime migration's rollback keeps recorded opt-outs in
  `vistrial_rollback_keep.lead_opt_outs`.
- No agent stops for Divine Acquisition on day one; checked with both the TypeScript and SQL gates.

**Day-one behaviour changes (all approved):**
- Follow-ups stop at 8pm instead of 9pm, in the lead's own time zone.
- Opt-out words are honoured.
- At most 2 messages per lead per day on every path.
- The speed-to-lead clock pauses outside business hours, so after-hours leads alert in the
  morning instead of overnight.

**Needs manual review (not mapped into configuration; each keeps working as today):**

1. **Primary contact.** Divine Acquisition has none, so its go-live check lists it. It is already
   live, so nothing stops; add one under Identity.
2. **Follow-up stage rules** (`follow_up_routing_rules`: steps per stage and the matching rules)
   stay in their own table. `response.follow_up_cadence` is stored but not yet read.
3. **CRM field mapping and scoring rules** (`score_field_maps`, `score_field_rules`) stay on the
   Integrations page.
4. **Per-person notification preferences** and the notification caps (8 per hour, brief timing)
   are unchanged.
5. **Ask Vistrial's own gate modes** (`sales_os_gates`) were not merged into the approval section.
6. **Operator agent limits** (`org_agent_settings`) are unchanged.
7. **Business-profile price and timeline bands, application fields, and disqualifier keyword
   phrases** are unchanged. Signals, disqualifiers, offers, channels and objections were mapped.
8. **Retention constants** (webhooks 14 days, notifications 90, closed workspaces 90, offboarding
   30) are unchanged.
9. **`organizations.product`** (Stellar on or off) stays a workspace column. It decides routing,
   not behaviour.
10. **Home metrics' "48 hours quiet" definition** stays a reporting constant; its label states it.
11. **Two items listed in discovery as outside this prompt are left as they are:**
    - the home queue's "Hi {name}," when greetings are off;
    - the timezone fallback that differs between agents and notifications.

## New tables and storage covered by workspace isolation

| Table or function | Who can read it | Who can write it |
|---|---|---|
| `config_fields` | staff | migrations only |
| `config_templates` | staff | functions (template access / Platform Admin) |
| `config_layers` | staff: the platform default and templates; workspace rows only for staff of that workspace | functions only |
| `config_versions` | same as `config_layers` | functions only; append-only (a trigger refuses edits) |
| `workspace_config_pins` | staff of that workspace | functions only |
| `config_review_notices` | staff of that workspace | functions only |
| `config_readiness` | staff of that workspace | functions only |
| `config_migration_legacy` | nobody through the API | the migration |
| `config_stops` | staff of that workspace | service role only |
| `lead_opt_outs` | anyone who can see that lead (operators only their leads) | service role only |
| `config_agent_gate`, `config_display_settings`, `config_owner_view` | members of that workspace / owners | n/a |

Every one has row-level security on, checked by test. The new screens all sit behind
`requireStaff` (owner hours behind the owner check), and every action re-checks in the database.

## Credentials (decision 4)

Credentials stay encrypted where they are (AES-256-GCM under `GHL_TOKEN_ENCRYPTION_KEY`).
Configuration stores only references (`integrations.*` hold a connection id and a label) and
refuses anything that looks like a key, token, password or private link, in TypeScript and in SQL.
The owner read on webhook ciphertext that discovery flagged was already closed by Prompt 1:
`notification_team_channels` is staff-only.

**Every place the key is used, for the Vault prompt:**

- **Decrypt:**
  - `src/lib/ghl/tokens.ts:35-36` and `src/lib/ghl/connect.ts:133-134`: CRM access and refresh
    tokens.
  - `src/lib/sources/connections.ts:205-206`: source secrets and refresh tokens.
  - `src/lib/execution/connections.ts:78-79`: execution connections.
  - `src/lib/transcripts/pull.ts:31`: recorder API key.
  - `src/lib/transcripts/ingest.ts:45`: recorder webhook secret.
  - `src/app/api/sources/webhooks/commas/[token]/route.ts:51` and `.../forms/[token]/route.ts:47`:
    inbound webhook secrets.
  - `src/lib/notifications/senders.ts:171-172`: Slack and Teams webhooks.
  - `src/lib/sales-os/executions/run.ts:479`: Ask Vistrial destinations, fetched through
    `sales_os_destination_credential`.
- **Encrypt:**
  - `src/lib/ghl/connect.ts` and `src/lib/ghl/tokens.ts`;
  - `src/lib/sources/connections.ts` and `src/lib/sources/sync.ts`;
  - `src/lib/execution/connections.ts`;
  - `src/lib/sales-os/settings.ts`;
  - `src/app/api/sales-os/drive/callback/route.ts`;
  - `src/app/(workspace)/app/settings/integrations/actions.ts`;
  - `src/app/(workspace)/app/settings/notifications/actions.ts`.
- **The same key is also an HMAC signing key:**
  - OAuth state: `src/lib/ghl/oauth-state.ts`, `src/lib/sources/oauth-state.ts`,
    `src/lib/execution/oauth-state.ts`;
  - Ask Vistrial tool approvals: `src/app/api/sales-os/chat/route.ts:33`;
  - Drive links: `src/lib/sales-os/executions/drive.ts:37`.

**What would make a later Vault move harder:**

- **One key does two jobs.** It encrypts and it signs. Moving it moves both, or the signing needs
  its own key first.
- **Decryption happens in the app.** It never happens in SQL, so Vault would be read through a
  service-role function on every use, or the app would cache the key.
- **The ciphertext format has only a `v1` prefix and no key id.** Rotating needs a key id in the
  format, or a re-encrypt of every row in one step.
- **A short key is stretched** with a fixed salt (`crypto.ts`), so the effective key is not the
  stored string.

Other credentials stay environment variables:
- `ANTHROPIC_API_KEY`, `GHL_CLIENT_SECRET`, `GOOGLE_DRIVE_CLIENT_SECRET`, `CRON_SECRET`;
- the Supabase keys;
- Twilio, Resend and Meta.

## Edge cases

| Case | What happens |
|---|---|
| A field is removed or renamed while workspaces override it | The resolver reads only fields in the registry, so a removed key is ignored and saving one is refused ("not a setting Vistrial knows about"). A rename ships as a migration that moves the values. Old values stay in history. |
| A value is no longer valid under a new rule | It shows on the field and on the go-live check. Agents that read that section stop with the reason, rather than guessing. |
| Two people edit at once | Every save carries the version it started from. The second gets "Someone else changed these settings… Reload" and nothing is overwritten. |
| A required field is cleared on a live workspace | Refused, with the list of what would be empty. Move the workspace back to onboarding first if that is intended. |
| A credential expires after go-live | As before Prompt 2: sending halts with "connection broken", managers are alerted by the CRM health check, and only that automation stops. |
| Timezone or hours change near a response window | The clock is recomputed from the lead's arrival using the hours in force when it is checked. A change applies to leads already waiting. |
| Paused or closed workspace | Configuration is viewable by staff. No automation runs (Prompt 1), and closed workspaces refuse edits. |
| Very long lists | Lists are capped (for example 30 objections, 30 opt-out words). Values load as one row per level, and the editor edits one field at a time. |

## Done When

| Check | Result | How it was checked |
|---|---|---|
| An override changes behaviour for that workspace only | **Pass** | `verify-config.sql`: an override in W1 changes W1's effective value and its scoring row; W2 is unchanged. |
| A template edit creates notices and changes no live workspace silently | **Pass** | `verify-config.sql`: W1 (live) unchanged with a pending notice showing exactly its before/after; W2 (onboarding, auto-accept) changed and recorded. |
| An override survives a template change unless staff choose otherwise | **Pass** | Accepting a notice keeps W1's override. A template switch keeps overrides unless ticked to drop. |
| Locked fields can't be overridden; an admin can push to all with a record | **Pass** | Loosening is refused and tightening allowed. A push needs a Platform Admin and a reason, applies at once, creates a "pushed" notice per workspace, and keeps a stricter workspace stricter. |
| Every field shows inherited / overridden / locked; the effective view shows sources | **Pass** | The field row badge (platform default, from template, overridden here, locked, locked and stricter here) and the per-field value on the workspace screen. |
| Three templates each produce a complete, valid configuration, with a sensible test run | **Pass** | `verify-config.sql` resolves each template alone with no missing or invalid value. The unit test runs the sample lead through Med Spa, and each template page shows its own run. |
| No go-live with missing required fields; missing items in plain language | **Pass** | `set_workspace_status` refuses without a passing check for the current version. The checklist links each item to its field. |
| History shows who, what, when; compare works; rollback makes a new version | **Pass** | `verify-config.sql`: history names the editor and the change; rollback writes version n+1 marked as a rollback; history cannot be edited. Compare on every history page. |
| No secret displayed or stored in configuration; integration tests clear | **Pass** | Secret-looking values are refused in TypeScript and SQL (tested). Credentials stay encrypted in connection tables. The existing "test connection" features are unchanged. |
| Agents read fresh configuration and every run records its version | **Pass** | No cache: each consumer resolves at run time. `config_version` is stamped on all 12 run and draft tables (draft stamp tested). |
| A missing required value stops the agent with a visible reason | **Pass** | `verify-config.sql`: the gate refuses with "Ask Vistrial stopped because…", counts repeats, and clears when fixed. Drafting, extraction, the queue, sending and the Operator record the reason on their job or run. |
| Owners see only their settings; Members and Operators see none | **Pass** | `verify-config.sql`: customers read no configuration tables or effective configuration; owners get only `config_owner_view`, and hours only when allowed. The screens are staff-only. |
| Existing workspaces behave as before, with a documented rollback | **Pass, with the four approved launch rules** | `scripts/test-config-migration.sh`: parity on live-shaped data, rollback and re-apply twice, the runtime migration round trip. |
| Isolation holds for every new table and screen | **Pass** | The table above. `verify-config.sql`: Service Team limited to assigned workspaces, RLS on every new table, nothing callable by signed-out visitors. |

**Test totals:**
- **Unit tests:** 765 pass.
- **Database suites:** every suite passes except `verify-reporting` and `verify-agent-framework`,
  which fail identically on `main` before this work.
- **Older rollback check:** `scripts/test-migration-rollback.sh` also fails on `main`, because an
  October Sales OS migration depends on a key that the old operator-agent rollback drops. It is
  not caused by this work.

## Going live

Same path as Prompt 1:

1. Database first, through the Supabase GitHub integration, from a `main` commit holding only the
   two migrations.
2. Check live against the parity checks.
3. Merge the app.

The app built cleanly on Vercel's preview of this branch. The old app runs safely against the new
database in between:
- `create_workspace` keeps working without a template;
- old screens' edits are captured as overrides;
- new columns are optional.

`20261007050000_workspace_template_reference.sql` follows the same path on its own: it only fills
and guards a column no code writes, so the deployed app needs no change.

Rollback: `supabase/rollbacks/20261007050000_workspace_template_reference.sql`, then
`supabase/rollbacks/20261007040000_configuration_runtime.sql`, then
`supabase/rollbacks/20261007030000_configuration_system.sql`, then redeploy the previous app.
