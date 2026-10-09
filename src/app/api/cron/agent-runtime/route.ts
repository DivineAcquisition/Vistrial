import { runAgentRuntimeJob } from "@/lib/agents/jobs";
import { flagStuckAgentRuns } from "@/lib/live/maintenance";
import { notifyDaAlert } from "@/lib/ops/alerts";
import { runAuthorizedCron } from "@/lib/ops/jobs";
import { processRelayJobs } from "@/lib/relay/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "agent-runtime", async (db) => {
    const runtime = await runAgentRuntimeJob(db);
    const stuck = await flagStuckAgentRuns(db);
    const relay = await processRelayJobs().catch(() => null);
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
    return { ...runtime, stuck, relay };
  });
}
