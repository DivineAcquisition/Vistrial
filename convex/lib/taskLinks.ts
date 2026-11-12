/**
 * What an agent task is linked to, read from the database: the conversation its work started in, the run
 * that became, the draft the run produced and the decision its result is measured through. `taskState`
 * (lib/agentTasks.ts) turns these into where the task stands; `syncTasks` writes that down.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { taskState, type TaskLinks } from "./agentTasks";

export type LinkedRecords = {
  intake: Doc<"intakes"> | null;
  run: Doc<"agentRuns"> | null;
  asset: Doc<"assets"> | null;
  decision: Doc<"decisions"> | null;
};

/** The records a task points at, each checked to be this organization's. A record that is gone reads as none. */
export async function linkedRecords(ctx: QueryCtx, task: Doc<"agentTasks">): Promise<LinkedRecords> {
  const here = <T extends { workspaceId: Id<"workspaces"> }>(row: T | null) => (row && row.workspaceId === task.workspaceId ? row : null);
  const intake = task.intakeId ? here(await ctx.db.get(task.intakeId)) : null;
  // The run a conversation started: on the conversation itself, or the latest run of the project it opened.
  let runId = task.runId ?? intake?.runId;
  if (!runId && intake?.status === "started" && intake.projectId) runId = here(await ctx.db.get(intake.projectId))?.latestRunId;
  const run = runId ? here(await ctx.db.get(runId)) : null;
  const asset = run
    ? await ctx.db
        .query("assets")
        .withIndex("by_workspace_run", (q) => q.eq("workspaceId", task.workspaceId).eq("createdByRun", run._id))
        .first()
    : null;
  const decision = task.decisionId ? here(await ctx.db.get(task.decisionId)) : null;
  return { intake, run, asset, decision };
}

export function linksOf(records: LinkedRecords): TaskLinks {
  return {
    intake: records.intake ? { status: records.intake.status } : null,
    run: records.run ? { status: records.run.status } : null,
    asset: records.asset ? { status: records.asset.status } : null,
    decision: records.decision ? { checkInAt: records.decision.checkInAt, outcome: Boolean(records.decision.outcome) } : null,
  };
}

const LIVE = ["approved", "running", "needsYou", "done"] as const;

/**
 * Brings the stored status of every task that is under way in line with what it is linked to, and
 * remembers the run a conversation became. Called when a run changes; reading the board never depends on it.
 */
export async function syncTasks(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  const now = Date.now();
  for (const status of LIVE) {
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", workspaceId).eq("status", status))
      .order("desc")
      .take(status === "done" ? 30 : 100);
    for (const task of tasks) {
      const records = await linkedRecords(ctx, task);
      const state = taskState(task.status, linksOf(records), now);
      const runId = records.run?._id;
      if (state.status === task.status && (!runId || runId === task.runId)) continue;
      await ctx.db.patch(task._id, { status: state.status, ...(runId && runId !== task.runId ? { runId } : {}), updatedAt: now });
    }
  }
}
