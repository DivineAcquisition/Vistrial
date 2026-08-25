import type { Enums } from "@/types/database";

import type { QueueCrmStatus } from "@/lib/queue/types";
import type { ExtractionStatus } from "@/lib/transcripts/types";
import type {
  CallDetailPayload,
  CallExtractionView,
  CallListPayload,
  CallListRow,
} from "@/lib/calls/types";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStatus(value: unknown): ExtractionStatus {
  if (value === "failed" || value === "pending" || value === "ready" || value === "none") return value;
  return "none";
}

function parseQuotes(value: unknown): Array<{ text: string; topic: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      const text = asString(row.text);
      if (!text) return null;
      return { text, topic: asString(row.topic) ?? "situation" };
    })
    .filter((item): item is { text: string; topic: string } => item !== null);
}

export function parseCallListPayload(value: unknown): CallListPayload {
  const row = asRecord(value);
  const crmRaw = asString(row.crmStatus);
  const crmStatus: QueueCrmStatus =
    crmRaw === "active" || crmRaw === "broken" || crmRaw === "inactive" || crmRaw === "missing"
      ? crmRaw
      : "missing";
  const rows = Array.isArray(row.rows)
    ? row.rows
        .map((item) => parseCallListRow(item))
        .filter((item): item is CallListRow => item !== null)
    : [];
  return {
    crmStatus,
    orgCallCount: asNumber(row.orgCallCount) ?? 0,
    rows,
    hasMore: asBoolean(row.hasMore),
  };
}

function parseCallListRow(value: unknown): CallListRow | null {
  const row = asRecord(value);
  const id = asString(row.id);
  const leadId = asString(row.leadId);
  const leadName = asString(row.leadName);
  const type = asString(row.type) as Enums<"call_type"> | null;
  if (!id || !leadId || !leadName || !type) return null;
  return {
    id,
    leadId,
    leadName,
    type,
    scheduledAt: asString(row.scheduledAt),
    occurredAt: asString(row.occurredAt),
    durationSeconds: asNumber(row.durationSeconds),
    outcome: (asString(row.outcome) as Enums<"call_outcome"> | null) ?? null,
    ranByName: asString(row.ranByName),
    hasTranscript: asBoolean(row.hasTranscript),
    extractionStatus: asStatus(row.extractionStatus),
  };
}

export function parseCallDetailPayload(value: unknown): CallDetailPayload | null {
  const row = asRecord(value);
  const call = asRecord(row.call);
  const lead = asRecord(row.lead);
  const id = asString(call.id);
  const leadId = asString(call.leadId) ?? asString(lead.id);
  const type = asString(call.type) as Enums<"call_type"> | null;
  if (!id || !leadId || !type) return null;

  return {
    call: {
      id,
      orgId: asString(call.orgId) ?? "",
      leadId,
      type,
      scheduledAt: asString(call.scheduledAt),
      occurredAt: asString(call.occurredAt),
      durationSeconds: asNumber(call.durationSeconds),
      outcome: (asString(call.outcome) as Enums<"call_outcome"> | null) ?? null,
      ranByName: asString(call.ranByName),
      transcriptSource: (asString(call.transcriptSource) as Enums<"transcript_source"> | null) ?? null,
      transcriptArrivedAt: asString(call.transcriptArrivedAt),
      rawTranscript: typeof call.rawTranscript === "string" ? call.rawTranscript : null,
    },
    lead: {
      id: asString(lead.id) ?? leadId,
      name: asString(lead.name) ?? "Unnamed lead",
    },
    extraction: parseExtraction(row.extraction),
    objections: Array.isArray(row.objections)
      ? row.objections
          .map((item) => {
            const objection = asRecord(item);
            const objectionId = asString(objection.id);
            const objectionType = asString(objection.type) as Enums<"objection_type"> | null;
            const verbatim = typeof objection.verbatim === "string" ? objection.verbatim : null;
            if (!objectionId || !objectionType || verbatim === null) return null;
            return {
              id: objectionId,
              type: objectionType,
              verbatim,
              resolved: asBoolean(objection.resolved),
              resolvedAt: asString(objection.resolvedAt),
              resolvedNote: asString(objection.resolvedNote),
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
      : [],
    job: parseJob(row.job),
    scoreChange: parseScore(row.scoreChange),
    corrections: Array.isArray(row.corrections)
      ? row.corrections
          .map((item) => {
            const correction = asRecord(item);
            const correctionId = asString(correction.id);
            const fieldName = asString(correction.fieldName);
            if (!correctionId || !fieldName) return null;
            return {
              id: correctionId,
              fieldName,
              actorName: asString(correction.actorName),
              createdAt: asString(correction.createdAt) ?? "",
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
      : [],
  };
}

function parseExtraction(value: unknown): CallExtractionView | null {
  const row = asRecord(value);
  const id = asString(row.id);
  const extractedAt = asString(row.extractedAt);
  if (!id || !extractedAt) return null;
  const state = (raw: unknown): Enums<"extraction_signal_state"> =>
    raw === "present" || raw === "unclear" || raw === "absent" ? raw : "absent";
  return {
    id,
    summary: asString(row.summary),
    statedObjection: asString(row.statedObjection),
    statedObjectionState: state(row.statedObjectionState),
    budgetSignal: asString(row.budgetSignal),
    budgetSignalState: state(row.budgetSignalState),
    timelineSignal: asString(row.timelineSignal),
    timelineSignalState: state(row.timelineSignalState),
    decisionProcess: asString(row.decisionProcess),
    decisionProcessState: state(row.decisionProcessState),
    nextStepAgreed: asString(row.nextStepAgreed),
    nextStepState: state(row.nextStepState),
    quotes: parseQuotes(row.quotes),
    modelVersion: asString(row.modelVersion),
    extractedAt,
    verificationStatus:
      row.verificationStatus === "passed" || row.verificationStatus === "needs_review"
        ? row.verificationStatus
        : "unchecked",
    verificationFaults: Array.isArray(row.verificationFaults)
      ? (row.verificationFaults as Array<{ code?: unknown; where?: unknown; what?: unknown }>)
          .map((item) => ({
            code: typeof item.code === "string" ? item.code : "",
            where: typeof item.where === "string" ? item.where : "output",
            what: typeof item.what === "string" ? item.what : "",
          }))
          .filter((item) => item.code && item.what)
      : [],
    verificationAttempt: asNumber(row.verificationAttempt) ?? 0,
  };
}

function parseJob(value: unknown): CallDetailPayload["job"] {
  const row = asRecord(value);
  const id = asString(row.id);
  const status = asString(row.status);
  if (!id || (status !== "pending" && status !== "processed" && status !== "dead")) return null;
  return {
    id,
    status,
    attemptCount: asNumber(row.attemptCount) ?? 0,
    lastError: asString(row.lastError),
    nextAttemptAt: asString(row.nextAttemptAt) ?? "",
  };
}

function parseScore(value: unknown): CallDetailPayload["scoreChange"] {
  const row = asRecord(value);
  const total = asNumber(row.total);
  const createdAt = asString(row.createdAt);
  if (total === null || !createdAt) return null;
  return {
    total,
    previousTotal: asNumber(row.previousTotal),
    reasoning: asString(row.reasoning),
    createdAt,
  };
}
