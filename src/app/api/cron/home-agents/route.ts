import { scanAllOrgs } from "@/lib/home/scan";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runAuthorizedCron(request, "home-agents", (db) => scanAllOrgs(db));
}
