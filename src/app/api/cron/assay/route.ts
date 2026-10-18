import { runAssayPass } from "@/lib/assay/worker";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runAuthorizedCron(request, "assay", async (db) => runAssayPass(db as never));
}
