import { runVerificationAuditJob } from "@/lib/verification/audit";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "verification-audit", (db) => runVerificationAuditJob(db));
}
