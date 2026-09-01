import { generatePreviousMonthForAll } from "@/lib/forsight/report/generate";
import { isoDate } from "@/lib/forsight/weeks";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "forsight-reports", (db) =>
    generatePreviousMonthForAll(db, isoDate(new Date()))
  );
}
