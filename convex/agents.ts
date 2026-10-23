import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { ensureAgents } from "./seed";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("agents").collect();
    return rows
      .map((row) => ({
        slug: row.slug,
        name: row.name,
        stage: row.stage,
        job: row.job,
        promise: row.promise,
        sort: row.sort,
      }))
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  },
});

export const ensure = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ensureAgents(ctx);
    return null;
  },
});
