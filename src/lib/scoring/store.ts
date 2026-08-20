import type { SupabaseClient } from "@supabase/supabase-js";

import {
  computeReadinessScore,
  type FactorValues,
  type ScoreWeights,
} from "@/lib/scoring/compute";
import {
  extractFactors,
  extractionReasoning,
  type ScoreFieldMap,
} from "@/lib/scoring/extract";
import type { Database, Json } from "@/types/database";

export type ScoringClient = SupabaseClient<Database>;

export type LoadedScoreConfig = {
  orgId: string;
  weights: ScoreWeights;
  readyThreshold: number;
  speedToLeadMinutes: number;
  ghostDaysSoft: number;
  ghostDaysHard: number;
};

export function answersFromJson(value: Json): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function factorsFromScoreRow(row: {
  timeline_raw: number | null;
  investment_capacity_raw: number | null;
  decision_authority_raw: number | null;
  pain_severity_raw: number | null;
}): FactorValues {
  return {
    timeline: row.timeline_raw,
    investment_capacity: row.investment_capacity_raw,
    decision_authority: row.decision_authority_raw,
    pain_severity: row.pain_severity_raw,
  };
}

export async function loadScoreConfig(
  client: ScoringClient,
  orgId: string
): Promise<LoadedScoreConfig> {
  const { data, error } = await client
    .from("score_configs")
    .select(
      "org_id, timeline_weight, investment_capacity_weight, decision_authority_weight, pain_severity_weight, ready_threshold, speed_to_lead_minutes, ghost_days_soft, ghost_days_hard"
    )
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("This workspace has no scoring config.");
  }

  return {
    orgId: data.org_id,
    weights: {
      timeline: data.timeline_weight,
      investment_capacity: data.investment_capacity_weight,
      decision_authority: data.decision_authority_weight,
      pain_severity: data.pain_severity_weight,
    },
    readyThreshold: data.ready_threshold,
    speedToLeadMinutes: data.speed_to_lead_minutes,
    ghostDaysSoft: data.ghost_days_soft,
    ghostDaysHard: data.ghost_days_hard,
  };
}

export async function loadScoreMaps(
  client: ScoringClient,
  orgId: string
): Promise<ScoreFieldMap[]> {
  const [{ data: maps, error: mapError }, { data: rules, error: ruleError }] = await Promise.all([
    client
      .from("score_field_maps")
      .select("id, field_name, factor")
      .eq("org_id", orgId)
      .order("field_name", { ascending: true }),
    client
      .from("score_field_rules")
      .select("id, field_map_id, kind, answer_value, range_min, range_max, score")
      .eq("org_id", orgId),
  ]);

  if (mapError || ruleError) {
    throw new Error("Could not load scoring maps.");
  }

  const byMap = new Map<string, ScoreFieldMap>();
  for (const map of maps ?? []) {
    byMap.set(map.id, {
      id: map.id,
      fieldName: map.field_name,
      factor: map.factor,
      rules: [],
    });
  }
  for (const rule of rules ?? []) {
    const map = byMap.get(rule.field_map_id);
    if (!map) continue;
    map.rules.push({
      id: rule.id,
      kind: rule.kind,
      answerValue: rule.answer_value,
      rangeMin: rule.range_min === null ? null : Number(rule.range_min),
      rangeMax: rule.range_max === null ? null : Number(rule.range_max),
      score: rule.score,
    });
  }
  return [...byMap.values()];
}

export async function loadLatestFactors(
  client: ScoringClient,
  orgId: string,
  leadId: string
): Promise<FactorValues> {
  const { data } = await client
    .from("readiness_scores")
    .select("timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw")
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return {
      timeline: null,
      investment_capacity: null,
      decision_authority: null,
      pain_severity: null,
    };
  }
  return factorsFromScoreRow(data);
}

export type WriteScoreInput = {
  orgId: string;
  leadId: string;
  factors: FactorValues;
  total: number;
  reasoning: string;
  triggeredBy: Database["public"]["Enums"]["score_trigger"];
  callId?: string | null;
  scoredByMemberId?: string | null;
  idempotencyKey?: string | null;
};

export type WriteScoreResult =
  | { written: true; id: string }
  | { written: false; reason: "duplicate" | "db" };

export async function insertScoreRow(
  client: ScoringClient,
  input: WriteScoreInput
): Promise<WriteScoreResult> {
  const { data, error } = await client
    .from("readiness_scores")
    .insert({
      org_id: input.orgId,
      lead_id: input.leadId,
      timeline_raw: input.factors.timeline,
      investment_capacity_raw: input.factors.investment_capacity,
      decision_authority_raw: input.factors.decision_authority,
      pain_severity_raw: input.factors.pain_severity,
      total: input.total,
      reasoning: input.reasoning,
      triggered_by: input.triggeredBy,
      call_id: input.callId ?? null,
      scored_by_member_id: input.scoredByMemberId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { written: false, reason: "duplicate" };
    return { written: false, reason: "db" };
  }
  if (!data) return { written: false, reason: "db" };
  return { written: true, id: data.id };
}

export function scoreFromAnswers(
  answers: Record<string, unknown>,
  maps: ScoreFieldMap[],
  weights: ScoreWeights
) {
  const extracted = extractFactors(answers, maps);
  const computed = computeReadinessScore(extracted.factors, weights);
  const extraction = extractionReasoning(extracted.notes, extracted.ignoredFields);
  return { extracted, computed, extraction };
}
