# Dealmaker: the second live agent (design)

Date: 2026-11-14. Designed, then **answered by the owner the same day** (section 12). The build goes in
the small stacked pull requests of section 13. Where an answer changed the design, the sections below say
what was decided.

Dealmaker is the catalog agent `sales-conversion` (`convex/catalog.ts`, number 3, department `sales`,
lifecycle `Convert`, display name **Dealmaker**). Its customers are the same as Strategist's: marketing
agencies, consultants, coaches and course sellers. Most of them sell through **booked sales calls**: a lead
books a call, shows up or does not, the call goes well or not, and the deal is won, lost or left to go cold.
Dealmaker's job is that stretch, from a lead booking to a deal closing.

The owner's brief, 2026-11-14, in short:

- Build and display Dealmaker the way Strategist is built and displayed.
- "Let's start over on the skills." Starting picks: Pipeline diagnosis, Pre-call brief, Call review,
  Follow-up on stalled deals. Also weigh show-rate booster, proposal and pricing, lead priority, objection
  library and scripts.
- **CRM-agnostic**: "don't make some of the skills only configured for HighLevel; soon we will set up
  integrations for other CRMs." One normalized CRM layer, HighLevel first, HubSpot and Salesforce later.
  Skills read and act only through it.
- Act only through the existing approvals. Messaging leads is behind its own Owner switch (another session).
- In the app, label work by the agent and what it produced ("Dealmaker · pipeline review"). Skill names stay
  for the landing page, future per-agent pages, and a condensed form on the Usage page. No model names and no
  credits used on work screens; only a budget a person confirms before work starts.

---

## 1. How Strategist is built, and what that means for Dealmaker

Read end to end before writing this. The parts Dealmaker reuses as they are, and the parts that assume
there is only one agent.

| Part | Where | What Dealmaker does with it |
|---|---|---|
| Catalog | `convex/catalog.ts` (`CatalogAgent`, `AgentSkill`, `AVAILABLE_SKILLS`, `skill()`), seeded into the `agents` / `skills` tables by `ensureAgents` (`convex/lib/agents.ts`) | Adds its skills to the `sales-conversion` entry; flips `status` to `live` and the skills into `AVAILABLE_SKILLS` only at go-live |
| Skill module | `convex/skills/types.ts`: `SkillModule { slug, agentSlug, tools, output, reserveCents, questions, nextStep(ctx) }`; one folder per skill with `index.ts`, `shapes.ts`, `tools.ts`, `checks.ts`, `compute.ts`, `render.ts` | Same interface, same folder shape, `agentSlug: "sales-conversion"` |
| Registry and dispatch | `convex/lib/registry.ts` (`TOOLS`, `wrapUntrusted`), `convex/lib/skills.ts` (`SKILLS`, `skillFor`), `convex/runs.ts` (`MUTATION_TOOLS`, `prepare`, `commitTool`, `commitModel`) | Tool slugs namespaced `dm.*`; modules added to `SKILLS`; tool maps spread into `MUTATION_TOOLS` |
| Runs and caps | `agentRuns`, `runSteps`; `startRunFor` (`runs.ts`) checks the agent is live and on, the skill belongs to it, caps, the spending limit; `SKILL_CAPS` (`convex/lib/caps.ts`) | Each Dealmaker skill gets its own `SKILL_CAPS` row (section 9) |
| Budget before work | `convex/skillIntake.ts`: the plan message "Nothing runs or spends until you press Start", with "up to N credits"; `start` refuses if the cap moved | Reused; Dealmaker's skills are chat skills with their own checklists |
| Evidence | `convex/lib/evidence.ts`: Observed, Inference, Untested hypothesis, Your data, Not enough data; `screenClaims`; `evidence` rows per claim; `firstParty` must cite a `customerData` source | CRM figures and transcript quotes are **Your data**; readings are **Inference**; suggested moves are **Untested hypothesis** |
| Checks | Code-only checks per skill (`runChecks` → `ChecksRecord`), one revision held in reserve (`useReserve`) | Same pattern; checks per skill in section 4 |
| Approvals | `approvals` table, `convex/lib/approvals.ts` (`requestApproval`, `mayDecide`, `ownerOnly`), `approvals.decide` as the one door | CRM changes go through `crmActions` (kind `accountChange`), reports through `publish`, tasks through `task` |
| Tasks / Briefing / Home | `runChanged` (`convex/lib/briefing.ts`) posts `finished` / `draft` / `alert`; `agentTasks` + `insertProposal`; `taskProposer` turns items of approved reports into tasks; `home.ts` | Dealmaker's results feed all three (section 7) |
| Side chat | `convex/agentChat.ts`, `routeIntent` and `CHAT_ROUTES` (`convex/lib/chatRouting.ts`) | Its own chat with its own routes |
| Work tabs | `convex/lib/workTabs.ts` (`WORK_TABS`, `SKILL_TAB`, `SKILL_ASSET`), `convex/workTabs.ts` (`tab`), `src/lib/shell/journey.ts` (`workTabsFor`, `agentTabs`), `src/components/work/*` | Dealmaker's own tabs (section 8) |
| Readable output | `docs/rebuild/readable-output.md`, `src/components/readable/*` | Every Dealmaker result is built from those blocks |
| Usage | `convex/usage.ts` names rows "`<skill name> run`" | Condensed "Dealmaker · Pipeline Forensics" (section 8.4) |

**The one-agent assumption.** `GROWTH_ARCHITECT` (`"growth-architect"`) is hard-coded in 36 non-test files
under `convex/`. The ones that matter here:

- `agentTasks.ts`: `insertProposal` forces `agentSlug: GROWTH_ARCHITECT` on work tasks, and prices them with
  `creditCostOf(…, GROWTH_ARCHITECT, …)` over `CHAT_ROUTES`.
- `skillIntake.ts` (`CHAT_SKILLS`, `plan`, `start`), `agentChat.ts` (one chat, Strategist's routes),
  `chatRouting.ts` (`CHAT_ROUTES` = the three Strategist skills).
- `workTabs.ts` / `lib/workTabs.ts` (`WORK_TABS` = research, offers, diagnostics; `tab` filters on Strategist).
- `home.ts` (8 places), `lib/usage.ts`, `planner.ts`, `taskProposer/tools.ts` (`proposedBy: GROWTH_ARCHITECT`).

So Dealmaker cannot be added by declaring it. The first code pull request (section 13, PR 2) turns these
into a per-agent table (`AGENT_SURFACES[slug] = { chatRoutes, chatSkills, workTabs, … }`) with no change in
behaviour, so Strategist keeps working exactly as today and Dealmaker becomes one more row.

---

## 2. The skills, from scratch

### 2.1 What Dealmaker should hand back

The rule from the v2 brief still stands: an agent is defined by the concrete thing it hands back. For an
agency or a coach selling on calls, the money leaks in five places:

1. Leads that never book.
2. Booked calls that do not show.
3. Calls that do not close, because the closer was not prepared or did not handle what the lead raised.
4. Deals that go quiet after the call and nobody follows up.
5. Not knowing which of those four is the real problem.

### 2.2 The skills (owner's decision, 2026-11-14: all six at launch)

| Skill (landing / Usage name) | In the app it reads | Hands back | Verdict |
|---|---|---|---|
| **Pipeline Forensics** (owner's "Pipeline diagnosis") | Dealmaker · pipeline review | Where deals stall, from the CRM's own figures, with a short plan | **Launch**, built first |
| **Conversation Intelligence** | Dealmaker · call review | What happened on one sales call, what was promised, the next steps, proposed CRM updates | **Launch** |
| **Deal Briefing** | Dealmaker · pre-call brief | One page on the lead before a booked call | **Launch** |
| **Follow-up Engine** | Dealmaker · follow-ups | The stalled deals, who first, a drafted message and proposed CRM actions for each | **Launch** |
| **Objection Playbook** (owner's "objection library and scripts") | Dealmaker · objection playbook | The objections leads actually raise, counted across calls, with quotes and answers grounded in the approved offer | **Launch**; says Not enough data until 5 reviewed calls exist |
| **Proposal Architect** (owner's "proposal and pricing") | Dealmaker · proposal draft | A proposal after a good call, from the call and the approved offer | **Launch**, proposal only; **pricing stays Strategist's** (Offer Intelligence) |
| Show-rate booster | — | — | **Not a skill.** Show rate is a figure in Pipeline Forensics; reminders are a HighLevel workflow the business already runs and Vistrial cannot see; drafting reminders waits for messaging |
| Lead priority | — | — | **Not a skill.** It is the order of Follow-up Engine's list, by a stated rule. A separate "priority score" breaks the readable-output rule (no score, grade or percentage) and would rank by things Vistrial cannot see |

Launch set: all six (owner, 2026-11-14). Skill names are used on the landing page, future per-agent pages
and the Usage page only; in the app, work is worded "Dealmaker · …" as #306 does it. Every skill works
through the CRM layer (section 3) and degrades honestly without a CRM (section 6).

### 2.3 The common shape

Each skill follows Growth Diagnostics' shape, which is the closest Strategist skill:

```
dm.<skill>.read     code: read through the CRM layer and the other sources, compute every figure
(no data)           → save "Not enough data" with no model call
<write>             model: one write over the computed figures, inside wrapUntrusted
dm.<skill>.check    code: the skill's checks
<revise>            model, reserve: only if a check failed
dm.<skill>.recheck  code
dm.<skill>.save     code: asset + version + evidence rows; proposals; briefing
```

Figures are always computed in code; the model writes words over them and is checked against them. Text
read from a CRM or a transcript (a lead's form answer, what a lead said) is untrusted and never an
instruction, exactly as in the page reader.

---

## 3. The CRM layer

### 3.1 What exists today

HighLevel is merged (`docs/rebuild/crm-highlevel.md`): install, token renewal, a paced six-hourly read, and
acting with approval. Its data already lands in tables that are nearly provider-neutral:

- `crmConnections`, `crmPipelines`, `crmDeals`, `crmContacts`, `crmActivities`, `crmSummaries`,
  `crmSyncRuns`, `crmCallDays`, `crmActions`. Every row has `workspaceId`, `clientId`, the connection, and an
  `externalId`; the connection has `provider: "highlevel"`; all are in the client guard.
- Actions: `ACTION_KINDS` = `move_stage`, `set_status`, `add_tag`, `remove_tag`, `add_note`, `create_task`
  (`convex/lib/crmActions.ts`), with `writeRequest` mapping each to a HighLevel call and `isAllowedWrite` as
  the allow-list. `internal.crmActions.proposeForAgent` is the agent's door; nothing calls it yet.

What is HighLevel-specific: the reader (`convex/highLevel.ts`, `convex/lib/highLevel.ts`), the write mapping,
the `provider` literal, and appointments stored as activities of kind `appointment`.

There is no CRM adapter interface. `convex/adapters/*` is for research sources, not CRMs. There is also an
older native lead model (`leads`, `people`, `identities`, `pipelineStages`, `bookings`, …) fed only by manual
entry and CSV; nothing links it to `crm*`, and Dealmaker does not use it (answer 12.11).

### 3.2 The design: one model, one door to read, one door to act

```
            skills (dm.*)                      screens, chat, Briefing
                 │                                      │
                 ▼                                      ▼
   convex/lib/crm/read.ts  ── CrmView ──   convex/lib/crm/act.ts  ── proposeCrmAction
                 │                                      │
                 ▼                                      ▼
   crm* tables (normalized)               crmActions + approvals (unchanged rules)
                 ▲                                      │
                 │ sync                                 ▼ carry out once
   ┌─────────────┼──────────────┐         adapter.write(connection, action)
   HighLevel   HubSpot (later)  Salesforce (later)
   adapter     adapter          adapter
```

**Rule, enforced by a test:** nothing under `convex/skills/` imports `highLevel.ts` or any adapter. Skills
import only `convex/lib/crm/read.ts` and `convex/lib/crm/act.ts`. (The same kind of architecture test as
`src/lib/architecture.test.ts`.)

### 3.3 The normalized model (`convex/lib/crm/types.ts`)

The `crm*` tables become the normalized store. They keep their names and fields; `provider` widens from a
literal to `"highlevel" | "hubspot" | "salesforce"`; one table is added for appointments.

| Entity | Fields (normalized) | HighLevel | HubSpot | Salesforce |
|---|---|---|---|---|
| Connection | provider, account id and name, currency, time zone, clientId, `capabilities`, acting switch, messaging switch | location | portal (hub id) | org id |
| Pipeline | ref, name, stages `{ ref, name, order, kind: open \| won \| lost }` | pipeline | deal pipeline | one per sales process / record type; stages from `OpportunityStage` |
| Deal | ref, pipelineRef, stageRef, status `open \| won \| lost \| abandoned`, value, currency, source, contactRef, ownerRef, createdAt, updatedAt, stageChangedAt, statusChangedAt | opportunity | deal | Opportunity (`IsWon`, `IsClosed` → status) |
| Contact | ref, kind `lead \| contact`, name, email, phone, source, tags (≤10), addedAt, lastActivityAt, time zone | contact | contact | Lead **or** Contact (two objects; `kind` says which) |
| Activity | kind `call \| sms \| email \| chat \| social \| meeting \| stage_change \| status_change \| note_added \| task_added`, direction, at, contactRef, dealRef, short facts (call seconds, message status, from→to stage) | conversation messages; diffed stage changes | engagements (calls, emails, meetings); stage history from property history | Task / Event; `OpportunityFieldHistory` |
| Appointment (new table `crmAppointments`) | ref, calendarRef, contactRef, dealRef?, startsAt, endsAt, status `booked \| confirmed \| showed \| noShow \| cancelled`, title kept? (no: see privacy) | calendar event | meeting | Event |
| Owner (person on the team) | ref only | user id | owner id | user id |

Stage kind is decided by the adapter: HighLevel by deal `status`; HubSpot by the stage's `isClosed` and
probability metadata; Salesforce by `IsWon` / `IsClosed`. Skills never see a provider's own words for this.

**Privacy stays as HighLevel's**: no message bodies, email subjects, recordings, deal names, notes or custom
fields are stored by any adapter. A new adapter that cannot meet that does not ship.

### 3.4 The adapter interface (`convex/lib/crm/adapter.ts`)

```ts
export type CrmCapabilities = {
  appointments: boolean;            // can read booked calls with a status
  stageHistory: "exact" | "diffed"; // exact from the CRM, or diffed between reads
  actions: CrmActionKind[];         // which of the approved actions this CRM can carry out
  messaging: ("sms" | "email")[];   // empty until the messaging switch and its scopes exist
};

export type CrmAdapter = {
  provider: CrmProvider;
  capabilities(connection): CrmCapabilities;
  readSteps: readonly string[];                       // shown to the Owner, like HL_STEPS
  read(ctx, connection, window): Promise<NormalizedBatch>;   // paced, capped, drops what is not kept
  writeRequest(connection, action): AllowedRequest;   // one action → one allow-listed request
  reverseOf(action): CrmActionInput | null;           // for Undo
};
```

HighLevel's adapter wraps what is merged: `syncConnection` becomes `read`, `writeRequest` / `isAllowedWrite`
move behind `writeRequest`, `reverseOf` is reused. The OAuth install stays per provider (each CRM's own
callback), but tokens, renewal claims (`refreshingSince`) and "Reconnect needed" work the same way.

### 3.5 Reading: `CrmView`

```ts
const crm = await crmFor(ctx, { workspaceId, clientId });   // null when nothing is connected
crm.connection        // provider, name, currency, time zone, last read, capabilities
crm.pipelines()       // stages in order, with kind
crm.deals({ open?, updatedSince?, pipelineRef? })
crm.contact(ref)
crm.activities({ dealRef?, contactRef?, since? })
crm.appointments({ from, to })
crm.summary()         // crmSummaries: counts and value per stage, won 30/90/365, sources
```

It is a plain query helper over the tables, so a skill's read step stays deterministic and testable with
a fake CRM (as `highLevel.test.ts` already does). One CRM per client (or per organization when there is no
client), as HighLevel already is. If a client one day has two CRMs, that is a later decision.

### 3.6 Acting: `proposeCrmAction`

`internal.crmActions.proposeForAgent` becomes provider-neutral: it finds the client's connection, checks the
action is in `capabilities.actions`, and calls the same `proposeAction` (acting switch on, connection
healthy, the deal or contact was read by Vistrial, the stage is in that deal's pipeline, no duplicate open
proposal). Everything after that is unchanged: one `accountChange` approval, Owner or Admin decides, Owner
with `VALUE` for won/lost, 24-hour expiry, carried out once, recorded, Undo as a new proposal, the
automations warning.

**When a CRM cannot do an action** (or acting is off), the skill does not fail and does not drop the idea.
It hands the step back as a Vistrial task for a person ("Move Jordan's deal to Proposal sent in your CRM"),
labelled "Do this in your CRM". That is the honest degrade for every CRM and for acting being off.

**Messaging** is the merged messaging path (#301, privacy text #304): actions `send_sms` and `send_email`,
behind the connection's own Owner switch (off by default, consent confirmed by the Owner), with a fresh Do
Not Disturb and opt-out check, quiet hours in the lead's time zone, at most one Vistrial message per lead a
day, and `SEND` typed per message. Dealmaker only ever *proposes* a message through it. When the switch is
off (or the CRM has no messaging capability), the same draft is shown with **Copy** instead (owner,
2026-11-14).

### 3.6A What step 3 built

`convex/lib/crm/`: `types.ts` (the shared model), `adapter.ts` (the `CrmAdapter` interface and the one
registry, HighLevel only), `highlevel.ts` (HighLevel's adapter, wrapping the merged `lib/crmActions.ts`
rules unchanged), `read.ts` (`crmFor`, the read view) and `act.ts` (`proposeCrmAction`, the act door, with
`doItYourself` for the fallback). `crmActions.ts` exports `proposeAgentAction`, which `proposeForAgent` now
calls. A test fails if any file under `convex/skills/` imports HighLevel, the action rules or an adapter.

Two choices differ from the sketch above, to keep this step free of schema changes:

- **Appointments are not a table of their own.** HighLevel's sync already saves them as activities of kind
  `appointment`; the read view returns them through `appointments()` and leaves them out of `activities()`.
  A `crmAppointments` table can come with the HubSpot adapter if a CRM needs more fields.
- **`provider` stays `"highlevel"` in the schema.** The shared types already name HubSpot and Salesforce; the
  schema widens in the pull request that adds the first of them, together with its connection page.

Reading stays in each CRM's own module (sign-in, paging and rate limits differ); what every CRM writes is
the shared model.

### 3.7 Other sources, and what each can and cannot give

| Source | Today | What Dealmaker uses it for | Limit, said on screen |
|---|---|---|---|
| CRM (HighLevel now) | `crm*` tables, six-hourly | Everything about deals, stages, contacts, activity, appointments | Reads up to 365 days of deals, 30 of conversations; activity facts only, no message words |
| Calendar (Google Calendar, Calendly) | `convex/bookings.ts`: **weekly counts only** (booked, cancelled, no-show), no names | Booked-call and show-rate figures in Pipeline Forensics when the CRM has no appointments | Cannot say *which* lead booked; no pre-call brief from a calendar alone |
| Call transcripts | `callTranscripts`: pasted or uploaded text, consent confirmed, `agents` grant (Strategist only by default), no link to a lead | Conversation Intelligence, the transcript part of Deal Briefing, Objection Playbook | Text only; needs to be granted to Dealmaker and linked to a lead (section 5) |
| Meta results | `metaAdSnapshots`: spend, results, cost per result per campaign | Upstream volume and cost in Pipeline Forensics: cost per booked call, per won deal | Only when both Meta and the CRM cover the same period; matched by totals, not per lead |
| Results files | `resultUploads`: totals of spend, conversions, revenue | Same as Meta, for other channels | Totals only; no per-lead link |
| Strategist's approved work | offer analysis, market report, business facts | The offer and its proof for Deal Briefing, Proposal Architect, Objection Playbook answers | Only **approved** versions are used |

---

## 4. Each skill in detail

Costs are in credits at the default markup (1 credit = 1 cent of balance, cost × 3). "Cap" is the most one
run can use, which is the number a person confirms before it starts. "Usually" is an estimate from token
counts; the first real runs must measure it (section 11).

### 4.1 Pipeline Forensics

**The job.** "Where are we losing deals?" An agency owner looks at a HighLevel pipeline every day and still
cannot say whether the problem is leads not booking, calls not showing, or calls not closing. This answers
that from their own figures, and says what to try first.

**Hands back** (asset kind `pipelineReview`, a report like a growth diagnosis):

- *The stall*: the stage where the most deals stop moving, with its figures. Labelled **Your data**.
- *The flow*: per stage, deals that entered in the window, moved on, are still there, median days there,
  stalled (no activity and no stage change for the stalled-deal days, default 14).
- *Show rate and close rate* when appointments exist: booked, showed, no-show, cancelled; won of showed.
- *Speed to first touch*: median time from a lead being added to the first call or message (from activity).
- *Sources*: won deals and value by lead source; cost per booked call and per won deal when Meta or a results
  file covers the same period.
- *What to try*: up to five steps, Fix / Build / Scale, each citing the figures behind it (**Inference**),
  or "Not enough data" when it cites none. These become task candidates (section 7).

**Data it needs.** A CRM with at least one pipeline and 20 deals updated in the window (below that: "Not
enough data", no model call, no charge beyond the read). Optional: calendar counts, Meta, results files.

**Agent work.** Read (code), compute the figures (code), one write over the figures (model), check, revise
once if needed, save. No web search.

**Checks (code).**
1. Every number in the text matches a computed figure (as Growth Diagnostics does).
2. Every stage named exists in the pipeline.
3. A stage with fewer than 5 deals in the window is "Not enough data" and the text may not draw a rate from it.
4. No outside benchmarks ("the industry average close rate is…": the `BENCHMARK` check).
5. No promised result ("this will double your close rate").
6. Each step in "what to try" cites at least one figure or is labelled Not enough data.

**Approval.** The report is a draft until an Owner or Admin approves it (`publish`), like every Strategist
report, because the task proposer only uses approved reports. It proposes no CRM change.

**Cost.** Cap 100 cents of cost a run, 600 a day (**300 credits** a run). Usually 30–60 credits.

**Shown as** (readable-output pattern, section 8.2): the stall as the verdict with its label; counts (open
deals, open value, stalled deals, won in 90 days); a **stage flow table** (stages down; entered, moved on,
stuck, median days, stalled; the stall row flagged with an icon and the words "Most deals stop here"); show
and close rate as two figures with their counts; top three "Where deals stop" / "What is working" by the
fixed rule (stalled and lost first, then slow, then what code counted); "what to do next" is the first step
nobody is trying. The full text, every figure's definition and the window are one step away.

**Feeds.** Approved: its steps are task candidates for the proposer, with **Your data** returns where the
figure exists. The **Briefing** gets the `finished` post with a three-row digest. **Home** "In motion" shows
it while it runs.

### 4.2 Conversation Intelligence

**The job.** A coach's closer, or the coach, had a sales call. They want to know what the lead actually
said, what was promised, what the next step is, and to get the CRM updated without retyping it.

**Hands back** (asset kind `callReview`):

- *Outcome in a sentence*, and where the deal should be now.
- *Fit, in plain fields*: need, budget, who decides, timing, fit with the offer. Each says what the lead
  said (a quote) or "Not raised on the call". No branded framework (answer 12.9).
- *Objections raised*, each with the lead's quote and whether it was answered on the call.
- *Commitments*: what each side said they would do, with the quote and any date.
- *Next step*, from the commitments.
- *Coaching notes*, at most three: where the call lost the lead or skipped a step (**Inference**).
- *Proposed CRM updates* (only with a linked deal and acting on): move the deal to a stage; add a note with
  the summary; create a task for the promised follow-up with its date; mark won or lost only when the lead
  said yes or no on the call (Owner, `VALUE`).

**Data it needs.** One transcript granted to Dealmaker. Better: linked to a CRM contact and deal (section 5),
so the review can propose updates and see the deal's history. Optional: the approved offer analysis, so
"fit with the offer" has something to compare with.

**Agent work.** Read the transcript and, if linked, the deal and its activity (code). One write (model).
Check. Revise once. Save; then propose the CRM updates.

**Checks (code).**
1. Every quote is found in the transcript as written (case and spacing aside), the same rule as `markText`.
2. Every objection and commitment carries a quote; one without is dropped.
3. A proposed stage exists in that deal's pipeline; a proposed deal or contact is the linked one, never
   another id.
4. Won or lost is proposed only when a quote shows a yes or a no.
5. Dates in commitments are real dates on or after the call.
6. No claim about the lead beyond the transcript and the kept CRM fields.

**Approval.** The review itself needs **no** approval: it is the business's own call read back to them and
never leaves Vistrial (answer 12.3). Every CRM update is its own `accountChange` approval, as today.

**Cost.** Cap 60 cents a run, 600 a day (**180 credits**). Usually 30–90 credits; it grows with the length
of the call (a one-hour call is about 9,000 words).

**Shown as**: verdict strip (outcome and next step, labelled Your data for quotes, Inference for readings);
counts (objections raised, answered, commitments, CRM updates proposed); **fit grid** (five fields, each "Said"
with the quote, or "Not raised"); objections as rows with an "Answered on the call / Not answered" chip;
commitments with dates; the proposed updates as approval cards right there. The transcript with every quote
marked (`MarkedText`, kinds: objection, commitment, budget, decision maker) is one step away.

**Feeds.** Each proposed CRM update is in the approvals queue (Briefing, Tasks, the CRM page). The Briefing
gets a `finished` post with the digest. A commitment with a date becomes a **Home** "Needs you" line on the
day before, if no CRM task was approved for it.

### 4.3 Deal Briefing

**The job.** Five minutes before a call, the closer opens one page: who this is, where they came from, what
has happened so far, what they said last time, what to cover, what they will probably push back on.

**Hands back** (asset kind `preCallBrief`, short):

- *Who*: name, source, when they were added, the deal's stage and value, how they booked.
- *So far*: the activity timeline in counts and dates (3 calls, 5 texts, booked 4 days ago, rescheduled once).
- *Last time*: if an earlier call was reviewed, its outcome, objections and commitments, with quotes.
- *Cover on this call*: up to five points, drawn from the offer and from what is open (**Inference**).
- *Likely objections*: from this lead's own earlier calls first; else from the Objection Playbook once it
  exists; else none. Never invented.
- *First call*: when nothing is known beyond the booking, it says so in one line and lists the offer's
  points. It does not pad.

**Data it needs.** A CRM appointment (or a deal the person picks), the contact and their activity.
Optional: reviewed earlier calls, the approved offer analysis, business facts.

**Agent work.** Read (code). One short write (model). Check. Save. With no history and no offer, no model
call: code writes the "who" and "so far" parts and stops.

**Checks (code).** Every fact traces to a field read; every quote is found in its transcript; nothing about
the lead beyond kept fields (no guessing age, income, family); no promise; objections only from the sources
listed above.

**Approval.** None (internal, never leaves Vistrial).

**Cost.** Cap 25 cents a run, 300 a day (**75 credits**). Usually 10–25 credits.

**Two ways to start.** On request ("brief me on my 3 pm"), with the budget confirmed as for any run. Or
**automatically** before each booked call: a switch, **off by default**, set by an Owner or Admin, with a
monthly cap shown beside it before it is switched on (like industry trend posts). Default proposal: a brief
3 hours before each CRM appointment in the next day, at most 200 briefs and **600 credits** a month
(answer 12.4).

**Shown as**: one screen; "who" as a short fact row with chips (source, stage, value); "so far" as a compact
timeline of counts; "last time" with quotes marked; "cover on this call" as a checklist; "likely
objections" with where each came from.

**Feeds.** **Home**: today's calls, each with its brief ("Brief ready" or "Make a brief"). **Briefing**:
one post a day listing the briefs made automatically, not one per brief. No tasks.

### 4.4 Follow-up Engine

**The job.** Deals go quiet after the call. Nobody remembers to chase. This finds them, puts them in a
sensible order, writes the next message for each, and proposes the CRM steps, for a person to approve.

**Hands back** (asset kind `followUps`):

- *The list*: open deals with no activity and no stage change for the stalled-deal days (default 14),
  at most 15 a run.
- *Who first*, by a **stated rule, not a score**: deals past the call stage first (they had a call), then by
  value, then by how long they have been quiet. The rule is printed under the list.
- *For each deal*: why it is on the list (in code: "Proposal sent, quiet 19 days, last touch a text"), one
  drafted message (text or email, channel chosen from what the lead last used), and proposed CRM steps:
  create a follow-up task, add a tag (for example "stalled"), or move the deal to the business's own
  "cold" or "lost" stage after 45 quiet days (answer 12.5).

**Data it needs.** A CRM with deals and activity. Optional: the deal's reviewed calls (for what was
promised), the approved offer analysis (for what the offer says). It has **no message words** to work
from, because no adapter keeps them (answer 12.7).

**Agent work.** Choose the deals (code). One write for all drafts (model). Check. Revise once. Save; propose
CRM steps; queue drafts.

**Checks (code).**
1. Each draft names only the lead's kept first name and the business; no other personal detail.
2. No promise, discount, price or guarantee that is not in the approved offer.
3. No link unless it is one of the business's own (website or booking link from business facts).
4. Length: a text at most 320 characters; an email at most 150 words.
5. Commitments it mentions are quotes from a reviewed call, or it mentions none.
6. A deal not read from the CRM is never on the list.

**Approval.** Every CRM step: Owner or Admin (`accountChange`). Every message: when the connection's
messaging switch is on, the draft is proposed as `send_sms` or `send_email` and an Owner types `SEND` per
message, after the merged consent, opt-out, quiet-hours and frequency checks. When the switch is off, the
draft is shown with **Copy** and the person sends it from their CRM.

**Cost.** Cap 100 cents a run, 600 a day (**300 credits**). Usually 40–120 credits for 15 deals.

**Shown as**: verdict ("12 deals have been quiet for 14 days or more, worth $38,400") with counts (quiet
deals, value, with a call, without); the list as rows with stage chip, days quiet, value, and the reason;
the draft and the proposed steps folded under each row; the stated order rule under the list.

**Feeds.** Each CRM step is an approval card; each draft is a `draft` post in the **Briefing** ("Needs your
decision" once messaging exists). **Tasks**: the follow-ups a person must send themselves appear as tasks
when acting or messaging is off. **Weekly**: a code-written alert, no model and no credits, when the count of
stalled deals rises ("9 deals went quiet this week").

### 4.5 Objection Playbook and Proposal Architect (launch, built after the first four)

**Objection Playbook** (asset `objectionPlaybook`). Reads all reviewed calls granted to Dealmaker (at least
5, else Not enough data). Groups objections by what they are about (price, timing, trust, partner or
spouse, "need to think"), counts them, keeps every quote, and writes an answer for each grounded in the
approved offer and its proof (Inference; an answer that claims a result is refused). Approval: `publish`.
Cap 150 cents (450 credits). Feeds Deal Briefing's "likely objections" and the task proposer.

**Proposal Architect** (asset `proposal`). After a reviewed call that ended in "send me something": a
proposal from the call's needs and commitments and the approved offer's deliverables and price. It never
sets or changes a price; a price not in the offer is refused. Approval: `publish` (it goes to a lead).
Cap 100 cents (300 credits). Sending it is the person's, or the messaging switch's.

---

## 5. Transcripts: two small changes Dealmaker needs

1. **Grant to Dealmaker.** `callTranscripts.agents` already exists (missing means Strategist only). The
   transcript form gets "Dealmaker may use this call" (on by default for new transcripts once Dealmaker is
   live; existing ones stay Strategist-only until a person ticks it).
2. **Link to a lead.** An optional `crmContactRef` and `crmDealRef` on `callTranscripts`, chosen from a
   picker of the client's CRM contacts when adding, or suggested from a CRM appointment on the call's date
   and confirmed by the person. Vistrial never links a call to a lead on its own.

**Built in step 4.** `callTranscripts` has two optional fields, `crmContactRef` and `crmDealRef`.
`transcripts.leadChoices` suggests the leads with a booked call within 36 hours of the call's date and finds
others by name or email, names only; `transcripts.linkLead` links (or unlinks) after checking, through the
CRM read view, that the lead is one Vistrial read and the deal is that lead's. Skills read calls through
`transcriptsFor` (granted to the agent, same client, optionally one lead's). Granting already worked for any
agent (`setAgentAccess`); the Connections screen lists live agents only, so Dealmaker's switch appears at
go-live, when new transcripts start out granted to it.

Later, when Fathom and Fireflies move from "designed" to built, transcripts arrive by themselves and the
appointment match is offered the same way.

---

## 6. When a source is missing

| Skill | No CRM | CRM, acting off | CRM without appointments | No transcripts | No Meta / results |
|---|---|---|---|---|---|
| Pipeline Forensics | Not run. "Connect your CRM" with the list of CRMs; no charge | Runs; proposes nothing anyway | Show rate from calendar counts if connected, else "Not enough data" for show rate | No change | No cost per booked call or won deal; said in one line |
| Conversation Intelligence | Runs on the transcript alone; no deal history; no CRM updates | Runs; updates are handed back as "Do this in your CRM" tasks | No change | Not run: "Add a call transcript" | No change |
| Deal Briefing | Runs only on request, from what the person types about the lead and any linked transcript | No change | On request for a picked deal; no automatic briefs | No "last time" | No change |
| Follow-up Engine | Not run | Drafts and the list still come; CRM steps become tasks | No change | Drafts cannot mention commitments | No change |

Every screen says what it could not read, the way the Pages tab lists a page under "Not read".

---

## 7. Approvals, Tasks, Briefing and Home

### 7.1 What needs approval

| Thing | Approval kind | Who | Typed word |
|---|---|---|---|
| Pipeline Forensics, Objection Playbook, Proposal Architect (reports and documents) | `publish` | Owner or Admin | — |
| Conversation Intelligence, Deal Briefing, the follow-up list | none (internal) | — | — |
| Move stage, add or remove tag, add note, create task | `accountChange` via `crmActions` | Owner or Admin | — |
| Mark a deal won, lost or abandoned, or reopen | `accountChange`, `ownerOnly` | Owner | `VALUE` |
| Send a message to a lead (`send_sms` / `send_email`, merged in #301) | `accountChange`, `ownerOnly`, behind the messaging switch | Owner | `SEND`, each message |
| Starting a run above the organization's spending limit | `spend` via a task, as today | Owner or Admin | — |

Never, whatever is approved: deleting anything in a CRM, changing users, settings, workflows or billing,
acting on a lead Vistrial did not read, sending without the messaging switch.

### 7.2 Changes to the shared code

- `insertProposal` takes the agent (`agentSlug`) instead of forcing Strategist, and prices work with that
  agent's routes.
- The task proposer reads candidates from approved Dealmaker reports too (Pipeline Forensics steps, Objection
  Playbook answers), with `proposedBy: { kind: "agent", agentSlug: "sales-conversion" }`. A task's expected
  return from a Pipeline Forensics step can be **Your data** (the stage's own figure) under the existing rules.
- `runChanged` posts Dealmaker's `finished`, `draft` and `alert` items like Strategist's, with the agent's
  name.
- Home: "Today's calls" in "Needs you" (with brief status); stalled-deal count in "Since you were last here";
  running Dealmaker work in "In motion".

### 7.3 New code-written Briefing posts (no model, no credits)

Each with the three-row digest (what changed, what it means, what to do), from fixed templates:

- "N deals went quiet this week" (from the six-hourly read), with "Review follow-ups" as what to do.
- "N booked calls tomorrow, M without a brief".
- "No-shows rose: N this week against M the week before" (Your data), when appointments exist.

---

## 8. How it is shown

### 8.1 Words

- In the app, work is labelled by the agent and what it produced: **Dealmaker · pipeline review**,
  **Dealmaker · call review with Jordan**, **Dealmaker · pre-call brief for Jordan, Tue 3 pm**,
  **Dealmaker · follow-ups, 12 deals**. No skill names on work screens, task cards, the Briefing or Home.
- Skill names (Pipeline Forensics, Conversation Intelligence, Deal Briefing, Follow-up Engine) appear only on the
  landing page, future per-agent pages, and the Usage page.
- No model names and no credits used on any work screen. The only number is the budget confirmed before
  work starts ("Up to 300 credits for this review"), as `docs/rebuild/usage-page.md` already rules.
- Catalog `job`: "Turns booked calls into customers: reviews your pipeline and calls, briefs you before each
  call, and follows up on deals that went quiet, for a person to approve." Catalog `promise`: "Dealmaker
  never changes your CRM or messages a lead on its own. A person approves every change, and an Owner approves
  every message."

### 8.2 Work tabs

Dealmaker's tabs, in `agentTabs` order: **Chat**, **Pipeline** (pipeline reviews), **Calls** (pre-call
briefs and call reviews, newest first, upcoming calls at the top), **Follow-ups**. Each tab follows the
shape of Strategist's (`work-shell.tsx`: running now, results, suggested next) and each result is built from
`src/components/readable/*`:

| Block | Pipeline Forensics | Conversation Intelligence | Deal Briefing | Follow-ups |
|---|---|---|---|---|
| `ResultHeader` / `VerdictStrip` | The stall, weakest label, 4 counts | Outcome and next step, 4 counts | Who, in one line | Quiet deals and value, 4 counts |
| Scannable structure | Stage flow table | Fit grid; objection rows with Answered chips | Fact row; timeline counts | Deal rows with stage chip and days quiet |
| `TopList` | Where deals stop / what is working | Objections not answered / what went well | — | — |
| `MarkedText` | — | Transcript with quote kinds | Last call's quotes | — |
| `NextStep` | First untried step | The next step promised | First point to cover | First deal on the list |
| `Detail` (one step away) | Full text, definitions, window | Full transcript, coaching notes | Everything read | Draft and proposed steps per deal |

Every indicator is computed from saved fields and says what it counted; evidence labels stay on; never
colour alone.

### 8.3 Side chat

Dealmaker's chat routes: pipeline review, call review (asks which transcript), pre-call brief (asks which
call), follow-ups. It shows the plan and the budget before anything runs, as Strategist's does. It answers
simple questions about the pipeline from `crm.summary()` in code ("how many open deals?") without a model
call where it can; anything else routes to a skill.

### 8.4 Usage page

Rows read "Dealmaker · Pipeline Forensics", "Dealmaker · Conversation Intelligence", etc. (condensed form). The usage view
already reserves a slot for `sales-conversion` (`AGENT_SLOT`). `limitsFor` lists Dealmaker's caps once live.

---

## 9. Caps

| Skill | Run (cost cents) | Day (cost cents) | Run cap in credits | Usually | Steps | Time |
|---|---|---|---|---|---|---|
| `pipeline-forensics` | 100 | 600 | 300 | 30–60 | 20 | 10 min |
| `conversation-intelligence` | 60 | 600 | 180 | 30–90 | 12 | 10 min |
| `deal-briefing` | 25 | 300 | 75 | 10–25 | 8 | 5 min |
| `follow-up-engine` | 100 | 600 | 300 | 40–120 | 12 | 10 min |
| `objection-playbook` | 150 | 600 | 450 | — | 20 | 10 min |
| `proposal-architect` | 100 | 600 | 300 | — | 12 | 10 min |
| Automatic pre-call briefs | — | — | 600 a month | — | — | — |

Code-written posts and the CRM read cost no credits (the read is HTTP only).

---

## 10. The landing page when Dealmaker goes live

Today `src/lib/marketing/content.ts` shows Dealmaker under Convert with `live: false` ("Planned"), and the
sidebar shows a "Soon" pill. At go-live:

1. `AGENTS_SECTION`: Dealmaker `live: true`; job "Pipeline forensics, deal briefings, call intelligence,
   follow-ups, objections and proposals."; the lead line becomes "Strategist and Dealmaker are live today. The others
   are planned and do not run yet."
2. The skills section gains Dealmaker's six skills, by their names (Pipeline Forensics, Conversation
   Intelligence, Deal Briefing, Follow-up Engine, Objection Playbook, Proposal Architect), with their plans
   (the "plan it runs" lines from section 4), grouped by agent.
3. A CRM line: "Works with HighLevel today. HubSpot and Salesforce are coming." Only HighLevel's logo is shown
   as connected; the others say "Coming soon". No claim of a result.
4. The promise from 8.1, word for word.
5. The claims ledger (`content.ts` support lines) and `content.test.ts` follow `AVAILABLE_SKILLS`.
6. In the app: the "Soon" pill and `PLANNED_AGENTS["sales-conversion"]` (`src/lib/agents/planned.ts`) go away
   because the agent is live; its "Books calls" line is not carried over (booking is not built).
7. People on Dealmaker's waitlist (`agentWaitlist`) get one email that it is live through the email path merged in #300 (answer 12.10).

---

## 11. Not proven until a real run

- What a real model writes in each skill, and what each costs against its cap.
- How often HighLevel accounts have usable appointments with a status, and real stage-change dates.
- Whether 14 days is the right "quiet" for agencies and coaches.
- HubSpot's and Salesforce's real answers; their mappings above are from their public documentation and
  untested. Salesforce's split of Lead and Contact needs a real org to confirm.
- How long real transcripts are, and whether the quote check is too strict for note-taker formatting.

---

## 12. The owner's answers (2026-11-14)

The questions this section asked, and what the owner decided. The sections above follow these answers.

1. **Launch set: all six at launch**: Pipeline Forensics, Conversation Intelligence, Deal Briefing,
   Follow-up Engine, Objection Playbook, Proposal Architect. Show rate and lead priority are folded in, not
   separate skills.
2. **Skill names**, for the landing page, future per-agent pages and the Usage page only:

   | Skill name | Slug | In the app |
   |---|---|---|
   | Pipeline Forensics | `pipeline-forensics` | Dealmaker · pipeline review |
   | Conversation Intelligence | `conversation-intelligence` | Dealmaker · call review |
   | Deal Briefing | `deal-briefing` | Dealmaker · pre-call brief |
   | Follow-up Engine | `follow-up-engine` | Dealmaker · follow-ups |
   | Objection Playbook | `objection-playbook` | Dealmaker · objection playbook |
   | Proposal Architect | `proposal-architect` | Dealmaker · proposal |

   In the app, work is worded "Dealmaker · …" the way #306 (`convex/lib/workWords.ts`) does it.
3. **No approval** for Conversation Intelligence, Deal Briefing and the follow-up list. Pipeline Forensics
   (a report that feeds tasks), anything that reaches a lead (Proposal Architect, messages) and every CRM
   change keep approval.
4. **Automatic briefs**: a switch, off by default, Owner or Admin; a brief 3 hours before each CRM
   appointment; at most 200 briefs and 600 credits a month, shown before the switch is turned on.
5. **Stalled** = 14 days with no activity and no stage change; a setting of 7, 14, 21 or 30 days. After 45
   quiet days Follow-up Engine may propose moving the deal to the business's own lost or cold stage, as a
   proposal like any other.
6. **Messages**: drafts with Copy, and, because #301 is merged, wired as `SEND` proposals (`send_sms` /
   `send_email`) through the merged messaging path. They respect the connection's messaging switch and fall
   back to Copy when it is off.
7. **No lead message text** is stored or read at launch.
8. **Without a CRM**, Conversation Intelligence and on-request Deal Briefing work; Pipeline Forensics and
   Follow-up Engine need a CRM. No deals CSV.
9. **Conversation Intelligence's fit fields** are plain: need, budget, who decides, timing, fit.
10. **One waitlist email at go-live**, through the email path merged in #300.
11. **Leads and My day** stay hidden and are removed in a cleanup PR after launch.
12. **CRMs**: HubSpot after HighLevel, then Salesforce. Skills stay CRM-agnostic through the adapter.
13. **Caps**: those in section 9, revised after 10 real runs per skill.

---

## 13. Build order, in small stacked pull requests

Each is a draft from current main (or stacked on the one before), passes tests, lint, `npm run typecheck`,
`npx tsc --noEmit -p convex` and `npm run build`, has a story page where it has a screen, and never deploys
Convex. The coordinator verifies each; the owner merges.

1. **This document** (#307), and the owner's answers in it.
2. **One agent becomes a parameter.** A per-agent table (chat routes, chat skills, work tabs, task pricing,
   the agent that proposes tasks); every `GROWTH_ARCHITECT` hard-code that decides behaviour reads it. No
   behaviour change; Strategist's tests unchanged.
3. **The CRM layer.** `convex/lib/crm/{types,adapter,read,act}.ts`; HighLevel's adapter wraps the merged
   code; `provider` widens; appointments read as their own rows; `proposeForAgent` checks capabilities
   (messaging included); the architecture test that skills never import an adapter. No behaviour change on
   the HighLevel page.
4. **Transcripts for Dealmaker.** The grant checkbox and the optional contact/deal link with its picker and
   appointment suggestion.
5. **Dealmaker skeleton.** The six catalog skills (all `comingSoon`, agent still `planned`), `SKILL_CAPS`,
   tool slugs, work tabs behind the dev flag, empty states, stories.
   *Built:* the six skills in `convex/catalog.ts` (coming soon, agent planned), their work words and their
   `SKILL_CAPS`. Tool slugs and the work tabs come with the first skill that uses them (step 6), so no slug
   or tab exists without code behind it.
6. **Pipeline Forensics, server.** Read, compute, write, checks, save, evidence; tests against a fake CRM.
7. **Pipeline Forensics, screen** and its Briefing post; the task proposer reads its approved steps.
8. **Conversation Intelligence**, server and screen, with CRM update proposals.
9. **Deal Briefing**, on request, then the automatic switch with its monthly cap; Home "Today's calls".
10. **Follow-up Engine**, server and screen; drafts as `SEND` proposals when messaging is on, Copy when it
    is off; CRM step proposals; the 45-day lost/cold proposal; the weekly stalled-deals post.
11. **Objection Playbook**, server and screen; feeds Deal Briefing's likely objections.
12. **Proposal Architect**, server and screen, with its `publish` approval.
13. **Side chat** routes and the plan/budget messages for Dealmaker.
14. **Go live.** Catalog `live`, `AVAILABLE_SKILLS` (all six), landing page (section 10), Usage names,
    planned card removed, waitlist email through the #300 path.
15. **After launch**: Leads and My day removed; caps revised after 10 real runs per skill; **HubSpot
    adapter**, then **Salesforce adapter**, each with its own connection page, scopes document and privacy
    section, and nothing changed in any skill.
