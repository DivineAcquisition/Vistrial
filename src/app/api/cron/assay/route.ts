import { runAssayJobs } from "@/lib/assay/jobs";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runAuthorizedCron(request, "assay", async (db) => runAssayJobs(db));
}
