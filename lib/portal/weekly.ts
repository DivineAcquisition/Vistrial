/**
 * Weekly summary delivery. One email per opted-in portal user for the last
 * complete calendar week. The unique index on (client_user_id, kind,
 * period_start) is what stops a retry from double-sending.
 */

import { loadPortalDashboard, listClientUsers } from "@/lib/db/portal";
import { listClients } from "@/lib/db/clients";
import { deliverWeeklySummary } from "@/lib/notifications/portal";
import { baseUrl } from "@/lib/origin";
import { lastCompleteWeek } from "@/lib/portal/cpa";
import type { LedgerDb } from "@/lib/supabase/ledger";

export type WeeklySummaryResult = {
  considered: number;
  sent: number;
  failed: number;
  skipped: number;
};

export async function runWeeklySummaries(
  db: LedgerDb,
  now: Date | number = Date.now()
): Promise<WeeklySummaryResult> {
  const period = lastCompleteWeek(now);
  const origin = await baseUrl();
  const clients = await listClients();

  let considered = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const client of clients) {
    if (client.status === "Churned") continue;

    const users = (await listClientUsers(client.id)).filter(
      (user) => user.status === "active" && user.weekly_summary
    );

    if (users.length === 0) continue;

    const dashboard = await loadPortalDashboard(client.id, period);

    for (const membership of users) {
      considered += 1;

      // Skip when a row already exists for this week (unique index also guards).
      const { data: existing } = await db
        .from("client_notifications")
        .select("id")
        .eq("client_user_id", membership.id)
        .eq("kind", "weekly_summary")
        .eq("period_start", period.start)
        .maybeSingle();

      if (existing) {
        skipped += 1;
        continue;
      }

      const delivery = await deliverWeeklySummary(db, {
        client,
        membership,
        cost: dashboard.cost,
        portalUrl: `${origin}/portal`,
      });

      if (delivery.status === "sent") sent += 1;
      else failed += 1;
    }
  }

  return { considered, sent, failed, skipped };
}
