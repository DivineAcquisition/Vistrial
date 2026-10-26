import { AREA_CATALOG, CATALOG } from "../catalog";
import type { MutationCtx } from "../_generated/server";

/** Seeds areas, agents, and skills from the code catalog. The rail reads the tables. */
export async function ensureAgents(ctx: MutationCtx) {
  const areas = await ctx.db.query("areas").withIndex("by_sort").take(20);
  const areaBySlug = new Map(areas.map((row) => [row.slug, row]));
  for (const area of AREA_CATALOG) {
    const current = areaBySlug.get(area.slug);
    if (!current) await ctx.db.insert("areas", area);
    else await ctx.db.patch(current._id, area);
  }

  const existing = await ctx.db.query("agents").withIndex("by_sort").take(50);
  const bySlug = new Map(existing.map((row) => [row.slug, row]));
  const live = new Set(CATALOG.map((agent) => agent.slug));

  for (const agent of CATALOG) {
    const { skills, ...row } = agent;
    const stored = {
      ...row,
      retired: false,
      skills: skills.map((skill) => ({
        slug: skill.slug,
        name: skill.name,
        handsBack: skill.handsBack,
        sort: skill.sort,
      })),
    };
    const current = bySlug.get(agent.slug);
    if (!current) await ctx.db.insert("agents", stored);
    else await ctx.db.patch(current._id, stored);
  }

  for (const row of existing) {
    if (!live.has(row.slug) && row.retired !== true) {
      await ctx.db.patch(row._id, { retired: true });
    }
  }

  const skillRows = await ctx.db.query("skills").withIndex("by_sort").take(100);
  const skillBySlug = new Map(skillRows.map((row) => [row.slug, row]));
  const liveSkills = new Set<string>();
  for (const agent of CATALOG) {
    for (const skill of agent.skills) {
      liveSkills.add(skill.slug);
      const row = {
        slug: skill.slug,
        agentSlug: agent.slug,
        name: skill.name,
        job: skill.job,
        promise: skill.promise,
        status: skill.status,
        sort: skill.sort,
      };
      const current = skillBySlug.get(skill.slug);
      if (!current) await ctx.db.insert("skills", row);
      else await ctx.db.patch(current._id, row);
    }
  }
  for (const row of skillRows) {
    if (!liveSkills.has(row.slug)) await ctx.db.delete(row._id);
  }
}
