import { parseActiveSequenceItems, parsePendingFollowUpItems } from "@/lib/follow-up/items";
import type { Enums } from "@/types/database";

import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/labels";
import { scoreConfidenceFromKnownCount, type ScoreConfidence } from "@/lib/scoring/compute";
import type { QueueCrmStatus, QueueMemberOption } from "@/lib/queue/types";
import type {
  CaseCall,
  CaseFieldMap,
  CaseFileLead,
  CaseFilePayload,
  CaseListEmptyKind,
  CaseListFilters,
  CaseListPayload,
  CaseListRow,
  CaseNextAction,
  CaseObjection,
  CaseRevenueRow,
  CaseScore,
  CaseScoreHistoryRow,
  CaseTimelineEntry,
  CaseTimelinePage,
} from "@/lib/cases/types";
import { caseListHasConstraints } from "@/lib/cases/filters";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStatus(value: unknown): LeadStatus | null {
  const raw = asString(value);
  if (!raw || !(LEAD_STATUSES as readonly string[]).includes(raw)) return null;
  return raw as LeadStatus;
}

function parseMember(value: unknown): QueueMemberOption | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const displayName = asString(row.displayName);
  const role = asString(row.role) as Enums<"org_role"> | null;
  if (!id || !displayName || !role) return null;
  return { id, displayName, role };
}

function parseAnswers(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function parseCaseListRow(value: unknown): CaseListRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const orgId = asString(row.orgId);
  const name = asString(row.name);
  const optedInAt = asString(row.optedInAt);
  const status = asStatus(row.status);
  if (!id || !orgId || !name || !optedInAt || !status) return null;
  return {
    id,
    orgId,
    name,
    email: asString(row.email),
    phone: asString(row.phone),
    source: asString(row.source),
    status,
    leadType: (asString(row.leadType) as Enums<"lead_type"> | null) ?? null,
    score: asNumber(row.score),
    optedInAt,
    lastTouchAt: asString(row.lastTouchAt),
    assignedSetterId: asString(row.assignedSetterId),
    assignedCloserId: asString(row.assignedCloserId),
    assignedSetterName: asString(row.assignedSetterName),
    assignedCloserName: asString(row.assignedCloserName),
  };
}

export function parseCaseListPayload(value: unknown): CaseListPayload {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const crmRaw = asString(row.crmStatus);
  const crmStatus: QueueCrmStatus =
    crmRaw === "active" || crmRaw === "broken" || crmRaw === "inactive" || crmRaw === "missing"
      ? crmRaw
      : "missing";
  const rows = Array.isArray(row.rows)
    ? row.rows.map(parseCaseListRow).filter((item): item is CaseListRow => item !== null)
    : [];
  const members = Array.isArray(row.members)
    ? row.members.map(parseMember).filter((item): item is QueueMemberOption => item !== null)
    : [];
  const sources = Array.isArray(row.sources)
    ? row.sources.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];

  return {
    crmStatus,
    ghlLocationId: asString(row.ghlLocationId),
    orgLeadCount: asNumber(row.orgLeadCount) ?? 0,
    rows,
    hasMore: asBoolean(row.hasMore),
    members,
    sources,
  };
}

export function caseListEmptyKind(
  payload: CaseListPayload,
  filters: CaseListFilters
): CaseListEmptyKind | null {
  if (payload.orgLeadCount === 0) {
    if (payload.crmStatus === "broken") return "broken";
    if (payload.crmStatus === "missing" || payload.crmStatus === "inactive") return "not_connected";
    return "no_leads";
  }
  if (payload.rows.length === 0 && caseListHasConstraints(filters)) return "no_results";
  return null;
}

function parseConfidence(value: unknown, knownFactorCount: number): ScoreConfidence | null {
  const raw = asString(value);
  if (raw === "high" || raw === "moderate" || raw === "low" || raw === "very_low") return raw;
  return scoreConfidenceFromKnownCount(knownFactorCount);
}

function parseScore(value: unknown): CaseScore | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const total = asNumber(row.total);
  const triggeredBy = asString(row.triggeredBy) as Enums<"score_trigger"> | null;
  const createdAt = asString(row.createdAt);
  if (!id || total === null || !triggeredBy || !createdAt) return null;
  const knownFactorCount = asNumber(row.knownFactorCount) ?? 0;
  return {
    id,
    total,
    timeline: asNumber(row.timeline),
    investmentCapacity: asNumber(row.investmentCapacity),
    decisionAuthority: asNumber(row.decisionAuthority),
    painSeverity: asNumber(row.painSeverity),
    reasoning: asString(row.reasoning),
    triggeredBy,
    createdAt,
    knownFactorCount,
    scoreConfidence: parseConfidence(row.scoreConfidence, knownFactorCount),
  };
}

function parseScoreHistory(value: unknown): CaseScoreHistoryRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const total = asNumber(row.total);
  const triggeredBy = asString(row.triggeredBy) as Enums<"score_trigger"> | null;
  const createdAt = asString(row.createdAt);
  if (!id || total === null || !triggeredBy || !createdAt) return null;
  return {
    id,
    total,
    previousTotal: asNumber(row.previousTotal),
    timeline: asNumber(row.timeline),
    investmentCapacity: asNumber(row.investmentCapacity),
    decisionAuthority: asNumber(row.decisionAuthority),
    painSeverity: asNumber(row.painSeverity),
    reasoning: asString(row.reasoning),
    triggeredBy,
    createdAt,
    scoredByName: asString(row.scoredByName),
  };
}

function parseObjection(value: unknown): CaseObjection | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const type = asString(row.type) as Enums<"objection_type"> | null;
  const verbatim = typeof row.verbatim === "string" ? row.verbatim : null;
  const createdAt = asString(row.createdAt);
  if (!id || !type || verbatim === null || !createdAt) return null;
  return {
    id,
    type,
    verbatim,
    callId: asString(row.callId),
    callType: (asString(row.callType) as Enums<"call_type"> | null) ?? null,
    callOccurredAt: asString(row.callOccurredAt),
    resolved: asBoolean(row.resolved),
    resolvedAt: asString(row.resolvedAt),
    resolvedNote: asString(row.resolvedNote),
    createdAt,
  };
}

function parseNextAction(value: unknown): CaseNextAction | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const actionText = asString(row.actionText);
  const createdBy = asString(row.createdBy) as Enums<"action_creator"> | null;
  if (!id || !actionText || !createdBy) return null;
  return {
    id,
    actionText,
    dueAt: asString(row.dueAt),
    completedAt: asString(row.completedAt),
    ownerMemberId: asString(row.ownerMemberId),
    ownerName: asString(row.ownerName),
    createdBy,
    overdue: asBoolean(row.overdue),
  };
}

function parseCall(value: unknown): CaseCall | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const type = asString(row.type) as Enums<"call_type"> | null;
  if (!id || !type) return null;
  return {
    id,
    type,
    scheduledAt: asString(row.scheduledAt),
    occurredAt: asString(row.occurredAt),
    durationSeconds: asNumber(row.durationSeconds),
    outcome: (asString(row.outcome) as Enums<"call_outcome"> | null) ?? null,
    ranByMemberId: asString(row.ranByMemberId),
    ranByName: asString(row.ranByName),
    hasTranscript: asBoolean(row.hasTranscript),
    hasExtraction: asBoolean(row.hasExtraction),
    extractionStatus:
      row.extractionStatus === "failed" ||
      row.extractionStatus === "pending" ||
      row.extractionStatus === "ready" ||
      row.extractionStatus === "none"
        ? row.extractionStatus
        : asBoolean(row.hasExtraction)
          ? "ready"
          : "none",
  };
}

function parseFieldMap(value: unknown): CaseFieldMap | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const fieldName = asString(row.fieldName);
  const factor = asString(row.factor) as Enums<"score_factor"> | null;
  if (!fieldName || !factor) return null;
  return { fieldName, factor };
}

function parseRevenue(value: unknown): CaseRevenueRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const amountCents = asNumber(row.amountCents);
  const currency = asString(row.currency);
  const paymentType = asString(row.paymentType) as Enums<"payment_type"> | null;
  const occurredAt = asString(row.occurredAt);
  if (!id || amountCents === null || !currency || !paymentType || !occurredAt) return null;
  return {
    id,
    amountCents,
    currency,
    paymentType,
    processor: asString(row.processor),
    occurredAt,
    closedByName: asString(row.closedByName),
  };
}

function parseTimelineEntry(value: unknown): CaseTimelineEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const at = asString(row.at);
  const kind = asString(row.kind);
  if (!id || !at || !kind) return null;

  if (kind === "touch") {
    const touchType = asString(row.touchType) as Enums<"touch_type"> | null;
    const channel = asString(row.channel) as Enums<"touch_channel"> | null;
    const direction = asString(row.direction) as Enums<"touch_direction"> | null;
    if (!touchType || !channel || !direction) return null;
    return {
      kind: "touch",
      id,
      at,
      touchType,
      channel,
      direction,
      outcome: (asString(row.outcome) as Enums<"touch_outcome"> | null) ?? null,
      actorName: asString(row.actorName),
      note: asString(row.note),
      outboundBody: direction === "outbound" ? asString(row.outboundBody) : null,
    };
  }

  if (kind === "call") {
    const callType = asString(row.callType) as Enums<"call_type"> | null;
    if (!callType) return null;
    return {
      kind: "call",
      id,
      at,
      callType,
      outcome: (asString(row.outcome) as Enums<"call_outcome"> | null) ?? null,
      actorName: asString(row.actorName),
      durationSeconds: asNumber(row.durationSeconds),
      scheduledAt: asString(row.scheduledAt),
      occurredAt: asString(row.occurredAt),
    };
  }

  if (kind === "status") {
    const fromStatus = asStatus(row.fromStatus);
    const toStatus = asStatus(row.toStatus);
    const source = asString(row.source);
    if (!fromStatus || !toStatus || (source !== "manual" && source !== "event")) return null;
    return {
      kind: "status",
      id,
      at,
      fromStatus,
      toStatus,
      source,
      actorName: asString(row.actorName),
      note: asString(row.note),
      supersedesManual: asBoolean(row.supersedesManual),
    };
  }

  if (kind === "activity") {
    const headline = asString(row.headline);
    const activityKind = asString(row.activityKind);
    const result = asString(row.result);
    if (!headline || !activityKind || !result) return null;
    const detail =
      row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)
        ? (row.detail as Record<string, unknown>)
        : {};
    return {
      kind: "activity",
      id,
      at,
      category: asString(row.category) ?? "system",
      activityKind,
      headline,
      actorName: asString(row.actorName),
      result,
      resultReason: asString(row.resultReason),
      retryable: asBoolean(row.retryable),
      retryKind: asString(row.retryKind),
      retryId: asString(row.retryId),
      detail,
    };
  }

  return null;
}

export function parseCaseTimelinePage(value: unknown): CaseTimelinePage {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const entries = Array.isArray(row.entries)
    ? row.entries.map(parseTimelineEntry).filter((item): item is CaseTimelineEntry => item !== null)
    : [];
  return { entries, hasMore: asBoolean(row.hasMore) };
}

function parseLead(value: unknown): CaseFileLead | null {
  const base = parseCaseListRow(value);
  if (!base || !value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    ...base,
    firstName: asString(row.firstName),
    lastName: asString(row.lastName),
    campaign: asString(row.campaign),
    firstHumanTouchAt: asString(row.firstHumanTouchAt),
    ghlContactId: asString(row.ghlContactId),
    crmUrl: asString(row.crmUrl),
    applicationAnswers: parseAnswers(row.applicationAnswers),
  };
}

export function parseCaseFilePayload(value: unknown): CaseFilePayload | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const lead = parseLead(row.lead);
  if (!lead) return null;

  const revenueRaw = row.revenue;
  const revenue =
    revenueRaw === null || revenueRaw === undefined
      ? null
      : Array.isArray(revenueRaw)
        ? revenueRaw.map(parseRevenue).filter((item): item is CaseRevenueRow => item !== null)
        : null;

  return {
    lead,
    score: parseScore(row.score),
    scoreHistory: Array.isArray(row.scoreHistory)
      ? row.scoreHistory.map(parseScoreHistory).filter((item): item is CaseScoreHistoryRow => item !== null)
      : [],
    objections: Array.isArray(row.objections)
      ? row.objections.map(parseObjection).filter((item): item is CaseObjection => item !== null)
      : [],
    nextActions: Array.isArray(row.nextActions)
      ? row.nextActions.map(parseNextAction).filter((item): item is CaseNextAction => item !== null)
      : [],
    calls: Array.isArray(row.calls)
      ? row.calls.map(parseCall).filter((item): item is CaseCall => item !== null)
      : [],
    fieldMaps: Array.isArray(row.fieldMaps)
      ? row.fieldMaps.map(parseFieldMap).filter((item): item is CaseFieldMap => item !== null)
      : [],
    revenue,
    members: Array.isArray(row.members)
      ? row.members.map(parseMember).filter((item): item is QueueMemberOption => item !== null)
      : [],
    timeline: parseCaseTimelinePage(row.timeline),
    pendingFollowUps: parsePendingFollowUpItems(row.pendingFollowUps),
    activeSequences: parseActiveSequenceItems(row.activeSequences),
  };
}
