# Phase 2 progress: Growth Architect V1

Tracks the Phase 2 backlog in `growth-architect-v1-plan.md`. Everything here was checked on the Convex **dev** deployment. Nothing was run on production.

| # | Task | State |
|---|---|---|
| 2.1 | Departments and seven agents, `sales` renamed to `growth-architect`, Leads and My day hidden | Done on dev. Production needs the migration below. |
| 2.2 | Drop the four unused tables | Done. Pushed to dev. |
| 2.3 | Skill module interface, `test-echo` moved onto it | Done. Pushed to dev. |
| 2.4 | `completeWithTools`: server tools, client tools, structured output, search fees | Done. Live call on dev. |
| 2.5 | Evidence basis and the new validator rules | Next |

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

## Production steps for 2.1

The migration now finishes by itself. A Convex cron (`convex/crons.ts`) calls `agentsMigration:backfillIfNeeded` every 10 minutes on every deployment. When any row still names `sales`, or any agent row still has the old area fields, it starts the backfill. Otherwise it writes nothing. So production completes within 10 minutes of this cron being deployed, with no key needed here.

To confirm, or to run it at once by hand:
   ```
   npx convex run agentsMigration:backfill --prod
   npx convex run agentsMigration:remaining --prod
   ```
   `remaining` must report all zeros. Until the backfill runs, the first sign-in after the deploy renames the agent row anyway, but old runs, caps and day counters still sit under `sales`, so the day cap starts from zero for that day.
3. Only after `remaining` is all zeros on production, a later push may drop `areas`, `agents.area` and `agents.stage`.
