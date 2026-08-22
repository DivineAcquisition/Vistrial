import type { Enums } from "@/types/database";
import { PROFILE_STAGES, type ProfileStage } from "@/lib/profile/stages";
import type {
  ActivationChange,
  ActivationReadiness,
  ActivationRecord,
  ActivationRequirement,
  ActivationWarning,
  ApplicationField,
  Benchmark,
  BenchmarkRow,
  BusinessProfileState,
  Completeness,
  CompletenessGap,
  Contradiction,
  DefaultSource,
  PatternSuggestion,
  ProfileDefault,
  ProfileDefaults,
  ProfileObjection,
  ProfileRow,
  ProfileVersion,
  RegistryField,
  ReviewPrompt,
  ScoreBand,
  StageMeaning,
  StageProgress,
} from "@/lib/profile/types";

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function bool(value: unknown): boolean {
  return value === true;
}

function strings(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function stage(value: unknown): ProfileStage {
  const text = str(value);
  return text && (PROFILE_STAGES as string[]).includes(text) ? (text as ProfileStage) : "business";
}

export function parseApplicationFields(value: unknown): ApplicationField[] {
  return asArray(value).flatMap((item) => {
    const row = asRecord(item);
    const answerKey = str(row.answer_key) ?? str(row.answerKey);
    if (!answerKey) return [];
    return [
      {
        answerKey,
        question: str(row.question),
        factor: (str(row.factor) as Enums<"score_factor"> | null) ?? null,
      },
    ];
  });
}

export function parseBands(value: unknown): ScoreBand[] {
  return asArray(value).flatMap((item) => {
    const row = asRecord(item);
    const answer = str(row.answer);
    const score = num(row.score);
    if (!answer || score === null) return [];
    return [{ answer, score, label: str(row.label) }];
  });
}

export function parseStageMeanings(value: unknown): StageMeaning[] {
  return asArray(value).flatMap((item) => {
    const row = asRecord(item);
    const crmStage = str(row.crm_stage) ?? str(row.crmStage);
    if (!crmStage) return [];
    return [{ crmStage, means: (str(row.means) as Enums<"lead_status"> | null) ?? null }];
  });
}

export function parseObjections(value: unknown): ProfileObjection[] {
  return asArray(value).flatMap((item) => {
    const row = asRecord(item);
    const type = str(row.type) as Enums<"objection_type"> | null;
    const phrasing = str(row.phrasing);
    if (!type || !phrasing) return [];
    return [{ type, phrasing, response: str(row.response) }];
  });
}

function parseSpend(value: unknown): Record<string, number> {
  const row = asRecord(value);
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(row)) {
    const cents = num(raw);
    if (cents !== null && cents > 0) out[key] = cents;
  }
  return out;
}

export function parseProfileRow(value: unknown): ProfileRow {
  const row = asRecord(value);
  const channel = str(row.channel_preference);
  return {
    orgId: str(row.org_id) ?? "",
    version: num(row.version) ?? 1,
    offerName: str(row.offer_name),
    offerType: (str(row.offer_type) as Enums<"profile_offer_type"> | null) ?? null,
    offerTypeOther: str(row.offer_type_other),
    pricePointCents: num(row.price_point_cents),
    paymentStructure:
      (str(row.payment_structure) as Enums<"profile_payment_structure"> | null) ?? null,
    paymentStructureOther: str(row.payment_structure_other),
    salesCycleDays: num(row.sales_cycle_days),
    touchesToClose: num(row.touches_to_close),
    closeMotion: (str(row.close_motion) as Enums<"profile_close_motion"> | null) ?? null,
    teamStructure: (str(row.team_structure) as Enums<"profile_team_structure"> | null) ?? null,
    monthlyLeadVolume: num(row.monthly_lead_volume),
    monthlyLeadTarget: num(row.monthly_lead_target),
    statedCloseRatePct: num(row.stated_close_rate_pct),
    leadChannels: strings(row.lead_channels) as Enums<"profile_lead_channel">[],
    leadChannelsOther: str(row.lead_channels_other),
    channelSpendCents: parseSpend(row.channel_spend_cents),
    applicationFields: parseApplicationFields(row.application_fields),
    qualificationSignals: strings(
      row.qualification_signals
    ) as Enums<"profile_qualification_signal">[],
    qualificationSignalsOther: str(row.qualification_signals_other),
    disqualifiers: strings(row.disqualifiers) as Enums<"profile_disqualifier">[],
    disqualifiersOther: str(row.disqualifiers_other),
    priceBands: parseBands(row.price_bands),
    timelineBands: parseBands(row.timeline_bands),
    speedToLeadIntentMinutes: num(row.speed_to_lead_intent_minutes),
    setterEstablishes: strings(row.setter_establishes) as Enums<"profile_setter_fact">[],
    setterEstablishesOther: str(row.setter_establishes_other),
    pipelineStageMeanings: parseStageMeanings(row.pipeline_stage_meanings),
    afterNoShow: (str(row.after_no_show) as Enums<"profile_existing_followup"> | null) ?? null,
    afterCall: (str(row.after_call) as Enums<"profile_existing_followup"> | null) ?? null,
    afterSilence: (str(row.after_silence) as Enums<"profile_existing_followup"> | null) ?? null,
    topObjections: parseObjections(row.top_objections),
    neverSay: strings(row.never_say),
    voiceFormality: (str(row.voice_formality) as Enums<"voice_formality"> | null) ?? null,
    channelPreference: channel === "sms" || channel === "email" ? channel : null,
    goalMetric: (str(row.goal_metric) as Enums<"profile_goal_metric"> | null) ?? null,
    goalValue: num(row.goal_value),
    aggregateOptOut: bool(row.aggregate_opt_out),
    completenessScore: num(row.completeness_score) ?? 0,
    lastReviewedAt: str(row.last_reviewed_at),
  };
}

export function parseCompleteness(value: unknown): Completeness {
  const row = asRecord(value);
  const gaps: CompletenessGap[] = asArray(row.gaps).map((item) => {
    const gap = asRecord(item);
    return {
      field: str(gap.field) ?? "",
      stage: stage(gap.stage),
      label: str(gap.label) ?? "",
      consumer: str(gap.consumer) ?? "",
    };
  });
  return {
    score: num(row.score) ?? 0,
    answered: num(row.answered) ?? 0,
    total: num(row.total) ?? 0,
    gaps,
    usableMin: num(row.usable_min) ?? 70,
  };
}

export function parseDefaults(value: unknown): ProfileDefaults {
  const row = asRecord(value);
  const out: ProfileDefaults = {};
  for (const [field, raw] of Object.entries(row)) {
    const entry = asRecord(raw);
    const source = str(entry.source);
    const parsed: ProfileDefault = {
      value: entry.value ?? null,
      source:
        source === "saved" || source === "derived" || source === "prior"
          ? (source as DefaultSource)
          : "fallback",
      basis: str(entry.basis) ?? "",
    };
    if (entry.crm_sources) parsed.crmSources = strings(entry.crm_sources);
    out[field] = parsed;
  }
  return out;
}

export function defaultValue<T>(defaults: ProfileDefaults, field: string, fallback: T): T {
  const entry = defaults[field];
  if (!entry || entry.value === null || entry.value === undefined) return fallback;
  return entry.value as T;
}

export function defaultStrings(defaults: ProfileDefaults, field: string): string[] {
  return strings(defaults[field]?.value);
}

export function parseBenchmark(value: unknown): Benchmark {
  const row = asRecord(value);
  const rows: BenchmarkRow[] = asArray(row.rows).flatMap((item) => {
    const entry = asRecord(item);
    const metric = str(entry.metric) as Enums<"benchmark_metric"> | null;
    const median = num(entry.cohort_median);
    if (!metric || median === null) return [];
    return [
      {
        metric,
        cohortMedian: median,
        orgCount: num(entry.org_count) ?? 0,
        ownValue: num(entry.own_value),
        ownSampleN: num(entry.own_sample_n),
        ownSource: str(entry.own_source),
      },
    ];
  });
  return {
    shown: bool(row.shown),
    orgCount: num(row.org_count) ?? 0,
    minCohort: num(row.min_cohort) ?? 5,
    rows,
    basis: str(row.basis),
    plain: str(row.plain),
  };
}

export function parsePatternFeedback(value: unknown): PatternSuggestion[] {
  return asArray(value).flatMap((item) => {
    const row = asRecord(item);
    const key = str(row.key);
    const plain = str(row.plain);
    if (!key || !plain) return [];
    return [{ key, plain, basis: str(row.basis) }];
  });
}

function parseRequirements(value: unknown): ActivationRequirement[] {
  return asArray(value).flatMap((item) => {
    const row = asRecord(item);
    const key = str(row.key) as Enums<"activation_requirement"> | null;
    if (!key) return [];
    return [
      {
        key,
        ok: bool(row.ok),
        label: str(row.label) ?? key,
        detail: str(row.detail) ?? "",
      },
    ];
  });
}

export function parseActivation(value: unknown): ActivationReadiness {
  const row = asRecord(value);
  const warnings: ActivationWarning[] = asArray(row.warnings).flatMap((item) => {
    const entry = asRecord(item);
    const key = str(entry.key) as Enums<"activation_warning"> | null;
    if (!key) return [];
    return [
      {
        key,
        label: str(entry.label) ?? key,
        detail: str(entry.detail) ?? "",
        affects: strings(entry.affects),
      },
    ];
  });

  const recordRow = row.record ? asRecord(row.record) : null;
  const record: ActivationRecord | null = recordRow
    ? {
        activatedAt: str(recordRow.activated_at) ?? "",
        warningsAcknowledged: strings(
          recordRow.warnings_acknowledged
        ) as Enums<"activation_warning">[],
        requirements: parseRequirements(recordRow.requirements),
      }
    : null;

  return {
    activatedAt: str(row.activated_at),
    hard: parseRequirements(row.hard),
    blocked: bool(row.blocked),
    warnings,
    completeness: parseCompleteness(row.completeness),
    record,
  };
}

export function parseBusinessProfileState(value: unknown): BusinessProfileState {
  const row = asRecord(value);

  const registry: RegistryField[] = asArray(row.registry).map((item) => {
    const entry = asRecord(item);
    return {
      field: str(entry.field) ?? "",
      stage: stage(entry.stage),
      label: str(entry.label) ?? "",
      consumer: str(entry.consumer) ?? "",
      required: bool(entry.required),
    };
  });

  const stages: StageProgress[] = asArray(row.stages).map((item) => {
    const entry = asRecord(item);
    return {
      stage: stage(entry.stage),
      completedAt: str(entry.completed_at),
      completedByMemberId: str(entry.completed_by_member_id),
    };
  });

  const versions: ProfileVersion[] = asArray(row.versions).map((item) => {
    const entry = asRecord(item);
    return {
      version: num(entry.version) ?? 0,
      changedFields: strings(entry.changed_fields),
      createdAt: str(entry.created_at) ?? "",
      actorName: str(entry.actor_name),
    };
  });

  const reviewPrompts: ReviewPrompt[] = asArray(row.review_prompts).flatMap((item) => {
    const entry = asRecord(item);
    const id = str(entry.id);
    const reason = str(entry.reason) as Enums<"profile_review_reason"> | null;
    if (!id || !reason) return [];
    return [
      { id, reason, detail: str(entry.detail) ?? "", detectedAt: str(entry.detected_at) ?? "" },
    ];
  });

  const contradictions: Contradiction[] = asArray(row.contradictions).flatMap((item) => {
    const entry = asRecord(item);
    const id = str(entry.id);
    const kind = str(entry.kind) as Enums<"profile_contradiction_kind"> | null;
    if (!id || !kind) return [];
    return [
      {
        id,
        kind,
        stated: str(entry.stated) ?? "",
        observed: str(entry.observed) ?? "",
        sampleN: num(entry.sample_n) ?? 0,
        detectedAt: str(entry.detected_at) ?? "",
      },
    ];
  });

  const activationChanges: ActivationChange[] = asArray(row.activation_changes).map((item) => {
    const entry = asRecord(item);
    return {
      previousAt: str(entry.previous_at) ?? "",
      newAt: str(entry.new_at) ?? "",
      reason: str(entry.reason) ?? "",
      createdAt: str(entry.created_at) ?? "",
      actorName: str(entry.actor_name),
    };
  });

  const latest = row.latest_leak_report ? asRecord(row.latest_leak_report) : null;

  return {
    profile: parseProfileRow(row.profile),
    completeness: parseCompleteness(row.completeness),
    registry,
    stages,
    versions,
    reviewPrompts,
    contradictions,
    benchmark: parseBenchmark(row.benchmark),
    patternFeedback: parsePatternFeedback(row.pattern_feedback),
    activation: parseActivation(row.activation),
    activationChanges,
    activatedByName: str(row.activated_by_name),
    latestLeakReport:
      latest && str(latest.id)
        ? {
            id: str(latest.id) as string,
            basis: (str(latest.basis) as Enums<"leak_report_basis">) ?? "profile_only",
            generatedAt: str(latest.generated_at) ?? "",
          }
        : null,
  };
}
