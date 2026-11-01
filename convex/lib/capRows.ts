import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";

import type { DataModel, Id } from "../_generated/dataModel";
import { capScope, defaultCapsFor, type Caps } from "./caps";

type Reader = { db: GenericDatabaseReader<DataModel> };
type Writer = { db: GenericDatabaseWriter<DataModel> };

/** The caps row for a skill's scope. A skill with its own caps never reads the agent-wide row. */
export async function capsRow(ctx: Reader, workspaceId: Id<"workspaces">, agentSlug: string, skillSlug: string | undefined) {
  return ctx.db
    .query("agentCaps")
    .withIndex("by_workspace_agent_skill", (q) =>
      q.eq("workspaceId", workspaceId).eq("agentSlug", agentSlug).eq("skillSlug", capScope(skillSlug)),
    )
    .unique();
}

export async function loadCaps(
  ctx: Reader,
  workspaceId: Id<"workspaces">,
  agentSlug: string,
  skillSlug: string | undefined,
): Promise<Caps> {
  const row = await capsRow(ctx, workspaceId, agentSlug, skillSlug);
  if (!row) return defaultCapsFor(skillSlug);
  return {
    maxCostCentsPerRun: row.maxCostCentsPerRun,
    maxCostCentsPerDay: row.maxCostCentsPerDay,
    maxSteps: row.maxSteps,
    maxDurationMs: row.maxDurationMs,
  };
}

async function counterRow(ctx: Reader, workspaceId: Id<"workspaces">, agentSlug: string, skillSlug: string | undefined, day: string) {
  return ctx.db
    .query("capCounters")
    .withIndex("by_workspace_agent_skill_day", (q) =>
      q.eq("workspaceId", workspaceId).eq("agentSlug", agentSlug).eq("skillSlug", capScope(skillSlug)).eq("day", day),
    )
    .unique();
}

export async function daySpend(ctx: Reader, workspaceId: Id<"workspaces">, agentSlug: string, skillSlug: string | undefined, day: string) {
  return (await counterRow(ctx, workspaceId, agentSlug, skillSlug, day))?.costCents ?? 0;
}

/** Adds spend to the day counter in the skill's scope and returns the new day total. */
export async function addDaySpend(
  ctx: Writer,
  workspaceId: Id<"workspaces">,
  agentSlug: string,
  skillSlug: string | undefined,
  day: string,
  costCents: number,
) {
  const counter = await counterRow(ctx, workspaceId, agentSlug, skillSlug, day);
  const total = (counter?.costCents ?? 0) + costCents;
  if (counter) await ctx.db.patch(counter._id, { costCents: total });
  else {
    const scope = capScope(skillSlug);
    await ctx.db.insert("capCounters", {
      workspaceId,
      agentSlug,
      ...(scope === undefined ? {} : { skillSlug: scope }),
      day,
      costCents: total,
    });
  }
  return total;
}
