import { overlayCallFactors } from "@/lib/scoring/events";
import { computeReadinessScore } from "@/lib/scoring/compute";
import { extractFactors, extractionReasoning } from "@/lib/scoring/extract";
import {
  insertScoreRow,
  loadLatestFactors,
  loadScoreConfig,
  loadScoreMaps,
  type ScoringClient,
  type WriteScoreResult,
} from "@/lib/scoring/store";

/**
 * Re-score from a call extraction. Call-derived factors replace prior ones
 * where present; the rest stay. Prompt 8 lands the extraction and calls this.
 */
export async function scoreLeadFromCall(
  client: ScoringClient,
  args: {
    orgId: string;
    leadId: string;
    callId: string;
    signals: {
      timeline_signal: string | null;
      budget_signal: string | null;
      decision_process: string | null;
    };
  }
): Promise<WriteScoreResult | { written: false; reason: "unscored" }> {
  const [config, maps, previous] = await Promise.all([
    loadScoreConfig(client, args.orgId),
    loadScoreMaps(client, args.orgId),
    loadLatestFactors(client, args.orgId, args.leadId),
  ]);

  const extracted = extractFactors(
    {
      timeline_signal: args.signals.timeline_signal ?? undefined,
      budget_signal: args.signals.budget_signal ?? undefined,
      decision_process: args.signals.decision_process ?? undefined,
    },
    maps
  );
  const merged = overlayCallFactors(previous, extracted.factors);
  const computed = computeReadinessScore(merged, config.weights);
  if (computed.kind === "unscored") {
    return { written: false, reason: "unscored" };
  }

  const extraction = extractionReasoning(extracted.notes, extracted.ignoredFields);
  const reasoning =
    `${computed.explanation} Call evidence replaced application answers where they conflicted; nothing was averaged. ${extraction}`.trim();

  return insertScoreRow(client, {
    orgId: args.orgId,
    leadId: args.leadId,
    factors: computed.factors,
    total: computed.total,
    reasoning,
    triggeredBy: "call",
    callId: args.callId,
    idempotencyKey: `call:${args.callId}`,
  });
}
