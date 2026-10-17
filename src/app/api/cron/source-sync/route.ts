import { maintainConnections } from "@/lib/connectors/maintain";
import { runAuthorizedCron } from "@/lib/ops/jobs";
import { runSourceSyncJobs } from "@/lib/sources/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "source-sync", async (db) => {
    const sources = await runSourceSyncJobs(db);
    const connectors = await maintainConnections();
    return { ...sources, connectors };
  });
}
