"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { runGhostDetectorForOrg } from "@/lib/scoring/ghost";
import { isScoreFactor } from "@/lib/scoring/extract";
import { loadScoreConfig, loadScoreMaps, scoreFromAnswers, answersFromJson } from "@/lib/scoring/store";
import { insertScoreRow } from "@/lib/scoring/store";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

function parseIntField(value: FormDataEntryValue | null, label: string, min: number, max: number): number | string {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return `${label} must be an integer from ${min} to ${max}.`;
  }
  return parsed;
}

export async function updateScoringConfig(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role)) {
    return { status: "error", error: "You do not have permission to change scoring settings." };
  }

  const timeline = parseIntField(formData.get("timeline_weight"), "Timeline weight", 0, 100);
  const investment = parseIntField(formData.get("investment_capacity_weight"), "Investment capacity weight", 0, 100);
  const authority = parseIntField(formData.get("decision_authority_weight"), "Decision authority weight", 0, 100);
  const pain = parseIntField(formData.get("pain_severity_weight"), "Pain severity weight", 0, 100);
  const ready = parseIntField(formData.get("ready_threshold"), "Ready threshold", 0, 100);
  const speed = parseIntField(formData.get("speed_to_lead_minutes"), "Speed-to-lead minutes", 1, 24 * 60);
  const ghostSoft = parseIntField(formData.get("ghost_days_soft"), "Approaching-ghost days", 1, 365);
  const ghostHard = parseIntField(formData.get("ghost_days_hard"), "Ghost days", 1, 365);

  for (const value of [timeline, investment, authority, pain, ready, speed, ghostSoft, ghostHard]) {
    if (typeof value === "string") return { status: "error", error: value };
  }

  const weights = [timeline, investment, authority, pain] as number[];
  const sum = weights.reduce((total, value) => total + value, 0);
  if (sum !== 100) {
    return { status: "error", error: `Weights must add to 100. They currently add to ${sum}.` };
  }
  if ((ghostSoft as number) >= (ghostHard as number)) {
    return { status: "error", error: "The approaching-ghost window must be shorter than the ghost window." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("score_configs")
    .update({
      timeline_weight: timeline as number,
      investment_capacity_weight: investment as number,
      decision_authority_weight: authority as number,
      pain_severity_weight: pain as number,
      ready_threshold: ready as number,
      speed_to_lead_minutes: speed as number,
      ghost_days_soft: ghostSoft as number,
      ghost_days_hard: ghostHard as number,
    })
    .eq("org_id", ctx.org.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { status: "error", error: "Could not save scoring settings." };
  }

  revalidatePath("/app/settings/scoring");
  return { status: "saved" };
}

export type MappingSaveResult = SettingsSaveResult;

export type MappingPayload = {
  field_name: string;
  factor: string;
  rules: Array<{
    kind: "choice" | "range";
    answer_value: string | null;
    range_min: number | null;
    range_max: number | null;
    score: number;
  }>;
};

export async function replaceScoreMaps(maps: MappingPayload[]): Promise<MappingSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role)) {
    return { status: "error", error: "You do not have permission to change scoring mappings." };
  }

  if (maps.length === 0) {
    return { status: "error", error: "Keep at least one field mapping, or scoring cannot read applications." };
  }

  for (const map of maps) {
    const fieldName = map.field_name.trim();
    if (!fieldName) return { status: "error", error: "Every mapping needs an application field name." };
    if (!isScoreFactor(map.factor)) return { status: "error", error: "Pick a valid factor for each field." };
    if (map.rules.length === 0) {
      return { status: "error", error: `“${fieldName}” needs at least one answer rule.` };
    }
    for (const rule of map.rules) {
      if (!Number.isInteger(rule.score) || rule.score < 0 || rule.score > 100) {
        return { status: "error", error: "Each mapped score must be an integer from 0 to 100." };
      }
      if (rule.kind === "choice" && !rule.answer_value?.trim()) {
        return { status: "error", error: `“${fieldName}” has a choice rule with no answer.` };
      }
      if (
        rule.kind === "range" &&
        (rule.range_min === null || rule.range_max === null || rule.range_min > rule.range_max)
      ) {
        return { status: "error", error: `“${fieldName}” has a range that is not usable.` };
      }
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_org_score_maps", {
    p_org_id: ctx.org.id,
    p_maps: maps.map((map) => ({
      field_name: map.field_name.trim(),
      factor: map.factor,
      rules: map.rules,
    })) as Json,
  });

  if (error) {
    return { status: "error", error: "Could not save the factor mappings." };
  }

  revalidatePath("/app/settings/scoring");
  return { status: "saved" };
}

export async function bulkRescoreLeads(): Promise<SettingsSaveResult & { count?: number }> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role)) {
    return { status: "error", error: "You do not have permission to re-score leads." };
  }

  const supabase = await createClient();
  const [config, maps, leads] = await Promise.all([
    loadScoreConfig(supabase, ctx.org.id),
    loadScoreMaps(supabase, ctx.org.id),
    supabase
      .from("leads")
      .select("id, current_score, application_answers")
      .eq("org_id", ctx.org.id),
  ]);

  if (leads.error) {
    return { status: "error", error: "Could not load leads to re-score." };
  }

  let count = 0;
  for (const lead of leads.data ?? []) {
    const { computed, extraction } = scoreFromAnswers(
      answersFromJson(lead.application_answers),
      maps,
      config.weights
    );
    if (computed.kind === "unscored") continue;

    const previous =
      lead.current_score === null ? "none" : String(lead.current_score);
    const result = await insertScoreRow(supabase, {
      orgId: ctx.org.id,
      leadId: lead.id,
      factors: computed.factors,
      total: computed.total,
      reasoning: `Bulk re-score by ${ctx.member.displayName} under the current settings. Previous cached score was ${previous}. Older score rows were not rewritten. ${computed.explanation} ${extraction}`.trim(),
      triggeredBy: "manual",
      scoredByMemberId: ctx.member.id,
    });
    if (result.written) count += 1;
  }

  revalidatePath("/app/settings/scoring");
  return { status: "saved", count };
}

export async function runGhostDetectorNow(): Promise<
  SettingsSaveResult & { evaluated?: number; changed?: number }
> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role)) {
    return { status: "error", error: "You do not have permission to run the ghost detector." };
  }

  try {
    const result = await runGhostDetectorForOrg(getSupabaseAdmin(), ctx.org.id);
    revalidatePath("/app/settings/scoring");
    return {
      status: "saved",
      evaluated: result.evaluated,
      changed: result.changed,
    };
  } catch {
    return { status: "error", error: "Could not run the ghost detector." };
  }
}
