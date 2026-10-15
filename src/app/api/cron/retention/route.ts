import type { SupabaseClient } from "@supabase/supabase-js";

import { runAuthorizedCron } from "@/lib/ops/jobs";
import { deleteOrgsPastGrace } from "@/lib/ops/lifecycle";
import { pruneAgentRunHistory } from "@/lib/live/maintenance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  return runAuthorizedCron(request, "retention", async (db) => {
    const { data: preview, error } = await db.rpc("run_data_retention", { p_dry_run: dryRun });
    if (error) throw new Error(error.message);
    const agentRuns = await pruneAgentRunHistory(db, dryRun);
    let deletedOrgs = 0;
    // Compass conversations older than the workspace's retention setting, and long-expired shares.
    let compass: unknown = null;
    if (!dryRun) {
      deletedOrgs = await deleteOrgsPastGrace(db);
      const { data: purged, error: purgeError } = await (db as unknown as SupabaseClient).rpc("compass_purge");
      if (purgeError) throw new Error(purgeError.message);
      compass = purged;
    }
    let accessRequests = 0;
    if (!dryRun) {
      const { data: purgedRequests, error: requestError } = await (db as unknown as SupabaseClient).rpc(
        "purge_expired_access_requests"
      );
      if (requestError) throw new Error(requestError.message);
      accessRequests = typeof purgedRequests === "number" ? purgedRequests : 0;
      const { retryAccessRequestEmail, notifyStaleRequests } = await import("@/lib/access-requests/submit");
      await retryAccessRequestEmail();
      await notifyStaleRequests();
    }
    const { data: notices, error: noticeError } = await (db as unknown as SupabaseClient).rpc(
      "purge_notification_retention",
      { p_dry_run: dryRun }
    );
    if (noticeError) throw new Error(noticeError.message);
    return { retention: preview, agentRuns, deletedOrgs, compass, accessRequests, notices, dryRun };
  });
}
