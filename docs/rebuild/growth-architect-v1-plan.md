# Growth Architect V1: audit and implementation plan

Date: 2026-11-01. Responds to the "Updated Product Vision" brief (seven-agent Agentic Workforce, Growth Architect first, Market Intelligence as the first skill). The brief asks for this plan before any broad implementation. Nothing here is built yet. Decisions D1 to D5 are settled (Section 5).

Read with: `doctrine-understanding-precedes-advantage.md` (adds tasks 2.18 to 2.20 and changes 2.11 and 2.13 to 2.17), `v2-brief-agents-and-areas.md` (superseded where it conflicts), `step-4-review.md`, `agentic-ui-research.md`.

---

## 1. Current state assessment

Audited on `main` at `2bf3d54`. "Works" means covered by tests that pass and, where stated, checked in a browser. Nothing has run against a live Convex deployment yet (see 1.4).

### 1.1 Works (tested offline)

| Area | What exists | Evidence |
|---|---|---|
| Workspace and roles | Workspaces, members, invitations, Owner / Manager / Rep, staff with expiring grants and MFA, audit log | `guard.test.ts`, `isolation.test.ts`, `staff.test.ts` |
| Isolation | Every public function goes through access builders. Workspace-first indexes. | Guard test fails the build otherwise |
| Agent runtime | Runs advance on the server through the scheduler. Durable steps with idempotency keys. Pause, halt, per-run and per-day cost caps, step and time caps with a platform ceiling. Model router with routes per kind of work, fallback, price table, result codes. Claude via `@anthropic-ai/sdk`. | `runtime.test.ts` (19 tests) |
| Evidence | Claims need a real source record in the same workspace, or a computed flag. | `runtime.test.ts`, `screens.test.ts` |
| Assets | Assets with never-overwritten versions. Approval by Owner or Manager. Editing an approved asset sends it back to draft. | Tests above |
| Business profile | Versioned, draft and confirm, examples with file upload | Tests above |
| Screens | Run viewer (live steps, cost bar, sources panel, artifacts, Stop), Runs list with filters, Decisions queue, Assets library, asset page with evidence and version compare. Story pages at `/dev/run-viewer` and `/dev/asset-viewer`. | 111 tests; Playwright at 320/768/1280 px |

### 1.2 Foundations that exist but are incomplete

- **Model calls are single-shot.** `complete(route, workKind, input)` sends one message and gets text back. There is no tool-use loop, no structured output, and no server tools (web search, web fetch). Market Intelligence needs all three.
- **Skills are hard-coded.** The only runnable skill is the dev `test-echo`. Its three steps live in `runs.ts` as a fixed list. There is no skill interface that a real skill implements.
- **Evidence has one kind of support.** A claim is sourced or computed. The brief needs five: observed, inferred, hypothesis, first-party, insufficient.
- **Sources panel is a placeholder.** The UI is built, but nothing produces per-source status yet.
- **Refused or billed-but-failed model calls** are not counted in cost. *Fixed in Phase 1 (1.6).*
- **Server-side check for approving an asset whose source is missing** is not enforced (the screen blocks it). *Fixed in Phase 1 (1.6).*

### 1.3 Placeholders and leftovers

- **Catalog** seeds three areas (Sales, Retention, Operations) with one agent each (`convex/catalog.ts`). The brief now has four departments and seven agents, with Growth Architect first.
- **Lead data spine** (people, leads, calls, conversations, imports, merges). Built for the old plan, paused since v2. It belongs to the future Sales Conversion Agent. The Leads and My day tabs still show in the nav.
- **Four unused tables:** `businessProfiles`, `approvalAssets`, `swipeEntries`, `libraryAcceptances`. No code reads them.
- **`grok-step-5-ad-research-prompt.md`** planned scraping public ad-library pages. The new brief says not to bypass access restrictions, so that plan is superseded (see decision D1).

### 1.4 Live environment: blocked (resolved in Phase 1)

Update 2026-11-01: the environment now holds a dev deploy key, and Phase 1 ran on the dev deployment. Results are in `phase-1-results.md`.

- The `CONVEX_DEPLOY_KEY` in this cloud environment is a **production** key (prefix `prod:`), and Convex rejected it as invalid. Nothing was run against it. Phase 1 needs a **development** deploy key from the dev deployment (Convex dashboard, dev deployment, Settings, Deploy keys), stored under the same name. A production key should not live in this environment.
- `ANTHROPIC_API_KEY` and `ALLOW_DEV_SKILLS=true` need to be set on the Convex **dev** deployment.

---

## 2. Architecture proposal

### 2.1 The seven-agent workforce in data

Replace the three-area catalog with departments and agents. Only Growth Architect is live. The rest exist as rows so the workforce, the rail and the "coming later" page come from data, not code.

| Department | Agent | V1 status |
|---|---|---|
| Growth and Marketing | 01 Growth Architect | **live** |
| Growth and Marketing | 02 Campaign Execution | planned |
| Sales | 03 Sales Conversion | planned |
| Customer Success | 04 Activation | planned |
| Customer Success | 05 Retention | planned |
| Customer Success | 06 Expansion | planned |
| Operations | 07 Operations Intelligence | planned |

- `departments` (replaces `areas`): slug, name, sort.
- `agents`: add `status: "live" | "planned"` and `lifecycle` (short text). A planned agent cannot start runs, enforced in `runs.start`.
- `skills`: Growth Architect's six skills. Only Market Intelligence becomes `available` in V1.
- **Migration:** the area union changes. Production has been receiving schema pushes from the Vercel build, so widen first (accept old and new values), backfill with a migration, then narrow. The agent slug `sales` becomes `growth-architect`; runs, caps and counters that reference `sales` are backfilled in the same migration.
- **Nav:** Overview (today's Decisions), Growth Architect, Projects, Reports, Assets, Approvals, Activity (runs), Settings. Leads and My day are hidden until the Sales Conversion Agent. Their code stays.

### 2.2 How Growth Architect fits the runtime

The runtime stays. Three additions make it able to do real research:

1. **Skill definitions.** A skill becomes a module that exports its declared tools, its steps (a small state machine over `prepare` / `commit`), its caps and its output schema. `runs.ts` asks the skill for the next step instead of reading a fixed list. `test-echo` becomes the first module; Market Intelligence is the second.
2. **Tool-using model steps.** The router gains `completeWithTools(route, workKind, request)`. It runs inside the step action, supports Claude's server tools (web search, web fetch) and our own client tools, and returns content blocks, citations, usage and server-tool counts. Cost adds search fees ($10 per 1,000 searches, confirm at build time) to token cost. Each search and fetch is recorded as a step with a code, never with page text.
3. **Structured output.** Classification and report writing use a JSON schema (`output_config.format`). Invalid output is retried once, then marked failed, never guessed.

Untrusted content rules stay: fetched pages and posts are data. They go into artifacts and into the model wrapped and labeled. They can never add a tool the skill did not declare.

### 2.3 How skills share context

Every Growth Architect skill reads the same workspace records:

- **Confirmed business profile** (exists).
- **Research projects** and their **source references** and **collections** (new).
- **Approved reports and strategies** (assets, exists).

Skill 02 onward takes inputs as ids of approved assets and collections, never as pasted text. That keeps the chain from source to research claim to strategy to asset intact.

### 2.4 Evidence and provenance

- `sourceRefs` (new): one row per thing the agent found (page, video, ad, post). Platform, kind, URL, canonical URL, title, publisher or creator, published date if known, observed date, embed provider and id, availability, a short excerpt (300 characters or less, attributed), and classified fields (hook, offer, call to action, format, audience hypothesis), each marked as a model classification.
- `evidence` gains `basis: observed | inferred | hypothesis | firstParty | insufficient` and `sourceRefIds`. The validator rules:
  - **observed** needs at least one `sourceRef` in the same workspace.
  - **inferred** needs at least one supporting `sourceRef` and is labeled as inference.
  - **hypothesis** needs no source and is always labeled as untested.
  - **firstParty** needs a customer-data source (CSV upload now, connected accounts later).
  - **insufficient** is the "Not enough data" line and carries no claim.
- Reports never contain a number the model made up. Counts and dates come from code over `sourceRefs`.
- Provenance chain: asset version, then evidence, then `sourceRef`, then artifact (raw fetch). Each link is an id, kept across versions.

### 2.5 Source adapters

Each source is an adapter behind one interface with a typed result and an explicit status: available, partial, unavailable, or awaiting authorization. No adapter logs in, stores cookies, solves challenges, rotates proxies or retries around a block.

| Source | Discovery in V1 | Viewing in the board | Notes |
|---|---|---|---|
| Web | Claude web search and web fetch | Link, title, excerpt | Official. Domain allow and block lists per run. |
| YouTube | YouTube Data API search | Official iframe embed | Official. Default quota is about 100 searches a day for the whole app, so it needs a quota increase before launch. |
| TikTok | URLs found by web search or supplied by the user | Official oEmbed embed | No general search API. The Commercial Content API is for approved researchers and covers mostly European ads. |
| Instagram | URLs found by web search or supplied by the user. V1.1: hashtag search through the customer's own Business account | oEmbed (needs a Meta app with oEmbed Read approval) | Hashtag search needs app review and allows 30 hashtags per rolling 7 days per account. |
| Meta Ad Library | Link-outs and user-supplied ad URLs. Official API where it applies (political ads, and EU/UK commercial ads) | Link card, no rehosting | Commercial ads outside the EU/UK have no official API. |
| Customer data | CSV upload of past results | Table | The only source that can support a firstParty claim. |

Where broad discovery is not available, the agent says so in the report's limits section and in the source status, and offers what is supported: "Paste the links you want analyzed."

---

## 3. Growth Architect V1 specification: Market Intelligence

### 3.1 The flow

1. **Assignment.** The user writes the objective in plain words and confirms the scope: market, geography, competitors to include, and platforms. A preview shows what will be searched, which sources are available, and the estimated cost. Owner or Manager starts it.
2. **Plan step** (model, structured output): research questions, queries per source, competitors to look up. Saved as an artifact and shown to the user.
3. **Collect steps** (one per source adapter): results become `sourceRefs`, with live per-source status.
4. **Classify step** (model, structured output, batched): each reference gets hook, offer, call to action, format and audience hypothesis, labeled as classifications.
5. **Compute step** (code): counts, groupings, dates and the minimum-sample checks. Below the threshold, a pattern reads "Not enough data".
6. **Write step** (model, structured output): the report. Every claim carries a basis and source ids. The validator drops or flags any claim that breaks the rules. The report's required shape is locked in `doctrine-understanding-precedes-advantage.md` (D7, D9): three actionable opportunities, each with evidence, business relevance, a proposed action and a validation method. Where an older brief lists a different report shape, the doctrine wins.
7. **Save:** a `marketReport` asset in draft, the project's board populated, and the run complete. The report waits in Approvals.

### 3.2 Screens

| Screen | Route | Built from |
|---|---|---|
| Growth Architect overview | `/app/growth` | Agent identity, six skills (one available), new assignment, recent projects, reports |
| New assignment | `/app/growth/research/new` | Form, source availability, cost preview |
| Research Studio | `/app/growth/research/[id]` | Run viewer parts (steps, cost, sources panel), research plan, live source feed |
| Visual Research Board | `/app/growth/research/[id]/board` | Media cards with official embeds or link cards, filters, save, collections, compare two |
| Report | `/app/assets/[id]` (extended) | Sections, claim basis badges, sources, version compare, Approve |

Media card fields follow the brief: platform, creator or advertiser, embed or preview, source link, format, observed date, hook, offer, call to action, audience hypothesis, relevance, and limitations. We only use official embeds and links. We never download or rehost third-party media.

### 3.3 New data

| Table | Purpose |
|---|---|
| `researchProjects` | Objective, scope, platforms, geography, status, latest run, confirmed-profile version |
| `sourceRefs` | Section 2.4 |
| `sourceStatus` | Per run and source: status plus reason code |
| `collections`, `collectionItems` | Saved groups of references, owned by a person or the workspace |
| `departments` | Section 2.1 |

Changes: `agents.status`, `agents.lifecycle`, `evidence.basis`, `evidence.sourceRefIds`, and a new asset kind `marketReport`.

### 3.4 Caps for research

Research runs cost far more than the test skill. A rough estimate for one Market Intelligence run, to be measured in Phase 1:

- About 20 to 40 web searches: $0.20 to $0.40.
- About 150k to 300k input tokens and 15k to 30k output tokens. On Claude Opus 5.5 ($4 / $20 per million) that is about $0.90 to $1.80. On Sonnet 5.5 ($2 / $10 per million) it is about half that.
- **Total: about $1 to $2.50 per run.**

Today's defaults (25¢ per run, $2 a day, 1 hour ceiling) would stop every research run. Proposed for Market Intelligence: **$3 per run, $25 a day per workspace**, platform ceiling raised to $10 per run and $100 a day. These are set per skill, so the test skill keeps its small cap.

---

## 4. Prioritized backlog

Each task ends with tests that pass, and on Phase 1 onward a check on the live dev deployment. "Done" never means "the screen exists" or "it works with mocks".

### Phase 1: foundation validation (done 2026-11-01, see `phase-1-results.md`)

| # | Task | Acceptance |
|---|---|---|
| 1.1 | Replace the production key with a dev deploy key in the environment. Set `ANTHROPIC_API_KEY` and `ALLOW_DEV_SKILLS` on the dev deployment. | `npx convex function-spec` lists dev functions |
| 1.2 | Push schema and functions to dev | Deploy succeeds. No production deploy. |
| 1.3 | Run `test-echo` end to end on dev with the fake route | Run completes on its own. Run viewer, Decisions and the asset page show it live. |
| 1.4 | One real Claude call on dev | Cost recorded from usage and the price table. Model name not shown to workspace users. |
| 1.5 | Pause, halt, caps, Stop, and a second workspace, all on dev | Each behaves as the tests say |
| 1.6 | Close the two Step 4 gaps: server-side approval check for missing sources, cost of refused calls | Tests for both |

### Phase 2: Growth Architect V1 (Market Intelligence)

| # | Task | Depends | Acceptance |
|---|---|---|---|
| 2.1 | Departments and seven agents in the catalog, with the widen, backfill and narrow migration. Rename `sales` to `growth-architect`. Hide Leads and My day. | 1.2 | Rail shows Growth Architect. Planned agents cannot start runs. Migration test on seeded old data. |
| 2.2 | Drop the four unused tables | 2.1 | Schema push on dev succeeds |
| 2.3 | Skill module interface. Move `test-echo` onto it. | 1.3 | All runtime tests pass unchanged |
| 2.4 | `completeWithTools`: server tools, client tools, structured output, search fees in cost | 2.3 | Fake provider tests, plus one live call on dev |
| 2.5 | Evidence basis and the new validator rules | 2.3 | One test per basis rule |
| 2.6 | `researchProjects`, `sourceRefs`, `sourceStatus`, `collections` with access tests | 2.1 | Isolation tests for every new table |
| 2.7 | Web adapter (Claude web search and fetch) | 2.4, 2.6 | Fixture tests, plus a live dev run with a small search cap |
| 2.8 | YouTube adapter (Data API, embeds) | 2.6 | Needs an API key. Quota errors become `unavailable` with a reason. |
| 2.9 | TikTok and Instagram URL adapters (oEmbed) | 2.6 | Bad or private URLs become `unavailable`. No scraping. |
| 2.10 | Meta Ad Library link adapter, plus the official API where it applies | 2.6 | Statuses are honest about coverage |
| 2.11 | Market Intelligence skill: plan, collect, classify, compute, prioritize, write, check. Report shape and the eight checks are locked in the doctrine (D7, D9). | 2.4–2.10, 2.18 | Full fixture run, including a run that can support only two opportunities, then one live run on dev |
| 2.12 | Per-skill caps (Section 3.4) | 2.3 | Cap tests per skill |
| 2.13 | Screens: overview, new assignment, Research Studio | 2.11 | Story pages, then live on dev |
| 2.14 | Visual Research Board with collections and compare | 2.11 | Story page, live on dev, 320 px, keyboard |
| 2.15 | Report view with basis badges and export (PDF or Markdown) | 2.11 | Every claim shows its basis and its sources |
| 2.16 | Injection test: a fetched page that says "ignore instructions" changes nothing | 2.11 | Test |
| 2.17 | End-to-end acceptance on dev against the brief's quality standards (Section 16) | all | Recorded run with cost, sources and report |

Phase 3 onward (Offer Intelligence, Campaign Strategy, Creative Production, Funnel Architect, Growth Diagnostics) gets its own plan once V1 passes 2.17.

---

## 5. Risks and open questions

### Decisions (made 2026-11-01)

- **D1. Ad-library scraping: dropped.** Research uses official APIs, official embeds, Claude web search and links users paste in. `grok-step-5-ad-research-prompt.md` is superseded on this point.
- **D2. Research model: Claude Opus 5.5 for every step to start.** Phase 1 measures real cost. If quality holds, bulk steps (search planning, classification) move to Sonnet 5.5 through the model routes, with no code change.
- **D3. Research caps: $3 per run and $25 a day per workspace** for Market Intelligence, set per skill. The platform ceiling rises to $10 per run and $100 a day. The test skill keeps its small caps.
- **D4. Platform accounts: owned by the business, applied for now.** Setup steps are in `platform-accounts-setup.md`. Meta review takes weeks, so it starts in parallel with Phase 1.
- **D5. Roles: unchanged for V1** (Owner, Manager, Rep). Revisit before launch.

### Decisions (locked 2026-11-04)

Locked in `doctrine-understanding-precedes-advantage.md`. The backlog tasks there (2.18 to 2.20, and the changes to 2.11 and 2.19) are part of this plan.

- **D6. Business facts have their own table**, `businessFacts`. The profile stays identity and configuration. A fact an agent writes stays unverified until a person verifies it. Replacing a fact keeps the old row as superseded.
- **D7. The first release is the research report**, with three actionable opportunities. Creative Production is a later skill. It starts from the approved report, has its own $3 cap, and shows its estimated cost before it starts.
- **D8. The run asks, then waits.** It asks only when a gap would change the result or make the task unreliable. After seven days with no answer it becomes Needs Input — Timed Out, and the user can resume it. The scheduled timeout changes the run only when it is still waiting on the same question.
- **D9. Eight completion checks, one revision, then Needs Review.** A 50¢ reserve pays for the check and the revision. A call that would pass its allowance does not start. A missing opportunity is reported, not invented.

### Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Platform coverage is thinner than the brief imagines (TikTok and Instagram search, Meta commercial ads outside the EU/UK) | The board shows fewer videos and ads than users expect | Honest per-source status. "Paste links to analyze." Official APIs in V1.1 where available. |
| Web search finds pages about videos, not the videos | Board relevance drops | Prefer YouTube's API. Ask for supplied URLs. Measure relevance in Phase 2. |
| Cost per run is higher than estimated | Margins, or caps stopping runs | Measure in Phase 1. Per-skill caps. Sonnet for bulk steps. |
| Embeds break or are removed | Empty cards | Cards always keep the source link and the saved excerpt. Status shows "no longer available". |
| Prompt injection through fetched pages | Agent misbehaves | Already contained (declared tools only, wrapped content). Add an injection test per adapter. |
| Production key in the dev environment | Accidental production changes | Replace with a dev key (1.1). Production deploys only through Vercel. |
| Data protection (stored excerpts, customer CSVs) | Legal exposure | Short attributed excerpts only. No media rehosting. CSVs keep totals and no personal data. |
| Model output fails the schema | Failed runs | Retry once, then fail cleanly with a code. Count it in metrics. |

### Sources checked for Section 2.5

- Instagram hashtag search limits and review: [Meta, Hashtag Search](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/hashtag-search)
- TikTok Commercial Content API: [TikTok for Developers](https://developers.tiktok.com/products/commercial-content-api), [TikTok newsroom, 2023](https://newsroom.tiktok.com/tiktoks-research-api-and-commercial-content-library?lang=en-GB)
- YouTube Data API quota: [Google, quota costs](https://developers.google.com/youtube/v3/determine_quota_cost)
- Claude web search pricing: [Claude pricing docs](https://docs.claude.com/ko/docs/about-claude/pricing)

Third-party write-ups conflicted on some details (TikTok eligibility, YouTube per-call cost). Each is marked "confirm at build time" in the backlog task that depends on it.
