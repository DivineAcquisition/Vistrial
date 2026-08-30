import { runAgentRuntimeJob } from "@/lib/agents/jobs";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "agent-runtime", (db) => runAgentRuntimeJob(db));
}
