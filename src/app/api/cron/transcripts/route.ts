import { runAuthorizedCron } from "@/lib/ops/jobs";
import { runTranscriptJobs } from "@/lib/transcripts/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "transcripts", (db) => runTranscriptJobs(db));
}
