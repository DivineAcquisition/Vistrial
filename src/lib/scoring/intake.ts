import type { Json } from "@/types/database";

import {
  answersFromJson,
  insertScoreRow,
  loadScoreConfig,
  loadScoreMaps,
  scoreFromAnswers,
  type ScoringClient,
  type WriteScoreResult,
} from "@/lib/scoring/store";

/**
 * Intake score for a new lead. Idempotent per lead: the same creation event
 * cannot write two rows.
 */
export async function scoreLeadOnIntake(
  client: ScoringClient,
  args: {
    orgId: string;
    leadId: string;
    answers: Json;
  }
): Promise<WriteScoreResult | { written: false; reason: "unscored" }> {
  const [config, maps] = await Promise.all([
    loadScoreConfig(client, args.orgId),
    loadScoreMaps(client, args.orgId),
  ]);
  const { computed, extraction } = scoreFromAnswers(
    answersFromJson(args.answers),
    maps,
    config.weights
  );

  if (computed.kind === "unscored") {
    return { written: false, reason: "unscored" };
  }

  return insertScoreRow(client, {
    orgId: args.orgId,
    leadId: args.leadId,
    factors: computed.factors,
    total: computed.total,
    reasoning: `${computed.explanation} ${extraction}`.trim(),
    triggeredBy: "intake",
    idempotencyKey: `intake:${args.leadId}`,
  });
}
