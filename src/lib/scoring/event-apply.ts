import { applyEventToFactors, type ScoringEvent } from "@/lib/scoring/events";
import { computeReadinessScore } from "@/lib/scoring/compute";
import {
  insertScoreRow,
  loadLatestFactors,
  loadScoreConfig,
  type ScoringClient,
  type WriteScoreResult,
} from "@/lib/scoring/store";

export async function scoreLeadFromEvent(
  client: ScoringClient,
  args: {
    orgId: string;
    leadId: string;
    event: ScoringEvent;
    idempotencyKey: string;
  }
): Promise<WriteScoreResult | { written: false; reason: "unscored" }> {
  const [config, previous] = await Promise.all([
    loadScoreConfig(client, args.orgId),
    loadLatestFactors(client, args.orgId, args.leadId),
  ]);
  const applied = applyEventToFactors(previous, args.event);
  const computed = computeReadinessScore(applied.factors, config.weights);
  if (computed.kind === "unscored") {
    return { written: false, reason: "unscored" };
  }

  return insertScoreRow(client, {
    orgId: args.orgId,
    leadId: args.leadId,
    factors: computed.factors,
    total: computed.total,
    reasoning: `${applied.summary} ${computed.explanation}`.trim(),
    triggeredBy: "event",
    idempotencyKey: args.idempotencyKey,
  });
}

/** Call outcome no-show. Prompt 8 should call this when a call is marked no-show. */
export async function scoreNoShow(
  client: ScoringClient,
  args: { orgId: string; leadId: string; callId: string }
) {
  return scoreLeadFromEvent(client, {
    ...args,
    event: "no_show",
    idempotencyKey: `event:no_show:${args.callId}`,
  });
}

/**
 * Inbound reply after silence. Silence is the org soft-ghost threshold in
 * the org timezone, measured against the previous last_touch_at (or opted_in_at).
 * Prompt 6 should call this when an inbound touch lands.
 */
export async function scoreInboundReplyAfterSilence(
  client: ScoringClient,
  args: {
    orgId: string;
    leadId: string;
    touchId: string;
    daysSilentBeforeTouch: number;
    ghostDaysSoft: number;
  }
): Promise<WriteScoreResult | { written: false; reason: "unscored" | "not_silent" }> {
  if (args.daysSilentBeforeTouch < args.ghostDaysSoft) {
    return { written: false, reason: "not_silent" };
  }
  return scoreLeadFromEvent(client, {
    orgId: args.orgId,
    leadId: args.leadId,
    event: "inbound_reply",
    idempotencyKey: `event:inbound_reply:${args.touchId}`,
  });
}
