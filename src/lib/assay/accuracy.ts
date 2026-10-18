import { tiersSeparate } from "@/lib/assay/learn";
import { TIERS_NOT_SEPARATING } from "@/lib/assay/copy";
import type { Tier } from "@/lib/assay/types";

export type ClosedRow = { tier: Tier; won: boolean; daysToClose: number | null };

export type TierAccuracy = {
  tier: Tier;
  n: number;
  won: number;
  rate: number | null;
  enough: boolean;
};

export function winRateByTier(rows: ClosedRow[], min = 20): { tiers: TierAccuracy[]; flag: string | null; hotDays: number | null; otherDays: number | null } {
  const tiers: TierAccuracy[] = (["hot", "warm", "cool", "cold"] as const).map((tier) => {
    const group = rows.filter((row) => row.tier === tier);
    const won = group.filter((row) => row.won).length;
    const enough = group.length >= min;
    return {
      tier,
      n: group.length,
      won,
      enough,
      rate: enough && group.length > 0 ? Math.round((won / group.length) * 1000) / 10 : null,
    };
  });
  const hot = tiers.find((row) => row.tier === "hot")!;
  const warm = tiers.find((row) => row.tier === "warm")!;
  const separation = tiersSeparate({ won: hot.won, n: hot.n }, { won: warm.won, n: warm.n });
  const median = (values: number[]) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const hotDays = median(rows.filter((row) => row.tier === "hot" && row.won && row.daysToClose != null).map((row) => row.daysToClose as number));
  const otherDays = median(rows.filter((row) => row.tier !== "hot" && row.won && row.daysToClose != null).map((row) => row.daysToClose as number));
  return {
    tiers,
    flag: separation.enough && separation.flag ? TIERS_NOT_SEPARATING : null,
    hotDays,
    otherDays,
  };
}
