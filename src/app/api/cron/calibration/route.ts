import { runAuthorizedCron } from "@/lib/ops/jobs";
import { runCalibrationJobs } from "@/lib/calibration/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "calibration", (db) => runCalibrationJobs(db));
}
