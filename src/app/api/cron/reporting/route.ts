import { runAuthorizedCron } from "@/lib/ops/jobs";
import { runReportingJobs } from "@/lib/reporting/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "reporting", (db) => runReportingJobs(db));
}
