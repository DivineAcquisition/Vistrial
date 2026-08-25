import { deliverQueuedNotifications } from "@/lib/notifications/deliver";
import { runNotificationObserve } from "@/lib/notifications/observe";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "notifications", async (db) => {
    const observed = await runNotificationObserve(db);
    const delivered = await deliverQueuedNotifications(db);
    return { ...observed, ...delivered };
  });
}
