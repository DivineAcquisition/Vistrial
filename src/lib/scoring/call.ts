import { overlayCallFactors } from "@/lib/scoring/events";
import { computeReadinessScore } from "@/lib/scoring/compute";
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
    signals: {
      timeline_signal: string | null;
      budget_signal: string | null;
      decision_process: string | null;
    };
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

  const namedSignals: CallScoreSignal[] = [];
  if (args.signals.timeline_signal) {
    namedSignals.push({ factor: "timeline", text: args.signals.timeline_signal });
  }
  if (args.signals.budget_signal) {
    namedSignals.push({ factor: "investment capacity", text: args.signals.budget_signal });
  }
  if (args.signals.decision_process) {
    namedSignals.push({ factor: "decision authority", text: args.signals.decision_process });
  }

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
