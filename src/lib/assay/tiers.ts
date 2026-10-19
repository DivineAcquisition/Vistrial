import type { TierLines } from "@/lib/assay/rules";
import { TIER_RANK, type Tier } from "@/lib/assay/vocabulary";

/** The tier a score falls in, with no memory of the last one. */
export function rawTier(score: number, lines: TierLines): Tier {
  if (score >= lines.hot) return "hot";
  if (score >= lines.warm) return "warm";
  if (score >= lines.cool) return "cool";
  return "cold";
}

function lineFor(tier: Tier, lines: TierLines): number {
  if (tier === "hot") return lines.hot;
  if (tier === "warm") return lines.warm;
  if (tier === "cool") return lines.cool;
  return 0;
}

/**
 * A lead moves up a tier as soon as it crosses the line, and down only once
 * it falls `stickiness` points below the line of the tier it is in. The
 * number is always shown as it is.
 */
export function stickyTier(score: number, lines: TierLines, previous: Tier | null, stickiness: number): Tier {
  const next = rawTier(score, lines);
  if (!previous || TIER_RANK[next] >= TIER_RANK[previous]) return next;
  let tier: Tier = previous;
  while (TIER_RANK[tier] > TIER_RANK[next] && score < lineFor(tier, lines) - stickiness) {
    tier = BELOW[tier];
  }
  return tier;
}

const BELOW: Record<Tier, Tier> = { hot: "warm", warm: "cool", cool: "cold", cold: "cold" };

/** Warm or higher counts as ready: the Forsight "qualified" line and the ready track. */
export function isReadyTier(tier: Tier): boolean {
  return tier === "hot" || tier === "warm";
}
