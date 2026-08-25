import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_RESULTS,
  type ActivityCategory,
  type ActivityEvent,
  type ActivityPage,
  type ActivityResult,
} from "@/lib/activity/types";

const DETAIL_KEYS = new Set([
  "total",
  "timeline",
  "investmentCapacity",
  "decisionAuthority",
  "painSeverity",
  "reasoning",
  "triggeredBy",
  "channel",
  "direction",
  "outcome",
  "outboundBody",
  "emailSubject",
  "callType",
  "scheduledAt",
  "durationSeconds",
  "matched",
  "status",
  "amountCents",
  "paymentType",
  "fromTrack",
  "toTrack",
  "field",
  "fromName",
  "toName",
  "fromStatus",
  "toStatus",
  "source",
  "note",
  "kind",
  "evaluated",
  "changed",
  "attemptCount",
  "branch",
  "maxSteps",
  "reason",
  "position",
  "type",
  "request",
  "label",
  "summary",
  "state",
  "writeKind",
  "decision",
  "recordCount",
  "section",
  "action",
  "fromValue",
  "toValue",
  "actorKind",
  "processed",
  "jobKind",
  "eventType",
]);

const BLOCKED_KEY =
  /(payload|token|secret|password|bearer|stack|sqlstate|arguments|inbound|transcript|raw)/i;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asCategory(value: unknown): ActivityCategory | null {
  const raw = asString(value);
  if (!raw || !(ACTIVITY_CATEGORIES as readonly string[]).includes(raw)) return null;
  return raw as ActivityCategory;
}

function asResult(value: unknown): ActivityResult | null {
  const raw = asString(value);
  if (!raw || !(ACTIVITY_RESULTS as readonly string[]).includes(raw)) return null;
  return raw as ActivityResult;
}

function asScalar(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return null;
}

function parseDetail(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!DETAIL_KEYS.has(key) || BLOCKED_KEY.test(key)) continue;
    const scalar = asScalar(raw);
    if (scalar !== null) out[key] = scalar;
  }
  return out;
}

function looksLikeInternalId(value: string): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return true;
  }
  return /^(sk-|pk_|eyJ|Bearer )/i.test(value);
}

function scrubLine(value: string | null): string | null {
  if (!value) return null;
  if (looksLikeInternalId(value) && value.length >= 32) return null;
  return value;
}

export function parseActivityEvent(value: unknown): ActivityEvent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const orgId = asString(row.orgId);
  const occurredAt = asString(row.occurredAt);
  const category = asCategory(row.category);
  const kind = asString(row.kind);
  const headline = asString(row.headline);
  const rawActor = asString(row.actorLabel);
  const actorLabel =
    rawActor && rawActor.toLowerCase() === "system" ? "Workspace" : scrubLine(rawActor);
  const href = asString(row.href);
  const result = asResult(row.result);
  if (!id || !orgId || !occurredAt || !category || !kind || !headline || !actorLabel || !href || !result) {
    return null;
  }

  return {
    id,
    orgId,
    orgName: asString(row.orgName),
    occurredAt,
    category,
    kind,
    headline,
    actorLabel,
    actorKind: asString(row.actorKind) ?? "scoring",
    actorUserId: asString(row.actorUserId),
    integration: asString(row.integration),
    leadId: asString(row.leadId),
    leadName: asString(row.leadName),
    href,
    result,
    resultReason: scrubLine(asString(row.resultReason)),
    retryable: asBoolean(row.retryable) && asString(row.retryKind) === "dispatch" && Boolean(asString(row.retryId)),
    retryKind: asString(row.retryKind) === "dispatch" ? "dispatch" : null,
    retryId: asString(row.retryId),
    isSyncNoise: asBoolean(row.isSyncNoise),
    detail: parseDetail(row.detail),
  };
}

export function parseActivityPage(value: unknown): ActivityPage {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const events = Array.isArray(row.events)
    ? row.events.map(parseActivityEvent).filter((item): item is ActivityEvent => item !== null)
    : [];
  return { events, hasMore: asBoolean(row.hasMore) };
}
