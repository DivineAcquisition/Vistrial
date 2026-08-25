import { runAuthorizedCron } from "@/lib/ops/jobs";
import { runGhostDetector } from "@/lib/scoring/ghost";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runAuthorizedCron(request, "ghost-detector", async (db) => {
    const result = await runGhostDetector(db);
    return { evaluated: result.evaluated, changed: result.changed, orgs: result.orgs };
  });
}
