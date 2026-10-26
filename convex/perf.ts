import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { seedSpine, firstOpenStage } from "./lib/seedSpine";

/**
 * Builds the labeled 20,000 lead workspace in batches.
 * Run on the dev deployment after the team exists:
 * npx convex run perf:start
 * Then open the Leads list and confirm the first page and Load more.
 */
export const start = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await seedSpine(ctx, args.workspaceId);
    await ctx.scheduler.runAfter(0, internal.perf.batch, { workspaceId: args.workspaceId, cursor: 0 });
    return null;
  },
});

export const batch = internalMutation({
  args: { workspaceId: v.id("workspaces"), cursor: v.number() },
  handler: async (ctx, args) => {
    const stage = await firstOpenStage(ctx, args.workspaceId);
    const members = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(1);
    const owner = members[0];
    if (!owner) return;
    const size = 100;
    for (let index = 0; index < size; index += 1) {
      const n = args.cursor + index;
      if (n >= 20_000) return;
      const personId = await ctx.db.insert("people", {
        workspaceId: args.workspaceId,
        displayName: `Fixture ${n}`,
        normalizedName: `fixture ${n}`,
        firstName: "Fixture",
        lastName: String(n),
        emailConsent: "unknown",
        textConsent: "unknown",
        callConsent: "unknown",
        consentSource: "csv",
        doNotContact: false,
        createdFromSource: "csv",
      });
      await ctx.db.insert("leads", {
        workspaceId: args.workspaceId,
        personId,
        stageId: stage._id,
        source: "csv",
        ownerMemberId: owner._id,
        status: "open",
        historic: true,
        lastActivityAt: n,
        createdAt: n,
      });
    }
    const next = args.cursor + size;
    if (next < 20_000) {
      await ctx.scheduler.runAfter(0, internal.perf.batch, { workspaceId: args.workspaceId, cursor: next });
    }
  },
});
