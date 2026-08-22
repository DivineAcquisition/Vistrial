import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  answersFromJson,
  insertScoreRow,
  loadScoreConfig,
  loadScoreMaps,
  scoreFromAnswers,
} from "@/lib/scoring/store";
import type { Database } from "@/types/database";

/**
 * Re-score every lead under the configuration a stage just wrote.
 *
 * Without this, mapping a field or moving a weight during onboarding changes
 * nothing a client can see: the leads already in the workspace keep the score
 * they were given under the old settings. The qualification stage promises to
 * show how their real leads score under what they just described, so the leads
 * have to actually be scored under it.
 *
 * Older score rows are never rewritten. Each pass appends a new row, so the
 * history of what a lead scored under which settings stays readable.
 */
export async function rescoreOrgLeads(
  client: SupabaseClient<Database>,
  args: { orgId: string; memberId: string | null; reason: string }
): Promise<number> {
  const [config, maps, leads] = await Promise.all([
    loadScoreConfig(client, args.orgId),
    loadScoreMaps(client, args.orgId),
    client.from("leads").select("id, current_score, application_answers").eq("org_id", args.orgId),
  ]);

  if (leads.error) return 0;

  let count = 0;
  for (const lead of leads.data ?? []) {
    const { computed, extraction } = scoreFromAnswers(
      answersFromJson(lead.application_answers),
      maps,
      config.weights
    );
    if (computed.kind === "unscored") continue;

    const previous = lead.current_score === null ? "none" : String(lead.current_score);
    const result = await insertScoreRow(client, {
      orgId: args.orgId,
      leadId: lead.id,
      factors: computed.factors,
      total: computed.total,
      reasoning:
        `${args.reason} Previous cached score was ${previous}. Older score rows were not rewritten. ${computed.explanation} ${extraction}`.trim(),
      triggeredBy: "manual",
      scoredByMemberId: args.memberId,
    });
    if (result.written) count += 1;
  }

  return count;
}
