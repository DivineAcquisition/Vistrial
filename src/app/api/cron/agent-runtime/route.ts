import { runAgentRuntimeJob } from "@/lib/agents/jobs";
import { flagStuckAgentRuns } from "@/lib/live/maintenance";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "agent-runtime", async (db) => {
    const runtime = await runAgentRuntimeJob(db);
    const stuck = await flagStuckAgentRuns(db);
    return { ...runtime, stuck };
  });
}
