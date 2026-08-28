import { runAuthorizedCron } from "@/lib/ops/jobs";
import { runSourceSyncJobs } from "@/lib/sources/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "source-sync", (db) => runSourceSyncJobs(db));
}
