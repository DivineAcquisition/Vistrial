# Adding an agent to the registry

The registry is the one list of every agent Vistrial can host. The sidebar, the phone Agents view, the status strip, the agent panel, the Home crew band, the Agent Library, the counts and the staff tools all read it, so a new agent needs no screen changes.

## Where things live

| What | Where |
| --- | --- |
| Identity, area, plans, availability, prerequisites, autonomy words, order | `agent_registry` in the database (edited at Team > Agent registry). Seed values for the current agents are in `src/lib/agents/roster.ts`. |
| Areas (Sales, Client Retention, later ones) and their work pages | `agent_areas` (same page). |
| Code-only behavior: pages, Run now, pause text, waiting words | `src/lib/agents/contract.ts`. An agent with no entry gets the generic contract. |
| Whether the agent may act right now | `agent_may_run(org, agent)` in Postgres. Every agent calls it through `agentMayRun()` before working. |
| Everything a screen shows | `agent_summary(org)` in Postgres, turned into rows by `buildAgentSummary()` in `src/lib/agents/summary.ts`. |

## The contract every agent meets

1. **Records its work** through `startRun()` and the `RunRecorder` in `src/lib/live/record.ts`: a plain step label while working, outputs with short titles (no message or transcript text), and a finish or a plain failure. That gives it presence, the live line, "last action" and Show its work with no extra code.
2. **Asks before acting**: call `agentMayRun(orgId, agentId)` and wait or skip when it is not ok. This covers the pause, the platform halt, the workspace stop, the plan, availability and activation.
3. **Puts anything for a person through the approval gate** as an `approval_items` row with `agent_id` set. That row is what "waiting on you" counts everywhere (`agent_waiting_items`).
4. **Respects role scoping**: runs and outputs carry the lead id, so row-level security shows Operators only their own leads.
5. **Optional, in `contract.ts`**: the pause text (what stops, what keeps going, what resuming does), a Run now action if it is safe on demand (cooldown and daily cap; it must never send anything), and plain words for what waits.

## Checklist

- [ ] Add the agent with `agent_registry_save` (Team > Agent registry, or a migration that calls it). Give it an area (or none for "Across areas"), the plans that include it, its availability, and what it needs.
- [ ] Write the "on its own", "only suggests" and "never without approval" lines from the real approval settings. Have someone review them before publishing; customers rely on them.
- [ ] If it starts as Beta, list the cohort workspaces. It shows only there.
- [ ] Record work through `RunRecorder` and check `agentMayRun()` before each piece of work.
- [ ] Route anything for a person through `approval_items` with `agent_id`.
- [ ] If it needs pages, a Run now action or pause words of its own, add them to `contract.ts`. Write the pause text from the real code.
- [ ] If it works on a new kind of record (customers, renewals), give its area a work page in `agent_areas`; it appears under the area header with no sidebar change.
- [ ] Add it to `verify-agent-registry.sql` if it adds tables, and check the sample agent test in `src/components/agents/roster.test.tsx` still passes.
- [ ] Turn it on for one workspace from the enablement matrix. The Owner confirms before it starts.
