import { HARD_REQUIREMENT_IDS, SETUP_STEPS, WARNING_IDS, type SetupStepId } from "@/lib/onboarding/constants";
import type { ActivationGate, GateRequirement, GateWarning, OrgSetupState } from "@/lib/onboarding/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseHard(value: unknown): GateRequirement[] {
  if (!Array.isArray(value)) return [];
  const rows: GateRequirement[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;
    const id = asString(row.id);
    if (!id || !(HARD_REQUIREMENT_IDS as readonly string[]).includes(id)) continue;
    const fix = asString(row.fix_step) ?? "review";
    rows.push({
      id: id as GateRequirement["id"],
      ok: asBool(row.ok),
      label: asString(row.label) ?? id,
      fixStep: (SETUP_STEPS as readonly string[]).includes(fix) ? (fix as SetupStepId) : "review",
      detail: asString(row.detail),
    });
  }
  return rows;
}

function parseWarnings(value: unknown): GateWarning[] {
  if (!Array.isArray(value)) return [];
  const rows: GateWarning[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;
    const id = asString(row.id);
    if (!id || !(WARNING_IDS as readonly string[]).includes(id)) continue;
    rows.push({
      id: id as GateWarning["id"],
      applies: asBool(row.applies),
      label: asString(row.label) ?? id,
      consequence: asString(row.consequence) ?? "",
    });
  }
  return rows;
}

export function parseActivationGate(value: unknown): ActivationGate | null {
  const row = asRecord(value);
  if (!row) return null;
  const orgId = asString(row.org_id);
  if (!orgId) return null;
  const last = asString(row.last_visited_step) ?? "organization";
  return {
    orgId,
    activatedAt: asString(row.activated_at),
    canActivate: asBool(row.can_activate),
    hard: parseHard(row.hard),
    warnings: parseWarnings(row.warnings),
    memberCount: asNumber(row.member_count),
    voiceExampleCount: asNumber(row.voice_example_count),
    transcriptChoice:
      row.transcript_choice === "connected" || row.transcript_choice === "manual"
        ? row.transcript_choice
        : null,
    baselineFallback:
      row.baseline_fallback === "self_reported" || row.baseline_fallback === "declined"
        ? row.baseline_fallback
        : null,
    lastVisitedStep: (SETUP_STEPS as readonly string[]).includes(last)
      ? (last as SetupStepId)
      : "organization",
  };
}

export function parseOrgSetupState(value: unknown): OrgSetupState | null {
  const row = asRecord(value);
  if (!row) return null;
  const org = asRecord(row.org);
  const gate = parseActivationGate(row.gate);
  if (!org || !gate) return null;
  const id = asString(org.id);
  const name = asString(org.name);
  const slug = asString(org.slug);
  const timezone = asString(org.timezone);
  if (!id || !name || !slug || !timezone) return null;

  const steps = Array.isArray(row.steps)
    ? row.steps.flatMap((item) => {
        const step = asRecord(item);
        const stepId = asString(step?.id);
        if (!stepId || !(SETUP_STEPS as readonly string[]).includes(stepId)) return [];
        return [
          {
            id: stepId as SetupStepId,
            complete: asBool(step?.complete),
            locked: asBool(step?.locked),
          },
        ];
      })
    : [];

  const backfill = asRecord(row.backfill);

  return {
    org: {
      id,
      name,
      slug,
      timezone,
      activatedAt: asString(org.activated_at),
    },
    lastVisitedStep: gate.lastVisitedStep,
    steps,
    gate,
    backfill: backfill
      ? {
          status: asString(backfill.status) ?? "unknown",
          grade: asString(backfill.grade),
          gradeReasons: Array.isArray(backfill.grade_reasons)
            ? backfill.grade_reasons.filter((item): item is string => typeof item === "string")
            : [],
        }
      : null,
  };
}

export function applicableWarnings(gate: ActivationGate): GateWarning[] {
  return gate.warnings.filter((warning) => warning.applies);
}

export function unmetHard(gate: ActivationGate): GateRequirement[] {
  return gate.hard.filter((item) => !item.ok);
}
