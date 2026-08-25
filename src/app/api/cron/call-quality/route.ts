import { runAuthorizedCron } from "@/lib/ops/jobs";
import { runCallQualityJobs } from "@/lib/coaching/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "call-quality", (db) => runCallQualityJobs(db));
}
