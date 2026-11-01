# Phase 2 progress: Growth Architect V1

Tracks the Phase 2 backlog in `growth-architect-v1-plan.md`. Everything here was checked on the Convex **dev** deployment. Nothing was run on production.

| # | Task | State |
|---|---|---|
| 2.1 | Departments and seven agents, `sales` renamed to `growth-architect`, Leads and My day hidden | Done on dev. Production needs the migration below. |
| 2.2 | Drop the four unused tables | Done. Pushed to dev. |
| 2.3 | Skill module interface | Next |

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

## Production steps for 2.1 (for the person who merges)

1. Merge. Vercel pushes the widened schema and the new code to production.
2. Run the backfill once on production, then check it:
   ```
   npx convex run agentsMigration:backfill --prod
   npx convex run agentsMigration:remaining --prod
   ```
   `remaining` must report all zeros. Until the backfill runs, the first sign-in after the deploy renames the agent row anyway, but old runs, caps and day counters still sit under `sales`, so the day cap starts from zero for that day.
3. Only after `remaining` is all zeros on production, a later push may drop `areas`, `agents.area` and `agents.stage`.
