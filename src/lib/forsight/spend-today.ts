import "server-only";

import { readCached } from "@/lib/forsight/cache";
import { fetchMetaAdInsights } from "@/lib/forsight/meta";
import { loadForsightSource, type ForsightDb } from "@/lib/forsight/sources";
import { isoDate } from "@/lib/forsight/weeks";

/**
 * Today's spend, read live from Meta so the dashboard does not have to wait
 * for tomorrow's sync.
 *
 * Deliberately nothing to do with the sync. They answer different questions —
 * this one is "what is happening right now", the sync is "what does Airtable
 * need in order to calculate costs" — and they must not be able to break each
 * other. Nothing here writes, and nothing here throws: an unavailable figure
 * is one unavailable figure, not a blank page.
 */

export type SpendToday =
  | { state: "ok"; date: string; spend: number; fetchedAt: Date }
  | { state: "unavailable"; reason: string }
  | { state: "not_tracked" };

export async function loadSpendToday(
  db: ForsightDb,
  args: { orgId: string; orgName?: string | null; now?: Date }
): Promise<SpendToday> {
  const today = isoDate(args.now ?? new Date());

  try {
    const source = await loadForsightSource(db, args.orgId, "meta_ads");
    if (!source || source.type !== "meta_ads") return { state: "not_tracked" };

    // The cache key carries the date so the figure rolls over at midnight
    // instead of showing yesterday's total for the first few minutes.
    const read = await readCached(
      { orgId: args.orgId, sourceId: source.id, dataset: `meta:spend:${today}` },
      async () => {
        const result = await fetchMetaAdInsights({
          orgId: args.orgId,
          orgLabel: args.orgName,
          adAccountId: source.adAccountId,
          since: today,
          until: today,
        });
        return [{ id: today, fields: { spend: result.totalSpend } }];
      }
    );

    const spend = read.records[0]?.fields.spend;
    if (typeof spend !== "number") {
      return { state: "unavailable", reason: "Meta returned no spend figure for today." };
    }
    return { state: "ok", date: today, spend, fetchedAt: read.fetchedAt };
  } catch (error) {
    return {
      state: "unavailable",
      reason: error instanceof Error ? error.message : "Meta could not be reached.",
    };
  }
}
