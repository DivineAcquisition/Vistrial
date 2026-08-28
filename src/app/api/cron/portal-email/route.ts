import { runAuthorizedCron } from "@/lib/ops/jobs";
import { runPortalEmailJobs } from "@/lib/portal/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "portal-email", (db) => runPortalEmailJobs(db));
}
