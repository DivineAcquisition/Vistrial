import { v } from "convex/values";

import { staffMutation, staffQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";

const OPEN = ["queued", "running", "waiting"] as const;

export const get = staffQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("platformControls")
      .withIndex("by_key", (q) => q.eq("key", "platform"))
      .unique();
    return { halted: row?.halted === true };
  },
});

export const setHalt = staffMutation({
  args: { halted: v.boolean() },
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("platformControls")
      .withIndex("by_key", (q) => q.eq("key", "platform"))
      .unique();
    if (current) await ctx.db.patch(current._id, { halted: args.halted });
    else await ctx.db.insert("platformControls", { key: "platform", halted: args.halted });
    if (args.halted) {
      for (const status of OPEN) {
        const rows = await ctx.db
          .query("agentRuns")
          .withIndex("by_status", (q) => q.eq("status", status))
          .take(50);
        for (const run of rows) {
          await ctx.db.patch(run._id, { status: "stopped", stopReason: "cancelled", finishedAt: Date.now() });
          await writeAudit(ctx, {
            workspaceId: run.workspaceId,
            actorType: "staff",
            actorId: ctx.identity.subject,
            action: "run.finished",
            subject: run._id,
            count: run.costCents,
          });
        }
      }
    }
    await writeAudit(ctx, {
      actorType: "staff",
      actorId: ctx.identity.subject,
      action: args.halted ? "platform.halted" : "platform.resumed",
      subject: "platform",
      count: args.halted ? 1 : 0,
    });
    return null;
  },
});

export const setRoute = staffMutation({
  args: {
    workKind: v.string(),
    provider: v.string(),
    model: v.string(),
    fallbackProvider: v.string(),
    fallbackModel: v.string(),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("modelRoutes")
      .withIndex("by_workKind", (q) => q.eq("workKind", args.workKind))
      .unique();
    if (current) {
      await ctx.db.patch(current._id, {
        provider: args.provider,
        model: args.model,
        fallbackProvider: args.fallbackProvider,
        fallbackModel: args.fallbackModel,
      });
    } else {
      await ctx.db.insert("modelRoutes", args);
    }
    await writeAudit(ctx, {
      actorType: "staff",
      actorId: ctx.identity.subject,
      action: "route.updated",
      subject: args.workKind,
      count: 1,
    });
    return null;
  },
});
