import { v } from "convex/values";

import { requireAccess } from "./access";
import { mutation } from "./_generated/server";
import { upsertEvent, upsertOutput, upsertRun, upsertStaff, upsertStep } from "./liveRows";

const op = v.object({
  idempotencyKey: v.string(),
  seq: v.number(),
  occurredAt: v.string(),
  kind: v.string(),
  action: v.string(),
  row: v.any(),
});

async function alreadyApplied(ctx: { db: import("./_generated/server").MutationCtx["db"] }, key: string): Promise<boolean> {
  const existing = await ctx.db
    .query("activityReceipts")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return Boolean(existing);
}

/** Live writer. The import key is refused: only the system caller may commit. */
export const commit = mutation({
  args: {
    key: v.string(),
    job: v.string(),
    workspaceId: v.string(),
    ops: v.array(op),
  },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, {
      scope: "system",
      key: args.key,
      job: args.job,
      workspaceId: args.workspaceId,
    });
    let applied = 0;
    const ids: string[] = [];
    for (const item of [...args.ops].sort((a, b) => a.seq - b.seq)) {
      const row = item.row as Record<string, unknown>;
      if (row.org_id !== access.workspaceId && row.workspaceId !== access.workspaceId) {
        throw new Error("A system call cannot leave its workspace.");
      }
      if (await alreadyApplied(ctx, item.idempotencyKey)) {
        if (typeof row.id === "string") ids.push(row.id);
        continue;
      }
      row.actor_job = access.job;
      row.actor = "system";
      if (item.action === "update" && item.kind === "run" && typeof row.id === "string") {
        const existing = await ctx.db
          .query("activityRuns")
          .withIndex("by_legacyId", (q) => q.eq("legacyId", row.id as string))
          .unique();
        if (existing) {
          await ctx.db.patch(existing._id, {
            status: typeof row.status === "string" ? row.status : existing.status,
            subjectLabel: typeof row.subject_label === "string" ? row.subject_label : existing.subjectLabel,
            leadId: typeof row.lead_id === "string" ? row.lead_id : existing.leadId,
            row: { ...(existing.row as Record<string, unknown>), ...row, actor_job: access.job, actor: "system" },
          });
        }
        await ctx.db.insert("activityReceipts", { key: item.idempotencyKey });
        ids.push(row.id);
        applied += 1;
        continue;
      }
      if (item.action === "update" && item.kind === "step") {
        const steps = await ctx.db
          .query("activitySteps")
          .withIndex("by_run", (q) => q.eq("runId", String(row.run_id ?? "")))
          .take(50);
        const step = steps.find((itemStep) => itemStep.seq === Number(row.seq));
        if (step) {
          await ctx.db.patch(step._id, {
            status: typeof row.status === "string" ? row.status : step.status,
            row: { ...(step.row as Record<string, unknown>), ...row },
          });
        }
        await ctx.db.insert("activityReceipts", { key: item.idempotencyKey });
        applied += 1;
        continue;
      }
      if (item.kind === "run" && typeof row.trigger_key === "string") {
        const runs = await ctx.db
          .query("activityRuns")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", access.workspaceId))
          .take(200);
        const existing = runs.find(
          (run) => run.agentId === row.agent_id && (run.row as { trigger_key?: string }).trigger_key === row.trigger_key,
        );
        if (existing) {
          await ctx.db.insert("activityReceipts", { key: item.idempotencyKey });
          ids.push(existing.legacyId);
          continue;
        }
      }
      if (item.kind === "run") await upsertRun(ctx, row);
      else if (item.kind === "step") await upsertStep(ctx, row);
      else if (item.kind === "event") await upsertEvent(ctx, { ...row, occurred_at: item.occurredAt, seq: item.seq });
      else if (item.kind === "output") await upsertOutput(ctx, row);
      else if (item.kind === "staff") await upsertStaff(ctx, row);
      await ctx.db.insert("activityReceipts", { key: item.idempotencyKey });
      if (typeof row.id === "string") ids.push(row.id);
      applied += 1;
    }
    return { applied, ids };
  },
});
