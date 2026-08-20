import "server-only";

import { refreshExpiringConnections } from "@/lib/ghl/client";
import { drainDispatchQueue } from "@/lib/ghl/dispatch";
import { emitIngestionAlerts } from "@/lib/ghl/health";
import { ghlLog } from "@/lib/ghl/log";
import { processGhlWebhookQueue } from "@/lib/ghl/process";
import type { GhlDb } from "@/lib/ghl/tokens";

export async function runGhlJobs(db: GhlDb): Promise<{
  refreshed: number;
  events: number;
  failed: number;
  dispatched: number;
  alerts: number;
}> {
  const refreshed = await refreshExpiringConnections(db);
  const processed = await processGhlWebhookQueue(db);
  const dispatch = await drainDispatchQueue(db);
  const alerts = await emitIngestionAlerts(db);
  ghlLog("ghl.jobs.ran", {
    refreshed,
    events: processed.events,
    failed: processed.failed,
    dispatched: dispatch.sent,
    queued: dispatch.queued,
    alerts,
  });
  return {
    refreshed,
    events: processed.events,
    failed: processed.failed,
    dispatched: dispatch.sent,
    alerts,
  };
}
