import { v } from "convex/values";

import { assertManager, assertPlatformAdmin, requireAccess } from "./access";
import { mutation, query } from "./_generated/server";

const OPEN = new Set(["queued", "working", "waiting_provider"]);

async function controlFor(ctx: { db: import("./_generated/server").QueryCtx["db"] }, workspaceId: string, agentId: string) {
  const rows = await ctx.db
    .query("presenceControls")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(20);
  return rows.find((row) => row.agentId === agentId) ?? null;
}

/** Agents call this before drafting, sending, or posting. A failed read never reaches here. */
export const mayRun = query({
  args: { key: v.string(), job: v.string(), workspaceId: v.string(), agentId: v.string() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "system", key: args.key, job: args.job, workspaceId: args.workspaceId });
    const halt = await ctx.db
      .query("platformHalts")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .unique();
    const control = await controlFor(ctx, args.workspaceId, args.agentId);
    if (halt?.halted || control?.paused) return { ok: false as const, reason: "paused" as const };
    return { ok: true as const };
  },
});

async function rewriteOpenRuns(
  ctx: import("./_generated/server").MutationCtx,
  workspaceId: string,
  agentId: string,
  paused: boolean,
) {
  const runs = await ctx.db
    .query("activityRuns")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(200);
  for (const run of runs) {
    if (run.agentId !== agentId) continue;
    if (paused && OPEN.has(run.status)) {
      await ctx.db.patch(run._id, { status: "paused" });
    }
    if (!paused && run.status === "paused") {
      await ctx.db.patch(run._id, { status: "queued" });
    }
  }
}

/** A person pauses or resumes one agent in one workspace. */
export const setPaused = mutation({
  args: {
    workspaceId: v.string(),
    agentId: v.string(),
    paused: v.boolean(),
    reason: v.optional(v.string()),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    assertManager(access);
    const existing = await controlFor(ctx, args.workspaceId, args.agentId);
    const row = {
      agent_id: args.agentId,
      org_id: args.workspaceId,
      paused: args.paused,
      changed_by_member_id: access.memberLegacyId,
      changed_by_name: args.actorName,
      reason: args.reason ?? null,
      changed_at: new Date().toISOString(),
    };
    if (existing) await ctx.db.patch(existing._id, { paused: args.paused, row });
    else await ctx.db.insert("presenceControls", { workspaceId: args.workspaceId, agentId: args.agentId, paused: args.paused, row });
    await rewriteOpenRuns(ctx, args.workspaceId, args.agentId, args.paused);
    await ctx.db.insert("activityEvents", {
      legacyId: `pause:${args.workspaceId}:${args.agentId}:${row.changed_at}`,
      workspaceId: args.workspaceId,
      runId: "",
      agentId: args.agentId,
      occurredAt: row.changed_at,
      row: {
        kind: args.paused ? "agent.paused" : "agent.resumed",
        label: args.paused ? `Paused by ${args.actorName}` : `Resumed by ${args.actorName}`,
        actor: "person",
        actor_job: "pause",
        who: args.actorName,
        who_id: access.memberLegacyId,
      },
    });
    return row;
  },
});

/** Platform halt. A platform job or a Platform Admin may set it. */
export const setHalt = mutation({
  args: {
    key: v.optional(v.string()),
    job: v.optional(v.string()),
    agentId: v.string(),
    halted: v.boolean(),
    actorId: v.string(),
    actorName: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.key && args.job) {
      await requireAccess(ctx, { scope: "system", key: args.key, job: args.job, platform: true });
      if (args.job !== "platform-halt") throw new Error("Only the platform-halt job may set a halt.");
    } else {
      const access = await requireAccess(ctx, { scope: "platform" });
      assertPlatformAdmin(access);
    }
    const at = new Date().toISOString();
    const existing = await ctx.db
      .query("platformHalts")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .unique();
    const fields = {
      agentId: args.agentId,
      halted: args.halted,
      actorId: args.actorId,
      actorName: args.actorName,
      reason: args.reason,
      at,
      job: args.job ?? "platform-halt",
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("platformHalts", fields);
    return fields;
  },
});
