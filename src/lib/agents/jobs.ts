import "server-only";

import { afterFailedRun } from "@/lib/agents/retry";
import { listAgentDefinitions } from "@/lib/agents/catalog";
import { isDueInOrgTimezone } from "@/lib/agents/schedule";
import { pollMessageBatch } from "@/lib/agents/batch";
import { loadAwaitingBatch, loadFailedRunsDue, updateAgentRun } from "@/lib/agents/persist";
import type { GhlDb } from "@/lib/ghl/tokens";

/**
 * One cron for the runtime: retry failed runs, finish batch turns,
 * and start scheduled agents that are due in the org timezone.
 * No working scheduled agent ships in this prompt.
 */
export async function runAgentRuntimeJob(db: GhlDb): Promise<{
  retried: number;
  deadLettered: number;
  batches: number;
  scheduled: number;
}> {
  let retried = 0;
  let deadLettered = 0;
  let batches = 0;
  const scheduled = 0;

  const due = await loadFailedRunsDue(db as never);
  for (const row of due) {
    const retryCount = Number(row.retry_count ?? 0);
    const next = afterFailedRun({ status: "failed", retryCount });
    if (next.nextStatus === "dead_lettered") {
      await updateAgentRun(db as never, {
        runId: String(row.id),
        orgId: String(row.org_id),
        status: "dead_lettered",
        stopReason: "retry_exhausted",
        finished: true,
      });
      deadLettered += 1;
      continue;
    }
    await updateAgentRun(db as never, {
      runId: String(row.id),
      orgId: String(row.org_id),
      status: "queued",
      nextRetryAt: next.nextRetryAt?.toISOString() ?? null,
      retryCount: retryCount + 1,
    });
    retried += 1;
  }

  const waiting = await loadAwaitingBatch(db as never);
  for (const row of waiting) {
    const batchId = typeof row.batch_id === "string" ? row.batch_id : null;
    if (!batchId) continue;
    const polled = await pollMessageBatch(batchId);
    if (polled.status === "in_progress") continue;
    if (polled.status === "failed") {
      await updateAgentRun(db as never, {
        runId: String(row.id),
        orgId: String(row.org_id),
        status: "failed",
        stopReason: polled.error,
        finished: false,
      });
      continue;
    }
    await updateAgentRun(db as never, {
      runId: String(row.id),
      orgId: String(row.org_id),
      status: "running",
      model: polled.turn.model,
      modelVersion: polled.turn.model,
      inputTokens: polled.turn.inputTokens,
      outputTokens: polled.turn.outputTokens,
      cacheReadTokens: polled.turn.cacheReadTokens,
    });
    batches += 1;
  }

  const { data: orgs } = await db.from("organizations").select("id, timezone, agents_halted");
  const scheduledAgents = listAgentDefinitions().filter((agent) => agent.modes.includes("scheduled"));
  const now = new Date();
  for (const org of orgs ?? []) {
    if (org.agents_halted) continue;
    const timezone = org.timezone ?? "America/New_York";
    for (const agent of scheduledAgents) {
      void agent;
      void isDueInOrgTimezone({ timezone, nowUtc: now, hour: 7, minute: 0 });
    }
  }

  return { retried, deadLettered, batches, scheduled };
}
