import { v } from "convex/values";

import { requireAccess, type Access } from "./access";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

type RunDoc = Doc<"activityRuns">;

async function seesRun(
  ctx: import("./_generated/server").QueryCtx,
  access: Extract<Access, { principal: "user"; scope: "workspace" }>,
  run: RunDoc,
): Promise<boolean> {
  if (access.role === "platform_admin" || access.role === "service_team") return true;
  if (run.agentId === "compass") return run.actorMemberId === access.memberLegacyId;
  if (access.role === "owner" || access.role === "member") return true;
  if (access.role !== "operator" || !run.leadId || !access.memberLegacyId) return false;
  const lead = await ctx.db
    .query("leadAccess")
    .withIndex("by_lead", (q) => q.eq("leadId", run.leadId as string))
    .unique();
  if (!lead || lead.workspaceId !== access.workspaceId || lead.drifted) return false;
  const unassigned = !lead.setterMemberId && !lead.closerMemberId;
  return unassigned || lead.setterMemberId === access.memberLegacyId || lead.closerMemberId === access.memberLegacyId;
}

function seesApproval(access: Extract<Access, { principal: "user"; scope: "workspace" }>, item: Doc<"approvalItems">): boolean {
  if (access.role === "owner" || access.role === "platform_admin" || access.role === "service_team") return true;
  return Boolean(item.assignedMemberId && item.assignedMemberId === access.memberLegacyId);
}

/** The live strip, panel, and approval cards for one workspace. */
export const feed = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const loaded = await ctx.db
      .query("activityRuns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(200);
    const runs = [];
    for (const run of loaded) {
      if (await seesRun(ctx, access, run)) runs.push(run);
    }
    const visibleRuns = new Set(runs.map((run) => run.legacyId));
    const steps = (
      await ctx.db
        .query("activitySteps")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(500)
    ).filter((step) => visibleRuns.has(step.runId));
    const events = (
      await ctx.db
        .query("activityEvents")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(300)
    ).filter((event) => visibleRuns.has(event.runId));
    const outputs = (
      await ctx.db
        .query("activityOutputs")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(200)
    ).filter((output) => visibleRuns.has(output.runId));
    const controls = await ctx.db
      .query("presenceControls")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(20);
    const approvals = (
      await ctx.db
        .query("approvalItems")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(200)
    ).filter((item) => seesApproval(access, item));
    return {
      runs: runs.map((run) => run.row),
      steps: steps.map((step) => step.row),
      events: events.map((event) => event.row),
      outputs: outputs.map((output) => output.row),
      controls: controls.map((control) => control.row),
      approvals: approvals.map((item) => item.row),
    };
  },
});

/** Technical run detail. Service Team and Platform Admin only. */
export const staffDetail = query({
  args: { workspaceId: v.string(), runId: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    if (access.role !== "platform_admin" && access.role !== "service_team") return null;
    const row = await ctx.db
      .query("activityStaff")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .unique();
    if (!row || row.workspaceId !== args.workspaceId) return null;
    return row.row;
  },
});

/**
 * Run ids and statuses in a window, for the reconciliation against the
 * Postgres copy. Identifiers and statuses only.
 */
export const runIdsSince = query({
  args: { key: v.string(), job: v.string(), workspaceId: v.string(), since: v.string() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "system", key: args.key, job: args.job, workspaceId: args.workspaceId });
    const rows = await ctx.db
      .query("activityRuns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(2000);
    return rows
      .filter((run) => String((run.row as { created_at?: string }).created_at ?? "") >= args.since)
      .map((run) => ({ id: run.legacyId, status: run.status }));
  },
});
