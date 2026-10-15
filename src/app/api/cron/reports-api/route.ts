import { deliverDueWebhooks } from "@/lib/webhooks/deliver";
import { runScheduledReports } from "@/lib/reports/schedule";
import { purgeExpiredExports } from "@/lib/exports/purge";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "reports-api", async (db) => {
    const webhooks = await deliverDueWebhooks(db);
    const reports = await runScheduledReports(db);
    const exports = await purgeExpiredExports();
    return { webhooks, reports, exports };
  });
}
