import { runBaselineBackfill } from "@/lib/ghl/backfill";
import { runAuthorizedCron } from "@/lib/ops/jobs";
import { ensureBaselineQueuedForConnectedOrgs } from "@/lib/reporting/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "baseline-backfill", async (db) => {
    const queued = await ensureBaselineQueuedForConnectedOrgs(db);
    const result = await runBaselineBackfill(db);
    return { queued, ...result };
  });
}
