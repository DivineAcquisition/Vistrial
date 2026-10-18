import { hiddenCallReasonLine } from "@/lib/assay/copy";
import type { FiredRule, Tier } from "@/lib/assay/types";
import { TIER_LABEL } from "@/lib/assay/types";

export type VisibleScore = {
  tier: Tier | "do_not_contact";
  score: number;
  reasons: FiredRule[];
  hiddenCallCount: number;
  hiddenLine: string | null;
};

export function visibleScore(args: {
  tier: Tier;
  score: number;
  doNotContact: boolean;
  reasons: FiredRule[];
  canSeeCall: boolean;
}): VisibleScore {
  if (args.doNotContact) {
    return { tier: "do_not_contact", score: args.score, reasons: [], hiddenCallCount: 0, hiddenLine: null };
  }
  if (args.canSeeCall) {
    return { tier: args.tier, score: args.score, reasons: args.reasons, hiddenCallCount: 0, hiddenLine: null };
  }
  const reasons = args.reasons.filter((reason) => !reason.callBased);
  const hiddenCallCount = args.reasons.length - reasons.length;
  return {
    tier: args.tier,
    score: args.score,
    reasons,
    hiddenCallCount,
    hiddenLine: hiddenCallCount > 0 ? hiddenCallReasonLine(hiddenCallCount) : null,
  };
}

export type ExportScore = {
  score: number | null;
  tier: string | null;
  reasons: string[];
};

/** Exports include the score only for roles that can already export leads. */
export function exportScore(args: {
  canExport: boolean;
  canSeeCall: boolean;
  score: number | null;
  tier: Tier | null;
  reasons: FiredRule[];
}): ExportScore {
  if (!args.canExport || args.score == null || !args.tier) return { score: null, tier: null, reasons: [] };
  const reasons = args.reasons.filter((reason) => args.canSeeCall || !reason.callBased).map((reason) => reason.reason);
  return { score: args.score, tier: TIER_LABEL[args.tier], reasons };
}

export function clientReportTotals(rows: Array<{ tier: Tier }>): Record<Tier, number> {
  const totals: Record<Tier, number> = { hot: 0, warm: 0, cool: 0, cold: 0 };
  for (const row of rows) totals[row.tier] += 1;
  return totals;
}

export function compassExplanation(args: { name: string; visible: VisibleScore }): string {
  if (args.visible.tier === "do_not_contact") return `${args.name} is marked do not contact, so Assay does not rank them for outreach.`;
  const reasons = args.visible.reasons.map((reason) => reason.reason.replace(/\.$/, "")).join("; ");
  const hidden = args.visible.hiddenLine ? ` ${args.visible.hiddenLine}` : "";
  return reasons
    ? `${args.name} is ${TIER_LABEL[args.visible.tier]} at ${args.visible.score}. ${reasons}.${hidden}`
    : `${args.name} is ${TIER_LABEL[args.visible.tier]} at ${args.visible.score}.${hidden}`;
}
