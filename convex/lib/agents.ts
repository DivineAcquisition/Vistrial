import { CATALOG } from "../catalog";
import type { MutationCtx } from "../_generated/server";

export async function ensureAgents(ctx: MutationCtx) {
  const existing = await ctx.db.query("agents").withIndex("by_sort").take(50);
  const have = new Set(existing.map((row) => row.slug));
  for (const agent of CATALOG) {
    if (!have.has(agent.slug)) await ctx.db.insert("agents", agent);
  }
}
