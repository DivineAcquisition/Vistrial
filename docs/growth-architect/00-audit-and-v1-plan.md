# Growth Architect: repository audit and Market Intelligence V1 plan

Date: 2026-10-31. Written against `main` at commit `2bf3d54` (PR #179).

This is the Phase 0 deliverable from the updated Vistrial direction ("The Agentic Workforce for Business Growth"). It is a plan for review. **No product code changes until it is approved.** Items marked **Decision** need an answer before the work that depends on them starts.

Where this document and `docs/rebuild/v2-brief-agents-and-areas.md` disagree, this document is the proposal to replace the v2 brief, pending approval.

---

## 0. How this audit was done, and what it could not check

- Read every Convex module, the schema, the access layer, the runtime, the model router, the evidence validator, the asset and controls modules, the product shell and the agent, runs, assets and decisions screens, and the rebuild docs.
- Ran `npm ci` and `npx vitest run`: **26 files, 111 tests, all passing.** CI on `main` (lint, tests, typecheck, build, no-secrets check) was green on 2026-10-27.
- **Not checked:** the live Convex dev deployment and the live Clerk instance. This environment has no Convex login, no deploy key, and no Anthropic key. Everything below described as "works" is proven by `convex-test` unit tests, not by a live run. Phase 1 closes that gap.
- Platform access rules (TikTok, Instagram, Meta, Google, YouTube) are stated from current public documentation as I understand it. Each one is marked **Verify** where a person should confirm the current terms before we build against it.

---

## 1. Current state assessment

### 1.1 Working, and covered by tests

| Area | What exists | Where |
|---|---|---|
| Sign-in | Clerk production issuer `clerk.vistrial.io`, audience `convex`. Staff need a `secondFactor` claim from Clerk token settings. | `convex/auth.config.ts`, `convex/lib/access.ts` |
| Workspace isolation | Every workspace function goes through `workspaceQuery` / `workspaceMutation`, which require an active membership. Isolation and guard tests exist. | `convex/lib/builders.ts`, `convex/isolation.test.ts`, `convex/guard.test.ts` |
| Roles | Owner, Manager, Rep. Staff (Platform Admin, Service Team) with time-boxed, audited access grants. | `convex/staff*.ts` |
| Business profile | Versioned, draft then confirmed, with examples and uploads. Agents read the newest confirmed version. Runs fail with `no_confirmed_profile` when none exists. | `convex/profile.ts`, `profileVersions`, `profileExamples` |
| Run engine | `runs.start` schedules server-side steps. Each step is prepared (membership, pause, halt, caps, route checked first), executed, then committed with an idempotency key so a retry cannot repeat an effect. A time-cap expiry is scheduled at start. | `convex/runs.ts` |
| Caps | Per-agent run, day, step and duration caps with a platform ceiling. Real model cost is always recorded, even when a call lands after a pause. | `convex/lib/caps.ts`, `convex/controls.ts` |
| Pause and halt | Owner pauses a workspace. Staff halt the platform. Both are checked before every step and after every model call. | `convex/controls.ts`, `convex/platform.ts` |
| Model layer | Work kinds (`research`, `classify`, `write`, `summarize`) map to routes in `modelRoutes`, with a fallback model. Claude through `@anthropic-ai/sdk`, a price table per model, an unpriced model cannot run, errors become codes. Only a Platform Admin can change routes. | `convex/lib/modelRouter.ts` |
| Assets | Versioned assets with evidence rows per version. A new version of an approved asset returns it to draft. | `convex/assets.ts` |
| Untrusted content | Tool and page text is wrapped and labeled. A test proves model text cannot add a tool. | `convex/lib/registry.ts` |
| Audit | Actions are logged with ids and counts only, never content. | `convex/lib/audit.ts` |
| Screens | Product shell with rail, Decisions queue (first-run setup plus drafts waiting), Runs list and run viewer with cost bar and steps, Assets list and asset review with versions and evidence, Profile editor, Controls. | `src/app/(product)/app/*`, `src/components/{runs,assets,shell,profile}` |
| Design system | Tailwind 4 tokens with lavender `#9A88FC` (`brand-500`) and ink `#07070B` (`ink-950`), Base UI plus shadcn components, light and dark. | `src/app/globals.css`, `src/components/ui` |

### 1.2 Incomplete foundations (exist, but not ready for a real skill)

1. **The runtime runs one hardcoded plan.** `PLAN` in `convex/runs.ts` is a fixed list (`profile.read`, model, `asset.create`) and `commitTool` has an `if/else` per tool. `declaredTools` returns tools only for the dev `test-echo` skill. There is no way to define a real skill's phases, fan out over sources, or pause a run for user input (`waiting` exists as a status but nothing uses it).
2. **Only model costs count toward caps.** Tool steps record no cost. Search APIs, browser sessions and paid data providers would be invisible to the caps.
3. **Caps are too small for research.** Default $0.25 per run and $2 per day, with a platform ceiling of $1 per run and $10 per day. A real Market Intelligence run is estimated at $0.50 to $3 (section 3.9).
4. **The evidence model cannot express the five evidence labels.** `evidence` has `sourceId`, `fetchedAt` and `computed`. It cannot say Observed, Inferred, Hypothesis, First-Party or Insufficient, cannot cite more than one source, and can only cite profile records or run artifacts. There is no table for an external source (a page, a video, an ad).
5. **Asset decisions are one-way.** There is `approve` but no decline, archive, or reason. Who approved which version is only in the audit log, not on the asset.
6. **The model call is single-turn text.** No system prompt, no structured output, no tool use. Fine for now, but classification and report writing need schema-validated output.
7. **Pause and halt cancel at most 50 open runs per status** (`take(50)` in `controls.ts` and `platform.ts`). The per-step check stops the rest at their next step, so this is safe, but the run rows stay "running" until then.
8. **Four unused tables** remain from earlier plans: `businessProfiles`, `approvalAssets`, `swipeEntries`, `libraryAcceptances` (Step 4 review item 13, still open).

### 1.3 Gaps that must be fixed before any real skill ships

1. **`memberAction` does not check membership.** It accepts any signed-in user and any `workspaceId` (`convex/lib/builders.ts` line 113). Nothing uses it yet. The first research action that uses it would be a cross-workspace hole. Fix it or remove it.
2. **`runs.start` ignores the agent's on/off state.** An Owner can turn an agent off, and a Manager can still start its runs.
3. **`workspace.syncCatalog` is open to any signed-in user.** It rewrites the global `areas`, `agents` and `skills` tables from code. The data is fixed, so the risk is low, but it should be internal or staff-only.

### 1.4 Placeholders

- Every skill in the catalog is `comingSoon`. The agent page offers only the dev "Run test skill" button.
- Connections, My day, Team and Settings pages are static empty states.
- Dev story pages (`/dev/run-viewer`, `/dev/asset-viewer`) render fixtures.

### 1.5 Built for an earlier direction (keep, but take out of the way)

- **Leads and the data spine** (people, identities, leads, imports, merges, possible matches, consent): about 1,500 lines with tests, paused since the v2 brief. It belongs to the future Sales Conversion agent. It still sits in the main nav (`My day`, `Leads`).
- **Catalog shape:** three areas (Sales, Retention, Operations) and a "Sales Agent" whose skills are ad research, ad copy, creative and content. The `agents.area` field is a fixed three-value union, and `agents.stage` is a required legacy field.
- **The Step 5 brief** (`docs/rebuild/grok-step-5-ad-research-prompt.md`) plans scraping collectors for the Meta Ad Library, TikTok Creative Center and Google Ads Transparency Center, "off until an Owner accepts the risk". The new direction says the system "must not bypass access restrictions, authentication requirements or platform protections" and should use "lawful, reliable access". See Decision D2.

### 1.6 What must change, in short

1. Re-shape the catalog to departments, the seven agents, and Growth Architect with six skills (D1).
2. Turn the runtime's hardcoded plan into skill definitions with phases, fan-out, tool costs and a `waiting` state.
3. Add source references, evidence labels and research collections to the data model.
4. Close the three gaps in 1.3.
5. Prove the whole loop on the live dev deployment with a real model before building research on it.

---

## 2. Architecture proposal

### 2.1 How the seven-agent workforce is represented

Keep the current pattern: **the catalog lives in code and is seeded into tables**, so the rail and pages read live rows and a deploy changes the catalog.

```
Department (4)          Agent (7)                         Skill (Growth Architect: 6)
growth-marketing   ->   growth-architect      [live]  ->  market-intelligence  [available in V1]
                        campaign-execution    [planned]   offer-intelligence   [planned]
sales              ->   sales-conversion      [planned]   campaign-strategy    [planned]
customer-success   ->   activation            [planned]   creative-production  [planned]
                        retention             [planned]   funnel-architect     [planned]
                        expansion             [planned]   growth-diagnostics   [planned]
operations         ->   operations-intelligence [planned]
```

- Rename `areas` to departments (new rows, slugs above). Add `lifecycle` (text) and `status: live | planned` to agents. Retire `sales`, `retention`, `operations` agent rows with the existing `retired` flag, so old runs keep resolving.
- A **planned** agent is a catalog row only: name, department, lifecycle, responsibilities. No skills run, no screens beyond a short read-only card. This is what keeps the long-term structure visible without building seven agents.
- Agent names other than Growth Architect stay working names in the catalog copy.

### 2.2 How Growth Architect fits the existing runtime

The runtime already has the right shape (prepare, execute, commit, schedule next). The change is to replace the fixed `PLAN` with a **skill definition**:

```ts
type SkillDefinition = {
  slug: string;                 // "market-intelligence"
  agentSlug: string;            // "growth-architect"
  tools: ToolSlug[];            // the whole allowed list; model text cannot add one
  defaultCaps: Caps;            // per skill, still bounded by the platform ceiling
  phases: Phase[];              // ordered; each phase emits one or more steps
};

type Phase =
  | { kind: "tool"; tool: ToolSlug }
  | { kind: "model"; workKind: WorkKind; schema?: OutputSchemaId }
  | { kind: "fanOut"; tool: ToolSlug; over: "planQueries" | "references" } // one step per item, bounded
  | { kind: "waitForUser"; reason: "confirmPlan" };                        // run status becomes "waiting"
```

- Each tool is a module with `prepare` (pure, in the mutation), `execute` (in an action, may call the network) and `commit` (in a mutation, writes records and the step marker together). The current `commitTool` branches become these modules.
- Steps record `costCents` for tools as well as models. Caps add both.
- A `fanOut` phase schedules its steps with bounded concurrency (for example four at a time) and records one `runSteps` row per item, so the run viewer shows progress per source without extra work.
- `test-echo` is re-expressed as a skill definition so its tests keep guarding the runtime.

### 2.3 How skills share context

Shared context is **records, not chat history**:

| Context | Record | Read by tool |
|---|---|---|
| The business | confirmed `profileVersions` | `profile.read` (exists) |
| What research found | `sourceReferences`, `referenceAnalyses`, `collections` | `research.read` (new) |
| Approved conclusions | approved `assets` versions with their claims | `assets.readApproved` (new, later skills) |

Every asset version records `derivedFrom: { assetId, version }[]` and `collectionIds`. So an ad copy set (Skill 04) points at the strategy version it came from, the strategy points at the report version, and each report claim points at its source references. Provenance is per version, so it survives edits.

### 2.4 How evidence and artifacts are stored

- **Source reference:** one row per thing the agent found (a page, a video, an ad, a post, an uploaded file, a first-party data file). Stores the URL, platform, author or advertiser, observed date, retrieved time, the adapter that found it, its availability, embed info, and a short excerpt. **No rehosted third-party media.**
- **Raw page text:** stored in Convex file storage as a run artifact for the length of the review window, readable only through an access-checked query, never in logs. Retention period is Decision D7.
- **Reference analysis:** the model's structured reading of one reference (hook, offer, call to action, format, audience hypothesis, relevance), each field labeled Observed or Inferred.
- **Claim:** replaces the meaning of the `evidence` table. Each claim has an evidence label and a list of source references or a computed-value key. Validation rules:

| Label | Must have | Notes |
|---|---|---|
| Observed | at least one source reference in the same workspace | the reference must have been retrieved in this or a cited run |
| Inferred | at least one source reference | shown as "interpretation" in the report |
| Hypothesis | nothing, but must be labeled | goes in Opportunities, Experiments, Risks only |
| First-Party | a reference whose kind is `firstParty` | only these may use performance language |
| Insufficient evidence | nothing | renders as "Not enough data." |

- A **performance-language guard** rejects claims that say an ad or video "converted", "was profitable", "earned", "generated customers" and similar, unless the claim is First-Party. Counts, durations and rankings are computed in code and cited by computed-value key, never written by the model.

### 2.5 How browser and provider integrations operate

Each source is an adapter behind one interface. Adapters run inside Convex actions (Node runtime where an SDK needs it). A run never calls a platform directly.

```ts
type SourceAdapter = {
  id: string;                          // "web.search", "youtube.data", "meta.adLibrary", "url.intake"
  platform: Platform;
  access: "officialApi" | "licensedProvider" | "publicWeb" | "userSupplied";
  capabilities: ("search" | "lookupUrl" | "embed")[];
  requiresConnection: boolean;         // needs a workspace-level key or an Owner's authorization
  limits: { perRunCalls: number; perMinute: number };
  costPerCallCents: number;
  run(input: AdapterInput): Promise<AdapterResult>;
};

type AdapterResult = {
  status: "available" | "partial" | "unavailable" | "awaitingAuthorization";
  reasonCode?: string;                 // "quota_exceeded", "blocked", "no_key", "scope_limited", ...
  limitations: string[];               // plain sentences shown in the board and the report
  items: NormalizedReference[];
};
```

Rules for every adapter:

1. No logins, stored cookies or customer passwords. Credentials, where an official API needs them, are platform keys held as Convex environment variables or OAuth tokens a workspace Owner granted.
2. No CAPTCHA solving, proxy rotation or fingerprint spoofing. A block or challenge stops that source with `unavailable` and a reason.
3. `web.fetch` blocks private and link-local addresses (SSRF), allows `http(s)` only, follows a small number of redirects, caps size and time, and respects `robots.txt`.
4. Every adapter is tested against recorded fixtures. Live calls happen only in the dev validation runs.
5. Everything an adapter returns is untrusted data, wrapped before it reaches a model, and can never trigger a tool.

**Browser use.** Most research (search results, company sites, landing pages) needs only fetch plus text extraction, which runs in a Convex action. Convex cannot run a headless browser. For pages that need JavaScript, the adapter calls a hosted browser service (for example Vercel Sandbox running Playwright, or a hosted browser API). That is an optional adapter, off in the first build, and its choice is Decision D4. It obeys the same rules: public pages only, no evasion.

---

## 3. Growth Architect V1 specification: Market Intelligence

### 3.1 What V1 promises, honestly

A person describes a market. Growth Architect proposes a research plan with a cost estimate, the person confirms it, and the agent searches the sources it is allowed to use. The person watches sources and references arrive, inspects real videos, ads and pages on the Visual Research Board, saves and groups them, and receives a Market Intelligence Report in which every claim is labeled and linked. Coverage gaps are stated, never hidden.

### 3.2 The research experience, step by step

1. **Assignment.** A short brief: objective (free text), market and geography, competitors to include (optional), platforms to look at, optional public URLs to analyze, and depth (Quick or Standard). The confirmed business profile is attached automatically.
2. **Plan (model, `research` work kind, structured output).** Research questions, search queries per source, competitors to check, and what each source can and cannot answer. The plan screen shows **which sources are available, partial, unavailable or awaiting authorization before the run spends anything**, and a cost range.
3. **Confirm.** The run waits (`waiting`) until an Owner or Manager confirms or edits the plan. This is the first human checkpoint and the cost checkpoint.
4. **Discover (fan-out per source and query).** Adapters return normalized references. Duplicates are merged by canonical URL.
5. **Read (fan-out per reference, bounded).** Fetch and extract page text, or video and ad metadata, through the adapter that found it.
6. **Analyze (model, `classify`, schema-validated).** One structured analysis per reference. An invalid result is retried once, then marked "not analyzed", never guessed.
7. **Compute (code).** Counts, frequencies, competitor coverage, date spans, source coverage. Patterns below a minimum sample (Decision D6, proposed 8 references for a pattern, 3 for a competitor summary) are marked Insufficient.
8. **Synthesize (model, `write`, schema-validated).** The 14 report sections as structured claims with labels and reference ids.
9. **Validate (code).** Claim rules from 2.4, performance-language guard, every reference id exists in this workspace, every number matches a computed value. A report that fails is not saved as completed; failing claims are dropped and listed in the run.
10. **Save.** A `marketIntelligenceReport` asset in draft, linked to the assignment and its collection. It appears in Approvals.

A run that hits a cap or a pause keeps everything collected so far, and says what is missing.

### 3.3 Source adapters for V1

| Platform | V1 adapter | What it can do | What it cannot do | Status |
|---|---|---|---|---|
| Web | `web.search` (a search API, Decision D3) plus `web.fetch` | Find and read company sites, landing pages, offers, publications, reviews pages that allow it | Pages behind logins or that block automated access | Build |
| YouTube | `youtube.data` (YouTube Data API v3) plus official iframe embed | Keyword search for videos and Shorts, channel and publish date, public view counts | Ads served on YouTube; daily quota is limited | Build |
| Meta ads | `meta.adLibrary` (official Ad Library API) | Search ads by keyword or page **within the API's scope** | **Verify:** the API returns all ads only for ads delivered in the EU and UK, and political or issue ads elsewhere. US commercial ads are visible on the Ad Library website but not through the API. | Build, with the scope stated on every result |
| TikTok | `url.intake` with TikTok oEmbed | Analyze and embed public TikTok URLs the user supplies | **Verify:** no official keyword search for commercial use. The Research API is for approved academic researchers, and the Commercial Content API covers ads shown in the EU. | Supplied URLs only |
| Instagram | `url.intake` with Instagram oEmbed | Embed supplied public Reels and posts | **Verify:** oEmbed needs a Meta app with oEmbed access. There is no public keyword search. Hashtag search needs a connected Instagram business account and is rate limited. | Supplied URLs only |
| Google ads | none in V1 | Link out to the Ads Transparency Center for a named advertiser | No official API for commercial ads. **Verify** whether a public dataset covers what we need. | Deferred |
| Swipe file | `url.intake` and upload | Anything the user saved or pasted | Proof of performance | Build |
| First-party results | CSV upload with column mapping | The only source that can support performance claims | Live ad accounts (Skill 06) | Build last in V1, or defer (D8) |

The example request in the vision ("B2B cybersecurity consulting in the United States, across TikTok, Instagram, YouTube and Meta") would, in V1, get full web and YouTube coverage, scope-limited Meta coverage, and TikTok and Instagram only through supplied URLs. The plan screen and the report's Scope section must say exactly that. Broad US coverage of TikTok, Instagram and Meta ads needs a licensed ad-intelligence provider (D2).

### 3.4 Visual Research Board

A board per assignment, and a workspace board across assignments.

**Media card** (fields shown only when available, otherwise "Not available from this source"):
platform, creator or advertiser, preview (official embed, or provider-hosted thumbnail, or a text card with excerpt), original link, format, observed publish date or first-seen date, hook, offer, call to action, audience hypothesis (labeled Inferred), relevance to the objective, source status and limitations, evidence label per field.

**Embeds:** YouTube (`youtube-nocookie.com` iframe), TikTok embed, Instagram embed. Meta Ad Library results are link-out cards with the ad's text excerpt, because there is no general embed. Embeds load only after the user opens a card, to keep the board fast and avoid third-party tracking until it is wanted. This needs `frame-src` and `script-src` entries in the content security policy in `next.config.ts`.

**Interactions:** filter (platform, format, hook type, offer type, relevance, source status, saved), save, add a note, group into collections, compare two to four cards side by side, open the source, see why a card is here (which query and adapter found it). Two actions, "Draft a creative brief from selection" and "Draft campaign hypotheses", are shown disabled with "Comes with Creative Production" and "Comes with Campaign Strategy". They record nothing until those skills exist.

**Source status bar** at the top of every board: one chip per adapter with Available, Partial, Unavailable or Awaiting authorization, the count found, and the reason. The board never says "all" or "complete".

### 3.5 Report generation

Report sections, as structured data rendered by the app (not a markdown blob):

1. Executive Summary
2. Research Objective and Scope (which sources ran, which did not, and why)
3. Market Overview
4. Target Audience Analysis
5. Competitor Landscape
6. Offer and Positioning Analysis
7. Advertising Landscape
8. Content and Creative Patterns
9. Observed Customer Language (short attributed quotes only)
10. Strategic Opportunities
11. Risks and Uncertainties
12. Recommended Priorities (ranked, with what to defer)
13. Proposed Experiments (hypothesis, what to measure, what result would change the plan)
14. Sources and Evidence (every reference, with retrieval time and adapter)

Each claim renders its label (Observed, Inferred, Hypothesis, First-Party, Not enough data) and opens its sources in a side panel. Versions, compare, approve and decline with a reason. Export to Markdown in V1, and print-to-PDF through a print stylesheet. A dedicated PDF library is a later choice.

The agent's voice for the report is fixed in the skill's system prompt: direct, skeptical of unsupported claims, prioritized, and willing to say "Not enough data." The philosophical influences guide the reasoning rules, not the tone.

### 3.6 Data models (proposed Convex tables)

All new tables carry `workspaceId` and indexes that start with it.

| Table | Key fields |
|---|---|
| `researchAssignments` | objective, market, geography, platforms[], competitors[], suppliedUrls[], depth, profileVersionId, status (`draft`, `planning`, `awaitingConfirmation`, `running`, `completed`, `stopped`), runId, reportAssetId, createdBy |
| `researchPlans` | assignmentId, version, questions[], queries[] per adapter, estimate { lowCents, highCents }, confirmedBy, confirmedAt |
| `sourceRunStatus` | runId, adapterId, status, reasonCode, itemsFound, callsMade, costCents, limitations[] |
| `sourceReferences` | assignmentId, runId, adapterId, kind (`webPage`, `video`, `ad`, `post`, `upload`, `firstParty`), platform, url, canonicalUrl, author, title, observedPublishedAt, retrievedAt, excerpt (short), embed { provider, id }, thumbnailUrl (provider-hosted), metrics (only what the source publishes, labeled), contentArtifactId, availability |
| `referenceAnalyses` | referenceId, runId, fields { hook, offer, cta, format, audienceHypothesis, relevance } each with label, status (`ok`, `notAnalyzed`) |
| `collections` / `collectionItems` | name, assignmentId (optional), createdBy; item: referenceId, note, addedBy |
| `claims` (evolves `evidence`) | assetVersionId, section, claimKey, statement, label, referenceIds[], computedKey |
| `assets` (changed) | new kinds `marketIntelligenceReport` and later skill kinds; `approvedVersion`, `approvedBy`, `approvedAt`, `declinedReason`; `derivedFrom[]` on `assetVersions` |
| `runSteps` (changed) | `costCents`, `phase`, `adapterId` |
| `agentRuns` (changed) | `inputRef` points at the assignment; `phase` for the progress header |
| `integrations` | workspace connections later (Owner-granted OAuth), and per-workspace adapter switches with the enabling user and time |

Drop `businessProfiles`, `approvalAssets`, `swipeEntries`, `libraryAcceptances` (unused).

### 3.7 Interface components

Routes under `/app/agents/growth-architect`:

| Route | Purpose | Reuses |
|---|---|---|
| `/` Overview | Identity, the six skills (one available, five planned), "New research" input, recent assignments, latest reports | `PageHeader`, `Panel`, `RunList`, `agent-identity` |
| `/research/new` | Brief form, then plan review with source availability and cost range, then confirm | form primitives, `cost-bar` |
| `/research/[id]` | Research Studio: plan, live progress per source, references as they arrive, cost, stop button. Tabs: Progress, Board, Report | `run-viewer`, `step-list`, `cost-bar` |
| `/board` | Workspace-wide Visual Research Board and collections | new `MediaCard`, `SourceStatusBar`, `CompareTray` |
| `/reports` | Reports list (filtered assets) | `asset-row` |
| Report view | Section renderer with claim labels and source panel | `asset-parts` |

Creation Studio, Funnel Studio and Diagnostics appear only as planned skills on the Overview. Rename "Decisions" to "Approvals" in the nav. Move `My day` and `Leads` out of the main nav behind a flag until the Sales Conversion agent (D5).

### 3.8 Approval and usage controls

- Only Owner and Manager start runs and confirm plans (existing rule, kept). Runs refuse to start when the agent is off.
- The report is an internal draft. Approve or decline per version, with the approver stored on the asset.
- No adapter performs an external action. V1 has no publishing, sending, spending or site changes, so the external-action approval table is designed (2.4, `integrations`) but not built.
- Adapters that need a key or an Owner's authorization show "Awaiting authorization" until an Owner enables them in Connections, which is audited.
- Per-skill default caps for Market Intelligence: proposed $3 per run, $15 per day, 150 steps, 20 minutes. This needs the platform ceiling raised (D9). Tool costs count. The plan screen shows the estimate, and the run stops at the cap with what it has.
- Pause, halt, and the time-cap sweep apply unchanged.

### 3.9 Cost estimate for a Standard run (to validate in Phase 1)

| Part | Volume | Rough cost |
|---|---|---|
| Plan | 1 call, about 6k in, 2k out, mid model | about $0.03 |
| Web search | 20 to 30 queries | $0.10 to $0.30 depending on provider |
| Page reading and extraction | 30 to 40 pages, small model summaries, about 8k tokens each | $0.03 to $0.10 |
| Reference analysis | 40 to 80 references, small model, structured | $0.05 to $0.15 |
| YouTube and Meta APIs | quota, no direct fee | $0 |
| Synthesis | 1 to 2 calls, about 60k in, 12k out, strongest model | $0.25 to $0.75 |
| **Total** | | **about $0.50 to $1.50**, more with a hosted browser |

These are estimates from the price table in `convex/lib/modelRouter.ts`, not measurements. Phase 1 replaces them with measured numbers.

---

## 4. Prioritized engineering backlog

Each item is small enough for one reviewed PR. "Validated" means tested in the live dev deployment, not only with fixtures.

### Phase 1: foundation validation (before any research code)

| Id | Task | Depends on | Acceptance | Validation |
|---|---|---|---|---|
| F1 | Fix `memberAction` to require active membership, or delete it. Make `syncCatalog` internal or staff-only. | none | A non-member calling either is refused; tests fail before the fix | unit |
| F2 | `runs.start` refuses when the agent is off or the skill is not available. | none | Test for each case | unit |
| F3 | Drop the four unused tables. Paginate pause and halt cancellation. | none | Schema deploys cleanly; 200 open runs all stop | unit, then dev deploy |
| F4 | Live dev validation: link the Convex dev deployment, set the Clerk issuer, set `ANTHROPIC_API_KEY` and model routes, sign in as Owner, Manager and Rep in two workspaces, run `test-echo` with a real model. Check isolation, caps, pause, halt, cost, approval, asset review, failure codes. Write the results into `docs/growth-architect/01-foundation-validation.md`. | F1 to F3, credentials | Every item in Phase 1 of the vision passes or is listed as a bug | **live** |
| F5 | Catalog: departments, seven agents (one live, six planned), Growth Architect with six skills. Retire old agent rows; old runs still display. | D1 | Rail shows Growth Architect; planned agents are read-only cards | unit, dev |
| F6 | Skill definitions replace `PLAN` (phases, fan-out with bounded concurrency, `waitForUser`). Tools become modules. `test-echo` moves onto it. | F2 | All runtime tests pass unchanged; new tests for fan-out, waiting, resume after confirm | unit, dev |
| F7 | Tool costs on steps and in caps. Per-skill default caps. Raise the platform ceiling. | F6, D9 | A tool cost can stop a run at its cap | unit |
| F8 | Structured model output: system prompt per skill, JSON schema per output, one retry, then a failure code. | F6 | Invalid output never reaches a record | unit with fake provider, one live call |
| F9 | Asset decisions: approve and decline per version with reason, approver stored, archive. Nav "Decisions" becomes "Approvals". | none | Tests; approval of v2 does not approve v3 | unit, dev |
| F10 | Activity page from the audit log (ids, actions, costs, no content). | F4 | Owner sees runs, approvals, pauses, errors | dev |

### Phase 2: Market Intelligence

| Id | Task | Depends on | Acceptance | Validation |
|---|---|---|---|---|
| MI1 | Tables in 3.6 with isolation tests for every new public function. `claims` with labels and the claim validator and performance-language guard. | F6 | Workspace A cannot read B's references, analyses, collections, claims; invalid claims rejected | unit |
| MI2 | `SourceAdapter` interface, fixture harness, request inspector test (no cookies, no credentials, no evasion headers), SSRF-safe `web.fetch` with robots.txt. | MI1 | Blocked page gives `unavailable`; private IP refused | unit |
| MI3 | `web.search` adapter for the chosen provider. | MI2, D3 | Fixtures pass; quota and cost recorded | unit, live small |
| MI4 | `url.intake`: detect platform from a URL, YouTube/TikTok/Instagram oEmbed, Meta Ad Library link cards, plain pages through `web.fetch`. | MI2 | Each platform fixture produces a correct card; unknown URLs become web pages | unit, live small |
| MI5 | `youtube.data` adapter with quota tracking. | MI2, YouTube key | Search returns references with embed ids and publish dates | unit, live small |
| MI6 | `meta.adLibrary` adapter with the scope limitation attached to every result. | MI2, Meta app and token (D2) | Results carry the scope note; missing token gives "Awaiting authorization" | unit, live small |
| MI7 | Assignment form, plan step, plan review with availability and estimate, confirm. | F6, F8, MI3 | A run waits for confirmation and spends nothing before it | dev |
| MI8 | Pipeline: discover, read, analyze, compute, synthesize, validate, save (3.2). | MI3 to MI7 | Full fixture run yields a report with all 14 sections, labeled claims, and no unsupported claim | unit (fixtures in CI) |
| MI9 | Research Studio progress screen: per-source status, references arriving, cost, stop. | MI8 | Live updates without polling; stop works mid-run | dev |
| MI10 | Visual Research Board: cards, lazy embeds, filters, source status bar, CSP update. | MI8 | Phone, tablet, desktop; keyboard; screen reader labels; no embed loads until opened | dev |
| MI11 | Save, notes, collections, compare tray. | MI10 | Collections persist and are workspace-isolated | unit, dev |
| MI12 | Report viewer: section renderer, claim labels, source panel, versions, approve and decline, Markdown export, print stylesheet. | MI8, F9 | Every claim opens its sources; export matches the approved version | dev |
| MI13 | `research.read` tool and `derivedFrom` provenance, ready for Skill 02 and 03. | MI8 | A later skill can read an approved report and its collections only | unit |
| MI14 | Safety tests: injection page changes nothing; no page, ad or model text in audit, events or logs; cap stop saves partial work and states what is missing. | MI8 | All pass | unit |
| MI15 | Live validation: three real assignments in different markets in dev, reviewed by a person against a written quality rubric (accuracy of sources, correct labels, usefulness, honesty about gaps). Record cost and time per run. | all above | Rubric results and measured costs written to `docs/growth-architect/02-mi-validation.md` | **live** |
| MI16 | Product metrics from `events`: research completion rate, source failure rate, time to report, report acceptance, evidence corrections, cost per completed run. | MI8 | Visible to staff | dev |

Optional, after MI15 and only if approved: hosted-browser adapter (D4), licensed ad-intelligence adapter (D2), first-party CSV results (D8).

---

## 5. Risks and open questions

### 5.1 Decisions needed

| Id | Question | Recommendation |
|---|---|---|
| **D1** | Re-shape the catalog to four departments and seven agents, replacing the three areas and the Sales Agent? | Yes, as in 2.1. Keep old rows retired, not deleted. |
| **D2** | Ad libraries: the v2 Step 5 plan scrapes public library pages; the new direction rules out bypassing platform protections. Which wins? | Drop scraping from V1. Use official APIs and supplied URLs, and evaluate a licensed ad-intelligence provider for US commercial ad coverage (contract terms reviewed first, since some providers scrape on our behalf). |
| D3 | Which web search provider? | Pick one with a clear commercial license, per-query pricing and no requirement to show their UI. Compare two on the same fixture queries in MI3. |
| D4 | Hosted browser for JavaScript-heavy pages: which service, and is it needed in V1? | Not in V1. Measure how many pages fail plain fetch during MI15 first. |
| D5 | Hide `My day` and `Leads` from the nav until the Sales Conversion agent? | Yes, behind a flag. Keep the code and its tests. |
| D6 | Minimum sample sizes for patterns and competitor summaries. | 8 references for a pattern, 3 for a competitor summary; tune after MI15. |
| D7 | How long to keep raw page text. | 30 days, then delete; keep references and excerpts. |
| D8 | First-party results (CSV) in V1, or in Skill 06? | Defer to Skill 06 unless early customers ask for it. V1 reports then contain no First-Party claims. |
| D9 | Raise the platform ceiling to allow about $5 per run and $25 per day? | Yes, with Market Intelligence defaults of $3 and $15. |
| D10 | Roles: keep Owner, Manager, Rep? | Keep. Reps read approved reports only. |

### 5.2 Risks

- **Platform research restrictions.** Broad discovery on TikTok, Instagram and US Meta ads is not available through official APIs. V1 will look thinner on those platforms than the vision's example request. Mitigation: say so on the plan screen and in the report; supplied URLs; a licensed provider decision.
- **Embedding limitations.** Embeds can be removed by the creator or blocked by the platform at any time, and each embed loads third-party scripts. Mitigation: lazy embeds, a text fallback card, the original link always shown, CSP limited to the needed hosts.
- **Integration permissions.** Meta and Instagram need a reviewed Meta app; YouTube has daily quotas; app review takes time outside our control. Start the Meta app review during Phase 1.
- **Model and browser costs.** Synthesis on a large context is the main model cost. Mitigation: small models for extraction and classification, the strongest model only for synthesis, per-skill caps, the estimate shown before the run. A hosted browser adds per-minute cost and stays optional.
- **Data protection.** Retrieved pages can contain personal data. Store short excerpts only, delete raw text on schedule, keep content out of logs, add the search and model providers to the subprocessors page.
- **Prompt injection.** Every page is hostile by default. Already enforced for tools; MI14 extends the tests to real adapters.
- **Production reliability.** Convex actions have time limits, so long reads must stay split into steps (fan-out already does this). Adapters fail independently and the report finishes from the rest. Nothing in this plan has run live yet (F4 and MI15 are the gates).
- **Scope pressure.** The seven-agent catalog makes the product look larger than it is. Planned agents stay read-only cards; no skill ships without passing the vision's quality standards.

---

## 6. What happens after approval

1. Answer D1 to D10 (or accept the recommendations).
2. Phase 1 starts with F1, F2 and F3 as one PR, then F4 in the live dev deployment. F4 needs: Convex dev deploy access, Clerk dev keys, and an Anthropic API key, added as Cloud Agent secrets.
3. Phase 2 starts only after the F4 validation report is reviewed.
