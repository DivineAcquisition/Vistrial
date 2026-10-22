import { runAgentRuntimeJob } from "@/lib/agents/jobs";
import { drainCopyOutbox, drainLiveOutbox } from "@/lib/live/drain";
import { flagStuckAgentRuns } from "@/lib/live/maintenance";
import { reconcileLiveRecord } from "@/lib/live/reconcile";
import { notifyDaAlert } from "@/lib/ops/alerts";
import { runAuthorizedCron } from "@/lib/ops/jobs";
import { processRelayJobs } from "@/lib/relay/run";
import { advanceWorkflows } from "@/lib/workflows/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "agent-runtime", async (db) => {
    const copy = await drainCopyOutbox().catch(() => null);
    const drained = await drainLiveOutbox().catch(() => 0);
    // Once an hour: does the Convex record agree with the copy the screens read?
    const drift = new Date().getUTCMinutes() === 0 ? await reconcileLiveRecord().catch(() => null) : null;
    const runtime = await runAgentRuntimeJob(db);
    const stuck = await flagStuckAgentRuns(db);
    const relay = await processRelayJobs().catch(() => null);
    const workflows = await advanceWorkflows(db as never).catch(() => null);
    if (!relay) {
      await notifyDaAlert({ kind: "relay_pass_failed", title: "Relay's pass failed", checkFirst: "The agent-runtime cron logs and the relay_jobs table.", severity: "warning" });
    } else if (relay.dead > 0) {
      await notifyDaAlert({
        kind: "relay_dead_jobs",
        title: `${relay.dead} Relay job${relay.dead === 1 ? "" : "s"} could not be drafted`,
        checkFirst: "Agents → Relay → Could not draft. Retry once the cause is fixed.",
        severity: "warning",
        detail: { dead: relay.dead },
      });
    }
    return { ...runtime, stuck, relay, workflows, drained, copy, drift };
  });
}
