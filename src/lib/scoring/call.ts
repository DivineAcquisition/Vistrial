import { overlayCallFactors } from "@/lib/scoring/events";
import { computeReadinessScore, type FactorValues } from "@/lib/scoring/compute";
import { extractCallFactors, extractionReasoning } from "@/lib/scoring/extract";
import {
  insertScoreRow,
  loadLatestFactors,
  loadScoreConfig,
  loadScoreMaps,
  type ScoringClient,
  type WriteScoreResult,
} from "@/lib/scoring/store";
import { callScoreReasoning, type CallScoreSignal } from "@/lib/scoring/call-reason";
import type { Enums } from "@/types/database";

export type CallSignalText = {
  timeline_signal: string | null;
  budget_signal: string | null;
  decision_process: string | null;
};

/**
 * Quote only what actually moved a factor. A signal the call raised but that
 * mapped to nothing explains no part of this score, and naming it as the reason
 * would send an operator looking for a change that never happened.
 */
export function namedCallSignals(
  signals: CallSignalText,
  factors: FactorValues
): CallScoreSignal[] {
  const named: CallScoreSignal[] = [];
  if (signals.timeline_signal && factors.timeline !== null) {
    named.push({ factor: "timeline", text: signals.timeline_signal });
  }
  if (signals.budget_signal && factors.investment_capacity !== null) {
    named.push({ factor: "investment capacity", text: signals.budget_signal });
  }
  if (signals.decision_process && factors.decision_authority !== null) {
    named.push({ factor: "decision authority", text: signals.decision_process });
  }
  return named;
}

/**
 * Re-score from a call extraction. Call-derived factors replace prior ones
 * where present; the rest stay. Nothing is averaged.
 */
export async function scoreLeadFromCall(
  client: ScoringClient,
  args: {
    orgId: string;
    leadId: string;
    callId: string;
    extractionId?: string | null;
    callType?: Enums<"call_type"> | null;
    callAt?: string | null;
    signals: CallSignalText;
  }
): Promise<WriteScoreResult | { written: false; reason: "unscored" }> {
  if (!args.signals.timeline_signal && !args.signals.budget_signal && !args.signals.decision_process) {
    return { written: false, reason: "unscored" };
  }

  const [config, maps, previous] = await Promise.all([
    loadScoreConfig(client, args.orgId),
    loadScoreMaps(client, args.orgId),
    loadLatestFactors(client, args.orgId, args.leadId),
  ]);

  const extracted = extractCallFactors(args.signals, maps);
  const merged = overlayCallFactors(previous, extracted.factors);
  const computed = computeReadinessScore(merged, config.weights);
  if (computed.kind === "unscored") {
    return { written: false, reason: "unscored" };
  }

  const namedSignals = namedCallSignals(args.signals, extracted.factors);
  const extraction = extractionReasoning(extracted.notes, extracted.ignoredFields);
  const reasoning = callScoreReasoning({
    callId: args.callId,
    callType: args.callType ?? null,
    callAt: args.callAt ?? null,
    explanation: computed.explanation,
    signals: namedSignals,
    mapping: extraction,
  });

  const idempotencyKey = args.extractionId
    ? `call:${args.callId}:extract:${args.extractionId}`
    : `call:${args.callId}`;

  return insertScoreRow(client, {
    orgId: args.orgId,
    leadId: args.leadId,
    factors: computed.factors,
    total: computed.total,
    reasoning,
    triggeredBy: "call",
    callId: args.callId,
    idempotencyKey,
  });
}
