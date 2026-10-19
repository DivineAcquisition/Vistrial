import { v } from "convex/values";

import { requireAccess, type Access } from "./access";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

type RunDoc = Doc<"activityRuns">;

function seesRun(access: Extract<Access, { scope: "workspace" }>, run: RunDoc): boolean {
  if (access.role === "platform_admin" || access.role === "service_team") return true;
  if (run.agentId === "compass") return run.actorMemberId === access.memberLegacyId;
  if (access.role === "owner" || access.role === "member") return true;
  if (access.role !== "operator" || !run.leadId) return access.role === "operator" && !run.leadId;
  const mine = access.memberLegacyId;
  const unassigned = !run.setterMemberId && !run.closerMemberId;
  return unassigned || run.setterMemberId === mine || run.closerMemberId === mine;
}

function seesApproval(access: Extract<Access, { scope: "workspace" }>, item: Doc<"approvalItems">): boolean {
  if (access.role === "owner" || access.role === "platform_admin" || access.role === "service_team") return true;
  return Boolean(item.assignedMemberId && item.assignedMemberId === access.memberLegacyId);
}

/** The live strip, panel, and approval cards for one workspace. */
export const feed = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const runs = (
      await ctx.db
        .query("activityRuns")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(200)
    ).filter((run) => seesRun(access, run));
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
