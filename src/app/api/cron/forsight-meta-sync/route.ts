import { runForsightMetaSync } from "@/lib/forsight/meta-sync";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "forsight-meta-sync", (db) => runForsightMetaSync(db));
}
