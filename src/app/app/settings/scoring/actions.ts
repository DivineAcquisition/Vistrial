"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { runGhostDetectorForOrg } from "@/lib/scoring/ghost";
import { isScoreFactor } from "@/lib/scoring/extract";
import { loadScoreConfig, loadScoreMaps, scoreFromAnswers, answersFromJson } from "@/lib/scoring/store";
import { insertScoreRow } from "@/lib/scoring/store";
import { HOLDOUT_MAX_PERCENT } from "@/lib/calibration/constants";
import { logSettingsActivity } from "@/lib/settings/activity";
import { canWriteAdvancedSettings } from "@/lib/settings/managed";
import { advancedRpcDenied, loadOrgManaged } from "@/lib/settings/org";
import { previewScoringImpact, scoringPreviewFingerprint, type ScoringPreviewConfig, type ScoringPreviewResult } from "@/lib/settings/preview";
import { loadScoringPreviewLeads } from "@/lib/settings/preview-load";
import { revalidateSettings } from "@/lib/settings/revalidate";
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

export async function previewScoringChange(
  proposed: ScoringPreviewConfig
): Promise<ScoringPreviewResult | { error: string }> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
    return { error: "You do not have permission to preview scoring settings." };
  }
  const supabase = await createClient();
  const current = await loadScoreConfig(supabase, ctx.org.id);
  const leads = await loadScoringPreviewLeads(ctx.org.id);
  return previewScoringImpact({
    leads,
    current: {
      ...current.weights,
      readyThreshold: current.readyThreshold,
      speedToLeadMinutes: current.speedToLeadMinutes,
      ghostDaysSoft: current.ghostDaysSoft,
      ghostDaysHard: current.ghostDaysHard,
    },
    proposed,
    timeZone: ctx.org.timezone,
  });
}

async function saveScoreConfigFromValues(args: {
  formData: FormData;
  proposed: ScoringPreviewConfig;
  holdoutPercent: number;
}): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
    return { status: "error", error: "You do not have permission to change scoring settings." };
  }
  const managed = await loadOrgManaged(ctx.org.id);
  if (!canWriteAdvancedSettings(ctx, managed.managed)) {
    return { status: "error", error: "These settings are managed by your install team. Take over management, or ask them to make the change." };
  }

  const fingerprint = String(args.formData.get("preview_fingerprint") ?? "");
  if (fingerprint !== scoringPreviewFingerprint(args.proposed)) {
    return {
      status: "error",
      error: "Preview the impact of these changes against current leads before saving.",
    };
  }

  const supabase = await createClient();
  const current = await loadScoreConfig(supabase, ctx.org.id);
  const { error } = await supabase.rpc("save_org_score_config", {
    p_org_id: ctx.org.id,
    p_timeline: args.proposed.timeline,
    p_investment: args.proposed.investment_capacity,
    p_authority: args.proposed.decision_authority,
    p_pain: args.proposed.pain_severity,
    p_threshold: args.proposed.readyThreshold,
    p_speed: args.proposed.speedToLeadMinutes,
    p_ghost_soft: args.proposed.ghostDaysSoft,
    p_ghost_hard: args.proposed.ghostDaysHard,
    p_source: "settings",
    p_holdout_percent: args.holdoutPercent,
  });

  if (error) {
    return { status: "error", error: advancedRpcDenied(error.message) ?? "Could not save scoring settings." };
  }

  await logSettingsActivity({
    ctx,
    section: "scoring",
    action: "Updated scoring configuration",
    from: {
      ...current.weights,
      readyThreshold: current.readyThreshold,
      speedToLeadMinutes: current.speedToLeadMinutes,
      ghostDaysSoft: current.ghostDaysSoft,
      ghostDaysHard: current.ghostDaysHard,
    },
    to: args.proposed,
  });

  revalidatePath("/app/settings/scoring");
  revalidatePath("/app/reporting/calibration");
  revalidateSettings();
  return { status: "saved" };
}

export async function updateScoringConfig(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const timeline = parseIntField(formData.get("timeline_weight"), "Timeline weight", 0, 100);
  const investment = parseIntField(formData.get("investment_capacity_weight"), "Investment capacity weight", 0, 100);
  const authority = parseIntField(formData.get("decision_authority_weight"), "Decision authority weight", 0, 100);
  const pain = parseIntField(formData.get("pain_severity_weight"), "Pain severity weight", 0, 100);
  const ready = parseIntField(formData.get("ready_threshold"), "Ready threshold", 0, 100);
  const speed = parseIntField(formData.get("speed_to_lead_minutes"), "Speed-to-lead minutes", 1, 24 * 60);
  const ghostSoft = parseIntField(formData.get("ghost_days_soft"), "Approaching-ghost days", 1, 365);
  const ghostHard = parseIntField(formData.get("ghost_days_hard"), "Ghost days", 1, 365);
  const holdoutEnabled = formData.get("holdout_enabled") === "on";
  const holdoutRaw = holdoutEnabled
    ? parseIntField(formData.get("holdout_percent"), "Holdout percent", 1, HOLDOUT_MAX_PERCENT)
    : 0;

  for (const value of [timeline, investment, authority, pain, ready, speed, ghostSoft, ghostHard, holdoutRaw]) {
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

  return saveScoreConfigFromValues({
    formData,
    proposed: {
      timeline: timeline as number,
      investment_capacity: investment as number,
      decision_authority: authority as number,
      pain_severity: pain as number,
      readyThreshold: ready as number,
      speedToLeadMinutes: speed as number,
      ghostDaysSoft: ghostSoft as number,
      ghostDaysHard: ghostHard as number,
    },
    holdoutPercent: holdoutRaw as number,
  });
}

export async function updateWorkspaceSensitivity(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
    return { status: "error", error: "You do not have permission to change scoring settings." };
  }
  const ready = parseIntField(formData.get("ready_threshold"), "Ready threshold", 0, 100);
  if (typeof ready === "string") return { status: "error", error: ready };
  const supabase = await createClient();
  const current = await loadScoreConfig(supabase, ctx.org.id);
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("holdout_percent")
    .eq("id", ctx.org.id)
    .maybeSingle();
  return saveScoreConfigFromValues({
    formData,
    proposed: {
      ...current.weights,
      readyThreshold: ready,
      speedToLeadMinutes: current.speedToLeadMinutes,
      ghostDaysSoft: current.ghostDaysSoft,
      ghostDaysHard: current.ghostDaysHard,
    },
    holdoutPercent: Number(orgRow?.holdout_percent ?? 0),
  });
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
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
    return { status: "error", error: "You do not have permission to change scoring mappings." };
  }
  const managed = await loadOrgManaged(ctx.org.id);
  if (!canWriteAdvancedSettings(ctx, managed.managed)) {
    return { status: "error", error: "These settings are managed by your install team. Take over management, or ask them to make the change." };
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
    return { status: "error", error: advancedRpcDenied(error.message) ?? "Could not save the factor mappings." };
  }

  await logSettingsActivity({
    ctx,
    section: "scoring",
    action: "Replaced scoring field mappings",
    to: { fieldCount: maps.length },
  });

  revalidatePath("/app/settings/scoring");
  revalidateSettings();
  return { status: "saved" };
}

export async function bulkRescoreLeads(): Promise<SettingsSaveResult & { count?: number }> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
    return { status: "error", error: "You do not have permission to re-score leads." };
  }
  const managed = await loadOrgManaged(ctx.org.id);
  if (!canWriteAdvancedSettings(ctx, managed.managed)) {
    return { status: "error", error: "These settings are managed by your install team. Take over management, or ask them to make the change." };
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

  await logSettingsActivity({
    ctx,
    section: "scoring",
    action: "Bulk re-scored leads",
    to: { count },
  });

  revalidatePath("/app/settings/scoring");
  revalidateSettings();
  return { status: "saved", count };
}

export async function runGhostDetectorNow(): Promise<
  SettingsSaveResult & { evaluated?: number; changed?: number }
> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
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
