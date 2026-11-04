# Phase 2 progress: Growth Architect V1

Tracks the Phase 2 backlog in `growth-architect-v1-plan.md`. Everything here was checked on the Convex **dev** deployment. Nothing was run on production.

| # | Task | State |
|---|---|---|
| 2.1 | Departments and seven agents, `sales` renamed to `growth-architect`, Leads and My day hidden | Done on dev. Production needs the migration below. |
| 2.2 | Drop the four unused tables | Done. Pushed to dev. |
| 2.3 | Skill module interface, `test-echo` moved onto it | Done. Pushed to dev. |
| 2.4 | `completeWithTools`: server tools, client tools, structured output, search fees | Done. Live call on dev. |
| 2.5 | Evidence basis and the new validator rules | Done. Checked on dev. |
| 2.6 | `researchProjects`, `sourceRefs`, `sourceStatus`, `collections`, `collectionItems`, asset kind `marketReport` | Done. Checked on dev. |
| 2.12 | Per-skill caps | Done. Checked on dev. |
| 2.7 | Web adapter (Claude web search and fetch) | Done. Live on dev. |
| 2.8 | YouTube adapter (Data API, embeds) | Done, tested on fixtures. Live search waits on `YOUTUBE_API_KEY` on dev. |
| 2.9 | TikTok and Instagram URL adapters (oEmbed) | Done. TikTok live on dev. Instagram waits on Meta's oEmbed Read approval. |
| 2.10 | Meta Ad Library links, plus the official API in the EU and UK | Done, tested on fixtures. Live API call waits on a fresh `META_AD_LIBRARY_TOKEN`. |
| 2.18 | Business facts (doctrine D6) | Done. Checked on dev. |
| 2.20 | Feedback: reject or request a revision with a reason, promote to a fact | Done. Checked on dev. CSV results uploads are still to come. |
| 2.11 | Market Intelligence: brief, plan, research, collect, classify, compute, prioritize, write, check | Built and tested offline on the fake provider. Not yet run live on dev. |
| 2.19 | Ask, wait, answer, seven-day timeout, resume (doctrine D8) | Built and tested offline. Not yet run live on dev. |

## 2.1 Departments and the seven agents

**What changed**

- Four departments (Growth and Marketing, Sales, Customer Success, Operations) and seven numbered agents. Growth Architect is the only live agent. Its six skills are listed and all marked coming soon until each is built.
- `runs.start` refuses a planned agent ("Retention is not available yet.") and an agent that is off. `setAgentState` refuses to turn on a planned agent. An older client that still sends `sales` is mapped to `growth-architect`.
- The rail groups agents by department and shows planned agents as Planned. The top strip shows live agents only. Leads and My day are hidden from the nav (their pages stay for the Sales Conversion agent). Runs is labelled Activity.
- The connections page no longer promises public ad libraries (decision D1).

**Schema: widen only.** `departments` is new. Agents gain optional `department`, `number`, `status` and `lifecycle`, and `stage` becomes optional. The old `area` field and `areas` table stay until the migration has run on every deployment. Dropping them is a later, separate push.

**The rename keeps ids.** The catalog sync renames the `sales` agent row in place, so every workspace's on/off link to it still applies. Retired rows (the old Operations Agent) are rewritten without the old fields.

**Checked on dev**

| Check | Result |
|---|---|
| Migration | Before: 1 old agent row, 37 runs, 1 cap row, 2 day counters, 3 old-shape agent rows. After: all zero. |
| Migrated workspace | Growth Architect still on (the link survived). 31 runs listed under `growth-architect`. Caps kept. |
| Planned agent | Turning on Retention and starting a run on it are both refused. |
| Agent off | Workspace B's start is refused with "Turn on the Growth Architect first." |
| Old slug | A run started with `sales` ran on Opus and was stored as `growth-architect`. |
| Screens | Rail shows the four departments and seven agents. No Leads or My day. No sideways scroll at 320 px. |

Tests: 132 pass, including a migration test on seeded old-shape data (rename in place, links kept, caps kept, same-day counters added together, a second run changes nothing).

## 2.2 The four unused tables

`businessProfiles`, `approvalAssets`, `swipeEntries` and `libraryAcceptances` are gone from the schema. No code read them, and they were empty on dev.

Production could not be read from here, so the case with data was tested on dev. One row was added to `swipeEntries`, then the schema was pushed without the table. The push **succeeded**. Convex dropped the table's index and left the row in place, outside the schema. The row was then cleared from dev. So the production push cannot fail on these tables, and any old rows there stay untouched until someone clears them on purpose.

## 2.3 Skill modules

A skill is now a module (`convex/skills/types.ts`) that declares its tools, what it hands back, and an async `nextStep` that picks the next step from the steps already taken. It gets read-only database access. `runs.ts` asks the skill for each step instead of reading a fixed list, and uses the skill's work kind for the route and the skill's output for the asset. The runtime still owns every stop check, the idempotent commit, and cost. `convex/lib/skills.ts` lists the runnable skills. A dev-only skill exists only while `ALLOW_DEV_SKILLS` is on, and a run whose dev skill is switched off midway fails with `skill_unavailable`.

Acceptance: all 132 existing tests pass with no test changed. Three new tests cover the lookup, the step sequence and the mid-run switch-off. A live `test-echo` run on dev completed through the module path (Opus, 39 in / 389 out, 0.7936¢).

## 2.4 Model calls with tools

`convex/lib/toolRouter.ts` adds `completeWithTools(route, workKind, request)`.

- **Server tools:** `web_search_20260209` and `web_fetch_20260209`, each with `max_uses` and allowed or blocked domains.
- **Client tools:** our own tools run inside the action. Only declared tools run; a made-up tool name gets an error result. A failing tool reports "The tool failed." with no detail.
- **Structured output:** `output_config.format` with a JSON schema. Output that does not parse is retried once, then fails with `invalid_output`.
- **Turns:** a `pause_turn` is resumed by sending the turn back. At most 8 turns, then the call fails with `too_many_turns`.
- **Cost:** every response is counted, including refused, truncated and failed ones. That covers input, output and cache tokens at the model's rates, plus **1¢ per web search** ($10 per 1,000). Web fetch has no fee; fetched pages count as input tokens.
- **Fallback:** the same contract as `complete`. The fallback route takes over on retryable failures, carrying what was already spent.
- **Testing:** the network call is injectable, so tests drive the loop with scripted responses. The fake provider uses the same loop.

**In the runtime**, a skill's model step can set `webSearch`, `webFetch`, `outputSchema` and `system`. Using a web tool requires the skill to declare `web.search` or `web.fetch`, the same rule as every other tool. The step row keeps `webSearches` and `webFetches` (counts only). The answer is saved as the model record, and the sources found (URL, title, page age, short cited lines) are saved as a separate `sources` record.

**Checked live on dev** with the dev-only `test-research` skill. It reads the confirmed profile, then makes one research step with web search (at most 2) and a JSON schema. Results:

| | |
|---|---|
| Result | Completed. Valid JSON: three real Austin deep-cleaning competitors with their sites. Web search and structured output work together on Opus 5.5. |
| Step | 16,032 ms, 25,472 in / 470 out tokens, 1 search, 0 fetches |
| Cost | 12.1288¢ = 11.1288¢ tokens (Opus $4 / $20) + 1¢ search |
| Sources record | 9 search results, each with title and page age |
| Model name | Not in any workspace-facing response |

**Cost finding for Market Intelligence.** One search brought in about **25k input tokens (about 10¢ on Opus)**, ten times the 1¢ search fee. The plan's estimate (20 to 40 searches, 150k to 300k input tokens, $1 to $2.50 a run) is too low if every search lands in context like this. At this rate 20 searches cost about $2 in tokens alone. Before 2.11: lean on `max_uses`, run the collect steps on Sonnet 5.5 (D2 allows it), and measure again. The $3 per-run cap (D3) may be tight.

## Milestone B: source adapters (2.7 to 2.10)

**State: done.** Built, tested on fixtures, and run live on the dev deployment `calm-spider-678` on 2026-11-04. Three live paths wait on accounts, not code (see "Waiting on accounts").

### How it fits the runtime

- **Adapters** live in `convex/adapters/`. Each one takes the project scope, the web tools' results from this run, and the links the project already holds, and returns a typed result: `state` (available, partial, unavailable, awaitingAuthorization), a `reasonCode`, a plain `limitation`, and the sources. The network and settings are passed in, so tests use fixtures.
- No adapter logs in, keeps cookies, solves challenges, rotates proxies or retries around a block. `runAdapter` never throws: anything unexpected reads as `unavailable / adapter_error` with no detail kept.
- **Collect steps.** Five new tools, `source.web`, `source.youtube`, `source.tiktok`, `source.instagram` and `source.metaAdLibrary`, are declared by a skill like any other tool. They run in the step action, where the network is. `commitCollect` then saves, in one mutation with the step marker:
  - the adapter's result as the raw record;
  - each source on the project, the same page once;
  - the adapter's status for the run.
  An adapter that could not reach its source still completes its step. The status says why, and the run goes on.
- **Runs on a project.** `runs.start` takes an optional `projectId` from the same workspace. Starting a run locks the project's scope and sets `latestRunId`. An archived project cannot run, and a project with an open run cannot be archived. A collect step on a run with no project fails with `no_project`.
- **Later checks fill gaps.** When a step finds a page already saved, it adds what is missing and never overwrites. For example, a TikTok link the web search found gains its embed when oEmbed confirms it.
- **Failed tool steps record the tool**, so the run page can say which step failed.
- `test-sources` (dev only) runs one web search (at most 2), then every adapter. Market Intelligence (2.11) will use the same tools with its own plan.

### The adapters

| Adapter | Discovery | Shown as | Honest statuses |
|---|---|---|---|
| Web (2.7) | Claude web search in the model step (`maxUses`, domain lists). The adapter keeps links, titles, dates and cited lines, and sorts each link onto its platform. | Link card with excerpt | `no_search_step`, `unreadable_results`, `no_results` |
| YouTube (2.8) | Data API `search.list`, at most 2 searches a run (100 quota units each), plus pasted links | Official iframe embed from the video id | `not_configured`, `quota_exceeded` (never "no videos"), `key_rejected`, `connection_failed` |
| TikTok (2.9) | Links pasted in or found by web search. Only video links are sent to TikTok's oEmbed. | Official embed once oEmbed confirms it | Profile and topic pages stay links ("not a video"). A refused video is kept as unavailable. With no links: "Paste the TikTok links you want analyzed." |
| Instagram (2.9) | Links pasted in or found. Posts and reels go to Meta's `instagram_oembed` (Graph v25.0). The app token travels in a header, never in a URL. | Embed after approval, link card until then | `not_configured`, `oembed_not_approved`, `token_rejected`. Profiles stay links ("not a post"). |
| Meta Ad Library (2.10) | Pasted Ad Library links. The official `ads_archive` API only where it covers commercial ads (EU and UK, found by country or city name, never a two-letter code: "DE" is also Delaware). | Link card rebuilt from the ad id. `ad_snapshot_url` carries the token, so it is never requested or stored. | `commercial_outside_eu_uk`, `not_configured`, `token_rejected`, `access_not_granted`, `rate_limited` |

Graph API version: `v25.0` (supported until July 2028), changeable with the `META_GRAPH_VERSION` setting.

### Tests

191 pass, 21 of them new:
- 16 adapter fixture tests (`convex/adapters/adapters.test.ts`). They cover link parsing, every status above, partial results, and that no key appears in any result, link, reason or title.
- 5 runtime tests (`convex/collect.test.ts`):
  - a full run saves sources and one status per platform;
  - a second run adds no duplicates;
  - gap filling;
  - another workspace's project and a Rep are both refused;
  - the archive rules.

### Checked live on dev

The `research` route on dev was set to Opus 5.5, with Sonnet 5.5 as fallback, by a test Platform Admin.

| Run | Result |
|---|---|
| Austin, TX (5 platforms, 3 pasted links) | Completed, 15.6¢ (2 searches, 28.6k in / 1.1k out). Web: 14 pages kept. TikTok: 2 videos confirmed with embeds; 2 profile pages kept as links. YouTube: 2 videos with embeds (pasted and found), status `not_configured`. Instagram: `awaitingAuthorization / oembed_not_approved`. Meta: `unavailable / commercial_outside_eu_uk`. |
| London, UK (web and Meta) | Completed, 19.8¢. Web: 19 found, including 4 YouTube videos with embeds. Meta: the official API was called and answered `token_rejected`, shown as `awaitingAuthorization`. |

The first live run showed TikTok profile and topic pages being sent to oEmbed and marked "private or removed". The adapters now send only video and post links to oEmbed; the rerun above shows the fix.

**Cost note for 2.11:** each 2-search step cost 15 to 20¢, almost all of it input tokens (search results in context). That matches the 2.4 finding.

### Waiting on accounts (no code needed)

1. **`YOUTUBE_API_KEY`** in the Convex dev (and later production) environment variables. Without it YouTube shows pasted and found videos and says search is not set up.
2. **`META_AD_LIBRARY_TOKEN`**: the one on dev is rejected (expired or revoked). It needs a new long-lived token, and Ad Library API access (identity check and terms) on the business's Meta account.
3. **Instagram oEmbed Read** approval on the business's Meta app (`META_APP_ID` / `META_APP_SECRET` are set).

## 2.11 Market Intelligence and 2.19 ask, pause, resume

**State: built, tested offline.** These follow doctrine sections 3.2 to 3.4 and decisions D7 to D9. This environment has no deploy key and no Anthropic key, so nothing here has run against a real model yet. The skill is registered and runs through `runs.start` with a project. The catalog still shows it as coming soon until the Research Studio screens (2.13) give a way to pick a project.

### The skill (`convex/skills/marketIntelligence.ts`, `convex/lib/marketReport.ts`)

1. **Ask (only if needed).** Before anything else, it checks the two declared gaps: the market, and the area. It asks only when the project, the confirmed profile and the live facts all leave one empty. The questions are worded in code (`MARKET_ASKS`), so the model can never add one.
2. **Brief.** Built in code and saved as the run's `brief` artifact before collection starts. It holds the objective, the deliverable, the market and area, what is known (each profile field and live fact, with its origin, status and date), what is missing, and the assumptions. A missing ad budget does not block a run; it becomes the assumption "Budget not provided; recommendations do not depend on a budget figure."
3. **Plan.** A small `classify` step that returns up to three questions and four search queries.
4. **Research.** One `research` step with at most three web searches.
5. **Collect.** `source.web` always, then each other adapter only for a platform the project lists.
6. **Classify.** Each source's theme, offer and hook, citing source ids exactly.
7. **Compute.** Counts by platform and by theme, done in code. They are saved as observed, computed claims that cite the sources counted.
8. **Prioritize.** Up to three opportunities, each with the five fields: opportunity, evidence (basis plus source ids), business relevance (naming the profile fields or fact ids it uses), proposed action, and validation method. Source ids the project does not hold are dropped. An opportunity left with no sources becomes a hypothesis. Fewer than three must come with a reason.
9. **Write.** A summary and up to eight observations. It cannot add opportunities.
10. **Save, then check.** `asset.create` saves a draft `marketReport`. Every claim is screened again as it is saved, and the structured report is kept as a `report` artifact.

### The completion check

The eight checks from doctrine 3.4 run in code over the structured report: objective and context use, the context list, three opportunities with distinct actions, `screenClaims`, a basis on every claim, every non-available source named in the limits, the required structure, and cost within the cap. If any check fails, the run gets **one revision**:

- The revision may use only sources already collected. It cannot search.
- It cannot add an untested opportunity to reach three (`keepSupported`).
- Then `asset.addVersion` saves it and the checks run again.

If the checks still fail, or the reserve cannot pay for the revision, the draft is kept as **Needs Review** with the failed checks in plain words. `runs.get` returns them as `completion`.

### Runtime changes (`convex/runs.ts`)

- **New step kinds:** `ask`, `check` and `brief`, each recorded as a note step. A skill with a check can finish as passed only if its latest check passed.
- **Budget reserve:** a skill can declare `reserveCents`; Market Intelligence keeps back 50¢. Before every model call the runtime estimates the worst case (`convex/lib/estimate.ts`): prompt, output room, and searches priced at the dearer of the two models. A call that does not fit its allowance does not start, and the runtime records `budget_skip` instead. Only the revision may spend the reserve.
- **Questions:** `ask` sets the run to `waiting` with `waitingFor`, and schedules `timeoutQuestion` for seven days later. While a run waits it makes no calls, and the wait does not count toward the time cap (`waitedMs`). `answer` saves a verified owner fact and resumes the run.
- **Timeout:** `timeoutQuestion` changes the run only if it still waits on that same question. The run then becomes `needsInput` (timed out), with everything kept. `resume` asks the same question again, with a new id and a new seven days.
- **Starting runs:** a project cannot start a second run while one is open or waiting. Once that run has timed out, a new run is allowed. Market Intelligence needs a project to start.
- **Expiry:** `expire` now leaves waiting runs alone and reschedules itself for the active time left.

### Run viewer

- The status reads **Waiting for User** or **Needs Input — Timed Out**.
- A question panel lets an Owner or Manager answer the question, or resume after a timeout.
- A completion panel lists the failed checks first, with a **Needs Review** badge and the skipped-revision note when it applies.
- The story page (`/dev/run-viewer`) has all three states.

### Tests and checks

- 220 pass. New tests:
  - `convex/marketIntelligence.test.ts`: 9 full runs on scripted fake models (`fake-market`, `fake-market-two`, `fake-market-dup`).
  - `convex/lib/marketReport.test.ts`: each check failing on its own fault, the revision guard, and the reserve allowance.
- The full runs cover:
  - three opportunities passing all eight checks;
  - two opportunities ending as Needs Review with no third invented;
  - one revision fixing a duplicate action;
  - the revision skipped for budget;
  - ask, wait past the time cap and answer, twice;
  - the timeout, a stale timeout doing nothing, and resume;
  - a new run allowed after a timeout;
  - isolation and roles on `answer` and `resume`.
- Typecheck, lint (no new warnings), production build and the client secrets scan pass.
- **Still to do live on dev:** one real run on a real project, to measure cost per step against the estimates and tune the 50¢ reserve.

## 2.18 Business facts and 2.20 feedback

**State: done.** These follow `doctrine-understanding-precedes-advantage.md` sections 3.1 and 3.5. They were checked live on `calm-spider-678` on 2026-11-04.

### Business facts (`businessFacts`, `convex/facts.ts`, `convex/lib/facts.ts`)

- **What a row holds:** a key, a value, a source type (owner, agent, assumption, upload, feedback), a source reference, when it was recorded and by whom, when and by whom it was verified, a status (unverified, verified, disputed, superseded), and the fact it supersedes.
- **One live fact per key.** Replacing a fact inserts a new row that points at the old one, and the old row becomes `superseded`. Nothing is edited into a new value. Removing a fact is a soft delete: audited, by an Owner or Manager, with its history kept.
- **A person's statement is verified.** That covers `facts.record` and a promoted feedback row. Only an Owner or Manager records, verifies, disputes or removes a fact. Disputing a fact keeps its verification history.
- **An agent's fact is always unverified** (`writeAgentFact`). It never replaces a fact a person verified: the verified fact stays current and nothing is written.
- **Source references:** agent, upload and feedback facts must have one. Owner and assumption facts may leave it empty.
- **What a run can see:** `factsForRun` returns only live facts, each with its status. 2.11 records which fact ids a run used.

### Feedback (`feedback`, `assets.reject`, `assets.requestRevision`, `convex/feedback.ts`)

- **Reject:** an Owner or Manager rejects a waiting asset with a reason of 3 to 1,000 characters. The asset becomes `rejected`, leaves the queue and keeps every version.
- **Request a revision:** the asset stays waiting.
- **Both save a `feedback` row** with the asset version, the reason, who and when.
- **Promoting:** `feedback.promote` turns a reason into a verified fact, with `sourceType: feedback` and the feedback id as its reference. Only a person can do it, once per row. Nothing is promoted automatically.

### Asset statuses

These are now shared in `convex/lib/assetStatus.ts`: draft, **needsReview**, approved, **rejected**, archived. "Needs review" is for an agent's draft that failed a completion check (2.11). It cannot be approved until a person adds a version or rejects it. The asset page has Reject with a reason. Lists show the two new statuses and can filter by them.

### Tests and checks

- 202 pass, 11 of them new (`convex/facts.test.ts`). They cover the supersede chain, roles, key and value checks, source references, agent facts never verifying themselves, removed and replaced facts, what a run sees, the feedback flows, promotion, needs review, and isolation for both tables through every public function.
- **Live on dev:** 9 of 9 checks pass. Those covered replacement, roles, dispute history and isolation. They also included rejecting a real `test-echo` draft, the queue emptying, and promoting the reason into a verified fact.

## Production steps for 2.1

The migration now finishes by itself. A Convex cron (`convex/crons.ts`) calls `agentsMigration:backfillIfNeeded` every 10 minutes on every deployment. When any row still names `sales`, or any agent row still has the old area fields, it starts the backfill. Otherwise it writes nothing. So production completes within 10 minutes of this cron being deployed, with no key needed here.

To confirm, or to run it at once by hand:
   ```
   npx convex run agentsMigration:backfill --prod
   npx convex run agentsMigration:remaining --prod
   ```
   `remaining` must report all zeros. Until the backfill runs, the first sign-in after the deploy renames the agent row anyway, but old runs, caps and day counters still sit under `sales`, so the day cap starts from zero for that day.
3. Only after `remaining` is all zeros on production, a later push may drop `areas`, `agents.area` and `agents.stage`.

## Milestone A: evidence and data (2.5, 2.6, 2.12)

**State: done.** Checked live on the dev deployment `calm-spider-678` on 2026-11-04 (see "Checked on dev" at the end of this section). Nothing was run on production.

### 2.5 Evidence basis

Evidence rows gain `basis` and `sourceRefIds`. The rules live in `convex/lib/evidence.ts` and run in three places: when a person adds a version (`assets.addVersion`), when an asset is approved (`assets.approve`, re-checked against what is in the workspace now), and on the asset screen (`sourceMissing` per claim, which blocks the Approve button). `screenClaims` gives the report writer (2.11) the same rules as a keep/drop list with a reason code, so a bad claim is dropped instead of failing the report.

| Basis | Rule | Label (set in code, never by the model) |
|---|---|---|
| observed | At least one `sourceRef`, every cited one in this workspace | Observed |
| inferred | At least one supporting `sourceRef`, same check | Inference |
| hypothesis | No source needed. Cannot be marked computed. | Untested hypothesis |
| firstParty | At least one cited `sourceRef` on the `customerData` platform. A web page is not enough. | Your data |
| insufficient | No sources, not computed, and the line starts with "Not enough data" | Not enough data |

Two choices to review:

- **One rule beyond the plan:** a claim with a basis cites `sourceRefIds` only, not the older `sourceId` (profile, profile example, run record). Mixing the two would let a claim look sourced by a record that is not a collected source.
- **Claims without a basis keep the old rule** (a source and a fetch time, or computed), so `test-echo` and every existing asset work unchanged.

Tests: `convex/evidence.test.ts`, one test per basis rule, plus the mixed-source rule, approval after a cited source is deleted, and the keep/drop screen. Each rule is exercised through the real `assets.addVersion` and `assets.approve`.

The asset screen now uses the server's `sourceMissing` instead of "no source label", and shows the basis label and linked sources under each claim. Without this, a correctly sourced basis claim would have read "Source not found" and blocked approval. The full report view is still 2.15.

### 2.6 Research data

| Table | Holds | Who can change it |
|---|---|---|
| `researchProjects` | Objective, market, geography, competitors, platforms, pasted links, status, latest run, the confirmed profile version it was scoped against | Owner or Manager. Scope is locked once the project has run. |
| `sourceRefs` | Platform, kind, URL and canonical URL, title, publisher, dates, official embed id, availability, an excerpt of 300 characters or less, model classification (marked as such), limitation, and links to the run and raw artifact | Written only by the runtime (`saveSourceRef`). Read by every member. |
| `sourceStatus` | Per run and platform: available, partial, unavailable or awaiting authorization, with a reason code and a count | Written only by the runtime (`setSourceStatus`) |
| `collections` | A named group, personal (has an owner) or the workspace's | Personal: its owner, any role. Workspace: Owner or Manager. A Rep can read it. |
| `collectionItems` | A source in a collection, with an optional note | Same as its collection |

- `saveSourceRef` refuses a project, run or artifact from another workspace and any URL that is not public `http(s)` (no `javascript:`, `data:`, `file:`, credentials or bare hosts). It stores the same page once per project, matched on a canonical URL (no `www.`, fragment or tracking parameters, sorted query). It cuts excerpts to 300 characters.
- Screens never get the raw artifact id or body from a source reference.
- A personal collection reads as not found to everyone else in the workspace, the Owner included.

Tests: `convex/research.test.ts`. Workspace B calls **every** public research and collection function (15) on A's records, or on A's workspace directly, and gets the same `Not found.` each time. B also cannot put A's source in its own collection, read A's run statuses through its own project, or write a source or status against A's project, run or artifact. Separate tests cover roles, scope checks, the scope lock, dedupe, excerpt length and personal collections. As a check on the check, removing the workspace test from `getSourceRef` makes the isolation test fail.

### 2.12 Per-skill caps

- `SKILL_CAPS` in `convex/lib/caps.ts`: Market Intelligence **$3 a run, $25 a day**, 60 steps, 30 minutes. The platform ceiling is now **$10 a run and $100 a day** (decision D3).
- A skill with its own caps has its own caps row and its **own day counter** (`skillSlug` on `agentCaps` and `capCounters`). A research day cannot use up the test skill's $2, and test runs do not count against research's $25.
- Every other skill, `test-echo` included, reads and writes the same agent-wide rows as before (no `skillSlug`). Existing rows and the agent migration keep working unchanged.
- The agent-wide caps row does not apply to Market Intelligence. An Owner who set the agent to 25¢ does not stop research at 25¢.
- `controls.get` and `controls.setCaps` take an optional `skillSlug`. `get` also returns the scope, the ceiling and today's spend for the assignment form's cost preview (2.13). Setting caps for a skill that shares the agent's is refused.
- `runs.get` reports `caps.scope` (`skill` or `agent`).

Tests: `convex/caps.test.ts`. Market Intelligence is not built until 2.11, so these tests write its run rows directly and drive the real `prepare` and `commitModel`:

- A Market Intelligence run at 250¢ carries on (the test skill would have stopped at 25¢) and stops at 310¢ with `cap`.
- Its day budget is checked before each step, apart from the agent's: an agent day at its $2 limit does not stop research, and a research day at $25 does.
- A test-echo run starts while research has used its day, and still stops at 25¢.
- The ceiling is enforced at $10.00 and $100.00.

**Changed existing tests (2):** `runtime.test.ts` "refuses caps above the platform ceiling" now uses 1001¢ (101¢ is allowed under the new ceiling). `screens.test.ts` expects the four new evidence fields on an older claim (`basis: null`, `basisLabel: null`, `sources: []`, `sourceMissing: false`).

### Checks

- `npx vitest run`: 169 passed, in 36 files (150 before, 19 new).
- `npm run lint`: 0 errors, the same 9 warnings as `main`.
- `npm run typecheck`, `npm run build`, `npm run assert:no-secrets`: pass.
- `convex/_generated/api.d.ts` gained the five new modules by hand. `convex codegen` needs a reachable deployment, and the key is rejected. The data model types come from `schema.ts`, so the import list is the only part codegen writes per module. `codegen.test.ts` confirms the list matches `convex/`.

### Added when checked

- **Asset kind `marketReport`.** Section 3.3 lists it and it was missing. Market Intelligence (2.11) writes this kind. The test skills keep `researchReport`.
- **`assets.list` filtered by kind alone.** A kind with no status was ignored and every asset came back. It now reads a new `by_workspace_kind` index. The assets screen always sends a status, so no screen showed the bug.

Tests: 170 pass (one new: a market report lists under its own kind and not under `researchReport`).

### Checked on dev

Schema and functions pushed to `calm-spider-678`. Functions were called as test members of two new workspaces (Owner and Rep in A, Owner in B) with admin auth and a test identity. Runtime-only writes (`saveSourceRef`, `setSourceStatus`, a day-counter add, a source delete) went through a temporary internal module that was pushed, used, and removed again. It was never committed.

| Area | Check | Result |
|---|---|---|
| 2.6 | Owner creates a project; Rep is refused | Pass |
| 2.6 | `test-echo` run finishes by itself and makes a draft (run id and asset for the checks below) | Pass |
| 2.6 | Same page saved once on its canonical URL (`www.`, tracking and fragment removed) | Pass |
| 2.6 | 500-character excerpt stored as 300 or fewer | Pass |
| 2.6 | `javascript:` URL refused; a source written against B's project refused | Pass |
| 2.6 | Owner and Rep both list the sources; no artifact id or body in screen rows; run status readable | Pass |
| 2.6 | B calling five research reads on A's records or workspace gets `Not found.` each time | Pass |
| 2.6 | Rep's personal collection: Rep reads it, Owner gets not found; Rep cannot make a workspace collection; B cannot add A's source | Pass |
| 2.5 | Refused through `assets.addVersion`: observed with no source, observed citing another workspace's id, inferred with no source, firstParty citing a web page, computed hypothesis, insufficient line that makes a claim | Pass |
| 2.5 | One valid claim per basis accepted; labels come back as Observed, Inference, Untested hypothesis, Your data, Not enough data | Pass |
| 2.5 | After a cited source is deleted, `assets.approve` refuses and the screen marks the claim's source missing | Pass |
| 2.12 | Market Intelligence: $3 a run, $25 a day, scope `skill`; ceiling $10 and $100; agent-wide caps still 25¢ and $2 | Pass |
| 2.12 | 700¢ of research spend shows on its own counter; the agent-wide counter stays at 1¢. Two counter rows, one without `skillSlug` | Pass |
| 2.12 | Setting caps for a skill that shares the agent's caps is refused | Pass |

32 of 32 checks passed. Lookups with `skillSlug` missing match the agent-wide rows on the real deployment, the same as in tests.

