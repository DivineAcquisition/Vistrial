import type { MutationCtx } from "./_generated/server";

type Row = Record<string, unknown>;

function text(row: Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function required(row: Row, key: string): string {
  return text(row, key) ?? "";
}

export async function upsertRun(ctx: MutationCtx, row: Row) {
  const fields = {
    legacyId: required(row, "id"),
    workspaceId: required(row, "org_id"),
    agentId: required(row, "agent_id"),
    leadId: text(row, "lead_id"),
    actorMemberId: text(row, "actor_member_id"),
    setterMemberId: text(row, "setter_member_id"),
    closerMemberId: text(row, "closer_member_id"),
    status: required(row, "status") || "queued",
    subjectLabel: required(row, "subject_label"),
    row,
  };
  const existing = await ctx.db
    .query("activityRuns")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", fields.legacyId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("activityRuns", fields);
}

export async function upsertStep(ctx: MutationCtx, row: Row) {
  const fields = {
    legacyId: required(row, "id"),
    workspaceId: required(row, "org_id"),
    runId: required(row, "run_id"),
    agentId: required(row, "agent_id"),
    leadId: text(row, "lead_id"),
    actorMemberId: text(row, "actor_member_id"),
    seq: typeof row.seq === "number" ? row.seq : Number(row.seq ?? 0),
    status: required(row, "status") || "pending",
    row,
  };
  const existing = await ctx.db
    .query("activitySteps")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", fields.legacyId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("activitySteps", fields);
}

export async function upsertEvent(ctx: MutationCtx, row: Row) {
  const fields = {
    legacyId: required(row, "id"),
    workspaceId: required(row, "org_id"),
    runId: required(row, "run_id"),
    agentId: required(row, "agent_id"),
    leadId: text(row, "lead_id"),
    actorMemberId: text(row, "actor_member_id"),
    occurredAt: required(row, "occurred_at"),
    ...(typeof row.seq === "number" ? { seq: row.seq } : {}),
    row,
  };
  const existing = await ctx.db
    .query("activityEvents")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", fields.legacyId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("activityEvents", fields);
}

export async function upsertOutput(ctx: MutationCtx, row: Row) {
  const fields = {
    legacyId: required(row, "id"),
    workspaceId: required(row, "org_id"),
    runId: required(row, "run_id"),
    agentId: required(row, "agent_id"),
    leadId: text(row, "lead_id"),
    actorMemberId: text(row, "actor_member_id"),
    row,
  };
  const existing = await ctx.db
    .query("activityOutputs")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", fields.legacyId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("activityOutputs", fields);
}

export async function upsertStaff(ctx: MutationCtx, row: Row) {
  const runId = required(row, "run_id");
  const fields = { runId, workspaceId: required(row, "org_id"), row };
  const existing = await ctx.db
    .query("activityStaff")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("activityStaff", fields);
}

export async function upsertPresence(ctx: MutationCtx, row: Row) {
  const workspaceId = required(row, "org_id");
  const agentId = required(row, "agent_id");
  const fields = { workspaceId, agentId, paused: row.paused === true, row };
  const existing = (
    await ctx.db
      .query("presenceControls")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .take(20)
  ).find((item) => item.agentId === agentId);
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("presenceControls", fields);
}

export async function upsertApproval(ctx: MutationCtx, row: Row) {
  const fields = {
    legacyId: required(row, "id"),
    workspaceId: required(row, "org_id"),
    status: required(row, "status") || "pending",
    assignedMemberId: text(row, "assigned_member_id"),
    title: required(row, "title"),
    row,
  };
  const existing = await ctx.db
    .query("approvalItems")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", fields.legacyId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("approvalItems", fields);
}

export async function upsertNotification(ctx: MutationCtx, row: Row) {
  const fields = {
    legacyId: required(row, "id"),
    workspaceId: required(row, "org_id"),
    status: required(row, "status"),
    queuedAt: required(row, "queued_at"),
    row,
  };
  const existing = await ctx.db
    .query("notifications")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", fields.legacyId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("notifications", fields);
}
