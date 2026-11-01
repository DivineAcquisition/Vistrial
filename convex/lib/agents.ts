import { CATALOG, DEPARTMENT_CATALOG, RENAMED_AGENTS } from "../catalog";
import type { MutationCtx } from "../_generated/server";

/**
 * Seeds departments, agents, and skills from the code catalog. The rail reads the tables.
 * Idempotent, and safe on old data: an agent whose slug was renamed is renamed in place, so its
 * id, and every workspace's on/off link to it, stays the same. Old area and stage fields are cleared.
 */
export async function ensureAgents(ctx: MutationCtx) {
  const departments = await ctx.db.query("departments").withIndex("by_sort").take(20);
  const departmentBySlug = new Map(departments.map((row) => [row.slug, row]));
  for (const department of DEPARTMENT_CATALOG) {
    const current = departmentBySlug.get(department.slug);
    if (!current) await ctx.db.insert("departments", department);
    else await ctx.db.patch(current._id, department);
  }

  const existing = await ctx.db.query("agents").withIndex("by_sort").take(50);
  const bySlug = new Map(existing.map((row) => [row.slug, row]));
  for (const [oldSlug, newSlug] of Object.entries(RENAMED_AGENTS)) {
    const old = bySlug.get(oldSlug);
    if (!old || bySlug.has(newSlug)) continue;
    await ctx.db.patch(old._id, { slug: newSlug });
    bySlug.delete(oldSlug);
    bySlug.set(newSlug, { ...old, slug: newSlug });
  }
  const live = new Set(CATALOG.map((agent) => agent.slug));

  for (const agent of CATALOG) {
    const { skills, ...row } = agent;
    const stored = {
      ...row,
      retired: false,
      area: undefined,
      stage: undefined,
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

  // Retired rows stay for old runs to point at, rewritten so no row keeps the old area fields.
  for (const row of bySlug.values()) {
    if (live.has(row.slug)) continue;
    if (row.retired !== true || row.area !== undefined || row.stage !== undefined) {
      await ctx.db.patch(row._id, { retired: true, area: undefined, stage: undefined });
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
