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

/** Quality modes. Thorough uses the routes as set (Opus for research and writing); Fast uses the faster
 * route for them and a lower cap. */
export const MODES = {
  thorough: { label: "Thorough", capCents: null as number | null },
  fast: { label: "Fast", capCents: 150 as number | null },
} as const;
export type Mode = keyof typeof MODES;

export function isMode(value: unknown): value is Mode {
  return value === "thorough" || value === "fast";
}

/** A run's caps: the scope's caps, lowered to the mode's cap when the mode has one. */
export async function runCaps(ctx: Reader, run: { workspaceId: Id<"workspaces">; agentSlug: string; skillSlug: string; mode?: string }): Promise<Caps> {
  const caps = await loadCaps(ctx, run.workspaceId, run.agentSlug, run.skillSlug);
  const modeCap = isMode(run.mode) ? MODES[run.mode].capCents : null;
  return modeCap === null ? caps : { ...caps, maxCostCentsPerRun: Math.min(caps.maxCostCentsPerRun, modeCap) };
}
