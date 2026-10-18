import { assertRulesFair } from "@/lib/assay/fairness";
import { templateForSlug, templateRuleset } from "@/lib/assay/rulesets";
import type { CapSettings, PartWeights, Ruleset, ScoreRule, TierThresholds, TriggerSettings } from "@/lib/assay/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function rulesetToRow(ruleset: Ruleset, orgId: string) {
  return {
    id: ruleset.id.startsWith("template:") ? undefined : ruleset.id,
    org_id: orgId,
    version: ruleset.version,
    template_slug: ruleset.template,
    weights: ruleset.weights,
    tiers: ruleset.tiers,
    decay_days: ruleset.decayDays,
    confidence_min: ruleset.confidenceMin,
    triggers: ruleset.triggers,
    caps: ruleset.caps,
    rules: ruleset.rules,
    note: ruleset.note,
    active: true,
  };
}

export function rulesetFromRow(row: Record<string, unknown>): Ruleset {
  const weights = asRecord(row.weights) ?? {};
  const tiers = asRecord(row.tiers) ?? {};
  const triggers = asRecord(row.triggers) ?? {};
  const caps = asRecord(row.caps) ?? {};
  const rules = Array.isArray(row.rules) ? (row.rules as ScoreRule[]) : [];
  const ruleset: Ruleset = {
    id: String(row.id),
    version: Number(row.version ?? 1),
    template: templateForSlug(String(row.template_slug ?? "")),
    weights: {
      fit: Number(weights.fit ?? 35),
      engagement: Number(weights.engagement ?? 45),
      call: Number(weights.call ?? 20),
    } satisfies PartWeights,
    tiers: {
      hot: Number(tiers.hot ?? 75),
      warm: Number(tiers.warm ?? 50),
      cool: Number(tiers.cool ?? 25),
      stickiness: Number(tiers.stickiness ?? 5),
    } satisfies TierThresholds,
    decayDays: Number(row.decay_days ?? 7),
    confidenceMin: row.confidence_min === "low" || row.confidence_min === "high" ? row.confidence_min : "medium",
    triggers: {
      becameHot: triggers.becameHot !== false,
      bigJump: triggers.bigJump !== false,
      bigJumpPoints: Number(triggers.bigJumpPoints ?? 20),
      goingQuiet: triggers.goingQuiet !== false,
      goingQuietDays: Number(triggers.goingQuietDays ?? 3),
      hotNoShow: triggers.hotNoShow !== false,
    } satisfies TriggerSettings,
    caps: {
      tasksPerPersonPerDay: Number(caps.tasksPerPersonPerDay ?? 15),
      tasksPerWorkspacePerDay: Number(caps.tasksPerWorkspacePerDay ?? 60),
      draftsPerWorkspacePerDay: Number(caps.draftsPerWorkspacePerDay ?? 40),
      triggerCooldownHours: Number(caps.triggerCooldownHours ?? 72),
    } satisfies CapSettings,
    rules,
    note: String(row.note ?? ""),
  };
  assertRulesFair(ruleset.rules);
  return ruleset;
}

export function defaultRulesetFor(slug: string | null | undefined): Ruleset {
  return templateRuleset(templateForSlug(slug));
}
