import { AREA_ROWS, CATALOG } from "../catalog";
import type { MutationCtx } from "../_generated/server";

/** Seeds the global registry: areas, agents, and skills. Safe to run again; it updates rows in place. */
export async function ensureAgents(ctx: MutationCtx) {
  const areas = await ctx.db.query("areas").withIndex("by_sort").take(20);
  const haveArea = new Map(areas.map((row) => [row.key, row]));
  for (const row of AREA_ROWS) {
    const existing = haveArea.get(row.key);
    if (!existing) await ctx.db.insert("areas", row);
    else if (existing.name !== row.name || existing.sort !== row.sort) await ctx.db.patch(existing._id, row);
  }

  const agents = await ctx.db.query("agents").withIndex("by_sort").take(50);
  const haveAgent = new Map(agents.map((row) => [row.slug, row]));
  for (const entry of CATALOG) {
    const { skills, ...fields } = entry;
    const existing = haveAgent.get(entry.slug);
    const agentId = existing
      ? (await ctx.db.patch(existing._id, fields), existing._id)
      : await ctx.db.insert("agents", fields);

    const rows = await ctx.db
      .query("skills")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .take(50);
    const haveSkill = new Map(rows.map((row) => [row.key, row]));
    for (const skill of skills) {
      const current = haveSkill.get(skill.key);
      if (!current) await ctx.db.insert("skills", { agentId, ...skill });
      else if (current.name !== skill.name || current.sort !== skill.sort || current.status !== skill.status) {
        await ctx.db.patch(current._id, { name: skill.name, sort: skill.sort, status: skill.status });
      }
    }
  }
}
