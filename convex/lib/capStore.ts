import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";

import type { DataModel, Id } from "../_generated/dataModel";
import { SKILL_CAPS, capsForSkill, clampToCeiling, type Caps } from "./caps";

type Reader = { db: GenericDatabaseReader<DataModel> };
type Writer = { db: GenericDatabaseWriter<DataModel> };

/**
 * The workspace's caps for a skill, kept under the skill's ceiling: its Owner's row for the skill, else
 * the skill's defaults. Caps an Owner set per agent, before caps were per skill, still apply to the skills
 * without caps of their own (the test skills, the only ones that existed then). A skill with its own caps,
 * such as Market Intelligence, starts from its own defaults.
 */
export async function loadSkillCaps(
  ctx: Reader,
  workspaceId: Id<"workspaces">,
  skillSlug: string,
  agentSlug: string,
): Promise<Caps> {
  const { defaults, ceiling } = capsForSkill(skillSlug);
  const row = await ctx.db
    .query("skillCaps")
    .withIndex("by_workspace_skill", (q) => q.eq("workspaceId", workspaceId).eq("skillSlug", skillSlug))
    .unique();
  if (row) return clampToCeiling(row, ceiling);
  if (!SKILL_CAPS[skillSlug]) {
    const legacy = await ctx.db
      .query("agentCaps")
      .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", agentSlug))
      .unique();
    if (legacy) return clampToCeiling(legacy, ceiling);
  }
  return defaults;
}

/** What a skill has spent in the workspace on one day. The skill's day cap is checked against this. */
export async function skillDaySpend(ctx: Reader, workspaceId: Id<"workspaces">, skillSlug: string, day: string) {
  const row = await ctx.db
    .query("skillSpend")
    .withIndex("by_workspace_skill_day", (q) => q.eq("workspaceId", workspaceId).eq("skillSlug", skillSlug).eq("day", day))
    .unique();
  return row?.costCents ?? 0;
}

/** Adds to a skill's day total and returns the new total. */
export async function addSkillSpend(ctx: Writer, workspaceId: Id<"workspaces">, skillSlug: string, day: string, cents: number) {
  const row = await ctx.db
    .query("skillSpend")
    .withIndex("by_workspace_skill_day", (q) => q.eq("workspaceId", workspaceId).eq("skillSlug", skillSlug).eq("day", day))
    .unique();
  const total = (row?.costCents ?? 0) + cents;
  if (row) await ctx.db.patch(row._id, { costCents: total });
  else await ctx.db.insert("skillSpend", { workspaceId, skillSlug, day, costCents: total });
  return total;
}
