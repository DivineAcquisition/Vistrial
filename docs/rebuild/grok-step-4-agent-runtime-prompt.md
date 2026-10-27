GROK PROMPT: VISTRIAL REBUILD, STEP 4 (THE SHARED AGENT RUNTIME AND THE BUSINESS PROFILE), ALL ON CONVEX

Paste everything below into Grok. Attach `v2-brief-agents-and-areas.md` and `00-product-brief-and-step-1-spec.md` with it. Step 1 must be built and reviewed first, with the v2 patch notes applied.

============================================================
YOUR ROLE
============================================================

You are building Step 4 of the Vistrial rebuild. The product now has three areas (Sales, Retention, Operations), one agent per area, and skills inside each agent. Step 4 builds the shared foundation every agent will run on, and the business profile every agent reads. No skill is built in this step.

Read the existing Step 1 code first. Reuse the access layer, builders, audit log, and guard tests exactly as they are. Do not weaken them or change their behavior without telling me. Every public function goes through the builders.

Build exactly what Step 4 asks for and nothing else. If something is unclear, list it as a question in your plan and wait.

Convex rules still apply: read the current Convex docs first, validators everywhere, indexed reads, no unbounded `collect()`, paginated lists. Long work runs in actions with durable steps. Outside services are called only from actions.

Check the official Convex Agent and Workflow components in the current docs. In your plan, say whether to use them or build the runtime directly, with the tradeoffs. Do not add either without my approval.

============================================================
WHAT STEP 4 IS (AND IS NOT)
============================================================

Is: the agent registry (areas, agents, skills), the run framework, a tool registry, a model router, cost caps, the asset library with approval, the live run stream, a run viewer, and the business profile with its screens.

Is not: any skill, any web research, any scraping, any publishing, any outside connection. A development-only test skill proves the runtime end to end.

============================================================
THE MODEL
============================================================

Every workspace table has `workspaceId` and an index that starts with it.

**Registry (global)**
- `areas` and `agents` and `skills`: key, name, one-line job, plain promise (what it never does), sort. Seeded with Sales, Retention, Operations and their agents. Skills are listed with a status (`available | comingSoon`). The rail reads these tables.
- `workspaceAgents` (already in Step 1): state per workspace.

**Business profile (per workspace, versioned)**
- `businessProfiles`: workspaceId, version, offer, priceNotes, audience, geography, channels, brandVoice (short plain text), competitors (list of name and URL), confirmedBy, confirmedAt, status (`draft | confirmed`).
- `profileExamples`: version, kind (`voiceExample | pastAd | other`), storageId or short text. Files go to Convex storage.
- Agents read only the confirmed version. An edit creates a new draft version and keeps the old one. Only an Owner or Manager can confirm.

**Runs**
- `agentRuns`: agentKey, skillKey, status (`queued | running | waiting | completed | failed | stopped`), startedBy, inputRef (a structured input record), startedAt, finishedAt, stopReason (`done | cap | error | cancelled | halted`), costCents, inputTokens, outputTokens.
- `runSteps`: runId, index, kind (`tool | model | note`), toolKey or modelRoute, status, durationMs, token counts, resultCode. No page text or model text in a step row. Larger content goes to an artifact record.
- `runArtifacts`: runId, stepId, kind, storageId, byteSize. Raw tool results and model outputs live here, with access limited to people who can open the run.

**Assets**
- `assets`: kind (`researchReport | adCopySet | creativeBrief | contentCalendar | swipeItem`), title, status (`draft | approved | archived`), currentVersion, createdByRun, createdAt.
- `assetVersions`: assetId, version, storageId or structured body, createdBy (`agent | person`), notes. Versions are never overwritten.
- Approval: an Owner or Manager moves an asset from `draft` to `approved`. It is audited with who and when. Nothing is published in this step.

**Controls**
- `agentCaps`: per workspace and agent, a maximum cost per run and per day (cents), a maximum steps per run, and a maximum run time.
- `capCounters`: per day usage.
- Pause and halt controls from Step 3, if built, apply. If the gate is not built yet, add `workspaceControls.agentsPaused` and a platform halt, and reuse them when the gate lands.

**Model router**
- A `modelRoutes` table and a typed `workKinds` list in code (for example `research`, `classify`, `write`, `summarize`). Each work kind points to a provider and a model, with a fallback. Default provider is Claude. Application code never names a model. Platform Admin edits routes. Every model call goes through one function that records tokens and cost.

============================================================
THE TOOL REGISTRY AND SAFETY
============================================================

Agents act only through named tools registered in code. A tool has a key, a label, a tier (`read`, `produce`), allowed domains if it fetches, a rate limit, a cost estimate, and a typed input and output. There is no generic "call any URL," no code execution, and no raw database tool.

In this step, register only: `profile.read`, `asset.create`, `asset.addVersion`, and a development-only `test.echo`. Later steps add web, library, and swipe tools to the same registry.

**Untrusted content.** Anything a tool fetches from outside (page text, ad text, file contents) is data, never instructions. It is wrapped and labeled as untrusted when given to a model. A model's output cannot call a tool that the run's skill did not declare. Build a test fixture that contains instructions ("ignore previous instructions and ...") and prove they have no effect.

**Evidence.** Every claim an agent writes into an asset must reference an evidence record (a source id and fetch time) or a computed value. A validator drops or flags any claim without one. Build the validator and its tests now, so later skills inherit it.

============================================================
SCREENS
============================================================

- **Setup path (first sign-in):** create the business profile, then turn on the Sales Agent. Steps show done or not done.
- **Business profile:** a form with the fields above, draft and confirm, version history, and file upload for examples.
- **Agents:** one page per agent, listing its skills with status, its promise, and its recent runs.
- **Run viewer:** a run's status, steps, cost, stop reason, and artifacts, updating live. Roles that can open an agent can open its runs.
- **Assets:** a library with filters by kind and status, a viewer with version history, and Approve for Owner and Manager.
- **Decisions:** assets waiting for approval appear here. The empty line stays "Nothing is waiting."
- **Controls and caps** for Owner, and the platform halt for staff.
- The development-only test skill is reachable only in development.

Phone, tablet, and desktop. No horizontal scroll. Keyboard operable. Calm, quiet, plain words.

============================================================
RULES (NON-NEGOTIABLE)
============================================================

1. Agents run only through the runtime. No skill code calls a model or tool directly.
2. Costs are capped per run and per day. A run stops cleanly at a cap and says why. A paused workspace or halted platform stops new runs and cancels waiting ones.
3. No model text, page text, or personal content in the audit log, the `events` stream, or any log line. Ids, kinds, counts, and cost only.
4. Run steps are durable: a restart or failure resumes or fails cleanly and never repeats a side effect.
5. Only the registered tools exist. A skill declares its tools, and the runtime refuses any other.
6. Evidence is required on every claim in an asset.
7. Access follows Step 1: workspace isolation and roles apply to runs, assets, and the profile. Staff read nothing without a grant.
8. Calls to models go through the router, record cost, and respect caps. No provider key reaches client code.

============================================================
STEP 0: PLAN FIRST (NO CODE YET)
============================================================

Reply with:
1. Whether you will use the Convex Agent and Workflow components, with the tradeoffs and sizes.
2. The final table list with validators and indexes.
3. The run lifecycle as a table of status, event, and next status, including caps and cancellation.
4. How durable steps work and how a failure resumes without repeating side effects.
5. The tool registry design and how a skill declares its tools.
6. The model router design, the cost accounting, and how caps stop a run.
7. How untrusted content is wrapped, and how the injection test fixture works.
8. How the evidence validator works.
9. How live run updates reach the run viewer.
10. The test plan, including how you will test without calling a real model (a fake provider) and once against a real one.
11. Every question or assumption for me to confirm.

Wait for my approval before writing code.

============================================================
THEN BUILD, IN THIS ORDER
============================================================

1. Registry tables, seeds, and the rail reading them.
2. The business profile, with versions and confirmation, and its screens.
3. The model router with a fake provider and a Claude provider, and cost accounting.
4. The tool registry and the run framework with caps, durability, and cancellation.
5. Assets and versions, approval, and the evidence validator.
6. The run viewer, the Assets screens, and Decisions.
7. The development-only test skill and the full end-to-end test.
8. Phone and accessibility pass.

After each numbered part, stop and report: what changed, what you tested, and the exact commands to run it.

============================================================
ACCEPTANCE TESTS (ALL MUST PASS)
============================================================

1. A test skill runs end to end through the runtime: profile read, a model call, asset created, run completed, cost recorded.
2. A run stops at the per-run cost cap and at the per-day cap, with the stop reason shown.
3. A paused workspace and a halted platform stop and cancel runs.
4. A skill cannot call a tool it did not declare.
5. A fetched page containing instructions changes nothing about what the run does.
6. An asset claim with no evidence is rejected or flagged by the validator.
7. A run that fails midway does not repeat a completed side effect when resumed.
8. Only an Owner or Manager can confirm a profile or approve an asset. A Rep and staff without a grant cannot.
9. A user in workspace A cannot read workspace B's profile, runs, steps, artifacts, or assets, through any function.
10. No model text, page text, or file content appears in the audit log, events, or any log line.
11. Changing a work kind's model route changes which model is used with no change to agent code.
12. The Step 1 guard tests still pass.
13. Phone, tablet, and desktop with no horizontal scroll, keyboard only, and screen reader labels.

============================================================
DO NOT
============================================================

- Do not build any skill, web research, scraping, publishing, or outside connection.
- Do not add libraries or components without telling me their size and license.
- Do not change the Step 1 access layer without telling me.
- No em-dashes in any copy. Plain words, no jargon.

============================================================
DEFINITION OF DONE
============================================================

All thirteen tests pass and are reported one by one with the command and the result. List anything you were unsure about, anything you left out on purpose, and the dependencies you added with size and license.

============================================================
HOW I WILL REVIEW
============================================================

I will run the tests, read the runtime, router, and validator, try to make a skill call an undeclared tool, feed it an injection page, hit the caps, kill a run midway, and read another workspace's data as each role. Anything that fails goes back to you before Step 5 starts.
