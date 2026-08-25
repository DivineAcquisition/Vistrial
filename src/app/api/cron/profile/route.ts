import { runAuthorizedCron } from "@/lib/ops/jobs";
import { runProfileJobs } from "@/lib/profile/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "profile", (db) => runProfileJobs(db));
}
