import { v } from "convex/values";

import { currentAgentSlug } from "./catalog";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { PLATFORM_CEILING, assertWithinCeiling, capScope, dayKey } from "./lib/caps";
import { capsRow, daySpend, loadCaps } from "./lib/capRows";
import { notAllowed, userError } from "./lib/errors";

const OPEN = ["queued", "running", "waiting"] as const;

async function cancelOpen(ctx: MutationCtx, workspaceId: Id<"workspaces">, stopReason: "cancelled") {
  for (const status of OPEN) {
    const rows = await ctx.db
      .query("agentRuns")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", workspaceId).eq("status", status))
      .take(50);
    for (const run of rows) {
      await ctx.db.patch(run._id, { status: "stopped", stopReason, finishedAt: Date.now() });
      await writeAudit(ctx, {
        workspaceId,
        actorType: "system",
        actorId: "runtime",
        action: "run.finished",
        subject: run._id,
        count: run.costCents,
      });
    }
  }
}

/**
 * Caps for an agent, or for one of its skills. A skill with its own caps (Market Intelligence) has its
 * own row and day budget; any other skill reads the agent's.
 */
export const get = workspaceQuery({
  args: { agentSlug: v.string(), skillSlug: v.optional(v.string()) },
  handler: async (ctx, input) => {
    const args = { agentSlug: currentAgentSlug(input.agentSlug), skillSlug: input.skillSlug };
    const caps = await loadCaps(ctx, ctx.workspaceId, args.agentSlug, args.skillSlug);
    const paused = await ctx.db
      .query("workspaceControls")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    const platform = await ctx.db
      .query("platformControls")
      .withIndex("by_key", (q) => q.eq("key", "platform"))
      .unique();
    return {
      caps,
      scope: capScope(args.skillSlug) === undefined ? ("agent" as const) : ("skill" as const),
      ceiling: PLATFORM_CEILING,
      daySpentCents: await daySpend(ctx, ctx.workspaceId, args.agentSlug, args.skillSlug, dayKey()),
      paused: paused?.agentsPaused === true,
      halted: platform?.halted === true,
    };
  },
});

export const setCaps = workspaceMutation({
  args: {
    agentSlug: v.string(),
    /** Sets a skill's own caps. Only skills that have their own caps accept this; others share the agent's. */
    skillSlug: v.optional(v.string()),
    maxCostCentsPerRun: v.number(),
    maxCostCentsPerDay: v.number(),
    maxSteps: v.number(),
    maxDurationMs: v.number(),
  },
  handler: async (ctx, input) => {
    const args = { ...input, agentSlug: currentAgentSlug(input.agentSlug) };
    if (ctx.member.role !== "owner") notAllowed();
    assertWithinCeiling(args);
    if (args.maxSteps < 1 || args.maxDurationMs < 1) throw userError("Caps must allow at least one step.");
    const scope = capScope(args.skillSlug);
    if (args.skillSlug !== undefined && scope === undefined) throw userError("That skill uses the agent's caps.");
    const current = await capsRow(ctx, ctx.workspaceId, args.agentSlug, scope);
    const fields = {
      maxCostCentsPerRun: args.maxCostCentsPerRun,
      maxCostCentsPerDay: args.maxCostCentsPerDay,
      maxSteps: args.maxSteps,
      maxDurationMs: args.maxDurationMs,
    };
    const id = current
      ? (await ctx.db.patch(current._id, fields), current._id)
      : await ctx.db.insert("agentCaps", {
          workspaceId: ctx.workspaceId,
          agentSlug: args.agentSlug,
          ...(scope === undefined ? {} : { skillSlug: scope }),
          ...fields,
        });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "caps.updated",
      subject: id,
      count: args.maxCostCentsPerRun,
    });
    return null;
  },
});

export const setPaused = workspaceMutation({
  args: { paused: v.boolean() },
  handler: async (ctx, args) => {
    if (ctx.member.role !== "owner") notAllowed();
    const current = await ctx.db
      .query("workspaceControls")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    if (current) await ctx.db.patch(current._id, { agentsPaused: args.paused });
    else await ctx.db.insert("workspaceControls", { workspaceId: ctx.workspaceId, agentsPaused: args.paused });
    if (args.paused) await cancelOpen(ctx, ctx.workspaceId, "cancelled");
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: args.paused ? "agents.paused" : "agents.resumed",
      subject: ctx.workspaceId,
      count: args.paused ? 1 : 0,
    });
    return null;
  },
});
