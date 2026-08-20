import type { Enums } from "@/types/database";

import { scoreConfidenceFromKnownCount } from "@/lib/scoring/compute";
import type {
  QueueCrmStatus,
  QueueMemberOption,
  QueueNextAction,
  QueuePayload,
  QueueRow,
} from "@/lib/queue/types";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function parseNextAction(value: unknown): QueueNextAction | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const actionText = asString(row.actionText);
  if (!id || !actionText) return null;
  return {
    id,
    actionText,
    dueAt: asString(row.dueAt),
    overdue: asBoolean(row.overdue),
  };
}

export function parseQueueRow(value: unknown): QueueRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const orgId = asString(row.orgId);
  const name = asString(row.name);
  const optedInAt = asString(row.optedInAt);
  const status = asString(row.status) as Enums<"lead_status"> | null;
  if (!id || !orgId || !name || !optedInAt || !status) return null;

  const knownFactorCount = asNumber(row.knownFactorCount) ?? 0;
  const score = asNumber(row.score);
  const confidenceRaw = asString(row.scoreConfidence);
  const scoreConfidence =
    score === null
      ? null
      : confidenceRaw === "high" ||
          confidenceRaw === "moderate" ||
          confidenceRaw === "low" ||
          confidenceRaw === "very_low"
        ? confidenceRaw
        : scoreConfidenceFromKnownCount(knownFactorCount);

  return {
    id,
    orgId,
    name,
    email: asString(row.email),
    source: asString(row.source),
    status,
    leadType: (asString(row.leadType) as Enums<"lead_type"> | null) ?? null,
    score,
    scoreConfidence,
    knownFactorCount,
    scoreReasoning: asString(row.scoreReasoning),
    optedInAt,
    lastTouchAt: asString(row.lastTouchAt),
    firstHumanTouchAt: asString(row.firstHumanTouchAt),
    assignedSetterId: asString(row.assignedSetterId),
    assignedCloserId: asString(row.assignedCloserId),
    assignedSetterName: asString(row.assignedSetterName),
    assignedCloserName: asString(row.assignedCloserName),
    ghlContactId: asString(row.ghlContactId),
    crmUrl: asString(row.crmUrl),
    nextAction: parseNextAction(row.nextAction),
    inAlarm: asBoolean(row.inAlarm),
    breachSeconds: asNumber(row.breachSeconds),
    urgencyRank: asNumber(row.urgencyRank),
    sortScore: asNumber(row.sortScore) ?? 0,
  };
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

export function parseQueuePayload(value: unknown): QueuePayload {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const crmRaw = asString(row.crmStatus);
  const crmStatus: QueueCrmStatus =
    crmRaw === "active" || crmRaw === "broken" || crmRaw === "inactive" || crmRaw === "missing"
      ? crmRaw
      : "missing";

  const alarm = Array.isArray(row.alarm) ? row.alarm.map(parseQueueRow).filter((r): r is QueueRow => r !== null) : [];
  const queue = Array.isArray(row.queue) ? row.queue.map(parseQueueRow).filter((r): r is QueueRow => r !== null) : [];
  const members = Array.isArray(row.members)
    ? row.members.map(parseMember).filter((m): m is QueueMemberOption => m !== null)
    : [];
  const sources = Array.isArray(row.sources)
    ? row.sources.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];

  return {
    crmStatus,
    ghlLocationId: asString(row.ghlLocationId),
    orgLeadCount: asNumber(row.orgLeadCount) ?? 0,
    unfilteredActionableCount: asNumber(row.unfilteredActionableCount) ?? 0,
    alarm,
    queue,
    hasMore: asBoolean(row.hasMore),
    members,
    sources,
  };
}

export function queueEmptyKind(payload: QueuePayload): import("@/lib/queue/types").QueueEmptyKind | null {
  if (payload.crmStatus === "broken") return "broken";
  if (payload.crmStatus === "missing" || payload.crmStatus === "inactive") return "not_connected";
  if (payload.orgLeadCount === 0) return "no_leads";
  if (payload.unfilteredActionableCount === 0 && payload.alarm.length === 0) return "nothing_to_work";
  return null;
}
