import { CATALOG } from "../catalog";
import type { MutationCtx } from "../_generated/server";

export async function ensureAgents(ctx: MutationCtx) {
  const existing = await ctx.db.query("agents").withIndex("by_sort").take(50);
  const bySlug = new Map(existing.map((row) => [row.slug, row]));
  const live = new Set(CATALOG.map((agent) => agent.slug));

  for (const agent of CATALOG) {
    const current = bySlug.get(agent.slug);
    if (!current) {
      await ctx.db.insert("agents", { ...agent, retired: false });
      continue;
    }
    await ctx.db.patch(current._id, { ...agent, retired: false });
  }

  for (const row of existing) {
    if (!live.has(row.slug) && row.retired !== true) {
      await ctx.db.patch(row._id, { retired: true });
    }
  }
}
