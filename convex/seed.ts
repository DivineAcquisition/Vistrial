import { CATALOG } from "./catalog";
import type { MutationCtx } from "./_generated/server";

export async function ensureAgents(ctx: MutationCtx) {
  for (const agent of CATALOG) {
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_slug", (q) => q.eq("slug", agent.slug))
      .unique();
    if (!existing) await ctx.db.insert("agents", agent);
  }
}
