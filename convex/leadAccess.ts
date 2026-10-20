import { v } from "convex/values";

import { requireAccess } from "./access";
import { mutation, query } from "./_generated/server";

const assign = v.object({
  leadId: v.string(),
  workspaceId: v.string(),
  setterMemberId: v.optional(v.string()),
  closerMemberId: v.optional(v.string()),
});

async function put(
  ctx: import("./_generated/server").MutationCtx,
  row: { leadId: string; workspaceId: string; setterMemberId?: string; closerMemberId?: string },
) {
  const existing = await ctx.db
    .query("leadAccess")
    .withIndex("by_lead", (q) => q.eq("leadId", row.leadId))
    .unique();
  const fields = {
    leadId: row.leadId,
    workspaceId: row.workspaceId,
    setterMemberId: row.setterMemberId,
    closerMemberId: row.closerMemberId,
    syncedAt: Date.now(),
    drifted: false,
  };
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("leadAccess", fields);
}

/** Copy one assignment change. Ids only. */
export const sync = mutation({
  args: {
    key: v.string(),
    job: v.string(),
    workspaceId: v.string(),
    leadId: v.string(),
    setterMemberId: v.optional(v.string()),
    closerMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, {
      scope: "system",
      key: args.key,
      job: args.job,
      workspaceId: args.workspaceId,
    });
    if (args.workspaceId !== access.workspaceId) throw new Error("A system call cannot leave its workspace.");
    await put(ctx, args);
    return { ok: true };
  },
});

export const syncMany = mutation({
  args: { key: v.string(), job: v.string(), workspaceId: v.string(), rows: v.array(assign) },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "system", key: args.key, job: args.job, workspaceId: args.workspaceId });
    for (const row of args.rows) {
      if (row.workspaceId !== args.workspaceId) throw new Error("A system call cannot leave its workspace.");
      await put(ctx, row);
    }
    return { count: args.rows.length };
  },
});

/** Compare Postgres assignment ids with the Convex index. */
export const compare = query({
  args: { key: v.string(), job: v.string(), workspaceId: v.string(), postgres: v.array(assign) },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "system", key: args.key, job: args.job, workspaceId: args.workspaceId });
    const convex = await ctx.db
      .query("leadAccess")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(500);
    const byLead = new Map(convex.map((row) => [row.leadId, row]));
    const diffs: string[] = [];
    const seen = new Set<string>();
    for (const row of args.postgres) {
      if (row.workspaceId !== args.workspaceId) continue;
      seen.add(row.leadId);
      const copy = byLead.get(row.leadId);
      if (!copy) {
        diffs.push(row.leadId);
        continue;
      }
      if ((copy.setterMemberId ?? null) !== (row.setterMemberId ?? null) || (copy.closerMemberId ?? null) !== (row.closerMemberId ?? null)) {
        diffs.push(row.leadId);
      }
    }
    for (const row of convex) {
      if (!seen.has(row.leadId)) diffs.push(row.leadId);
    }
    return { differences: diffs.length, leadIds: diffs };
  },
});
